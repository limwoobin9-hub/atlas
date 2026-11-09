import { ImagePlus, Plus, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/misc'
import { useIdeologies, useTable } from '@/data/hooks'
import type { Chamber, WarSide } from '@/data/types'
import { useWorld } from '@/data/world'
import { uploadAsset } from '@/data/assets'
import { friendlyError } from '@/lib/errors'
import { EntityPicker } from './EntityPicker'
import type { FieldDef } from './fields'
import { StorageImage } from './common'

interface Props {
  field: FieldDef
  value: unknown
  onChange: (v: unknown) => void
  disabled?: boolean
  /** context for warSide fields */
  warId?: string | null
}

export function FieldInput({ field, value, onChange, disabled, warId }: Props) {
  const id = `f-${field.name}`
  switch (field.type) {
    case 'text':
      return (
        <>
          <Input id={id} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={field.placeholder}
            list={field.suggestions?.length ? id + '-list' : undefined} />
          {field.suggestions?.length ? <datalist id={id + '-list'}>{field.suggestions.map((s) => <option key={s} value={s} />)}</datalist> : null}
        </>
      )
    case 'textarea':
      return <Textarea id={id} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} rows={3} />
    case 'longtext':
      return <Textarea id={id} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} rows={6} className="min-h-32" />
    case 'number':
    case 'integer':
    case 'percent':
      return (
        <Input id={id} type="number" inputMode="decimal" value={value === null || value === undefined ? '' : String(value)} disabled={disabled}
          step={field.type === 'integer' ? 1 : 'any'} min={field.type === 'percent' ? 0 : field.min} max={field.type === 'percent' ? 100 : field.max}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') return onChange(null)
            const n = field.type === 'integer' ? Math.trunc(Number(raw)) : Number(raw)
            if (!Number.isNaN(n)) onChange(n)
          }} />
      )
    case 'date':
      return <Input id={id} type="date" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || null)} disabled={disabled} />
    case 'select':
      return (
        <Select id={id} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || null)} disabled={disabled}>
          {!field.required && <option value="">—</option>}
          {Object.entries(field.options ?? {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      )
    case 'boolean':
      return <div className="flex h-8 items-center"><Switch id={id} checked={Boolean(value)} onCheckedChange={onChange} disabled={disabled} /></div>
    case 'color':
      return <ColorInput value={(value as string) ?? null} onChange={onChange} disabled={disabled} />
    case 'entity':
      return <EntityPicker value={(value as string) ?? null} onChange={onChange} kinds={field.kinds} disabled={disabled} testId={`picker-${field.name}`} />
    case 'ideology':
      return <IdeologySelect id={id} value={(value as string) ?? null} onChange={onChange} disabled={disabled} />
    case 'chamber':
      return <ChamberSelect id={id} value={(value as string) ?? null} onChange={onChange} disabled={disabled} />
    case 'warSide':
      return <WarSideSelect id={id} value={(value as string) ?? null} onChange={onChange} disabled={disabled} warId={warId ?? null} />
    case 'image':
      return <ImageInput value={(value as string) ?? null} onChange={onChange} disabled={disabled} category={field.name.includes('flag') ? 'flag' : field.name.includes('emblem') ? 'emblem' : 'other'} />
    case 'specs':
      return <SpecsInput value={(value as { key: string; value: string }[]) ?? []} onChange={onChange} disabled={disabled} />
    case 'tags':
      return <TagsInput value={(value as string[]) ?? []} onChange={onChange} disabled={disabled} />
  }
}

export function ColorInput({ value, onChange, disabled }: { value: string | null; onChange: (v: string | null) => void; disabled?: boolean }) {
  return (
    <div className="flex h-8 items-center gap-1.5">
      <input type="color" value={value ?? '#888888'} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        className="h-8 w-10 cursor-pointer rounded-md border border-border bg-surface p-0.5" aria-label="색상" />
      <Input value={value ?? ''} disabled={disabled} placeholder="#rrggbb" className="w-24 font-mono text-[12px]"
        onChange={(e) => { const v = e.target.value.trim(); if (v === '') onChange(null); else if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v.toLowerCase()) }} />
      {value && !disabled && <Button variant="subtle" size="icon-xs" onClick={() => onChange(null)} aria-label="색상 지우기"><X /></Button>}
    </div>
  )
}

export function IdeologySelect({ value, onChange, disabled, id }: { value: string | null; onChange: (v: string | null) => void; disabled?: boolean; id?: string }) {
  const q = useIdeologies()
  return (
    <Select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} disabled={disabled}>
      <option value="">—</option>
      {(q.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
    </Select>
  )
}

function ChamberSelect({ value, onChange, disabled, id }: { value: string | null; onChange: (v: string | null) => void; disabled?: boolean; id?: string }) {
  const q = useTable<Chamber>('atlas_chambers', undefined, 'sort_order')
  const { entityMap } = useWorld()
  return (
    <Select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} disabled={disabled}>
      <option value="">—</option>
      {(q.data ?? []).map((c) => <option key={c.id} value={c.id}>{entityMap.get(c.parliament_id)?.name ?? '의회'} · {c.name} ({c.total_seats}석)</option>)}
    </Select>
  )
}

function WarSideSelect({ value, onChange, disabled, warId, id }: { value: string | null; onChange: (v: string | null) => void; disabled?: boolean; warId: string | null; id?: string }) {
  const q = useTable<WarSide>('atlas_war_sides', warId ? { war_id: warId } : undefined, 'sort_order')
  return (
    <Select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} disabled={disabled || !warId}>
      <option value="">{warId ? '—' : '먼저 전쟁을 지정하세요'}</option>
      {(q.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </Select>
  )
}

export function ImageInput({ value, onChange, disabled, category = 'other' }: { value: string | null; onChange: (v: string | null) => void; disabled?: boolean; category?: string }) {
  const { projectId } = useWorld()
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-14 w-20 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-2">
        {value ? <StorageImage path={value} className="h-full w-full object-contain" /> : <ImagePlus className="size-5 text-subtle" />}
      </div>
      <div className="flex flex-col gap-1">
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" hidden onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          setBusy(true)
          try {
            const a = await uploadAsset(projectId, f, { category })
            onChange(a.storage_path)
          } catch (err) { toast.error(friendlyError(err)) } finally { setBusy(false) }
        }} />
        <Button size="xs" variant="secondary" disabled={disabled || busy} onClick={() => ref.current?.click()}>{busy ? '업로드 중…' : value ? '이미지 교체' : '이미지 업로드'}</Button>
        {value && <Button size="xs" variant="subtle" disabled={disabled} onClick={() => onChange(null)}>제거</Button>}
      </div>
    </div>
  )
}

function SpecsInput({ value, onChange, disabled }: { value: { key: string; value: string }[]; onChange: (v: unknown) => void; disabled?: boolean }) {
  const rows = Array.isArray(value) ? value : []
  return (
    <div className="flex flex-col gap-1">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-1">
          <Input className="w-40" placeholder="항목 (예: 최고속도)" value={r.key} disabled={disabled} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} />
          <Input placeholder="값 (예: 520 km/h)" value={r.value} disabled={disabled} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
          <Button variant="subtle" size="icon-sm" disabled={disabled} onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="삭제"><Trash2 /></Button>
        </div>
      ))}
      <div><Button variant="secondary" size="xs" disabled={disabled} onClick={() => onChange([...rows, { key: '', value: '' }])}><Plus />제원 추가</Button></div>
    </div>
  )
}

export function TagsInput({ value, onChange, disabled }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const [t, setT] = useState('')
  const add = () => {
    const v = t.trim().replace(/^#/, '')
    if (v && !value.includes(v)) onChange([...value, v])
    setT('')
  }
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-1 rounded-md border border-border bg-surface px-1.5 py-1">
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-0.5 rounded bg-surface-2 px-1.5 text-[11.5px]">
          #{tag}{!disabled && <button type="button" onClick={() => onChange(value.filter((x) => x !== tag))} aria-label="태그 삭제"><X className="size-3 text-subtle" /></button>}
        </span>
      ))}
      {!disabled && (
        <input value={t} onChange={(e) => setT(e.target.value)} placeholder="태그 입력 후 Enter"
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } else if (e.key === 'Backspace' && !t && value.length) onChange(value.slice(0, -1)) }}
          onBlur={add} className="min-w-24 flex-1 bg-transparent text-[12.5px] outline-none" />
      )}
    </div>
  )
}
