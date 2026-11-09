import { CheckCircle2, FileText, Plus, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, useConfirm } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Badge, Card, CardHeader, Empty, Loading, Switch } from '@/components/ui/misc'
import { applyPlan, deleteRow, deleteWhere, insertRow, updateRow } from '@/data/db'
import { useInvalidateTable, useSubtype, useTable, useTemporal } from '@/data/hooks'
import type { AnyRow, DiplomaticRelation, Entity, TerritoryControl, TreatyClause, WarParticipant } from '@/data/types'
import { useWorld } from '@/data/world'
import { formatDate } from '@/domain/dates'
import { CONTROL_STATUS, RELATION_TYPES } from '@/domain/kinds'
import { planSetFrom, rowAt, rowsAt } from '@/domain/timeline'
import { friendlyError } from '@/lib/errors'
import { EntityLink } from '@/features/entities/common'
import { EntityPicker } from '@/features/entities/EntityPicker'

const EFFECTS: Record<TreatyClause['effect_type'], string> = {
  none: '서술만 (세계관 상태 변경 없음)', territory_transfer: '영토 변경 (지배권 이전)', relation_change: '외교관계 변경', war_end: '전쟁 종결',
}
const ROLES: Record<string, string> = { signatory: '서명국', guarantor: '보증국', observer: '참관국', beneficiary: '수혜국', other: '기타' }

export function TreatyTab({ entity }: { entity: Entity }) {
  const { projectId, canEdit } = useWorld()
  const parts = useTable<AnyRow>('atlas_treaty_participants', { treaty_id: entity.id }, 'participant_id')
  const clauses = useTable<TreatyClause>('atlas_treaty_clauses', { treaty_id: entity.id }, 'ordinal')
  const invalidate = useInvalidateTable()
  const [pick, setPick] = useState<string | null>(null)
  const [role, setRole] = useState('signatory')
  const [editing, setEditing] = useState<TreatyClause | 'new' | null>(null)
  const [applying, setApplying] = useState<TreatyClause | null>(null)
  const confirm = useConfirm()

  return (
    <>
      <Card>
        <CardHeader title="서명국·당사자" icon={<Users />} />
        <ul className="divide-y divide-border">
          {(parts.data ?? []).map((p) => (
            <li key={p.participant_id} className="flex items-center gap-3 px-4 py-1.5 text-[12.5px]">
              <span className="w-16 text-[11.5px] text-muted">{ROLES[p.role]}</span><EntityLink id={p.participant_id} />
              {canEdit && <Button className="ml-auto" size="icon-xs" variant="subtle" aria-label="제거" onClick={async () => {
                try { await deleteWhere('atlas_treaty_participants', { treaty_id: entity.id, participant_id: p.participant_id }); invalidate('atlas_treaty_participants') } catch (e) { toast.error(friendlyError(e)) }
              }}><Trash2 /></Button>}
            </li>
          ))}
          {(parts.data ?? []).length === 0 && <li className="px-4 py-3 text-[12px] text-subtle">서명국이 없습니다.</li>}
        </ul>
        {canEdit && (
          <div className="flex gap-2 border-t border-border p-3">
            <EntityPicker value={pick} onChange={setPick} kinds={['country', 'organization']} className="flex-1" exclude={(parts.data ?? []).map((p) => p.participant_id)} testId="treaty-party-picker" />
            <Select className="w-28" value={role} onChange={(e) => setRole(e.target.value)}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            <Button size="sm" disabled={!pick} onClick={async () => {
              try { await insertRow('atlas_treaty_participants', { project_id: projectId, treaty_id: entity.id, participant_id: pick, role }); setPick(null); invalidate('atlas_treaty_participants') } catch (e) { toast.error(friendlyError(e)) }
            }} data-testid="treaty-add-party"><Plus />추가</Button>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="조항" icon={<FileText />} sub="영토·외교관계 변경이 연결된 조항은 '확정 반영'을 눌러야만 세계관 상태에 적용됩니다."
          actions={canEdit && <Button size="xs" variant="secondary" onClick={() => setEditing('new')} data-testid="add-clause"><Plus />조항 추가</Button>} />
        {clauses.isLoading ? <Loading /> : (clauses.data ?? []).length === 0 ? <div className="p-4"><Empty title="조항이 없습니다" description="예: 제1조 양국은 전쟁 상태를 종료한다." /></div> : (
          <ol className="divide-y divide-border">
            {(clauses.data ?? []).map((c) => (
              <li key={c.id} className="group px-4 py-2.5" data-testid="clause">
                <div className="flex items-start gap-2">
                  <span className="shrink-0 text-[12.5px] font-semibold">제{c.ordinal}조</span>
                  <div className="min-w-0 flex-1">
                    {c.title && <p className="text-[12.5px] font-medium">{c.title}</p>}
                    <p className="prose-atlas text-muted">{c.body}</p>
                    {c.effect_type !== 'none' && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px]">
                        <Badge tone="accent">{EFFECTS[c.effect_type]}</Badge>
                        <EffectSummary clause={c} />
                        {c.applied_at ? <Badge tone="success"><CheckCircle2 className="size-3" />반영됨 {new Date(c.applied_at).toLocaleDateString('ko-KR')}</Badge> : <Badge tone="warning">미반영</Badge>}
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 gap-1">
                      {c.effect_type !== 'none' && !c.applied_at && <Button size="xs" onClick={() => setApplying(c)} data-testid="apply-clause"><CheckCircle2 />확정 반영</Button>}
                      <Button size="xs" variant="ghost" onClick={() => setEditing(c)}>수정</Button>
                      <Button size="icon-xs" variant="subtle" aria-label="삭제" onClick={async () => {
                        if (!(await confirm({ title: `제${c.ordinal}조를 삭제할까요?`, description: c.applied_at ? '이미 반영된 변경은 유지됩니다. 필요하면 변경 기록에서 되돌리세요.' : undefined, danger: true }))) return
                        try { await deleteRow('atlas_treaty_clauses', c.id); invalidate('atlas_treaty_clauses') } catch (e) { toast.error(friendlyError(e)) }
                      }}><Trash2 /></Button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
      {editing && <ClauseDialog treaty={entity} clause={editing === 'new' ? null : editing} next={(clauses.data?.length ?? 0) + 1} onClose={() => setEditing(null)} />}
      {applying && <ApplyClauseDialog treaty={entity} clause={applying} onClose={() => setApplying(null)} />}
    </>
  )
}

function EffectSummary({ clause }: { clause: TreatyClause }) {
  const e = clause.effect as AnyRow
  if (clause.effect_type === 'territory_transfer') return <span className="text-muted">{(e.region_ids ?? []).length}개 지역 → <EntityLink id={e.to_id} showIcon={false} /></span>
  if (clause.effect_type === 'relation_change') return <span className="text-muted"><EntityLink id={e.a_id} showIcon={false} /> ↔ <EntityLink id={e.b_id} showIcon={false} />: {RELATION_TYPES[e.relation_type]?.label}</span>
  if (clause.effect_type === 'war_end') return <span className="text-muted"><EntityLink id={e.war_id} showIcon={false} /> 종결</span>
  return null
}

function ClauseDialog({ treaty, clause, next, onClose }: { treaty: Entity; clause: TreatyClause | null; next: number; onClose: () => void }) {
  const { projectId } = useWorld()
  const sub = useSubtype<AnyRow>('atlas_treaties', treaty.id)
  const invalidate = useInvalidateTable()
  const [ordinal, setOrdinal] = useState(String(clause?.ordinal ?? next))
  const [title, setTitle] = useState(clause?.title ?? '')
  const [body, setBody] = useState(clause?.body ?? '')
  const [type, setType] = useState<TreatyClause['effect_type']>(clause?.effect_type ?? 'none')
  const [effect, setEffect] = useState<AnyRow>(clause?.effect ?? {})
  const [regionPick, setRegionPick] = useState<string | null>(null)
  const set = (k: string, v: unknown) => setEffect((e) => ({ ...e, [k]: v }))
  const save = async () => {
    if (type === 'territory_transfer' && (!(effect.region_ids?.length) || !effect.to_id)) return toast.error('이전할 지역과 받는 국가를 지정하세요.')
    if (type === 'relation_change' && (!effect.a_id || !effect.b_id || !effect.relation_type)) return toast.error('양 당사자와 새 관계를 지정하세요.')
    if (type === 'war_end' && !effect.war_id) return toast.error('종결할 전쟁을 지정하세요.')
    const payload = { ordinal: Number(ordinal) || next, title, body, effect_type: type, effect: type === 'none' ? {} : effect }
    try {
      if (clause) await updateRow('atlas_treaty_clauses', clause.id, { ...payload, applied_at: clause.effect_type === type && JSON.stringify(clause.effect) === JSON.stringify(payload.effect) ? clause.applied_at : null })
      else await insertRow('atlas_treaty_clauses', { ...payload, project_id: projectId, treaty_id: treaty.id })
      invalidate('atlas_treaty_clauses')
      onClose()
    } catch (e) { toast.error(friendlyError(e)) }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide title={clause ? `제${clause.ordinal}조 수정` : '조항 추가'} footer={<><Button variant="secondary" onClick={onClose}>취소</Button><Button onClick={save} data-testid="clause-save">저장</Button></>}>
        <div className="grid grid-cols-4 gap-3">
          <Field label="조"><Input type="number" value={ordinal} onChange={(e) => setOrdinal(e.target.value)} /></Field>
          <Field label="제목 (선택)" className="col-span-3"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="조문" className="col-span-4"><Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} data-testid="clause-body" /></Field>
          <Field label="세계관 효과" className="col-span-4" hint="효과는 저장만 되고, 조약 화면에서 '확정 반영'을 눌러야 적용됩니다.">
            <Select value={type} onChange={(e) => setType(e.target.value as TreatyClause['effect_type'])} data-testid="clause-effect">{Object.entries(EFFECTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          </Field>
          {type === 'territory_transfer' && (
            <>
              <Field label="이전 대상 지역" className="col-span-4">
                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap gap-2">{(effect.region_ids ?? []).map((id: string) => (
                    <span key={id} className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 text-[12px]"><EntityLink id={id} showIcon={false} />
                      <button onClick={() => set('region_ids', (effect.region_ids as string[]).filter((x) => x !== id))} aria-label="제거">×</button></span>
                  ))}</div>
                  <div className="flex gap-1.5"><EntityPicker value={regionPick} onChange={setRegionPick} kinds={['region']} className="flex-1" testId="clause-region-picker" />
                    <Button size="sm" variant="secondary" disabled={!regionPick} onClick={() => { set('region_ids', [...new Set([...(effect.region_ids ?? []), regionPick])]); setRegionPick(null) }} data-testid="clause-add-region">추가</Button></div>
                </div>
              </Field>
              <Field label="받는 국가 (새 실효지배국)" className="col-span-2"><EntityPicker value={effect.to_id ?? null} onChange={(v) => set('to_id', v)} kinds={['country', 'organization']} testId="clause-to-picker" /></Field>
              <Field label="지배 상태" className="col-span-1"><Select value={effect.status ?? 'integrated'} onChange={(e) => set('status', e.target.value)}>{Object.entries(CONTROL_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              <Field label="주권도 이전" className="col-span-1"><div className="flex h-8 items-center"><Switch checked={effect.change_sovereign !== false} onCheckedChange={(v) => set('change_sovereign', v)} /></div></Field>
            </>
          )}
          {type === 'relation_change' && (
            <>
              <Field label="당사자 A" className="col-span-2"><EntityPicker value={effect.a_id ?? sub.data?.war_id ?? null} onChange={(v) => set('a_id', v)} kinds={['country', 'organization']} /></Field>
              <Field label="당사자 B" className="col-span-2"><EntityPicker value={effect.b_id ?? null} onChange={(v) => set('b_id', v)} kinds={['country', 'organization']} /></Field>
              <Field label="새 관계" className="col-span-2"><Select value={effect.relation_type ?? ''} onChange={(e) => set('relation_type', e.target.value)}><option value="">—</option>{Object.entries(RELATION_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
            </>
          )}
          {type === 'war_end' && (
            <Field label="종결할 전쟁" className="col-span-2"><EntityPicker value={effect.war_id ?? sub.data?.war_id ?? null} onChange={(v) => set('war_id', v)} kinds={['war']} /></Field>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Explicitly apply a clause effect to the world state of the current world line from a date. */
function ApplyClauseDialog({ treaty, clause, onClose }: { treaty: Entity; clause: TreatyClause; onClose: () => void }) {
  const { branchId, projectId, branch, entityMap } = useWorld()
  const sub = useSubtype<AnyRow>('atlas_treaties', treaty.id)
  const control = useTemporal<TerritoryControl>('atlas_territory_control')
  const rels = useTemporal<DiplomaticRelation>('atlas_diplomatic_relations')
  const parts = useTemporal<WarParticipant>('atlas_war_participants')
  const invalidate = useInvalidateTable()
  const [from, setFrom] = useState<string>(treaty.starts_on ?? (sub.data?.effective_on as string) ?? (sub.data?.signed_on as string) ?? '')
  const [busy, setBusy] = useState(false)
  const e = clause.effect as AnyRow

  const apply = async () => {
    if (!from) return toast.error('적용 날짜를 지정하세요.')
    setBusy(true)
    try {
      if (clause.effect_type === 'territory_transfer') {
        for (const regionId of e.region_ids as string[]) {
          const keyRows = control.visible.filter((r) => r.region_id === regionId)
          const cur = rowAt(keyRows, from)
          await applyPlan('atlas_territory_control', planSetFrom(keyRows, from, {
            region_id: regionId, controller_id: e.to_id, sovereign_id: e.change_sovereign === false ? cur?.sovereign_id ?? null : e.to_id,
            administrator_id: e.to_id, status: e.status ?? 'integrated', note: `${treaty.name} 제${clause.ordinal}조`, source_clause_id: clause.id,
          } as Partial<TerritoryControl>), branchId, { project_id: projectId })
        }
        invalidate('atlas_territory_control')
      } else if (clause.effect_type === 'relation_change') {
        const pair = rels.visible.filter((r) => (r.a_id === e.a_id && r.b_id === e.b_id) || (r.a_id === e.b_id && r.b_id === e.a_id))
        for (const r of rowsAt(pair, from)) {
          await applyPlan('atlas_diplomatic_relations', r.valid_from === from ? [{ kind: 'delete', row: r }] : [{ kind: 'update', row: r, patch: { valid_to: from } }], branchId, {})
        }
        await applyPlan('atlas_diplomatic_relations', [{ kind: 'insert', values: { a_id: e.a_id, b_id: e.b_id, relation_type: e.relation_type, is_public: true, treaty_id: treaty.id, source_clause_id: clause.id, description: `${treaty.name} 제${clause.ordinal}조`, valid_from: from, valid_to: null } as Partial<DiplomaticRelation> }], branchId, { project_id: projectId })
        invalidate('atlas_diplomatic_relations')
      } else if (clause.effect_type === 'war_end') {
        const war = entityMap.get(e.war_id)
        if (!war) throw new Error('전쟁을 찾을 수 없습니다.')
        await updateRow('atlas_entities', war.id, { ends_on: war.ends_on && war.ends_on < from ? war.ends_on : from })
        await updateRow('atlas_wars', war.id, { war_status: 'ended' })
        for (const p of rowsAt(parts.visible.filter((x) => x.war_id === war.id), from)) {
          if (!p.valid_to || p.valid_to > from) await applyPlan('atlas_war_participants', p.valid_from === from ? [{ kind: 'delete', row: p }] : [{ kind: 'update', row: p, patch: { valid_to: from } }], branchId, {})
        }
        invalidate('atlas_entities', 'atlas_wars', 'atlas_war_participants')
      }
      await updateRow('atlas_treaty_clauses', clause.id, { applied_at: new Date().toISOString(), applied_branch_id: branchId })
      invalidate('atlas_treaty_clauses')
      toast.success(`${formatDate(from)}부터 반영했습니다.`)
      onClose()
    } catch (err) { toast.error(friendlyError(err)) } finally { setBusy(false) }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`제${clause.ordinal}조 효과를 확정 반영`} description={`세계선 "${branch.name}"의 데이터에 적용됩니다. 이전 상태는 적용일에 종료되고 이후 기록은 유지됩니다. 변경 기록에서 되돌릴 수 있습니다.`}
        footer={<><Button variant="secondary" onClick={onClose}>취소</Button><Button onClick={apply} disabled={busy || control.isLoading} data-testid="apply-clause-confirm">{busy ? '적용 중…' : '확정 반영'}</Button></>}>
        <div className="flex flex-col gap-3 text-[12.5px]">
          <div className="rounded-md bg-surface-2 p-3"><Badge tone="accent">{EFFECTS[clause.effect_type]}</Badge> <EffectSummary clause={clause} /></div>
          <Field label="적용 날짜 (조약 발효일)"><Input type="date" value={from} onChange={(ev) => setFrom(ev.target.value)} /></Field>
        </div>
      </DialogContent>
    </Dialog>
  )
}
