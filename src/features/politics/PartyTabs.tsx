import { LineChart, Network, Plus, Trash2, Users, Vote } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { EChart } from '@/components/EChart'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import { Card, CardHeader, Empty } from '@/components/ui/misc'
import { deleteWhere, insertRow } from '@/data/db'
import { useInvalidateTable, useTable, useTemporal } from '@/data/hooks'
import type { AnyRow, Chamber, Entity, SeatAllocation , Temporal } from '@/data/types'
import { useWorld } from '@/data/world'
import { compareDates, formatDate, formatRange, inRange } from '@/domain/dates'
import { friendlyError } from '@/lib/errors'
import { sortBy } from '@/lib/utils'
import { EntityLink } from '@/features/entities/common'
import { useCreateDialog } from '@/features/entities/CreateEntityDialog'
import { EntityPicker } from '@/features/entities/EntityPicker'
import { TEMPORAL } from '@/features/entities/fields'
import { TemporalEditor } from '@/features/entities/TemporalEditor'
import { entityActiveAt } from '@/domain/timeline'

export function PartyFactions({ entity }: { entity: Entity }) {
  const factions = useTable<AnyRow>('atlas_factions', { party_id: entity.id })
  const { entityMap, date } = useWorld()
  const open = useCreateDialog((s) => s.open)
  const list = (factions.data ?? []).filter((f) => entityMap.has(f.id))
  return (
    <Card>
      <CardHeader title="당내 계파" icon={<Network />} sub="계파의 결성·해산일, 분열 원천을 기록합니다" actions={<Button size="xs" variant="secondary" onClick={() => open('faction', { sub: { party_id: entity.id }, navigate: false })}><Plus />계파 생성</Button>} />
      {list.length === 0 ? <p className="px-4 py-3 text-[12px] text-subtle">계파가 없습니다.</p> : (
        <ul className="divide-y divide-border">
          {list.map((f) => {
            const e = entityMap.get(f.id)!
            return (
              <li key={f.id} className={`flex items-center gap-3 px-4 py-2 text-[12.5px] ${entityActiveAt(e, date) ? '' : 'opacity-60'}`}>
                <EntityLink id={f.id} />
                <span className="text-[11.5px] text-muted">{formatRange(e.starts_on, e.ends_on)}</span>
                {f.leader_id && <span className="text-[11.5px] text-muted">지도자 <EntityLink id={f.leader_id} showIcon={false} /></span>}
                {f.support_pct !== null && <span className="text-[11.5px] text-muted">당내 {f.support_pct}%</span>}
                {f.split_from_id && <span className="text-[11.5px] text-muted">← <EntityLink id={f.split_from_id} showIcon={false} />에서 분열</span>}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

export function PartyPolling({ entity }: { entity: Entity }) {
  const polls = useTemporal<Temporal & AnyRow & { valid_from: string; support_pct: number }>('atlas_party_polling', { party_id: entity.id })
  const data = sortBy(polls.visible, (p) => p.valid_from)
  return (
    <>
      <Card>
        <CardHeader title="지지율 추이" icon={<LineChart />} sub="입력된 여론조사만 표시합니다. 의석수와는 별개의 지표입니다." />
        {data.length === 0 ? <div className="p-4"><Empty title="지지율 기록이 없습니다" description="실제 입력한 조사 결과가 없으면 그래프를 만들지 않습니다." /></div> : (
          <EChart height={280} option={{
            grid: { left: 40, right: 16, top: 20, bottom: 30 },
            tooltip: { trigger: 'axis' },
            xAxis: { type: 'time' },
            yAxis: { type: 'value', min: 0, axisLabel: { formatter: '{value}%' } },
            series: [{ type: 'line', name: entity.name, data: data.map((p) => [p.valid_from, p.support_pct]), smooth: false, symbolSize: 7, itemStyle: { color: entity.color ?? '#6366f1' } }],
          }} />
        )}
      </Card>
      <TemporalEditor config={TEMPORAL.party_polling} filters={{ party_id: entity.id }} title="지지율 조사 기록" compact />
    </>
  )
}

/** Comparison chart of several parties' polling (used on politics hub). */
export function PollingComparison({ partyIds }: { partyIds: string[] }) {
  const polls = useTemporal<Temporal & AnyRow & { party_id: string; valid_from: string; support_pct: number }>('atlas_party_polling')
  const { entityMap } = useWorld()
  const series = partyIds.map((id) => ({
    type: 'line' as const, name: entityMap.get(id)?.name ?? '?', itemStyle: { color: entityMap.get(id)?.color ?? undefined },
    data: sortBy(polls.visible.filter((p) => p.party_id === id), (p) => p.valid_from).map((p) => [p.valid_from, p.support_pct]),
  })).filter((s) => s.data.length > 0)
  if (series.length === 0) return <p className="p-4 text-[12px] text-subtle">지지율 기록이 있는 정당이 없습니다.</p>
  return <EChart height={300} option={{ grid: { left: 40, right: 16, top: 34, bottom: 30 }, legend: { top: 0 }, tooltip: { trigger: 'axis' }, xAxis: { type: 'time' }, yAxis: { type: 'value', min: 0, axisLabel: { formatter: '{value}%' } }, series }} />
}

export function PartyElections({ entity }: { entity: Entity }) {
  const results = useTable<AnyRow>('atlas_election_results', { party_id: entity.id }, 'election_id')
  const seats = useTemporal<SeatAllocation>('atlas_seat_allocations', { party_id: entity.id })
  const chambers = useTable<Chamber>('atlas_chambers')
  const { entityMap, date } = useWorld()
  const list = (results.data ?? []).map((r) => ({ r, e: entityMap.get(r.election_id) })).filter((x) => x.e).sort((a, b) => compareDates(a.e!.starts_on, b.e!.starts_on))
  return (
    <>
      <Card>
        <CardHeader title="선거 기록" icon={<Vote />} />
        {list.length === 0 ? <p className="px-4 py-3 text-[12px] text-subtle">참여한 선거 결과가 없습니다.</p> : (
          <table className="w-full text-[12.5px]">
            <thead className="bg-surface-2 text-[11px] text-muted"><tr><th className="px-4 py-1.5 text-left font-medium">선거</th><th className="text-left font-medium">날짜</th><th className="text-right font-medium">득표수</th><th className="text-right font-medium">득표율</th><th className="px-4 text-right font-medium">의석</th></tr></thead>
            <tbody className="divide-y divide-border">
              {list.map(({ r, e }) => (
                <tr key={r.id}><td className="px-4 py-1.5"><EntityLink id={e!.id} /></td><td className="tabular-nums text-muted">{formatDate(e!.starts_on, 'short')}</td><td className="text-right tabular-nums">{r.votes?.toLocaleString() ?? '—'}</td><td className="text-right tabular-nums">{r.vote_share ?? '—'}%</td><td className="px-4 text-right tabular-nums font-medium">{r.seats ?? '—'}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card>
        <CardHeader title="의석 변동 기록" />
        {seats.visible.length === 0 ? <p className="px-4 py-3 text-[12px] text-subtle">의석 기록이 없습니다.</p> : (
          <ul className="divide-y divide-border">
            {sortBy(seats.visible, (s) => s.valid_from).map((s) => {
              const ch = chambers.data?.find((c) => c.id === s.chamber_id)
              return (
                <li key={s.id} className={`flex gap-3 px-4 py-1.5 text-[12.5px] ${inRange(date, s.valid_from, s.valid_to) ? 'bg-accent-soft/50' : ''}`}>
                  <span className="w-44 text-[11.5px] tabular-nums text-muted">{formatRange(s.valid_from, s.valid_to)}</span>
                  <span className="flex-1">{ch ? `${entityMap.get(ch.parliament_id)?.name ?? ''} ${ch.name}` : '—'}</span>
                  <span className="tabular-nums font-medium">{s.seats}석</span>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </>
  )
}

export function GovernmentMembers({ entity }: { entity: Entity }) {
  const gp = useTable<AnyRow>('atlas_government_parties', { government_id: entity.id }, 'party_id')
  const { projectId, canEdit } = useWorld()
  const invalidate = useInvalidateTable()
  const [party, setParty] = useState<string | null>(null)
  const [role, setRole] = useState('ruling')
  const ROLE: Record<string, string> = { ruling: '집권 정당', coalition: '연립 정당', confidence_supply: '신임·공급 협약' }
  const rows = useMemo(() => gp.data ?? [], [gp.data])
  return (
    <>
      <Card>
        <CardHeader title="집권·연립 정당" icon={<Users />} />
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.party_id} className="flex items-center gap-3 px-4 py-2 text-[12.5px]">
              <span className="w-32 text-[11.5px] text-muted">{ROLE[r.role]}</span><EntityLink id={r.party_id} />
              {canEdit && <Button className="ml-auto" variant="subtle" size="icon-xs" aria-label="제거" onClick={async () => {
                try { await deleteWhere('atlas_government_parties', { government_id: entity.id, party_id: r.party_id }); invalidate('atlas_government_parties') } catch (e) { toast.error(friendlyError(e)) }
              }}><Trash2 /></Button>}
            </li>
          ))}
          {rows.length === 0 && <li className="px-4 py-3 text-[12px] text-subtle">지정된 정당이 없습니다.</li>}
        </ul>
        {canEdit && (
          <div className="flex items-center gap-2 border-t border-border p-3">
            <EntityPicker value={party} onChange={setParty} kinds={['party']} placeholder="정당 선택" className="flex-1" exclude={rows.map((r) => r.party_id)} />
            <Select className="w-40" value={role} onChange={(e) => setRole(e.target.value)}>{Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            <Button size="sm" disabled={!party} onClick={async () => {
              try { await insertRow('atlas_government_parties', { project_id: projectId, government_id: entity.id, party_id: party, role }); setParty(null); invalidate('atlas_government_parties') } catch (e) { toast.error(friendlyError(e)) }
            }}><Plus />추가</Button>
          </div>
        )}
      </Card>
      <TemporalEditor config={TEMPORAL.positions} filters={{ organization_id: entity.id }} title="내각·정부 인사 (임명 기록)" emptyText="장관 등 정부 직책 임명을 기록하세요" />
    </>
  )
}
