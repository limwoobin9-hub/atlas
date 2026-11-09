import { CalendarClock, GitBranch, History, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, useConfirm } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/input'
import { Badge, Card, CardHeader, Empty, Loading, Tooltip } from '@/components/ui/misc'
import { applyPlan, type TemporalTable } from '@/data/db'
import { useInvalidateTable, useTemporal } from '@/data/hooks'
import type { AnyRow } from '@/data/types'
import { useWorld } from '@/data/world'
import { compareDates, formatDate, formatRange, inRange } from '@/domain/dates'
import { findOverlaps, planSetFrom, type TemporalRow } from '@/domain/timeline'
import { friendlyError } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { FieldInput } from './FieldInput'
import type { FieldDef, TemporalConfig } from './fields'

interface Props {
  config: TemporalConfig
  /** server-side equality filters, also used as fixed values for new rows */
  filters?: Record<string, string>
  /** extra client-side filter (e.g. relations where A or B is the entity) */
  match?: (row: AnyRow) => boolean
  /** fields fixed by context (hidden in the form) */
  fixed?: Record<string, string>
  /** single-valued per key: offers "change from current date" and overlap warnings */
  singleValued?: boolean
  title?: string
  warId?: string | null
  compact?: boolean
  emptyText?: string
  renderRow?: (row: AnyRow) => React.ReactNode
}

type Row = TemporalRow & AnyRow

export function TemporalEditor({ config, filters, match, fixed, singleValued, title, warId, compact, emptyText, renderRow }: Props) {
  const { date, canEdit, branchId, branches, projectId, entityMap } = useWorld()
  const q = useTemporal<Row>(config.table as TemporalTable, filters)
  const invalidate = useInvalidateTable()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<{ row: Row | null; mode: 'edit' | 'new' | 'from-date' } | null>(null)

  const rows = useMemo(() => {
    const list = match ? q.visible.filter(match) : q.visible
    return [...list].sort((a, b) => compareDates(a.valid_from, b.valid_from))
  }, [q.visible, match])
  const overlaps = useMemo(() => (singleValued ? findOverlaps(rows) : []), [rows, singleValued])
  const overlapIds = new Set(overlaps.flat().map((r) => r.id))
  const current = rows.filter((r) => inRange(date, r.valid_from, r.valid_to))
  const name = (id: unknown) => (typeof id === 'string' ? entityMap.get(id)?.name ?? '?' : '—')
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? '?'

  const remove = async (row: Row) => {
    const inherited = row.branch_id !== branchId
    const ok = await confirm({
      title: '이 기록을 삭제할까요?',
      description: inherited ? `상위 세계선 "${branchName(row.branch_id)}"의 기록입니다. 현재 세계선에서만 숨겨지며 원본은 유지됩니다.` : '되돌리려면 변경 기록에서 복원할 수 있습니다.',
      danger: true, confirmLabel: '삭제',
    })
    if (!ok) return
    try {
      await applyPlan(config.table as TemporalTable, [{ kind: 'delete', row }], branchId, {})
      invalidate(config.table)
      toast.success('삭제했습니다.')
    } catch (e) { toast.error(friendlyError(e)) }
  }

  return (
    <Card>
      <CardHeader title={title ?? config.label} icon={<History />}
        sub={singleValued && current[0] ? <>현재({formatDate(date, 'short')}): {config.describe?.(current[0], name) ?? '기록 있음'}</> : `${rows.length}개 기록 · 시점에 따라 달라지는 정보`}
        actions={canEdit && (
          <div className="flex gap-1">
            {singleValued && <Button size="xs" variant="secondary" onClick={() => setEditing({ row: current[0] ?? null, mode: 'from-date' })} data-testid={`temporal-from-date-${config.table}`}><CalendarClock />{formatDate(date, 'short')}부터 변경</Button>}
            <Button size="xs" variant={singleValued ? 'ghost' : 'secondary'} onClick={() => setEditing({ row: null, mode: 'new' })} data-testid={`temporal-add-${config.table}`}><Plus />기록 추가</Button>
          </div>
        )} />
      {q.isLoading ? <Loading /> : q.error ? <p className="p-3 text-[12px] text-danger">{friendlyError(q.error)}</p> : rows.length === 0 ? (
        <div className="p-3"><Empty title={emptyText ?? '기록이 없습니다'} description="시점별 정보를 기록하면 날짜를 바꿀 때 자동으로 반영됩니다." className="py-6" /></div>
      ) : (
        <ul className={cn('divide-y divide-border', compact && 'max-h-80 overflow-y-auto')}>
          {rows.map((r) => {
            const active = inRange(date, r.valid_from, r.valid_to)
            const inherited = r.branch_id !== branchId
            return (
              <li key={r.id} className={cn('group flex items-start gap-3 px-3.5 py-2', active && 'bg-accent-soft/50')}>
                <div className="w-44 shrink-0 pt-0.5 text-[11.5px] tabular-nums text-muted">
                  {formatRange(r.valid_from, r.valid_to)}
                  {active && <Badge tone="accent" className="ml-1.5">현재</Badge>}
                </div>
                <div className="min-w-0 flex-1 text-[12.5px]">
                  {renderRow ? renderRow(r) : <span>{config.describe?.(r, name) ?? r.id}</span>}
                  {r.note ? <p className="mt-0.5 line-clamp-2 text-[11.5px] text-subtle">{String(r.note)}</p> : null}
                </div>
                <div className="flex items-center gap-1">
                  {overlapIds.has(r.id) && <Tooltip content="같은 기간에 다른 기록과 겹칩니다."><Badge tone="warning">기간 중복</Badge></Tooltip>}
                  {inherited && <Tooltip content={`상위 세계선 "${branchName(r.branch_id)}"에서 상속. 수정하면 현재 세계선에만 사본이 생깁니다.`}><Badge tone="muted"><GitBranch className="size-3" />상속</Badge></Tooltip>}
                  {canEdit && (
                    <span className="flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <Button variant="subtle" size="icon-xs" onClick={() => setEditing({ row: r, mode: 'edit' })} aria-label="수정"><Pencil /></Button>
                      <Button variant="subtle" size="icon-xs" onClick={() => remove(r)} aria-label="삭제"><Trash2 /></Button>
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {editing && (
        <TemporalRowDialog config={config} mode={editing.mode} row={editing.row} keyRows={rows} fixed={{ ...(filters ?? {}), ...(fixed ?? {}) }}
          warId={warId ?? (filters?.war_id as string | undefined) ?? null} projectId={projectId}
          onClose={() => setEditing(null)} onSaved={() => { invalidate(config.table); setEditing(null) }} />
      )}
    </Card>
  )
}

function TemporalRowDialog({ config, mode, row, keyRows, fixed, warId, onClose, onSaved, projectId }: {
  config: TemporalConfig; mode: 'edit' | 'new' | 'from-date'; row: Row | null; keyRows: Row[]; fixed: Record<string, string>
  warId: string | null; onClose: () => void; onSaved: () => void; projectId: string
}) {
  const { date, branchId } = useWorld()
  const initial: AnyRow = {}
  for (const f of config.fields) initial[f.name] = row?.[f.name] ?? (f.type === 'boolean' ? (f.name === 'is_public') : f.type === 'select' && f.required ? Object.keys(f.options ?? {})[0] : null)
  Object.assign(initial, fixed)
  const [values, setValues] = useState<AnyRow>(initial)
  const [from, setFrom] = useState<string>(mode === 'edit' ? row?.valid_from ?? '' : date)
  const [to, setTo] = useState<string>(mode === 'edit' ? row?.valid_to ?? '' : '')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const visibleFields = config.fields.filter((f) => !(f.name in fixed))

  const save = async () => {
    for (const f of config.fields) {
      const v = values[f.name]
      if (f.required && (v === null || v === undefined || v === '')) return setErr(`${f.label}을(를) 입력하세요.`)
    }
    if (from && to && to <= from) return setErr('종료일은 시작일보다 뒤여야 합니다.')
    if (config.table === 'atlas_party_polling' && !from) return setErr('조사 날짜를 입력하세요.')
    setBusy(true)
    try {
      const payload: AnyRow = {}
      for (const f of config.fields) payload[f.name] = values[f.name] === '' ? null : values[f.name]
      if (mode === 'edit' && row) {
        await applyPlan(config.table as TemporalTable, [{ kind: 'update', row, patch: { ...payload, valid_from: from || null, valid_to: to || null } }], branchId, {})
      } else if (mode === 'from-date') {
        await applyPlan(config.table as TemporalTable, planSetFrom(keyRows, from || date, payload as Partial<Row>), branchId, { project_id: projectId })
      } else {
        await applyPlan(config.table as TemporalTable, [{ kind: 'insert', values: { ...payload, valid_from: from || null, valid_to: to || null } as Partial<Row> }], branchId, { project_id: projectId })
      }
      toast.success('저장했습니다.')
      onSaved()
    } catch (e) {
      setErr(friendlyError(e))
    } finally { setBusy(false) }
  }

  const title = mode === 'edit' ? `${config.label} 수정` : mode === 'from-date' ? `${formatDate(from || date)}부터 변경` : `${config.label} 추가`
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide title={title}
        description={mode === 'from-date' ? '기존 기록은 이 날짜에 종료되고, 새 값은 다음 변경 시점까지 유지됩니다. 이후의 기록은 지워지지 않습니다.' : '시작일을 비우면 "처음부터", 종료일을 비우면 "현재까지"로 간주합니다.'}
        footer={<><Button variant="secondary" onClick={onClose}>취소</Button><Button onClick={save} disabled={busy} data-testid="temporal-save">{busy ? '저장 중…' : '저장'}</Button></>}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={config.table === 'atlas_party_polling' ? '조사 날짜' : mode === 'from-date' ? '변경 날짜' : '시작일 (포함)'}>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="temporal-from" />
          </Field>
          {mode !== 'from-date' && config.table !== 'atlas_party_polling' && (
            <Field label="종료일 (이 날부터 미적용)"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="temporal-to" /></Field>
          )}
          <div className="hidden sm:block" />
          {visibleFields.map((f: FieldDef) => (
            <Field key={f.name} label={f.label + (f.required ? ' *' : '')} className={f.span === 3 ? 'col-span-full' : f.span === 2 ? 'sm:col-span-2' : ''}>
              <FieldInput field={f} value={values[f.name]} onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))} warId={(values.war_id as string) ?? warId} />
            </Field>
          ))}
        </div>
        {err && <p role="alert" className="mt-3 rounded-md bg-danger-soft px-2.5 py-2 text-[12px] text-danger">{err}</p>}
      </DialogContent>
    </Dialog>
  )
}
