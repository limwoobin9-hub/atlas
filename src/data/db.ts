/**
 * Data access layer. All Supabase table access goes through here so that
 * errors are normalised and query keys/invalidation stay consistent.
 */
import { supabase } from '@/lib/supabase'
import { uuid } from '@/lib/utils'
import { materialize, type DbOp, type PlannedOp, type TemporalRow } from '@/domain/timeline'
import type { AnyRow } from './types'

export const TEMPORAL_TABLES = [
  'atlas_country_states', 'atlas_territory_control', 'atlas_territory_claims', 'atlas_positions', 'atlas_affiliations',
  'atlas_seat_allocations', 'atlas_party_polling', 'atlas_unit_states', 'atlas_ship_assignments',
  'atlas_equipment_holdings', 'atlas_war_participants', 'atlas_diplomatic_relations', 'atlas_entity_relations',
  'atlas_markers', 'atlas_map_features',
] as const
export type TemporalTable = (typeof TEMPORAL_TABLES)[number]

export const qk = {
  projects: ['projects'] as const,
  project: (pid: string) => ['project', pid] as const,
  branches: (pid: string) => ['branches', pid] as const,
  entities: (pid: string) => ['entities', pid] as const,
  hidden: (pid: string) => ['hidden', pid] as const,
  table: (table: string, pid: string, extra?: unknown) => (extra === undefined ? ['table', table, pid] : ['table', table, pid, extra]) as unknown[],
  temporal: (table: string, pid: string, chainKey: string) => ['table', table, pid, 'chain', chainKey] as unknown[],
  subtype: (table: string, id: string) => ['subtype', table, id] as const,
  backlinks: (pid: string, id: string) => ['backlinks', pid, id] as const,
}

export class DbError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.code = code
  }
}

function check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new DbError(res.error.message, res.error.code)
  return res.data
}

const PAGE = 1000

/** Fetch every row matching filters, paging past the PostgREST row limit. */
export async function fetchAll(
  table: string,
  opts: { projectId: string; select?: string; eq?: Record<string, unknown>; in?: Record<string, unknown[]>; order?: string },
): Promise<AnyRow[]> {
  const out: AnyRow[] = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(opts.select ?? '*').eq('project_id', opts.projectId)
    for (const [k, v] of Object.entries(opts.eq ?? {})) q = q.eq(k, v as never)
    for (const [k, v] of Object.entries(opts.in ?? {})) q = q.in(k, v as never[])
    q = q.order(opts.order ?? 'id', { ascending: true }).range(from, from + PAGE - 1)
    const rows = check(await q) as unknown as AnyRow[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

export async function insertRow<T = AnyRow>(table: string, values: AnyRow): Promise<T> {
  return check(await supabase.from(table).insert(values).select().single()) as T
}

export async function insertRows(table: string, values: AnyRow[]): Promise<void> {
  for (let i = 0; i < values.length; i += 500) {
    check(await supabase.from(table).insert(values.slice(i, i + 500)))
  }
}

export async function upsertRows(table: string, values: AnyRow[], onConflict?: string): Promise<void> {
  if (values.length === 0) return
  check(await supabase.from(table).upsert(values, onConflict ? { onConflict } : undefined))
}

export async function updateRow<T = AnyRow>(table: string, id: string, patch: AnyRow, idColumn = 'id'): Promise<T> {
  const data = check(await supabase.from(table).update(patch).eq(idColumn, id).select())
  const rows = data as unknown as T[]
  if (!rows || rows.length === 0) throw new DbError('저장되지 않았습니다. 항목이 삭제되었거나 수정 권한이 없습니다.', 'PGRST116')
  return rows[0]
}

export async function deleteRow(table: string, id: string, idColumn = 'id'): Promise<void> {
  check(await supabase.from(table).delete().eq(idColumn, id))
}

export async function deleteWhere(table: string, match: Record<string, unknown>): Promise<void> {
  check(await supabase.from(table).delete().match(match))
}

export async function getRow<T = AnyRow>(table: string, id: string): Promise<T | null> {
  return check(await supabase.from(table).select('*').eq('id', id).maybeSingle()) as T | null
}

export async function rpc<T = unknown>(fn: string, args: AnyRow): Promise<T> {
  return check(await supabase.rpc(fn, args)) as T
}

// ------------------------------------------------------------------ temporal writes with undo support

export interface RecordedMutation {
  table: string
  forward: DbOp
  inverse: DbOp
}

/** Execute concrete DB operations, returning a record that can be inverted (undo) or replayed (redo). */
export async function runDbOps(table: string, ops: DbOp[]): Promise<RecordedMutation[]> {
  const done: RecordedMutation[] = []
  for (const op of ops) {
    if (op.kind === 'insert') {
      const row = await insertRow(table, op.values)
      done.push({ table, forward: { kind: 'insert', values: stripSystem(row) }, inverse: { kind: 'delete', id: row.id } })
    } else if (op.kind === 'update') {
      const before = await getRow(table, op.id)
      if (!before) throw new DbError('수정할 항목이 존재하지 않습니다.', 'PGRST116')
      await updateRow(table, op.id, op.patch)
      const prev: AnyRow = {}
      for (const k of Object.keys(op.patch)) prev[k] = before[k]
      done.push({ table, forward: op, inverse: { kind: 'update', id: op.id, patch: prev } })
    } else {
      const before = await getRow(table, op.id)
      await deleteRow(table, op.id)
      if (before) done.push({ table, forward: op, inverse: { kind: 'insert', values: stripSystem(before) } })
    }
  }
  return done
}

function stripSystem(row: AnyRow): AnyRow {
  const copy = { ...row }
  delete copy.created_at
  delete copy.updated_at
  delete copy.created_by
  delete copy.updated_by
  return copy
}

/** Plan -> copy-on-write materialization -> execution, for one temporal table. */
export async function applyPlan<T extends TemporalRow>(
  table: TemporalTable, plan: PlannedOp<T>[], branchId: string, base: AnyRow,
): Promise<RecordedMutation[]> {
  const ops = materialize(plan, branchId, uuid, base)
  return runDbOps(table, ops)
}

export async function replay(muts: RecordedMutation[], direction: 'undo' | 'redo'): Promise<void> {
  const list = direction === 'undo' ? [...muts].reverse() : muts
  for (const m of list) {
    const op = direction === 'undo' ? m.inverse : m.forward
    if (op.kind === 'insert') check(await supabase.from(m.table).insert(op.values))
    else if (op.kind === 'update') check(await supabase.from(m.table).update(op.patch).eq('id', op.id))
    else check(await supabase.from(m.table).delete().eq('id', op.id))
  }
}

// ------------------------------------------------------------------ storage

import { ASSET_BUCKET } from '@/lib/supabase'

const urlCache = new Map<string, { url: string; expires: number }>()

export async function signedUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null
  const hit = urlCache.get(path)
  if (hit && hit.expires > Date.now()) return hit.url
  const { data, error } = await supabase.storage.from(ASSET_BUCKET).createSignedUrl(path, 3600)
  if (error || !data) return null
  urlCache.set(path, { url: data.signedUrl, expires: Date.now() + 50 * 60 * 1000 })
  return data.signedUrl
}

export async function downloadBlob(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(ASSET_BUCKET).download(path)
  if (error || !data) throw new DbError(error?.message ?? '파일을 내려받을 수 없습니다.')
  return data
}
