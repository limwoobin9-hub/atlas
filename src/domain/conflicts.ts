/**
 * World consistency checks. Pure: takes already-resolved (branch-visible) data and returns findings.
 * Cross-project links and dangling references are prevented by composite foreign keys in the DB;
 * these checks cover logical contradictions inside one world line.
 */
import { findOverlaps } from './timeline'
import { wouldCycle } from './oob'

export type Severity = 'error' | 'warning'
export interface Conflict {
  key: string
  severity: Severity
  category: string
  title: string
  detail: string
  entityIds: string[]
}

interface E { id: string; kind: string; name: string; starts_on: string | null; ends_on: string | null }
interface T { id: string; valid_from: string | null; valid_to: string | null; [k: string]: unknown }

export interface ConflictInput {
  entities: E[]
  /** ids of entities that exist in the project but not in this world line */
  foreignIds: Set<string>
  countryStates: T[]
  control: T[]
  unitStates: T[]
  positions: T[]
  affiliations: T[]
  seats: T[]
  shipAssignments: T[]
  warParticipants: T[]
  chambers: { id: string; total_seats: number; name: string; parliament_id: string }[]
  governments: { id: string; country_id: string | null }[]
  elections: { id: string; chamber_id: string | null; applied_from: string | null }[]
  electionResults: { election_id: string; party_id: string | null; seats: number | null }[]
}

const fmt = (d: string | null) => d ?? '처음'

function after(rowFrom: string | null, rowTo: string | null, limit: string): boolean {
  // the row is (partly) active on or after `limit`
  return !rowTo || rowTo > limit || (!!rowFrom && rowFrom >= limit)
}

export function checkConflicts(input: ConflictInput): Conflict[] {
  const out: Conflict[] = []
  const ent = new Map(input.entities.map((e) => [e.id, e]))
  const name = (id: unknown) => (typeof id === 'string' ? ent.get(id)?.name ?? '?' : '?')

  // 1. end before start
  for (const e of input.entities) {
    if (e.starts_on && e.ends_on && e.ends_on < e.starts_on) {
      out.push({ key: `dates:${e.id}`, severity: 'error', category: '날짜 오류', title: `${e.name}: 종료일이 시작일보다 빠름`, detail: `${e.starts_on} ~ ${e.ends_on}`, entityIds: [e.id] })
    }
  }

  // 2. references to entities missing from this world line
  const refCols: [string, T[], string[]][] = [
    ['국가 상태', input.countryStates, ['country_id', 'capital_id', 'head_of_state_id', 'head_of_government_id']],
    ['영토 지배', input.control, ['region_id', 'controller_id', 'sovereign_id']],
    ['부대 편제', input.unitStates, ['unit_id', 'parent_unit_id', 'country_id', 'commander_id']],
    ['직책', input.positions, ['character_id', 'organization_id']],
    ['참전', input.warParticipants, ['war_id', 'participant_id']],
  ]
  for (const [label, rows, cols] of refCols) {
    for (const r of rows) {
      for (const c of cols) {
        const v = r[c]
        if (typeof v === 'string' && !ent.has(v) && input.foreignIds.has(v)) {
          out.push({ key: `missing:${r.id}:${c}`, severity: 'warning', category: '존재하지 않는 Entity 참조', title: `${label} 기록이 이 세계선에 없는 항목을 참조`, detail: `${c} → 다른 세계선 전용이거나 숨겨진 항목`, entityIds: cols.map((x) => r[x]).filter((x): x is string => typeof x === 'string' && ent.has(x)) })
        }
      }
    }
  }

  // 3. activity after death
  const deaths = new Map(input.entities.filter((e) => e.kind === 'character' && e.ends_on).map((e) => [e.id, e.ends_on!]))
  const deathChecks: [string, T[], string][] = [['직책', input.positions, 'character_id'], ['소속', input.affiliations, 'character_id'], ['부대 지휘', input.unitStates, 'commander_id'], ['국가원수', input.countryStates, 'head_of_state_id'], ['정부수반', input.countryStates, 'head_of_government_id']]
  for (const [label, rows, col] of deathChecks) {
    for (const r of rows) {
      const cid = r[col] as string | null
      const death = cid ? deaths.get(cid) : undefined
      if (death && after(r.valid_from, r.valid_to, death)) {
        out.push({ key: `death:${r.id}:${col}`, severity: 'warning', category: '사망 이후 인물의 활동', title: `${name(cid)}: 사망(${death}) 이후에도 ${label} 기록`, detail: `기간 ${fmt(r.valid_from)} ~ ${r.valid_to ?? '현재'}`, entityIds: [cid!] })
      }
    }
  }

  // 4. disbanded units
  const disband = new Map(input.entities.filter((e) => e.kind === 'unit' && e.ends_on).map((e) => [e.id, e.ends_on!]))
  for (const r of input.unitStates) {
    const own = disband.get(r.unit_id as string)
    if (own && r.valid_from && r.valid_from >= own) out.push({ key: `disband:${r.id}`, severity: 'warning', category: '해체된 부대의 이후 소속', title: `${name(r.unit_id)}: 해체(${own}) 이후의 편제 기록`, detail: `${fmt(r.valid_from)}부터`, entityIds: [r.unit_id as string] })
    const parentEnd = r.parent_unit_id ? disband.get(r.parent_unit_id as string) : undefined
    if (parentEnd && after(r.valid_from, r.valid_to, parentEnd)) out.push({ key: `disband-parent:${r.id}`, severity: 'warning', category: '해체된 부대의 이후 소속', title: `${name(r.unit_id)}: 해체된 상위부대 ${name(r.parent_unit_id)}(${parentEnd}) 소속 유지`, detail: `기간 ${fmt(r.valid_from)} ~ ${r.valid_to ?? '현재'}`, entityIds: [r.unit_id as string, r.parent_unit_id as string] })
  }

  // 5. dissolved countries with later governments / states
  const dissolved = new Map(input.entities.filter((e) => e.kind === 'country' && e.ends_on).map((e) => [e.id, e.ends_on!]))
  for (const g of input.governments) {
    const ge = ent.get(g.id)
    const end = g.country_id ? dissolved.get(g.country_id) : undefined
    if (ge && end && after(ge.starts_on, ge.ends_on, end)) out.push({ key: `dissolved-gov:${g.id}`, severity: 'warning', category: '멸망한 국가의 이후 정부', title: `${ge.name}: ${name(g.country_id)} 멸망(${end}) 이후에도 존속`, detail: `${fmt(ge.starts_on)} ~ ${ge.ends_on ?? '현재'}`, entityIds: [g.id, g.country_id!] })
  }
  for (const s of input.countryStates) {
    const end = dissolved.get(s.country_id as string)
    if (end && s.valid_from && s.valid_from >= end) out.push({ key: `dissolved-state:${s.id}`, severity: 'warning', category: '멸망한 국가의 이후 정부', title: `${name(s.country_id)}: 멸망(${end}) 이후의 국가 상태 기록`, detail: `${s.valid_from}부터`, entityIds: [s.country_id as string] })
  }

  // 6. seat sums per chamber at each change date
  for (const ch of input.chambers) {
    const rows = input.seats.filter((s) => s.chamber_id === ch.id)
    const dates = [...new Set(rows.map((r) => r.valid_from ?? '0001-01-01'))].sort()
    for (const d of dates) {
      const sum = rows.filter((r) => (!r.valid_from || r.valid_from <= d) && (!r.valid_to || d < r.valid_to)).reduce((a, r) => a + Number(r.seats ?? 0), 0)
      if (sum !== ch.total_seats && sum > 0) out.push({ key: `seats:${ch.id}:${d}`, severity: sum > ch.total_seats ? 'error' : 'warning', category: '의회 의석 합계 오류', title: `${name(ch.parliament_id)} ${ch.name}: ${d} 의석 합계 ${sum} ≠ 총 ${ch.total_seats}석`, detail: sum > ch.total_seats ? '총 의석 초과' : `공석 ${ch.total_seats - sum}석`, entityIds: [ch.parliament_id] })
    }
  }

  // 7. order of battle cycles at each change date
  const unitDates = [...new Set(input.unitStates.map((r) => r.valid_from ?? '0001-01-01'))].sort()
  const seenCycle = new Set<string>()
  for (const d of unitDates) {
    const parentOf = new Map<string, string | null>()
    for (const r of input.unitStates) if ((!r.valid_from || r.valid_from <= d) && (!r.valid_to || d < r.valid_to)) parentOf.set(r.unit_id as string, (r.parent_unit_id as string) ?? null)
    for (const [u, p] of parentOf) {
      parentOf.set(u, null)
      const cyc = wouldCycle(parentOf, u, p)
      parentOf.set(u, p)
      if (cyc && !seenCycle.has(u)) {
        seenCycle.add(u)
        out.push({ key: `cycle:${u}`, severity: 'error', category: '부대 트리 순환참조', title: `${name(u)}: 상위부대 사슬이 자기 자신으로 돌아옴`, detail: `${d} 시점`, entityIds: [u] })
      }
    }
  }

  // 8. overlapping single-valued periods
  const overlapSets: [string, string, T[], (r: T) => string][] = [
    ['서로 충돌하는 기간별 상태', '국가 상태', input.countryStates, (r) => String(r.country_id)],
    ['서로 충돌하는 기간별 상태', '부대 편제', input.unitStates, (r) => String(r.unit_id)],
    ['서로 충돌하는 기간별 상태', '함선 소속', input.shipAssignments, (r) => String(r.ship_id)],
    ['서로 충돌하는 기간별 상태', '의석 배분', input.seats, (r) => `${r.chamber_id}:${r.party_id}`],
    ['중복된 지역 지배 상태', '영토 지배', input.control, (r) => String(r.region_id)],
  ]
  for (const [cat, label, rows, key] of overlapSets) {
    const groups = new Map<string, T[]>()
    for (const r of rows) { const k = key(r); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(r) }
    for (const [k, list] of groups) {
      for (const [a, b] of findOverlaps(list)) {
        const owner = k.split(':')[0]
        out.push({ key: `overlap:${a.id}:${b.id}`, severity: 'warning', category: cat, title: `${name(owner)}: ${label} 기간 중복`, detail: `${fmt(a.valid_from)}~${a.valid_to ?? '현재'} 과 ${fmt(b.valid_from)}~${b.valid_to ?? '현재'}`, entityIds: ent.has(owner) ? [owner] : [] })
      }
    }
  }

  // 9. applied elections vs composition
  for (const el of input.elections) {
    if (!el.applied_from || !el.chamber_id) continue
    const d = el.applied_from
    const comp = new Map<string, number>()
    for (const r of input.seats) if (r.chamber_id === el.chamber_id && (!r.valid_from || r.valid_from <= d) && (!r.valid_to || d < r.valid_to)) comp.set(String(r.party_id), (comp.get(String(r.party_id)) ?? 0) + Number(r.seats))
    const results = input.electionResults.filter((r) => r.election_id === el.id && r.party_id && (r.seats ?? 0) > 0)
    const mismatch = results.some((r) => comp.get(r.party_id!) !== r.seats) || [...comp.entries()].some(([pid, s]) => s > 0 && !results.some((r) => r.party_id === pid))
    if (mismatch) out.push({ key: `election:${el.id}`, severity: 'warning', category: '선거 이후 의회 구성 불일치', title: `${name(el.id)}: 반영일(${d})의 의회 구성이 선거 결과와 다름`, detail: '결과를 수정했다면 다시 반영하세요.', entityIds: [el.id] })
  }

  return out
}
