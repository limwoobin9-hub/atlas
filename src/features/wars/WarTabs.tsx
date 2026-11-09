import { Map as MapIcon, Pencil, Plus, ScrollText, Swords, Target, Trash2, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, useConfirm } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/input'
import { Badge, Card, CardHeader, Empty, Loading } from '@/components/ui/misc'
import { deleteRow, insertRow, updateRow } from '@/data/db'
import { useInvalidateTable, useSubtype, useTable, useTemporal } from '@/data/hooks'
import type { AnyRow, Entity, MapFeature, WarParticipant, WarSide , Temporal } from '@/data/types'
import { useWorld } from '@/data/world'
import { compareDates, formatDate, formatRange, inRange } from '@/domain/dates'
import { WAR_STATUS } from '@/domain/kinds'
import { friendlyError } from '@/lib/errors'
import { sortBy } from '@/lib/utils'
import { ColorInput } from '@/features/entities/FieldInput'
import { EntityAvatar, EntityLink } from '@/features/entities/common'
import { useCreateDialog } from '@/features/entities/CreateEntityDialog'
import { TEMPORAL } from '@/features/entities/fields'
import { TemporalEditor } from '@/features/entities/TemporalEditor'
import { useCountryFlags } from './useCountryFlags'

const SIDE_COLORS = ['#dc2626', '#2563eb', '#16a34a', '#ca8a04', '#7c3aed']

export function WarOverviewTab({ entity }: { entity: Entity }) {
  const { date, canEdit, projectId, entityMap } = useWorld()
  const sides = useTable<WarSide>('atlas_war_sides', { war_id: entity.id }, 'sort_order')
  const parts = useTemporal<WarParticipant>('atlas_war_participants', { war_id: entity.id })
  const war = useSubtype<AnyRow>('atlas_wars', entity.id)
  const battles = useTable<AnyRow>('atlas_battles', { war_id: entity.id })
  const treaties = useTable<AnyRow>('atlas_treaties', { war_id: entity.id })
  const fronts = useTemporal<MapFeature>('atlas_map_features')
  const positions = useTemporal<Temporal & AnyRow & { character_id: string; title: string }>('atlas_positions', { organization_id: entity.id })
  const unitRels = useTemporal<Temporal & AnyRow & { from_id: string; to_id: string }>('atlas_entity_relations', { to_id: entity.id })
  const invalidate = useInvalidateTable()
  const confirm = useConfirm()
  const flags = useCountryFlags()
  const [editSide, setEditSide] = useState<WarSide | 'new' | null>(null)
  const warFronts = fronts.visible.filter((f) => f.entity_id === entity.id)
  const units = unitRels.visible.filter((r) => entityMap.get(r.from_id)?.kind === 'unit')

  if (sides.isLoading) return <Loading />
  const sideList = sides.data ?? []
  return (
    <>
      <Card>
        <CardHeader title="전쟁 개요" icon={<Swords />} />
        <div className="grid grid-cols-2 gap-3 p-4 text-[12.5px] md:grid-cols-4">
          <div><p className="text-[11px] text-subtle">전쟁 기간</p><p className="font-medium tabular-nums">{formatRange(entity.starts_on, entity.ends_on)}</p></div>
          <div><p className="text-[11px] text-subtle">전쟁 상태</p><p><Badge tone={war.data?.war_status === 'ongoing' ? 'danger' : 'default'}>{WAR_STATUS[war.data?.war_status ?? 'ongoing']}</Badge> {inRange(date, entity.starts_on, entity.ends_on) && <Badge tone="danger">{formatDate(date, 'short')} 교전 중</Badge>}</p></div>
          <div><p className="text-[11px] text-subtle">주요 전투</p><p className="font-medium">{battles.data?.length ?? 0}건</p></div>
          <div><p className="text-[11px] text-subtle">전선 지도</p><p><Link className="text-accent hover:underline" to={`/p/${projectId}/map?focus=${entity.id}`}><MapIcon className="mr-1 inline size-3.5" />{warFronts.length}개 전선 · 지도에서 보기</Link></p></div>
          {war.data?.losses && <div className="col-span-full"><p className="text-[11px] text-subtle">기록된 손실</p><p className="whitespace-pre-wrap">{war.data.losses}</p></div>}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {sideList.map((side) => {
          const members = sortBy(parts.visible.filter((p) => p.side_id === side.id), (p) => p.valid_from)
          return (
            <Card key={side.id} style={{ borderTop: `4px solid ${side.color}` }} data-testid="war-side">
              <CardHeader title={side.name} icon={<Users />} sub={`${members.filter((m) => inRange(date, m.valid_from, m.valid_to)).length}개국 참전 중 (${formatDate(date, 'short')})`}
                actions={canEdit && <div className="flex gap-0.5">
                  <Button size="icon-xs" variant="subtle" onClick={() => setEditSide(side)} aria-label="진영 수정"><Pencil /></Button>
                  <Button size="icon-xs" variant="subtle" aria-label="진영 삭제" onClick={async () => {
                    if (!(await confirm({ title: `"${side.name}" 진영을 삭제할까요?`, description: '이 진영의 참전 기록도 삭제됩니다.', danger: true }))) return
                    try { await deleteRow('atlas_war_sides', side.id); invalidate('atlas_war_sides', 'atlas_war_participants') } catch (e) { toast.error(friendlyError(e)) }
                  }}><Trash2 /></Button>
                </div>} />
              {members.length === 0 ? <p className="px-4 py-3 text-[12px] text-subtle">참전국이 없습니다. 아래 참전 기록에서 추가하세요.</p> : (
                <ul className="divide-y divide-border">
                  {members.map((m) => {
                    const e = entityMap.get(m.participant_id)
                    const active = inRange(date, m.valid_from, m.valid_to)
                    return (
                      <li key={m.id} className={`flex items-center gap-2 px-4 py-1.5 text-[12.5px] ${active ? '' : 'opacity-50'}`}>
                        {e && <EntityAvatar entity={e} size={20} path={flags.get(e.id) ?? e.image_path} />}
                        <EntityLink id={m.participant_id} showIcon={false} />
                        {m.role === 'leader' && <Badge tone="accent">주도국</Badge>}
                        <span className="ml-auto text-[11px] tabular-nums text-subtle">{formatRange(m.valid_from, m.valid_to)}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          )
        })}
        {canEdit && (
          <button onClick={() => setEditSide('new')} className="flex min-h-24 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-[12.5px] text-muted hover:border-accent hover:text-accent" data-testid="add-war-side">
            <Plus className="size-4" />진영 추가
          </button>
        )}
      </div>

      {sideList.length > 0 && (
        <TemporalEditor config={TEMPORAL.war_participants} filters={{ war_id: entity.id }} warId={entity.id} title="참전 기록 (참전·탈퇴 시점, 진영 변경은 기간을 나눠 기록)" compact />
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card>
          <CardHeader title="주요 지휘관" sub="이 전쟁을 소속 기관으로 하는 직책 기록" />
          {positions.visible.length === 0 ? <p className="px-4 py-3 text-[12px] text-subtle">인물의 직책 경력에서 소속 기관을 이 전쟁으로 지정하면 표시됩니다.</p> : (
            <ul className="divide-y divide-border">{positions.visible.map((p) => <li key={p.id} className="flex gap-2 px-4 py-1.5 text-[12.5px]"><span className="text-muted">{p.title}</span><EntityLink id={p.character_id} /></li>)}</ul>
          )}
        </Card>
        <Card>
          <CardHeader title="관련 부대" sub="부대 → 관계(참여) → 이 전쟁" />
          {units.length === 0 ? <p className="px-4 py-3 text-[12px] text-subtle">부대의 관계 탭에서 이 전쟁을 연결하세요.</p> : (
            <div className="flex flex-wrap gap-x-3 gap-y-1 p-4">{units.map((u) => <EntityLink key={u.id} id={u.from_id} />)}</div>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="관련 조약" icon={<ScrollText />} />
        {(treaties.data ?? []).length === 0 ? <p className="px-4 py-3 text-[12px] text-subtle">조약의 관련 전쟁으로 이 전쟁을 지정하면 표시됩니다.</p> : (
          <div className="flex flex-wrap gap-3 p-4">{treaties.data!.map((t) => <EntityLink key={t.id} id={t.id} />)}</div>
        )}
      </Card>

      {editSide && <SideDialog warId={entity.id} side={editSide === 'new' ? null : editSide} count={sideList.length} projectId={projectId} onClose={() => setEditSide(null)} />}
    </>
  )
}

function SideDialog({ warId, side, count, projectId, onClose }: { warId: string; side: WarSide | null; count: number; projectId: string; onClose: () => void }) {
  const invalidate = useInvalidateTable()
  const [name, setName] = useState(side?.name ?? `${String.fromCharCode(65 + count)}진영`)
  const [color, setColor] = useState<string | null>(side?.color ?? SIDE_COLORS[count % SIDE_COLORS.length])
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={side ? '진영 수정' : '진영 추가'} footer={<><Button variant="secondary" onClick={onClose}>취소</Button><Button data-testid="side-save" onClick={async () => {
        if (!name.trim()) return toast.error('진영 이름을 입력하세요.')
        try {
          if (side) await updateRow('atlas_war_sides', side.id, { name: name.trim(), color: color ?? '#ef4444' })
          else await insertRow('atlas_war_sides', { project_id: projectId, war_id: warId, name: name.trim(), color: color ?? '#ef4444', sort_order: count })
          invalidate('atlas_war_sides')
          onClose()
        } catch (e) { toast.error(friendlyError(e)) }
      }}>저장</Button></>}>
        <div className="flex flex-col gap-3">
          <Field label="진영 이름"><Input value={name} onChange={(e) => setName(e.target.value)} data-testid="side-name" /></Field>
          <Field label="진영 색상"><ColorInput value={color} onChange={setColor} /></Field>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function WarBattlesTab({ entity }: { entity: Entity }) {
  const { entityMap, canEdit, date } = useWorld()
  const battles = useTable<AnyRow>('atlas_battles', { war_id: entity.id })
  const sides = useTable<WarSide>('atlas_war_sides', { war_id: entity.id })
  const rels = useTemporal<Temporal & AnyRow & { from_id: string; to_id: string }>('atlas_entity_relations')
  const openCreate = useCreateDialog((s) => s.open)
  const list = useMemo(() => (battles.data ?? []).map((b) => ({ b, e: entityMap.get(b.id) })).filter((x) => x.e).sort((a, b) => compareDates(a.e!.starts_on, b.e!.starts_on)), [battles.data, entityMap])
  const events = rels.visible.filter((r) => (r.from_id === entity.id || r.to_id === entity.id)).map((r) => (r.from_id === entity.id ? r.to_id : r.from_id)).filter((id) => entityMap.get(id)?.kind === 'event')
  const side = (id: string | null) => sides.data?.find((s) => s.id === id)
  return (
    <>
      <Card>
        <CardHeader title="주요 전투" icon={<Target />} actions={canEdit && <Button size="xs" variant="secondary" onClick={() => openCreate('battle', { sub: { war_id: entity.id }, navigate: false })} data-testid="add-battle"><Plus />전투 생성</Button>} />
        {list.length === 0 ? <div className="p-4"><Empty title="기록된 전투가 없습니다" description="전투는 전쟁에 종속된 독립 항목으로 저장되어 지도·연표에 표시됩니다." /></div> : (
          <ol className="relative ml-6 border-l border-border py-2">
            {list.map(({ b, e }) => (
              <li key={b.id} className="relative py-2 pl-4 text-[12.5px]">
                <span className={`absolute -left-[5px] top-3.5 size-2.5 rounded-full border-2 border-surface ${e!.starts_on && e!.starts_on <= date ? 'bg-danger' : 'bg-surface-3'}`} />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11.5px] tabular-nums text-muted">{formatRange(e!.starts_on, e!.ends_on)}</span>
                  <EntityLink id={b.id} />
                  {b.location && <span className="text-[11.5px] text-subtle">@{b.location}</span>}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-2 text-[11.5px] text-muted">
                  {side(b.attacker_side_id) && <span>공격: <span style={{ color: side(b.attacker_side_id)!.color }}>{side(b.attacker_side_id)!.name}</span></span>}
                  {side(b.defender_side_id) && <span>방어: <span style={{ color: side(b.defender_side_id)!.color }}>{side(b.defender_side_id)!.name}</span></span>}
                  {b.result && <span>결과: {b.result}</span>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
      <Card>
        <CardHeader title="관련 사건" />
        {events.length === 0 ? <p className="px-4 py-3 text-[12px] text-subtle">관계·연결 탭에서 사건을 연결하세요.</p> : <div className="flex flex-wrap gap-3 p-4">{[...new Set(events)].map((id) => <EntityLink key={id} id={id} />)}</div>}
      </Card>
    </>
  )
}
