import { describe, expect, it } from 'vitest'
import { checkConflicts, type ConflictInput } from './conflicts'

const base = (): ConflictInput => ({
  entities: [], foreignIds: new Set(), countryStates: [], control: [], unitStates: [], positions: [], affiliations: [], seats: [],
  shipAssignments: [], warParticipants: [], chambers: [], governments: [], elections: [], electionResults: [],
})
const t = (id: string, from: string | null, to: string | null, extra: Record<string, unknown> = {}) => ({ id, valid_from: from, valid_to: to, ...extra })

describe('conflict checks', () => {
  it('flags end before start', () => {
    const i = base()
    i.entities = [{ id: 'a', kind: 'country', name: 'A', starts_on: '1940-01-01', ends_on: '1930-01-01' }]
    expect(checkConflicts(i).map((c) => c.category)).toContain('날짜 오류')
  })
  it('flags activity after death', () => {
    const i = base()
    i.entities = [{ id: 'p', kind: 'character', name: 'P', starts_on: null, ends_on: '1940-01-01' }]
    i.positions = [t('x', '1938-01-01', null, { character_id: 'p' })]
    expect(checkConflicts(i).some((c) => c.category === '사망 이후 인물의 활동')).toBe(true)
    i.positions = [t('x', '1938-01-01', '1939-06-01', { character_id: 'p' })]
    expect(checkConflicts(i).some((c) => c.category === '사망 이후 인물의 활동')).toBe(false)
  })
  it('flags seat sum mismatch and overlaps', () => {
    const i = base()
    i.entities = [{ id: 'parl', kind: 'parliament', name: 'P', starts_on: null, ends_on: null }]
    i.chambers = [{ id: 'c', total_seats: 300, name: '하원', parliament_id: 'parl' }]
    i.seats = [t('s1', '1936-01-01', null, { chamber_id: 'c', party_id: 'a', seats: 200 }), t('s2', '1936-01-01', null, { chamber_id: 'c', party_id: 'b', seats: 90 })]
    expect(checkConflicts(i).some((c) => c.category === '의회 의석 합계 오류')).toBe(true)
    i.seats[1].seats = 100
    expect(checkConflicts(i).some((c) => c.category === '의회 의석 합계 오류')).toBe(false)
  })
  it('flags overlapping territory control', () => {
    const i = base()
    i.entities = [{ id: 'r', kind: 'region', name: 'R', starts_on: null, ends_on: null }]
    i.control = [t('a', '1936-01-01', null, { region_id: 'r' }), t('b', '1940-01-01', null, { region_id: 'r' })]
    expect(checkConflicts(i).some((c) => c.category === '중복된 지역 지배 상태')).toBe(true)
  })
  it('flags unit cycles and disbanded parents', () => {
    const i = base()
    i.entities = [
      { id: 'a', kind: 'unit', name: 'A', starts_on: null, ends_on: null },
      { id: 'b', kind: 'unit', name: 'B', starts_on: null, ends_on: '1939-01-01' },
    ]
    i.unitStates = [t('1', null, null, { unit_id: 'a', parent_unit_id: 'b' }), t('2', null, null, { unit_id: 'b', parent_unit_id: 'a' })]
    const cats = checkConflicts(i).map((c) => c.category)
    expect(cats).toContain('부대 트리 순환참조')
    expect(cats).toContain('해체된 부대의 이후 소속')
  })
})
