import { describe, expect, it } from 'vitest'
import { buildOob, flattenOob, wouldCycle } from './oob'

const u = (id: string, extra = {}) => ({ id, name: id, starts_on: null, ends_on: null, ...extra })
const s = (unit_id: string, parent_unit_id: string | null, from: string | null = null, to: string | null = null, country_id: string | null = null) =>
  ({ unit_id, parent_unit_id, country_id, commander_id: null, name: '', valid_from: from, valid_to: to })

describe('order of battle', () => {
  it('builds hierarchy at a date and inherits country', () => {
    const roots = buildOob([u('army'), u('corps'), u('div')], [s('army', null, null, null, 'A'), s('corps', 'army'), s('div', 'corps')], '1940-01-01')
    expect(roots).toHaveLength(1)
    expect(roots[0].children[0].children[0].unit.id).toBe('div')
    expect(flattenOob(roots).every((n) => n.countryId === 'A')).toBe(true)
  })
  it('reflects reorganisations by date', () => {
    const states = [s('div', 'corps1', '1936-01-01', '1941-01-01'), s('div', 'corps2', '1941-01-01')]
    const units = [u('corps1'), u('corps2'), u('div')]
    expect(buildOob(units, states, '1940-01-01').find((r) => r.unit.id === 'corps1')!.children).toHaveLength(1)
    expect(buildOob(units, states, '1942-01-01').find((r) => r.unit.id === 'corps2')!.children).toHaveLength(1)
  })
  it('excludes disbanded units', () => {
    expect(buildOob([u('x', { ends_on: '1939-01-01' })], [], '1940-01-01')).toHaveLength(0)
  })
  it('detects cycles', () => {
    const parents = new Map<string, string | null>([['div', 'corps'], ['corps', 'army'], ['army', null]])
    expect(wouldCycle(parents, 'army', 'div')).toBe(true)
    expect(wouldCycle(parents, 'div', 'army')).toBe(false)
  })
  it('does not loop forever on cyclic data', () => {
    const roots = buildOob([u('a'), u('b')], [s('a', 'b'), s('b', 'a')], '1940-01-01')
    expect(flattenOob(roots)).toHaveLength(2)
  })
})
