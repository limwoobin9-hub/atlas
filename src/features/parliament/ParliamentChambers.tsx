import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertTriangle, CalendarClock, GripVertical, Landmark, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { EChart } from '@/components/EChart'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, useConfirm } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/input'
import { Badge, Card, CardHeader, Empty, Loading } from '@/components/ui/misc'
import { applyPlan, deleteRow, insertRow, updateRow } from '@/data/db'
import { useIdeologies, useInvalidateTable, useTable, useTemporal } from '@/data/hooks'
import type { AnyRow, Chamber, Entity, SeatAllocation } from '@/data/types'
import { useWorld } from '@/data/world'
import { resolvePartyColors } from '@/domain/colors'
import { formatDate, formatRange } from '@/domain/dates'
import { majorityThreshold, orderParties } from '@/domain/parliament'
import { entityActiveAt, planClearFrom, planSetFrom, rowsAt, type PlannedOp } from '@/domain/timeline'
import { friendlyError } from '@/lib/errors'
import { EntityLink } from '@/features/entities/common'
import { EntityPicker } from '@/features/entities/EntityPicker'
import { SeatChart, type ChartParty } from './SeatChart'

/** Party colours for a set of party ids (ideology-based unless custom). */
export function usePartyColors() {
  const parties = useTable<AnyRow>('atlas_parties')
  const ideologies = useIdeologies()
  const { entityMap } = useWorld()
  return useMemo(() => {
    const list = (parties.data ?? []).map((p) => ({ id: p.id, color: entityMap.get(p.id)?.color ?? null, color_mode: p.color_mode, ideology_id: p.ideology_id }))
    return resolvePartyColors(list, ideologies.data ?? [])
  }, [parties.data, ideologies.data, entityMap])
}

/** Parties of the government active on `date` in `countryId` (for government/opposition split). */
function useGovernmentParties(countryId: string | null) {
  const { entities, date } = useWorld()
  const govs = useTable<AnyRow>('atlas_governments', countryId ? { country_id: countryId } : undefined)
  const gp = useTable<AnyRow>('atlas_government_parties')
  return useMemo(() => {
    if (!countryId) return { government: null as Entity | null, parties: new Set<string>() }
    const active = entities.filter((e) => e.kind === 'government' && (govs.data ?? []).some((g) => g.id === e.id) && entityActiveAt(e, date))
    const g = active[0] ?? null
    return { government: g, parties: new Set((gp.data ?? []).filter((r) => g && r.government_id === g.id).map((r) => r.party_id as string)) }
  }, [countryId, entities, govs.data, gp.data, date])
}

export function ParliamentChambers({ entity }: { entity: Entity }) {
  const chambers = useTable<Chamber>('atlas_chambers', { parliament_id: entity.id }, 'sort_order')
  const parl = useTable<AnyRow>('atlas_parliaments', { id: entity.id })
  const { canEdit } = useWorld()
  const [editing, setEditing] = useState<Chamber | 'new' | null>(null)
  if (chambers.isLoading) return <Loading />
  const countryId = (parl.data?.[0]?.country_id as string | null) ?? null
  const bicameral = parl.data?.[0]?.structure === 'bicameral'
  return (
    <div className="flex flex-col gap-4">
      {(chambers.data ?? []).length === 0 ? (
        <Empty icon={<Landmark />} title="원(院)이 없습니다" description={bicameral ? '양원제: 상원과 하원을 각각 추가하세요.' : '단원제: 의회 하나를 추가하고 총 의석을 설정하세요.'}
          action={canEdit && <Button onClick={() => setEditing('new')} data-testid="add-chamber"><Plus />원 추가</Button>} />
      ) : (chambers.data ?? []).map((c) => <ChamberCard key={c.id} chamber={c} countryId={countryId} onEdit={() => setEditing(c)} />)}
      {canEdit && (chambers.data ?? []).length > 0 && (bicameral || (chambers.data ?? []).length === 0) && (chambers.data ?? []).length < 2 && (
        <div><Button variant="secondary" onClick={() => setEditing('new')}><Plus />원 추가 (양원제)</Button></div>
      )}
      {editing && <ChamberDialog parliamentId={entity.id} chamber={editing === 'new' ? null : editing} count={(chambers.data ?? []).length} bicameral={bicameral} onClose={() => setEditing(null)} />}
    </div>
  )
}

function ChamberDialog({ parliamentId, chamber, onClose, count, bicameral }: { parliamentId: string; chamber: Chamber | null; onClose: () => void; count: number; bicameral: boolean }) {
  const { projectId } = useWorld()
  const invalidate = useInvalidateTable()
  const confirm = useConfirm()
  const [name, setName] = useState(chamber?.name ?? (bicameral ? (count === 0 ? '하원' : '상원') : '의회'))
  const [type, setType] = useState(chamber?.chamber_type ?? (bicameral ? (count === 0 ? 'lower' : 'upper') : 'single'))
  const [total, setTotal] = useState(String(chamber?.total_seats ?? 300))
  const [maj, setMaj] = useState(chamber?.majority_seats ? String(chamber.majority_seats) : '')
  const [layout, setLayout] = useState(chamber?.layout ?? 'hemicycle')
  const save = async () => {
    const t = Number(total)
    if (!Number.isInteger(t) || t < 1 || t > 5000) return toast.error('총 의석은 1~5000 사이 정수여야 합니다.')
    const payload = { name: name.trim() || '의회', chamber_type: type, total_seats: t, majority_seats: maj ? Number(maj) : null, layout }
    try {
      if (chamber) await updateRow('atlas_chambers', chamber.id, payload)
      else await insertRow('atlas_chambers', { ...payload, project_id: projectId, parliament_id: parliamentId, sort_order: count })
      invalidate('atlas_chambers')
      onClose()
    } catch (e) { toast.error(friendlyError(e)) }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={chamber ? '원 설정' : '원 추가'} footer={<>
        {chamber && <Button variant="danger-ghost" className="mr-auto" onClick={async () => {
          if (!(await confirm({ title: '이 원을 삭제할까요?', description: '의석 배분 기록도 삭제됩니다.', danger: true }))) return
          try { await deleteRow('atlas_chambers', chamber.id); invalidate('atlas_chambers', 'atlas_seat_allocations'); onClose() } catch (e) { toast.error(friendlyError(e)) }
        }}><Trash2 />삭제</Button>}
        <Button variant="secondary" onClick={onClose}>취소</Button><Button onClick={save} data-testid="chamber-save">저장</Button>
      </>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="이름"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="구분"><Select value={type} onChange={(e) => setType(e.target.value as Chamber['chamber_type'])}><option value="single">단원</option><option value="lower">하원</option><option value="upper">상원</option></Select></Field>
          <Field label="총 의석"><Input type="number" value={total} onChange={(e) => setTotal(e.target.value)} data-testid="chamber-total" /></Field>
          <Field label="과반 기준 (비우면 자동)"><Input type="number" value={maj} onChange={(e) => setMaj(e.target.value)} /></Field>
          <Field label="시각화" className="col-span-2"><Select value={layout} onChange={(e) => setLayout(e.target.value as Chamber['layout'])}><option value="hemicycle">반원형 의석도</option><option value="circle">원형 의석도</option><option value="bar">누적 막대</option></Select></Field>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ChamberCard({ chamber, countryId, onEdit }: { chamber: Chamber; countryId: string | null; onEdit: () => void }) {
  const { date, entityMap, canEdit } = useWorld()
  const seats = useTemporal<SeatAllocation>('atlas_seat_allocations', { chamber_id: chamber.id })
  const colors = usePartyColors()
  const gov = useGovernmentParties(countryId)
  const invalidate = useInvalidateTable()
  const [editingSeats, setEditingSeats] = useState(false)
  const [view, setView] = useState<'chart' | 'share' | 'gov'>('chart')
  const current = rowsAt(seats.visible, date)
  const merged = new Map<string, number>()
  for (const r of current) merged.set(r.party_id, (merged.get(r.party_id) ?? 0) + r.seats)
  const ordered = orderParties([...merged.entries()].map(([partyId, s]) => ({ partyId, seats: s })), chamber.party_order)
  const parties: ChartParty[] = ordered.map((p) => ({ ...p, name: entityMap.get(p.partyId)?.name ?? '삭제된 정당', color: colors.get(p.partyId) ?? '#9ca3af', government: gov.parties.has(p.partyId) }))
  const sum = parties.reduce((a, p) => a + p.seats, 0)
  const maj = majorityThreshold(chamber.total_seats, chamber.majority_seats)
  const govSeats = parties.filter((p) => p.government).reduce((a, p) => a + p.seats, 0)
  const largest = [...parties].sort((a, b) => b.seats - a.seats)[0]
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const onDragEnd = async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const ids = parties.map((p) => p.partyId)
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)))
    const rest = chamber.party_order.filter((id) => !next.includes(id))
    try {
      await updateRow('atlas_chambers', chamber.id, { party_order: [...next, ...rest] })
      invalidate('atlas_chambers')
    } catch (err) { toast.error(friendlyError(err)) }
  }

  return (
    <Card>
      <CardHeader title={`${chamber.name} · ${chamber.total_seats}석`} icon={<Landmark />}
        sub={`${formatDate(date)} 구성 · 과반 ${maj}석${gov.government ? ` · 현 정부: ${gov.government.name}` : ''}`}
        actions={<div className="flex items-center gap-1">
          <Select className="h-7 w-32" value={view} onChange={(e) => setView(e.target.value as typeof view)}>
            <option value="chart">의석도</option><option value="share">정당별 비율</option><option value="gov">여야 구성</option>
          </Select>
          {canEdit && <Button size="xs" variant="secondary" onClick={() => setEditingSeats(true)} data-testid="edit-seats"><CalendarClock />의석 배분</Button>}
          {canEdit && <Button size="icon-xs" variant="subtle" onClick={onEdit} aria-label="원 설정"><Pencil /></Button>}
        </div>} />
      {seats.isLoading ? <Loading /> : (
        <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_260px]">
          <div>
            {sum !== chamber.total_seats && (
              <p className="mb-2 flex items-center gap-1.5 rounded-md bg-warning-soft px-2.5 py-1.5 text-[12px] text-warning" data-testid="seat-sum-warning">
                <AlertTriangle className="size-3.5" />배분된 의석 합계 {sum}석이 총 의석 {chamber.total_seats}석과 {sum > chamber.total_seats ? '초과' : `다릅니다 (공석 ${chamber.total_seats - sum})`}
              </p>
            )}
            {parties.length === 0 ? <Empty title="이 날짜의 의석 배분이 없습니다" description="의석 배분 버튼으로 현재 날짜부터의 구성을 입력하거나, 선거 결과를 반영하세요." /> :
              view === 'chart' ? <SeatChart total={chamber.total_seats} parties={parties} layout={chamber.layout} majority={chamber.majority_seats} /> :
              view === 'share' ? (
                <EChart height={260} option={{ tooltip: { trigger: 'item', formatter: '{b}: {c}석 ({d}%)' }, series: [{ type: 'pie', radius: ['40%', '72%'], data: parties.map((p) => ({ name: p.name, value: p.seats, itemStyle: { color: p.color } })), label: { formatter: '{b}\n{c}석' } }] }} />
              ) : (
                <SeatChart total={chamber.total_seats} layout="bar" majority={chamber.majority_seats}
                  parties={[...parties.filter((p) => p.government), ...parties.filter((p) => !p.government)]} />
              )}
            {view === 'gov' && <p className="mt-2 text-center text-[12px] text-muted">여당 {govSeats}석 · 야당 {sum - govSeats}석 {govSeats >= maj ? <Badge tone="success">여당 과반</Badge> : <Badge tone="warning">여소야대</Badge>}</p>}
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-medium text-muted">정당 배치 순서 (드래그하여 변경 · 왼쪽→오른쪽)</p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={canEdit ? onDragEnd : undefined}>
              <SortableContext items={parties.map((p) => p.partyId)} strategy={verticalListSortingStrategy}>
                <ul className="flex flex-col gap-1" data-testid="party-order">
                  {parties.map((p) => <SortableParty key={p.partyId} party={p} disabled={!canEdit} />)}
                </ul>
              </SortableContext>
            </DndContext>
            {largest && <p className="mt-2 text-[11.5px] text-muted">제1당: <b>{largest.name}</b> {largest.seats >= maj ? '(단독 과반)' : '(과반 미달)'}</p>}
          </div>
        </div>
      )}
      {editingSeats && <SeatEditor chamber={chamber} rows={seats.visible} onClose={() => setEditingSeats(false)} order={parties.map((p) => p.partyId)} />}
      <SeatHistory rows={seats.visible} />
    </Card>
  )
}

function SortableParty({ party, disabled }: { party: ChartParty; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: party.partyId, disabled })
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} data-party={party.partyId}
      className={`flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1 text-[12px] ${isDragging ? 'z-10 shadow-lg' : ''}`}>
      <button {...attributes} {...listeners} className="cursor-grab text-subtle active:cursor-grabbing disabled:cursor-default" aria-label="순서 이동" disabled={disabled}><GripVertical className="size-3.5" /></button>
      <span className="size-2.5 rounded-sm" style={{ background: party.color }} />
      <span className="min-w-0 flex-1 truncate"><EntityLink id={party.partyId} showIcon={false} /></span>
      <span className="tabular-nums font-medium">{party.seats}</span>
    </li>
  )
}

function SeatHistory({ rows }: { rows: SeatAllocation[] }) {
  const { entityMap } = useWorld()
  const dates = [...new Set(rows.map((r) => r.valid_from ?? ''))].sort()
  if (dates.length < 2) return null
  const parties = [...new Set(rows.map((r) => r.party_id))]
  const seriesData = parties.map((pid) => ({
    type: 'line' as const, step: 'end' as const, name: entityMap.get(pid)?.name ?? '?', itemStyle: { color: entityMap.get(pid)?.color ?? undefined },
    data: dates.map((d) => [d || '0001-01-01', rows.filter((r) => r.party_id === pid && (!r.valid_from || r.valid_from <= d) && (!r.valid_to || d < r.valid_to)).reduce((a, r) => a + r.seats, 0)]),
  }))
  return (
    <div className="border-t border-border px-4 pb-3 pt-2">
      <p className="text-[11px] font-medium text-muted">의석 변화 추이</p>
      <EChart height={200} option={{ grid: { left: 36, right: 12, top: 28, bottom: 24 }, legend: { top: 0, textStyle: { fontSize: 10 } }, tooltip: { trigger: 'axis' }, xAxis: { type: 'time' }, yAxis: { type: 'value' }, series: seriesData }} />
    </div>
  )
}

/** Set the composition of a chamber from a chosen date (earlier history kept, later records untouched). */
function SeatEditor({ chamber, rows, onClose, order }: { chamber: Chamber; rows: SeatAllocation[]; onClose: () => void; order: string[] }) {
  const { date, branchId, projectId } = useWorld()
  const invalidate = useInvalidateTable()
  const current = rowsAt(rows, date)
  const [from, setFrom] = useState(date)
  const [list, setList] = useState<{ partyId: string | null; seats: number }[]>(() => {
    const m = new Map<string, number>()
    for (const r of current) m.set(r.party_id, (m.get(r.party_id) ?? 0) + r.seats)
    const base = order.filter((id) => m.has(id)).map((id) => ({ partyId: id, seats: m.get(id)! }))
    return base.length ? base : [{ partyId: null, seats: 0 }]
  })
  const [busy, setBusy] = useState(false)
  const sum = list.reduce((a, r) => a + (r.seats || 0), 0)

  const save = async () => {
    const valid = list.filter((r) => r.partyId)
    const dup = valid.find((r, i) => valid.findIndex((x) => x.partyId === r.partyId) !== i)
    if (dup) return toast.error('같은 정당이 두 번 입력되었습니다.')
    if (valid.some((r) => r.seats < 0 || !Number.isInteger(r.seats))) return toast.error('의석수는 0 이상의 정수여야 합니다.')
    setBusy(true)
    try {
      const touched = new Set([...valid.map((r) => r.partyId!), ...rows.map((r) => r.party_id)])
      for (const pid of touched) {
        const keyRows = rows.filter((r) => r.party_id === pid)
        const target = valid.find((r) => r.partyId === pid)
        const plan: PlannedOp<SeatAllocation>[] = target && target.seats > 0
          ? planSetFrom(keyRows, from, { chamber_id: chamber.id, party_id: pid, seats: target.seats, election_id: null } as Partial<SeatAllocation>)
          : planClearFrom(keyRows, from)
        if (plan.length) await applyPlan('atlas_seat_allocations', plan, branchId, { project_id: projectId })
      }
      const newOrder = [...valid.map((r) => r.partyId!), ...chamber.party_order.filter((id) => !valid.some((r) => r.partyId === id))]
      await updateRow('atlas_chambers', chamber.id, { party_order: newOrder })
      invalidate('atlas_seat_allocations', 'atlas_chambers')
      toast.success(sum === chamber.total_seats ? '의석 배분을 저장했습니다.' : `저장했습니다. 합계 ${sum}석 ≠ 총 ${chamber.total_seats}석 (설정 충돌로 표시됩니다)`)
      onClose()
    } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide title={`${chamber.name} 의석 배분`} description="지정한 날짜부터 이 구성이 적용됩니다. 이전 구성은 그 날짜에 종료되고, 이후에 기록된 구성(예: 다음 선거)은 그대로 유지됩니다."
        footer={<><span className={`mr-auto text-[12px] ${sum === chamber.total_seats ? 'text-success' : 'text-warning'}`}>합계 {sum} / {chamber.total_seats}석</span><Button variant="secondary" onClick={onClose}>취소</Button><Button onClick={save} disabled={busy} data-testid="seats-save">{busy ? '저장 중…' : '저장'}</Button></>}>
        <Field label="적용 시작일" className="mb-3 w-48"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <div className="flex flex-col gap-1.5">
          {list.map((r, i) => (
            <div key={i} className="flex items-center gap-2" data-testid="seat-row">
              <EntityPicker value={r.partyId} onChange={(v) => setList((l) => l.map((x, j) => (j === i ? { ...x, partyId: v } : x)))} kinds={['party']} className="flex-1" placeholder="정당 선택" />
              <Input type="number" min={0} className="w-24" value={r.seats} onChange={(e) => setList((l) => l.map((x, j) => (j === i ? { ...x, seats: Math.max(0, Math.trunc(Number(e.target.value) || 0)) } : x)))} aria-label="의석수" />
              <Button variant="subtle" size="icon-sm" onClick={() => setList((l) => l.filter((_, j) => j !== i))} aria-label="삭제"><Trash2 /></Button>
            </div>
          ))}
          <div><Button size="sm" variant="secondary" onClick={() => setList((l) => [...l, { partyId: null, seats: 0 }])}><Plus />정당 추가</Button></div>
        </div>
        <p className="mt-3 text-[11.5px] text-subtle">기록 기간 예: {formatRange(from, null)}</p>
      </DialogContent>
    </Dialog>
  )
}
