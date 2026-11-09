/**
 * Integration tests against a real Supabase project (RLS, RPCs, triggers, storage).
 * Run: ATLAS_E2E=1 NODE_USE_ENV_PROXY=1 npx vitest run --config vitest.integration.config.ts
 * Requires two confirmed test accounts (see README "테스트").
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BACKUP_TABLES, prepareImport, validateBackup, type BackupFile } from '../../src/domain/backup'
import { branchChain, materialize, planSetFrom, rowAt, visibleRows, type TemporalRow } from '../../src/domain/timeline'

const URL = process.env.VITE_SUPABASE_URL!
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!
const PASSWORD = process.env.ATLAS_E2E_PASSWORD ?? 'AtlasE2E!2026'
const OWNER = process.env.ATLAS_E2E_OWNER ?? 'atlas-e2e-owner@example.com'
const OTHER = process.env.ATLAS_E2E_OTHER ?? 'atlas-e2e-other@example.com'
const enabled = process.env.ATLAS_E2E === '1'

async function login(email: string): Promise<SupabaseClient> {
  const c = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw error
  return c
}

const ok = <T>(r: { data: T; error: unknown }) => { if (r.error) throw r.error; return r.data }

describe.skipIf(!enabled)('ATLAS database integration', () => {
  let a: SupabaseClient
  let b: SupabaseClient
  let pid = ''
  let main = ''
  const created: string[] = []

  beforeAll(async () => {
    a = await login(OWNER)
    b = await login(OTHER)
    pid = ok(await a.rpc('atlas_create_project', { p_name: 'E2E 통합 테스트', p_description: 'auto', p_default_date: '1936-01-01', p_seed_ideologies: true })) as string
    created.push(pid)
    main = ok(await a.from('atlas_branches').select('id').eq('project_id', pid).eq('is_main', true).single()).id
  })

  afterAll(async () => {
    for (const id of created) await a.from('atlas_projects').delete().eq('id', id)
  })

  it('creates project with owner membership, main branch at 1936-01-01 and ideology palette', async () => {
    const p = ok(await a.from('atlas_projects').select('*').eq('id', pid).single())
    expect(p.default_date).toBe('1936-01-01')
    const ideologies = ok(await a.from('atlas_ideologies').select('name').eq('project_id', pid))
    expect(ideologies.length).toBe(11)
    const m = ok(await a.from('atlas_project_members').select('role').eq('project_id', pid))
    expect(m).toEqual([{ role: 'owner' }])
  })

  it('isolates projects from non-members (RLS)', async () => {
    expect(ok(await b.from('atlas_projects').select('id').eq('id', pid))).toEqual([])
    expect(ok(await b.from('atlas_branches').select('id').eq('project_id', pid))).toEqual([])
    const ins = await b.from('atlas_entities').insert({ project_id: pid, kind: 'country', name: '침입' })
    expect(ins.error).not.toBeNull()
    const del = await b.from('atlas_projects').delete().eq('id', pid).select()
    expect(del.data ?? []).toEqual([])
    expect(ok(await a.from('atlas_projects').select('id').eq('id', pid))).toHaveLength(1)
  })

  it('enforces composite foreign keys across projects', async () => {
    const other = ok(await b.rpc('atlas_create_project', { p_name: '타 프로젝트', p_seed_ideologies: false })) as string
    const foreign = ok(await b.from('atlas_entities').insert({ project_id: other, kind: 'country', name: 'X' }).select().single())
    const r = await a.from('atlas_entities').insert({ project_id: pid, kind: 'country', name: 'A' }).select().single()
    const country = ok(r)
    await a.from('atlas_countries').insert({ id: country.id, project_id: pid })
    const bad = await a.from('atlas_country_states').insert({ project_id: pid, branch_id: main, country_id: foreign.id })
    expect(bad.error).not.toBeNull()
    await b.from('atlas_projects').delete().eq('id', other)
  })

  it('checks subtype kind, date validity and unit cycles in the database', async () => {
    const ev = ok(await a.from('atlas_entities').insert({ project_id: pid, kind: 'event', name: '사건' }).select().single())
    const wrong = await a.from('atlas_countries').insert({ id: ev.id, project_id: pid })
    expect(wrong.error?.code).toBe('23514')
    const u1 = ok(await a.from('atlas_entities').insert({ project_id: pid, kind: 'unit', name: '제1군' }).select().single())
    const u2 = ok(await a.from('atlas_entities').insert({ project_id: pid, kind: 'unit', name: '제1군단' }).select().single())
    ok(await a.from('atlas_unit_states').insert({ project_id: pid, branch_id: main, unit_id: u2.id, parent_unit_id: u1.id }))
    const cyc = await a.from('atlas_unit_states').insert({ project_id: pid, branch_id: main, unit_id: u1.id, parent_unit_id: u2.id })
    expect(cyc.error?.message).toMatch(/cycle/)
    const range = await a.from('atlas_unit_states').insert({ project_id: pid, branch_id: main, unit_id: u1.id, valid_from: '1940-01-01', valid_to: '1939-01-01' })
    expect(range.error).not.toBeNull()
  })

  it('keeps branch edits independent (copy-on-write) and preserves the original line', async () => {
    const country = ok(await a.from('atlas_entities').insert({ project_id: pid, kind: 'country', name: '국가 A' }).select().single())
    const s1 = ok(await a.from('atlas_country_states').insert({ project_id: pid, branch_id: main, country_id: country.id, government_form: '입헌군주제', valid_from: '1936-01-01' }).select().single())
    ok(await a.from('atlas_country_states').insert({ project_id: pid, branch_id: main, country_id: country.id, government_form: '전시내각', valid_from: '1940-01-01' }))
    await a.from('atlas_country_states').update({ valid_to: '1940-01-01' }).eq('id', s1.id)
    const branch = ok(await a.from('atlas_branches').insert({ project_id: pid, name: '분기 A', parent_id: main, fork_date: '1939-01-01' }).select().single())
    const branches = ok(await a.from('atlas_branches').select('*').eq('project_id', pid))
    const chain = branchChain(branches, branch.id)
    const load = async () => ok(await a.from('atlas_country_states').select('*').eq('country_id', country.id).in('branch_id', chain.map((c) => c.branchId))) as (TemporalRow & { government_form: string })[]
    let rows = visibleRows(await load(), chain)
    expect(rows.map((r) => r.government_form)).toEqual(['입헌군주제'])
    // in branch: the monarchy continues past 1940 (edit inherited row -> override)
    const ops = materialize([{ kind: 'update', row: rows[0], patch: { valid_to: null } }], branch.id, () => crypto.randomUUID())
    for (const op of ops) if (op.kind === 'insert') ok(await a.from('atlas_country_states').insert(op.values))
    // and becomes a republic in 1945 only in the branch
    const plan = planSetFrom(visibleRows(await load(), chain), '1945-01-01', { country_id: country.id, government_form: '공화정' } as never)
    for (const op of materialize(plan, branch.id, () => crypto.randomUUID(), { project_id: pid })) {
      if (op.kind === 'insert') ok(await a.from('atlas_country_states').insert(op.values))
      else if (op.kind === 'update') ok(await a.from('atlas_country_states').update(op.patch).eq('id', op.id))
    }
    rows = visibleRows(await load(), chain)
    expect(rowAt(rows, '1941-01-01')?.government_form).toBe('입헌군주제')
    expect(rowAt(rows, '1946-01-01')?.government_form).toBe('공화정')
    const mainChain = branchChain(branches, main)
    const mainRows = visibleRows(ok(await a.from('atlas_country_states').select('*').eq('country_id', country.id).eq('branch_id', main)) as never[], mainChain) as (TemporalRow & { government_form: string })[]
    expect(rowAt(mainRows, '1941-01-01')?.government_form).toBe('전시내각')
    expect(rowAt(mainRows, '1946-01-01')?.government_form).toBe('전시내각')
  })

  it('returns bidirectional backlinks through RPC', async () => {
    const person = ok(await a.from('atlas_entities').insert({ project_id: pid, kind: 'character', name: '인물 갑' }).select().single())
    const party = ok(await a.from('atlas_entities').insert({ project_id: pid, kind: 'party', name: '보수당' }).select().single())
    ok(await a.from('atlas_parties').insert({ id: party.id, project_id: pid, leader_id: person.id }))
    const links = ok(await a.rpc('atlas_entity_backlinks', { p_project: pid, p_entity: person.id })) as { table_name: string; column_name: string }[]
    expect(links.some((l) => l.table_name === 'atlas_parties' && l.column_name === 'leader_id')).toBe(true)
    expect(ok(await b.rpc('atlas_entity_backlinks', { p_project: pid, p_entity: person.id }))).toEqual([])
  })

  it('enforces viewer / editor / owner roles', async () => {
    const r = ok(await a.rpc('atlas_invite_member', { p_project: pid, p_email: OTHER, p_role: 'viewer' }))
    expect(r).toBe('added')
    expect(ok(await b.from('atlas_projects').select('id').eq('id', pid))).toHaveLength(1)
    const w = await b.from('atlas_entities').insert({ project_id: pid, kind: 'event', name: '열람자 쓰기' })
    expect(w.error).not.toBeNull()
    await a.from('atlas_project_members').update({ role: 'editor' }).eq('project_id', pid).eq('user_id', (await b.auth.getUser()).data.user!.id)
    ok(await b.from('atlas_entities').insert({ project_id: pid, kind: 'event', name: '편집자 쓰기' }))
    const escalate = await b.from('atlas_project_members').update({ role: 'owner' }).eq('project_id', pid).select()
    expect(escalate.data ?? []).toEqual([])
    const del = await b.from('atlas_projects').delete().eq('id', pid).select()
    expect(del.data ?? []).toEqual([])
    const inv = await b.rpc('atlas_invite_member', { p_project: pid, p_email: 'x@example.com', p_role: 'owner' })
    expect(inv.error).not.toBeNull()
    // last owner cannot be demoted
    const demote = await a.from('atlas_project_members').update({ role: 'viewer' }).eq('project_id', pid).eq('user_id', (await a.auth.getUser()).data.user!.id)
    expect(demote.error?.message).toMatch(/owner/)
  })

  it('logs changes and reverts them', async () => {
    const e = ok(await a.from('atlas_entities').insert({ project_id: pid, kind: 'region', name: '원래 이름' }).select().single())
    ok(await a.from('atlas_entities').update({ name: '바뀐 이름' }).eq('id', e.id))
    const log = ok(await a.from('atlas_change_logs').select('*').eq('row_id', e.id).eq('action', 'UPDATE').single())
    expect(log.changed_fields).toContain('name')
    ok(await a.rpc('atlas_revert_change', { p_change_id: log.id }))
    expect(ok(await a.from('atlas_entities').select('name').eq('id', e.id).single()).name).toBe('원래 이름')
  })

  it('enforces storage policies per project', async () => {
    const path = `${pid}/document/e2e.txt`
    ok(await a.storage.from('atlas-assets').upload(path, new Blob(['hello'], { type: 'text/plain' }), { contentType: 'text/plain' }))
    const otherProject = ok(await b.rpc('atlas_create_project', { p_name: 'B 전용', p_seed_ideologies: false })) as string
    const denied = await a.storage.from('atlas-assets').upload(`${otherProject}/x.txt`, new Blob(['x'], { type: 'text/plain' }))
    expect(denied.error).not.toBeNull()
    await a.storage.from('atlas-assets').remove([path])
    await b.from('atlas_projects').delete().eq('id', otherProject)
  })

  it('exports, validates and re-imports a project with all relations preserved', async () => {
    const tables: Record<string, Record<string, unknown>[]> = {}
    for (const t of BACKUP_TABLES) tables[t] = ok(await a.from(t).select('*').eq('project_id', pid)) as never
    const project = ok(await a.from('atlas_projects').select('*').eq('id', pid).single())
    const backup: BackupFile = { format: 'atlas-backup', version: 1, exported_at: new Date().toISOString(), app: 'test', project, tables }
    expect(validateBackup(JSON.parse(JSON.stringify(backup))).ok).toBe(true)
    const newPid = ok(await a.rpc('atlas_create_project', { p_name: '가져온 사본', p_seed_ideologies: false })) as string
    created.push(newPid)
    const newMain = ok(await a.from('atlas_branches').select('id').eq('project_id', newPid).eq('is_main', true).single()).id
    const prepared = prepareImport(backup, newPid, newMain, () => crypto.randomUUID())
    const result = ok(await a.rpc('atlas_import_rows', { p_project: newPid, p_tables: prepared.tables })) as Record<string, number>
    expect(result.atlas_entities).toBe(tables.atlas_entities.length)
    expect(result.atlas_country_states).toBe(tables.atlas_country_states.length)
    const copyCount = ok(await a.from('atlas_entities').select('id', { count: 'exact' }).eq('project_id', newPid)).length
    expect(copyCount).toBe(tables.atlas_entities.length)
    // original untouched, no id collision
    expect(ok(await a.from('atlas_entities').select('id').eq('project_id', pid)).length).toBe(tables.atlas_entities.length)
    const parties = ok(await a.from('atlas_parties').select('leader_id').eq('project_id', newPid))
    const ents = new Set((ok(await a.from('atlas_entities').select('id').eq('project_id', newPid)) as { id: string }[]).map((e) => e.id))
    for (const p of parties as { leader_id: string | null }[]) if (p.leader_id) expect(ents.has(p.leader_id)).toBe(true)
  })
})
