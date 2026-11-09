import { describe, expect, it } from 'vitest'
import {
  branchChain, entityInBranch, findOverlaps, hiddenSet, materialize, planClearFrom, planSetFrom, rowAt, visibleRows,
  type TemporalRow,
} from './timeline'

const branches = [
  { id: 'main', parent_id: null, fork_date: null, is_main: true },
  { id: 'A', parent_id: 'main', fork_date: '1939-01-01', is_main: false },
  { id: 'A2', parent_id: 'A', fork_date: '1941-06-01', is_main: false },
  { id: 'clone', parent_id: 'main', fork_date: null, is_main: false },
]

type Row = TemporalRow & { value: string; key: string }
const row = (p: Partial<Row> & { id: string }): Row => ({
  branch_id: 'main', valid_from: null, valid_to: null, overrides_id: null, is_tombstone: false, value: '', key: 'k', ...p,
})

describe('branchChain', () => {
  it('builds cutoffs that only shrink going up', () => {
    const c = branchChain(branches, 'A2')
    expect(c.map((l) => [l.branchId, l.cutoff])).toEqual([
      ['A2', null], ['A', '1941-06-01'], ['main', '1939-01-01'],
    ])
  })
  it('clone without fork date sees everything of parent', () => {
    expect(branchChain(branches, 'clone')[1]).toMatchObject({ branchId: 'main', cutoff: null })
  })
})

describe('visibleRows', () => {
  const rows = [
    row({ id: 'r1', value: 'monarchy', valid_from: '1936-01-01', valid_to: '1940-01-01' }),
    row({ id: 'r2', value: 'war cabinet', valid_from: '1940-01-01', valid_to: '1945-01-01' }),
    row({ id: 'r3', value: 'republic', valid_from: '1945-01-01' }),
  ]
  it('main branch sees all rows', () => {
    expect(visibleRows(rows, branchChain(branches, 'main')).map((r) => r.id)).toEqual(['r1', 'r2', 'r3'])
  })
  it('branch only inherits rows that started before fork date', () => {
    expect(visibleRows(rows, branchChain(branches, 'A')).map((r) => r.id)).toEqual(['r1'])
  })
  it('override in branch hides the original only in that branch', () => {
    const override = row({ id: 'o1', branch_id: 'A', overrides_id: 'r1', value: 'monarchy', valid_from: '1936-01-01', valid_to: null })
    const all = [...rows, override]
    expect(visibleRows(all, branchChain(branches, 'A')).map((r) => r.id)).toEqual(['o1'])
    expect(visibleRows(all, branchChain(branches, 'main')).map((r) => r.id)).toEqual(['r1', 'r2', 'r3'])
  })
  it('tombstones hide inherited rows', () => {
    const tomb = row({ id: 't1', branch_id: 'A', overrides_id: 'r1', is_tombstone: true, valid_from: '1936-01-01' })
    expect(visibleRows([...rows, tomb], branchChain(branches, 'A'))).toEqual([])
  })
  it('grandchild inherits overrides from its parent branch', () => {
    const override = row({ id: 'o1', branch_id: 'A', overrides_id: 'r1', value: 'x', valid_from: '1936-01-01' })
    const later = row({ id: 'a-late', branch_id: 'A', value: 'y', valid_from: '1942-01-01' })
    const vis = visibleRows([...rows, override, later], branchChain(branches, 'A2')).map((r) => r.id)
    expect(vis).toEqual(['o1'])
  })
})

describe('rowAt', () => {
  it('uses half-open ranges', () => {
    const rows = [row({ id: 'a', valid_from: '1936-01-01', valid_to: '1940-01-01' }), row({ id: 'b', valid_from: '1940-01-01' })]
    expect(rowAt(rows, '1939-12-31')?.id).toBe('a')
    expect(rowAt(rows, '1940-01-01')?.id).toBe('b')
    expect(rowAt(rows, '1935-12-31')).toBeUndefined()
  })
})

describe('planSetFrom', () => {
  it('closes the current row and inserts until the next change, preserving future rows', () => {
    const rows = [row({ id: 'a', valid_from: '1936-01-01', valid_to: null }), row({ id: 'b', valid_from: '1945-01-01' })]
    const ops = planSetFrom(rows, '1940-01-01', { value: 'x' } as Partial<Row>)
    expect(ops).toEqual([
      { kind: 'update', row: rows[0], patch: { valid_to: '1940-01-01' } },
      { kind: 'insert', values: { value: 'x', valid_from: '1940-01-01', valid_to: '1945-01-01' } },
    ])
  })
  it('updates in place when a row already starts on that date', () => {
    const rows = [row({ id: 'a', valid_from: '1940-01-01' })]
    expect(planSetFrom(rows, '1940-01-01', { value: 'x' } as Partial<Row>)).toEqual([{ kind: 'update', row: rows[0], patch: { value: 'x' } }])
  })
  it('inserts an open row when nothing exists', () => {
    expect(planSetFrom([] as Row[], '1936-01-01', { value: 'x' } as Partial<Row>)).toEqual([
      { kind: 'insert', values: { value: 'x', valid_from: '1936-01-01', valid_to: null } },
    ])
  })
})

describe('planClearFrom', () => {
  it('ends the current row at the date', () => {
    const rows = [row({ id: 'a', valid_from: '1936-01-01' })]
    expect(planClearFrom(rows, '1940-01-01')).toEqual([{ kind: 'update', row: rows[0], patch: { valid_to: '1940-01-01' } }])
  })
  it('deletes a row starting on that date', () => {
    const rows = [row({ id: 'a', valid_from: '1940-01-01' })]
    expect(planClearFrom(rows, '1940-01-01')).toEqual([{ kind: 'delete', row: rows[0] }])
  })
})

describe('materialize (copy-on-write)', () => {
  let n = 0
  const id = () => `new${++n}`
  it('updates own rows directly but overrides inherited rows', () => {
    n = 0
    const own = row({ id: 'own', branch_id: 'A', valid_from: '1939-01-01' })
    const inherited = row({ id: 'inh', branch_id: 'main', valid_from: '1936-01-01', value: 'old' })
    const db = materialize<Row>([
      { kind: 'update', row: own, patch: { value: 'v' } },
      { kind: 'update', row: inherited, patch: { valid_to: '1939-06-01' } },
    ], 'A', id)
    expect(db[0]).toEqual({ kind: 'update', id: 'own', patch: { value: 'v' } })
    expect(db[1]).toMatchObject({ kind: 'insert', values: { id: 'new1', branch_id: 'A', overrides_id: 'inh', value: 'old', valid_to: '1939-06-01' } })
  })
  it('deleting inherited rows creates tombstones; deleting own override keeps hiding the original', () => {
    n = 0
    const inherited = row({ id: 'inh', branch_id: 'main' })
    const ownOverride = row({ id: 'ov', branch_id: 'A', overrides_id: 'inh' })
    const plain = row({ id: 'p', branch_id: 'A' })
    const db = materialize<Row>([
      { kind: 'delete', row: inherited }, { kind: 'delete', row: ownOverride }, { kind: 'delete', row: plain },
    ], 'A', id)
    expect(db[0]).toMatchObject({ kind: 'insert', values: { is_tombstone: true, overrides_id: 'inh', branch_id: 'A' } })
    expect(db[1]).toEqual({ kind: 'update', id: 'ov', patch: { is_tombstone: true } })
    expect(db[2]).toEqual({ kind: 'delete', id: 'p' })
  })
})

describe('entity visibility', () => {
  it('entities created in a branch are only in that line and its descendants', () => {
    const chainA = branchChain(branches, 'A')
    const chainMain = branchChain(branches, 'main')
    const e = { id: 'e', origin_branch_id: 'A', starts_on: null }
    expect(entityInBranch(e, chainA, new Set())).toBe(true)
    expect(entityInBranch(e, chainMain, new Set())).toBe(false)
  })
  it('main-line entities starting after the fork are not inherited', () => {
    const chainA = branchChain(branches, 'A')
    expect(entityInBranch({ id: 'w', origin_branch_id: 'main', starts_on: '1939-09-01' }, chainA, new Set())).toBe(false)
    expect(entityInBranch({ id: 'w', origin_branch_id: 'main', starts_on: '1938-09-01' }, chainA, new Set())).toBe(true)
  })
  it('hides apply to descendants', () => {
    const chainA2 = branchChain(branches, 'A2')
    const hidden = hiddenSet([{ branch_id: 'A', entity_id: 'x' }], chainA2)
    expect(entityInBranch({ id: 'x', origin_branch_id: null, starts_on: null }, chainA2, hidden)).toBe(false)
  })
})

describe('findOverlaps', () => {
  it('detects overlapping half-open ranges but not touching ones', () => {
    const a = { id: 'a', valid_from: '1936-01-01', valid_to: '1940-01-01' }
    const b = { id: 'b', valid_from: '1940-01-01', valid_to: null }
    const c = { id: 'c', valid_from: '1939-01-01', valid_to: '1941-01-01' }
    expect(findOverlaps([a, b])).toEqual([])
    expect(findOverlaps([a, b, c]).length).toBe(2)
  })
})
