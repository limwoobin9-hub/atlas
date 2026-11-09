import { describe, expect, it } from 'vitest'
import { assignSeats, circleSeats, compareElections, hemicycleSeats, majorityThreshold, orderParties } from './parliament'
import { resolvePartyColors } from './colors'

describe('seat layouts', () => {
  for (const n of [1, 7, 100, 300, 651]) {
    it(`hemicycle produces exactly ${n} seats in the upper half`, () => {
      const s = hemicycleSeats(n)
      expect(s).toHaveLength(n)
      expect(s.every((x) => x.y <= 1e-9)).toBe(true)
    })
  }
  it('hemicycle seats are ordered left to right', () => {
    const s = hemicycleSeats(300)
    expect(s[0].x).toBeLessThan(0)
    expect(s[s.length - 1].x).toBeGreaterThan(0)
  })
  it('circle produces exactly n seats', () => {
    expect(circleSeats(123)).toHaveLength(123)
  })
  it('assigns seats in party order and leaves vacancies', () => {
    const a = assignSeats(hemicycleSeats(10), [{ partyId: 'L', seats: 3 }, { partyId: 'R', seats: 5 }])
    expect(a.filter((x) => x === 'L')).toHaveLength(3)
    expect(a.filter((x) => x === null)).toHaveLength(2)
    expect(a[0]).toBe('L')
  })
})

describe('parliament arithmetic', () => {
  it('majority', () => {
    expect(majorityThreshold(300)).toBe(151)
    expect(majorityThreshold(301)).toBe(151)
    expect(majorityThreshold(300, 200)).toBe(200)
  })
  it('orders parties by saved order', () => {
    const parties = [{ partyId: 'a', seats: 1 }, { partyId: 'b', seats: 50 }, { partyId: 'c', seats: 10 }]
    expect(orderParties(parties, ['c', 'a']).map((p) => p.partyId)).toEqual(['c', 'a', 'b'])
  })
  it('compares elections', () => {
    const r = compareElections(
      [{ partyId: 'a', seats: 120, share: 40 }, { partyId: 'b', seats: 180, share: 55 }],
      [{ partyId: 'a', seats: 160, share: 48 }, { partyId: 'b', seats: 140, share: 45 }],
    )
    expect(r.rows[0].seatDelta).toBe(-40)
    expect(r.rows[1].shareDelta).toBe(10)
    expect(r.firstParty).toBe('b')
    expect(r.firstPartyChanged).toBe(true)
  })
})

describe('party colours', () => {
  it('uses ideology colour and shades duplicates, respects custom', () => {
    const m = resolvePartyColors([
      { id: 'p1', color: null, color_mode: 'ideology', ideology_id: 'i' },
      { id: 'p2', color: null, color_mode: 'ideology', ideology_id: 'i' },
      { id: 'p3', color: '#123456', color_mode: 'custom', ideology_id: 'i' },
    ], [{ id: 'i', color: '#2563eb' }])
    expect(m.get('p1')).toBe('#2563eb')
    expect(m.get('p2')).not.toBe('#2563eb')
    expect(m.get('p3')).toBe('#123456')
  })
})
