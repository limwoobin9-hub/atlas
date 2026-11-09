/** Compare two world lines at a date. Pure. */
import { entityInBranch, hiddenSet, rowsAt, visibleRows, type ChainLink, type TemporalRow } from './timeline'

type Row = TemporalRow & Record<string, unknown>
export interface DiffItem { category: string; key: string; label: string; a: string; b: string }

export interface DiffSpec { table: string; category: string; key: (r: Row) => string; value: (r: Row, name: (id: unknown) => string) => string; label: (k: string, name: (id: unknown) => string) => string }

export function diffBranches(opts: {
  date: string
  chainA: ChainLink[]
  chainB: ChainLink[]
  entities: { id: string; name: string; kind: string; origin_branch_id: string | null; starts_on: string | null; ends_on: string | null }[]
  hides: { branch_id: string; entity_id: string }[]
  tables: Record<string, Row[]>
  specs: DiffSpec[]
}) {
  const { date, chainA, chainB, entities } = opts
  const hA = hiddenSet(opts.hides, chainA)
  const hB = hiddenSet(opts.hides, chainB)
  const inA = new Set(entities.filter((e) => entityInBranch(e, chainA, hA)).map((e) => e.id))
  const inB = new Set(entities.filter((e) => entityInBranch(e, chainB, hB)).map((e) => e.id))
  const nameOf = new Map(entities.map((e) => [e.id, e.name]))
  const name = (id: unknown) => (typeof id === 'string' ? nameOf.get(id) ?? '?' : '—')
  const onlyA = entities.filter((e) => inA.has(e.id) && !inB.has(e.id))
  const onlyB = entities.filter((e) => inB.has(e.id) && !inA.has(e.id))

  const items: DiffItem[] = []
  for (const spec of opts.specs) {
    const rows = opts.tables[spec.table] ?? []
    const at = (chain: ChainLink[], inLine: Set<string>) => {
      const m = new Map<string, string[]>()
      for (const r of rowsAt(visibleRows(rows, chain), date)) {
        const k = spec.key(r)
        if (k.split('|').some((id) => /^[0-9a-f-]{36}$/.test(id) && !inLine.has(id))) continue
        if (!m.has(k)) m.set(k, [])
        m.get(k)!.push(spec.value(r, name))
      }
      return m
    }
    const a = at(chainA, inA)
    const b = at(chainB, inB)
    for (const k of new Set([...a.keys(), ...b.keys()])) {
      const va = (a.get(k) ?? []).sort().join(', ') || '없음'
      const vb = (b.get(k) ?? []).sort().join(', ') || '없음'
      if (va !== vb) items.push({ category: spec.category, key: k, label: spec.label(k, name), a: va, b: vb })
    }
  }
  return { onlyA, onlyB, items }
}

export const DIFF_SPECS: DiffSpec[] = [
  {
    table: 'atlas_country_states', category: '국가 상태', key: (r) => String(r.country_id),
    value: (r, n) => [r.name, r.government_form, r.head_of_state_id ? `원수 ${n(r.head_of_state_id)}` : ''].filter(Boolean).join(' · ') || '기록',
    label: (k, n) => n(k),
  },
  {
    table: 'atlas_territory_control', category: '영토 지배', key: (r) => String(r.region_id),
    value: (r, n) => n(r.controller_id), label: (k, n) => n(k),
  },
  {
    table: 'atlas_diplomatic_relations', category: '외교관계', key: (r) => [r.a_id, r.b_id].map(String).sort().join('|'),
    value: (r) => String(r.relation_type), label: (k, n) => k.split('|').map(n).join(' ↔ '),
  },
  {
    table: 'atlas_war_participants', category: '참전', key: (r) => `${r.war_id}|${r.participant_id}`,
    value: () => '참전', label: (k, n) => k.split('|').map(n).join(' : '),
  },
  {
    table: 'atlas_seat_allocations', category: '의석', key: (r) => `${r.party_id}`,
    value: (r) => `${r.seats}석`, label: (k, n) => n(k),
  },
  {
    table: 'atlas_unit_states', category: '부대 편제', key: (r) => String(r.unit_id),
    value: (r, n) => `상위 ${n(r.parent_unit_id)} · 지휘 ${n(r.commander_id)}`, label: (k, n) => n(k),
  },
  {
    table: 'atlas_positions', category: '직책', key: (r) => `${r.character_id}`,
    value: (r) => String(r.title), label: (k, n) => n(k),
  },
]
