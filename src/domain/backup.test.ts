import { describe, expect, it } from 'vitest'
import { prepareImport, topoSort, validateBackup, type BackupFile } from './backup'

const P = '00000000-0000-4000-8000-000000000001'
const MAIN = '00000000-0000-4000-8000-000000000002'
const BR = '00000000-0000-4000-8000-000000000003'
const C1 = '00000000-0000-4000-8000-000000000004'
const R1 = '00000000-0000-4000-8000-000000000005'
const S1 = '00000000-0000-4000-8000-000000000006'
const S2 = '00000000-0000-4000-8000-000000000007'

const backup: BackupFile = {
  format: 'atlas-backup', version: 1, exported_at: '', app: 'test',
  project: { id: P, name: 'X', cover_path: `${P}/cover.png` },
  tables: {
    atlas_branches: [
      { id: MAIN, project_id: P, is_main: true, parent_id: null, fork_date: null, name: 'main' },
      { id: BR, project_id: P, is_main: false, parent_id: MAIN, fork_date: '1939-01-01', name: 'A' },
    ],
    atlas_entities: [{ id: C1, project_id: P, kind: 'country', name: 'A' }, { id: R1, project_id: P, kind: 'region', name: 'R' }],
    atlas_country_states: [
      { id: S2, project_id: P, branch_id: BR, country_id: C1, overrides_id: S1 },
      { id: S1, project_id: P, branch_id: MAIN, country_id: C1, overrides_id: null, flag_path: `${P}/flags/a.png` },
    ],
    atlas_chambers: [{ id: '00000000-0000-4000-8000-000000000008', project_id: P, party_order: [C1] }],
  },
}

describe('backup', () => {
  it('validates structure', () => {
    expect(validateBackup(backup).ok).toBe(true)
    expect(validateBackup({ format: 'x' }).ok).toBe(false)
    const bad = structuredClone(backup)
    bad.tables.atlas_entities[0].project_id = 'other'
    expect(validateBackup(bad).ok).toBe(false)
  })

  it('remaps every id, array and storage path to the new project and merges main branch', () => {
    let n = 100
    const newId = () => `00000000-0000-4000-9000-${String(n++).padStart(12, '0')}`
    const NP = 'aaaaaaaa-0000-4000-8000-000000000000'
    const NM = 'bbbbbbbb-0000-4000-8000-000000000000'
    const { tables, mainBranch, project } = prepareImport(backup, NP, NM, newId)
    expect(mainBranch?.id).toBe(NM)
    expect(tables.atlas_branches).toHaveLength(1)
    expect(tables.atlas_branches[0].parent_id).toBe(NM)
    const newC1 = tables.atlas_entities[0].id
    expect(newC1).not.toBe(C1)
    expect(tables.atlas_chambers[0].party_order).toEqual([newC1])
    const states = tables.atlas_country_states
    // original row must be inserted before its override
    expect(states[0].overrides_id).toBeNull()
    expect(states[1].overrides_id).toBe(states[0].id)
    expect(states[0].flag_path).toBe(`${NP}/flags/a.png`)
    expect(project.cover_path).toBe(`${NP}/cover.png`)
    for (const rows of Object.values(tables)) for (const r of rows) expect(r.project_id).toBe(NP)
  })

  it('topoSort keeps unrelated order', () => {
    const rows = [{ id: 'a' }, { id: 'b' }]
    expect(topoSort('x', rows)).toEqual(rows)
  })
})
