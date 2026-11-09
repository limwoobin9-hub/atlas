import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { create } from 'zustand'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/input'
import { Switch } from '@/components/ui/misc'
import { createEntity } from '@/data/entities'
import { useInvalidateTable } from '@/data/hooks'
import type { AnyRow, EntityKind } from '@/data/types'
import { useWorld } from '@/data/world'
import { KINDS, KIND_LIST } from '@/domain/kinds'
import { friendlyError } from '@/lib/errors'
import { entityHref } from './common'
import { EntityPicker } from './EntityPicker'

interface CreateState {
  kind: EntityKind | null
  preset: { sub?: AnyRow; base?: AnyRow; navigate?: boolean; onCreated?: (id: string) => void | Promise<void> } | null
  open: (kind: EntityKind, preset?: CreateState['preset']) => void
  close: () => void
}

export const useCreateDialog = create<CreateState>((set) => ({
  kind: null,
  preset: null,
  open: (kind, preset = null) => set({ kind, preset }),
  close: () => set({ kind: null, preset: null }),
}))

const CONTEXT_FIELD: Partial<Record<EntityKind, { name: string; label: string; kinds: EntityKind[] }>> = {
  party: { name: 'country_id', label: '소속 국가', kinds: ['country'] },
  government: { name: 'country_id', label: '국가', kinds: ['country'] },
  parliament: { name: 'country_id', label: '국가', kinds: ['country'] },
  election: { name: 'country_id', label: '국가', kinds: ['country'] },
  character: { name: 'nationality_id', label: '국적', kinds: ['country'] },
  ship: { name: 'country_id', label: '국적', kinds: ['country'] },
  faction: { name: 'party_id', label: '소속 정당', kinds: ['party'] },
  battle: { name: 'war_id', label: '전쟁', kinds: ['war'] },
  treaty: { name: 'war_id', label: '관련 전쟁', kinds: ['war'] },
}

const HISTORICAL = new Set<EntityKind>(['event', 'war', 'battle', 'treaty', 'election', 'government'])

export function CreateEntityDialog() {
  const { kind, preset, close, open } = useCreateDialog()
  const { projectId, branchId, branch, date } = useWorld()
  const invalidate = useInvalidateTable()
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [allLinesChoice, setAllLines] = useState<boolean | null>(null)
  const [start, setStart] = useState('')
  const [ctx, setCtx] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (!kind) return null
  const meta = KINDS[kind]
  // history-specific records belong to the line they were written in; lasting things (countries, people...) are shared
  const allLines = allLinesChoice ?? !HISTORICAL.has(kind)
  const ctxField = CONTEXT_FIELD[kind]
  const ctxValue = ctx ?? (ctxField ? (preset?.sub?.[ctxField.name] as string | undefined) ?? null : null)

  const reset = () => { setName(''); setStart(''); setCtx(null); setErr(null); setAllLines(null) }
  const submit = async () => {
    if (!name.trim()) return setErr('이름을 입력하세요.')
    setBusy(true)
    try {
      const sub = { ...(preset?.sub ?? {}) }
      if (ctxField && ctxValue) sub[ctxField.name] = ctxValue
      const e = await createEntity({
        projectId, kind, name, originBranchId: allLines && branch.is_main ? null : branchId,
        base: { ...(preset?.base ?? {}), starts_on: start || (preset?.base?.starts_on as string | undefined) || null }, sub,
      })
      await preset?.onCreated?.(e.id)
      invalidate('atlas_entities', meta.table ?? 'atlas_entities')
      toast.success(`${meta.label} "${e.name}"을(를) 만들었습니다.`)
      if (preset?.navigate !== false) nav(entityHref(projectId, e))
      reset()
      close()
    } catch (e) { setErr(friendlyError(e)) } finally { setBusy(false) }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) { reset(); close() } }}>
      <DialogContent title={`새 ${meta.label}`} description={`세계선: ${branch.name}`}
        footer={<><Button variant="secondary" onClick={() => { reset(); close() }}>취소</Button><Button onClick={submit} disabled={busy} data-testid="create-entity-submit">{busy ? '만드는 중…' : '만들기'}</Button></>}>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); submit() }}>
          {!preset && (
            <Field label="유형">
              <Select value={kind} onChange={(e) => open(e.target.value as EntityKind)}>
                {KIND_LIST.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
              </Select>
            </Field>
          )}
          <Field label="이름" error={err}><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} data-testid="create-entity-name" /></Field>
          {ctxField && <Field label={ctxField.label}><EntityPicker value={ctxValue} onChange={setCtx} kinds={ctxField.kinds} /></Field>}
          <Field label={meta.startLabel} hint="비워 두면 시점 제한 없이 존재합니다.">
            <div className="flex gap-1.5">
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              <Button variant="secondary" size="sm" onClick={() => setStart(date)}>현재 날짜</Button>
            </div>
          </Field>
          {branch.is_main ? (
            <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <span>
                <span className="block text-[12.5px] font-medium">모든 세계선에 공통</span>
                <span className="block text-[11.5px] text-subtle">해제하면 기본 세계선과, 이 항목의 {meta.startLabel} 이후에 분기한 세계선에만 존재합니다.</span>
              </span>
              <Switch checked={allLines} onCheckedChange={setAllLines} />
            </label>
          ) : (
            <p className="rounded-md bg-surface-2 px-3 py-2 text-[11.5px] text-muted">분기 세계선 "{branch.name}"에서 만든 항목은 이 세계선과 그 하위 분기에만 존재합니다.</p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
