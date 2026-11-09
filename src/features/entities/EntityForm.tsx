import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Loading } from '@/components/ui/misc'
import { qk, updateRow } from '@/data/db'
import { useSubtype } from '@/data/hooks'
import type { AnyRow, Entity } from '@/data/types'
import { useWorld } from '@/data/world'
import { KINDS, STATUS } from '@/domain/kinds'
import { cn } from '@/lib/utils'
import { ColorInput, FieldInput, ImageInput, TagsInput } from './FieldInput'
import { SUBTYPE_FIELDS, type FieldDef } from './fields'
import { useAutosave } from './useAutosave'

const span = (f: FieldDef) => (f.span === 3 ? 'col-span-full' : f.span === 2 ? 'sm:col-span-2' : '')

/** Base + typed fields of an entity with debounced autosave. Mount with key={entity.id}. */
export function EntityForm({ entity, sections = 'all' }: { entity: Entity; sections?: 'all' | 'base' | 'sub' }) {
  const { canEdit, projectId } = useWorld()
  const qc = useQueryClient()
  const meta = KINDS[entity.kind]
  const full = useSubtype<Entity>('atlas_entities', entity.id)
  const sub = useSubtype<AnyRow>(meta.table, entity.id)
  const [base, setBase] = useState<AnyRow | null>(null)
  const [subDraft, setSubDraft] = useState<AnyRow | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => { if (full.data && !base) setBase(full.data) }, [full.data, base])
  useEffect(() => { if (sub.data && !subDraft) setSubDraft(sub.data) }, [sub.data, subDraft])

  const baseSave = useAutosave(`entity:${entity.id}`, async (patch) => {
    const row = await updateRow<Entity>('atlas_entities', entity.id, patch)
    qc.setQueryData<Entity[]>(qk.entities(projectId), (old) => old?.map((e) => (e.id === row.id ? { ...e, ...row } : e)))
    qc.setQueryData(qk.subtype('atlas_entities', entity.id), row)
  })
  const subSave = useAutosave(`sub:${entity.id}`, async (patch) => {
    if (!meta.table) return
    const row = await updateRow(meta.table, entity.id, patch)
    qc.setQueryData(qk.subtype(meta.table, entity.id), row)
    qc.invalidateQueries({ queryKey: ['table', meta.table, projectId] })
  })

  if (!base || (meta.table && !subDraft)) return <Loading />

  const setB = (k: string, v: unknown) => {
    const next = { ...base, [k]: v }
    setBase(next)
    const errs = { ...errors }
    delete errs[k]
    if (k === 'name' && !String(v ?? '').trim()) { errs.name = '이름은 비워 둘 수 없습니다.'; setErrors(errs); return }
    if ((k === 'starts_on' || k === 'ends_on') && next.starts_on && next.ends_on && next.ends_on < next.starts_on) {
      errs[k] = `${meta.endLabel}은(는) ${meta.startLabel}보다 빠를 수 없습니다.`
      setErrors(errs)
      return
    }
    delete errs.starts_on
    delete errs.ends_on
    setErrors(errs)
    baseSave.queue({ [k]: k === 'name' ? String(v).trim() : v, ...(k === 'starts_on' || k === 'ends_on' ? { starts_on: next.starts_on, ends_on: next.ends_on } : {}) })
  }
  const setS = (k: string, v: unknown) => {
    setSubDraft({ ...subDraft, [k]: v })
    subSave.queue({ [k]: v })
  }

  const ro = !canEdit
  const subFields = SUBTYPE_FIELDS[entity.kind] ?? []
  const hideEnd = entity.kind === 'election'

  return (
    <div className="flex flex-col gap-5">
      {sections !== 'sub' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="이름" error={errors.name} className="sm:col-span-2" htmlFor="ef-name">
            <Input id="ef-name" value={base.name ?? ''} onChange={(e) => setB('name', e.target.value)} disabled={ro} data-testid="entity-name" />
          </Field>
          <Field label="설정 상태">
            <Select value={base.status} onChange={(e) => setB('status', e.target.value)} disabled={ro}>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </Field>
          <Field label={meta.startLabel} error={errors.starts_on}>
            <Input type="date" value={base.starts_on ?? ''} onChange={(e) => setB('starts_on', e.target.value || null)} disabled={ro} data-testid="entity-start" />
          </Field>
          {!hideEnd && (
            <Field label={meta.endLabel} error={errors.ends_on} hint="이 날짜부터 존재하지 않는 것으로 계산됩니다.">
              <Input type="date" value={base.ends_on ?? ''} onChange={(e) => setB('ends_on', e.target.value || null)} disabled={ro} />
            </Field>
          )}
          <Field label={entity.kind === 'country' ? '기본 대표 색상' : entity.kind === 'party' ? '정당 색상' : '색상'}>
            <ColorInput value={base.color ?? null} onChange={(v) => setB('color', v)} disabled={ro} />
          </Field>
          <Field label="요약" className="col-span-full">
            <Textarea value={base.summary ?? ''} onChange={(e) => setB('summary', e.target.value)} disabled={ro} rows={2} maxLength={2000} placeholder="한두 문장 요약 — 목록과 빠른 보기 패널에 표시됩니다." />
          </Field>
          <Field label={entity.kind === 'country' ? '국기 (기본)' : entity.kind === 'character' ? '사진' : '대표 이미지'}>
            <ImageInput value={base.image_path ?? null} onChange={(v) => setB('image_path', v)} disabled={ro} category={entity.kind === 'character' ? 'portrait' : entity.kind === 'country' ? 'flag' : entity.kind === 'ship' ? 'ship' : 'other'} />
          </Field>
          <Field label="태그" className="sm:col-span-2">
            <TagsInput value={base.tags ?? []} onChange={(v) => setB('tags', v)} disabled={ro} />
          </Field>
        </div>
      )}
      {sections !== 'base' && subFields.length > 0 && subDraft && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {subFields.map((f) => (
            <Field key={f.name} label={f.label} hint={f.hint} className={cn(span(f), f.type === 'boolean' && 'justify-center')}>
              <FieldInput field={f} value={subDraft[f.name]} onChange={(v) => setS(f.name, v)} disabled={ro} warId={entity.kind === 'battle' ? (subDraft.war_id as string | null) : null} />
            </Field>
          ))}
        </div>
      )}
      {sections !== 'sub' && (
        <Field label="본문 / 상세 설명" hint="자유롭게 기록하는 장문 설명입니다.">
          <Textarea value={base.body ?? ''} onChange={(e) => setB('body', e.target.value)} disabled={ro} rows={10} className="min-h-48" />
        </Field>
      )}
    </div>
  )
}

/** Autosaving textarea bound to a key in a jsonb column (e.g. country sections). */
export function JsonSectionEditor({ table, id, column, sectionKey, label }: { table: string; id: string; column: string; sectionKey: string; label: string }) {
  const { canEdit } = useWorld()
  const qc = useQueryClient()
  const q = useSubtype<AnyRow>(table, id)
  const [text, setText] = useState<string | null>(null)
  const save = useAutosave(`json:${table}:${id}:${sectionKey}`, async (patch) => {
    const latest = (qc.getQueryData<AnyRow>(qk.subtype(table, id)) ?? q.data ?? {}) as AnyRow
    const merged = { ...(latest[column] ?? {}), ...patch }
    const row = await updateRow(table, id, { [column]: merged })
    qc.setQueryData(qk.subtype(table, id), row)
  })
  useEffect(() => { if (q.data && text === null) setText(String(q.data[column]?.[sectionKey] ?? '')) }, [q.data, text, column, sectionKey])
  if (text === null) return <Loading />
  return (
    <Field label={label}>
      <Textarea value={text} rows={12} className="min-h-56" disabled={!canEdit}
        onChange={(e) => { setText(e.target.value); save.queue({ [sectionKey]: e.target.value }) }} />
    </Field>
  )
}
