import { ArrowDownRight, ArrowUpRight, CheckCircle2, Plus, Trash2, Vote } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/input'
import { Badge, Card, CardHeader, Empty, Loading } from '@/components/ui/misc'
import { applyPlan, deleteRow, insertRow, updateRow } from '@/data/db'
import { useInvalidateTable, useSubtype, useTable, useTemporal } from '@/data/hooks'
import type { AnyRow, Chamber, Entity, SeatAllocation } from '@/data/types'
import { useWorld } from '@/data/world'
import { compareDates, formatDate } from '@/domain/dates'
import { compareElections, majorityThreshold } from '@/domain/parliament'
import { planClearFrom, planSetFrom, type PlannedOp } from '@/domain/timeline'
import { friendlyError } from '@/lib/errors'
import { EntityLink } from '@/features/entities/common'
import { EntityPicker } from '@/features/entities/EntityPicker'
import { usePartyColors } from './ParliamentChambers'
import { SeatChart } from './SeatChart'

interface Result { id: string; party_id: string | null; votes: number | null; vote_share: number | null; seats: number | null; sort_order: number; label: string }

export function ElectionResults({ entity }: { entity: Entity }) {
  const { projectId, canEdit, entityMap, entities } = useWorld()
  const sub = useSubtype<AnyRow>('atlas_elections', entity.id)
  const results = useTable<Result>('atlas_election_results', { election_id: entity.id }, 'sort_order')
  const allResults = useTable<Result & { election_id: string }>('atlas_election_results')
  const elections = useTable<AnyRow>('atlas_elections')
  const chambers = useTable<Chamber>('atlas_chambers')
  const colors = usePartyColors()
  const invalidate = useInvalidateTable()
  const [applying, setApplying] = useState(false)
  const chamber = chambers.data?.find((c) => c.id === sub.data?.chamber_id) ?? null

  const previous = useMemo(() => {
    if (!sub.data) return null
    const candidates = (elections.data ?? []).filter((e) => e.id !== entity.id && (sub.data!.chamber_id ? e.chamber_id === sub.data!.chamber_id : e.country_id === sub.data!.country_id && e.election_type === sub.data!.election_type))
      .map((e) => entityMap.get(e.id)).filter((e): e is Entity => !!e && !!e.starts_on && !!entity.starts_on && e.starts_on < entity.starts_on!)
      .sort((a, b) => compareDates(b.starts_on, a.starts_on))
    return candidates[0] ?? null
  }, [elections.data, sub.data, entity, entityMap])

  const rows = results.data ?? []
  const prevRows = previous ? (allResults.data ?? []).filter((r) => r.election_id === previous.id) : null
  const cmp = compareElections(
    rows.filter((r) => r.party_id).map((r) => ({ partyId: r.party_id!, seats: r.seats, share: r.vote_share })),
    prevRows ? prevRows.filter((r) => r.party_id).map((r) => ({ partyId: r.party_id!, seats: r.seats, share: r.vote_share })) : null,
  )
  const seatSum = rows.reduce((a, r) => a + (r.seats ?? 0), 0)
  const shareSum = rows.reduce((a, r) => a + (r.vote_share ?? 0), 0)
  const maj = chamber ? majorityThreshold(chamber.total_seats, chamber.majority_seats) : null

  const patch = async (r: Result, p: Partial<Result>) => {
    try { await updateRow('atlas_election_results', r.id, p); invalidate('atlas_election_results') } catch (e) { toast.error(friendlyError(e)) }
  }

  if (results.isLoading || sub.isLoading) return <Loading />
  return (
    <>
      <Card>
        <CardHeader title="선거 결과" icon={<Vote />} sub={`${formatDate(entity.starts_on)} · ${chamber ? `대상: ${entityMap.get(chamber.parliament_id)?.name ?? ''} ${chamber.name} (${chamber.total_seats}석)` : '대상 의회 미지정 (개요 탭에서 지정)'}`}
          actions={canEdit && <div className="flex gap-1">
            <Button size="xs" variant="secondary" onClick={async () => {
              try { await insertRow('atlas_election_results', { project_id: projectId, election_id: entity.id, sort_order: rows.length }); invalidate('atlas_election_results') } catch (e) { toast.error(friendlyError(e)) }
            }} data-testid="add-result"><Plus />정당 추가</Button>
            <Button size="xs" disabled={!chamber || rows.length === 0} onClick={() => setApplying(true)} data-testid="apply-election"><CheckCircle2 />의회 구성에 반영</Button>
          </div>} />
        {rows.length === 0 ? <div className="p-4"><Empty title="결과가 없습니다" description="참여 정당과 득표율·의석을 입력하세요." /></div> : (
          <table className="w-full text-[12.5px]">
            <thead className="bg-surface-2 text-[11px] text-muted"><tr>
              <th className="px-3 py-1.5 text-left font-medium">정당</th><th className="w-32 text-right font-medium">득표수</th><th className="w-24 text-right font-medium">득표율 %</th>
              <th className="w-24 text-right font-medium">의석</th><th className="w-20 text-right font-medium">의석 증감</th><th className="w-20 text-right font-medium">득표율 변화</th><th className="w-10" />
            </tr></thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const c = cmp.rows.find((x) => x.partyId === r.party_id)
                return (
                  <tr key={r.id} data-testid="result-row">
                    <td className="px-3 py-1"><div className="flex items-center gap-1.5"><span className="size-2.5 shrink-0 rounded-sm" style={{ background: r.party_id ? colors.get(r.party_id) : 'transparent' }} />
                      <EntityPicker value={r.party_id} onChange={(v) => patch(r, { party_id: v })} kinds={['party']} disabled={!canEdit} className="flex-1" exclude={rows.filter((x) => x.party_id && x.id !== r.id).map((x) => x.party_id!)} /></div></td>
                    <td><NumCell value={r.votes} disabled={!canEdit} onCommit={(v) => patch(r, { votes: v })} /></td>
                    <td><NumCell value={r.vote_share} decimal disabled={!canEdit} onCommit={(v) => patch(r, { vote_share: v })} max={100} /></td>
                    <td><NumCell value={r.seats} disabled={!canEdit} onCommit={(v) => patch(r, { seats: v })} testId="result-seats" /></td>
                    <td className="text-right tabular-nums">{c?.seatDelta === null || c?.seatDelta === undefined ? '—' : <Delta v={c.seatDelta} />}</td>
                    <td className="text-right tabular-nums">{c?.shareDelta === null || c?.shareDelta === undefined ? '—' : <Delta v={c.shareDelta} suffix="%p" />}</td>
                    <td className="pr-2 text-right">{canEdit && <Button variant="subtle" size="icon-xs" aria-label="삭제" onClick={async () => { try { await deleteRow('atlas_election_results', r.id); invalidate('atlas_election_results') } catch (e) { toast.error(friendlyError(e)) } }}><Trash2 /></Button>}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t border-border text-[11.5px] text-muted"><tr>
              <td className="px-3 py-1.5">합계</td><td className="text-right tabular-nums">{rows.reduce((a, r) => a + (r.votes ?? 0), 0).toLocaleString()}</td>
              <td className={`text-right tabular-nums ${shareSum > 100.05 ? 'text-danger' : ''}`}>{shareSum.toFixed(1)}</td>
              <td className={`text-right tabular-nums ${chamber && seatSum !== chamber.total_seats ? 'text-warning' : ''}`}>{seatSum}{chamber ? ` / ${chamber.total_seats}` : ''}</td><td colSpan={3} />
            </tr></tfoot>
          </table>
        )}
        {sub.data?.applied_at && <p className="border-t border-border px-4 py-2 text-[11.5px] text-success">✓ {formatDate(sub.data.applied_from as string)}부터 의회 구성에 반영됨 ({new Date(sub.data.applied_at as string).toLocaleString('ko-KR')})</p>}
      </Card>

      <Card>
        <CardHeader title="이전 선거와 비교" sub={previous ? <>이전 선거: <EntityLink id={previous.id} /> ({formatDate(previous.starts_on, 'short')})</> : '비교할 이전 선거가 없습니다'} />
        <div className="grid grid-cols-2 gap-3 p-4 text-[12.5px] md:grid-cols-4">
          <div><p className="text-[11px] text-subtle">제1당</p><p className="font-medium">{cmp.firstParty ? <EntityLink id={cmp.firstParty} /> : '—'}</p></div>
          <div><p className="text-[11px] text-subtle">제1당 변화</p><p>{previous ? (cmp.firstPartyChanged ? <Badge tone="warning">교체 ({entityMap.get(cmp.previousFirstParty ?? '')?.name ?? '?'} → )</Badge> : <Badge>유지</Badge>) : '—'}</p></div>
          <div><p className="text-[11px] text-subtle">단독 과반</p><p>{maj && cmp.firstParty ? ((rows.find((r) => r.party_id === cmp.firstParty)?.seats ?? 0) >= maj ? <Badge tone="success">달성 ({maj}석 이상)</Badge> : <Badge tone="warning">미달 → 연립 필요</Badge>) : '—'}</p></div>
          <div><p className="text-[11px] text-subtle">투표율</p><p className="font-medium">{sub.data?.turnout_pct ?? '—'}%</p></div>
        </div>
        {chamber && rows.some((r) => r.seats) && (
          <div className="border-t border-border p-4">
            <SeatChart total={chamber.total_seats} layout={chamber.layout} majority={chamber.majority_seats}
              parties={rows.filter((r) => r.party_id && r.seats).sort((a, b) => {
                const o = chamber.party_order
                return (o.indexOf(a.party_id!) + 1 || 999) - (o.indexOf(b.party_id!) + 1 || 999)
              }).map((r) => ({ partyId: r.party_id!, seats: r.seats!, name: entityMap.get(r.party_id!)?.name ?? '?', color: colors.get(r.party_id!) ?? '#999' }))} />
          </div>
        )}
      </Card>
      {applying && chamber && <ApplyDialog election={entity} chamber={chamber} results={rows} onClose={() => setApplying(false)} />}
      {entities.length === 0 && null}
    </>
  )
}

function Delta({ v, suffix = '' }: { v: number; suffix?: string }) {
  if (v === 0) return <span className="text-subtle">0{suffix}</span>
  return v > 0 ? <span className="inline-flex items-center text-success"><ArrowUpRight className="size-3" />+{v}{suffix}</span> : <span className="inline-flex items-center text-danger"><ArrowDownRight className="size-3" />{v}{suffix}</span>
}

function NumCell({ value, onCommit, disabled, decimal, max, testId }: { value: number | null; onCommit: (v: number | null) => void; disabled?: boolean; decimal?: boolean; max?: number; testId?: string }) {
  const [v, setV] = useState(value === null ? '' : String(value))
  return (
    <Input type="number" className="h-7 text-right tabular-nums" value={v} disabled={disabled} min={0} max={max} step={decimal ? 'any' : 1} data-testid={testId}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = v === '' ? null : decimal ? Number(v) : Math.trunc(Number(v))
        if (n !== null && (Number.isNaN(n) || n < 0 || (max !== undefined && n > max))) { toast.error('올바른 숫자가 아닙니다.'); setV(value === null ? '' : String(value)); return }
        if (n !== value) onCommit(n)
      }} />
  )
}

function ApplyDialog({ election, chamber, results, onClose }: { election: Entity; chamber: Chamber; results: Result[]; onClose: () => void }) {
  const { branchId, projectId } = useWorld()
  const seats = useTemporal<SeatAllocation>('atlas_seat_allocations', { chamber_id: chamber.id })
  const invalidate = useInvalidateTable()
  const [from, setFrom] = useState(election.starts_on ?? '')
  const [busy, setBusy] = useState(false)
  const valid = results.filter((r) => r.party_id && (r.seats ?? 0) > 0)
  const sum = valid.reduce((a, r) => a + (r.seats ?? 0), 0)

  const apply = async () => {
    if (!from) return toast.error('반영 시작일을 지정하세요.')
    setBusy(true)
    try {
      const pids = new Set([...valid.map((r) => r.party_id!), ...seats.visible.map((r) => r.party_id)])
      for (const pid of pids) {
        const keyRows = seats.visible.filter((r) => r.party_id === pid)
        const res = valid.find((r) => r.party_id === pid)
        const plan: PlannedOp<SeatAllocation>[] = res
          ? planSetFrom(keyRows, from, { chamber_id: chamber.id, party_id: pid, seats: res.seats!, election_id: election.id } as Partial<SeatAllocation>)
          : planClearFrom(keyRows, from)
        if (plan.length) await applyPlan('atlas_seat_allocations', plan, branchId, { project_id: projectId })
      }
      const order = [...chamber.party_order.filter((id) => pids.has(id)), ...valid.map((r) => r.party_id!).filter((id) => !chamber.party_order.includes(id))]
      await updateRow('atlas_chambers', chamber.id, { party_order: [...order, ...chamber.party_order.filter((id) => !order.includes(id))] })
      await updateRow('atlas_elections', election.id, { applied_from: from, applied_at: new Date().toISOString(), applied_branch_id: branchId })
      invalidate('atlas_seat_allocations', 'atlas_chambers', 'atlas_elections')
      toast.success(`${formatDate(from)}부터 ${chamber.name} 구성을 선거 결과로 기록했습니다.`)
      onClose()
    } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="선거 결과를 의회 구성에 반영" description="확정한 날짜부터 의석 배분이 선거 결과로 바뀝니다. 이전 구성은 그 날짜에 종료되며, 이후에 기록된 구성은 지워지지 않습니다. 결과를 나중에 수정하면 다시 반영할 수 있습니다."
        footer={<><Button variant="secondary" onClick={onClose}>취소</Button><Button onClick={apply} disabled={busy || seats.isLoading || !seats.data} data-testid="apply-confirm">{busy ? '반영 중…' : seats.isLoading ? '불러오는 중…' : '반영'}</Button></>}>
        <Field label="반영 시작일 (예: 의회 개원일)"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <p className={`mt-3 text-[12px] ${sum === chamber.total_seats ? 'text-success' : 'text-warning'}`}>의석 합계 {sum} / {chamber.total_seats}석 {sum !== chamber.total_seats && '— 합계가 다르면 설정 충돌로 표시됩니다.'}</p>
      </DialogContent>
    </Dialog>
  )
}
