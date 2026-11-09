import { Command } from 'cmdk'
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/misc'
import { createEntity } from '@/data/entities'
import { useInvalidateTable } from '@/data/hooks'
import type { Entity, EntityKind } from '@/data/types'
import { useWorld } from '@/data/world'
import { formatRange } from '@/domain/dates'
import { KINDS } from '@/domain/kinds'
import { friendlyError } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { EntityAvatar } from './common'

interface Props {
  value: string | null | undefined
  onChange: (id: string | null) => void
  kinds?: EntityKind[]
  placeholder?: string
  disabled?: boolean
  exclude?: string[]
  className?: string
  allowCreate?: boolean
  /** show entities from all world lines (default: current line only) */
  allLines?: boolean
  testId?: string
}

/** Search existing entities and link them; create a new one inline if it does not exist. */
export function EntityPicker({ value, onChange, kinds, placeholder = '선택…', disabled, exclude, className, allowCreate = true, allLines, testId }: Props) {
  const { entities, allEntities, entityMap, projectId, branchId, canEdit } = useWorld()
  const invalidate = useInvalidateTable()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [createKind, setCreateKind] = useState<EntityKind | null>(null)
  const pool = allLines ? allEntities : entities
  const selected = value ? entityMap.get(value) ?? allEntities.find((e) => e.id === value) : undefined

  const items = useMemo(() => {
    const s = q.trim().toLowerCase()
    return pool
      .filter((e) => (!kinds || kinds.includes(e.kind)) && !exclude?.includes(e.id))
      .filter((e) => !s || e.name.toLowerCase().includes(s) || e.tags.some((t) => t.toLowerCase().includes(s)))
      .slice(0, 60)
  }, [pool, kinds, exclude, q])

  const create = async (kind: EntityKind) => {
    try {
      const e = await createEntity({ projectId, kind, name: q.trim(), originBranchId: branchId })
      invalidate('atlas_entities')
      onChange(e.id)
      setOpen(false)
      setQ('')
      toast.success(`${KINDS[kind].label} "${e.name}"을(를) 만들고 연결했습니다.`)
    } catch (err) {
      toast.error(friendlyError(err))
    }
  }

  return (
    <div className={cn('flex min-w-0 items-center gap-1', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild disabled={disabled}>
          <button type="button" data-testid={testId}
            className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border bg-surface px-2 text-left text-[13px] hover:border-border-strong focus-ring disabled:opacity-60">
            {selected ? (<><EntityAvatar entity={selected} size={16} /><span className="truncate">{selected.name}</span></>)
              : value ? <span className="truncate text-subtle line-through">삭제된 항목</span>
              : <span className="truncate text-subtle">{placeholder}</span>}
            <ChevronsUpDown className="ml-auto size-3.5 shrink-0 text-subtle" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <Command shouldFilter={false}>
            <Command.Input value={q} onValueChange={setQ} placeholder={`${kinds ? kinds.map((k) => KINDS[k].label).join('·') : '항목'} 검색`}
              className="h-9 w-full border-b border-border bg-transparent px-3 text-[13px] outline-none" />
            <Command.List className="max-h-72 overflow-y-auto p-1">
              {items.length === 0 && <div className="px-2 py-3 text-center text-[12px] text-muted">일치하는 항목이 없습니다.</div>}
              {items.map((e: Entity) => (
                <Command.Item key={e.id} value={e.id} onSelect={() => { onChange(e.id); setOpen(false); setQ('') }}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[12.5px] data-[selected=true]:bg-surface-2">
                  <EntityAvatar entity={e} size={16} />
                  <span className="min-w-0 flex-1 truncate">{e.name}</span>
                  {!kinds || kinds.length > 1 ? <span className="text-[10.5px] text-subtle">{KINDS[e.kind].label}</span> : null}
                  {(e.starts_on || e.ends_on) && <span className="text-[10px] text-subtle">{formatRange(e.starts_on, e.ends_on)}</span>}
                  {e.id === value && <Check className="size-3.5 text-accent" />}
                </Command.Item>
              ))}
              {allowCreate && canEdit && q.trim() && (
                <div className="mt-1 border-t border-border pt-1">
                  {(kinds ?? (createKind ? [createKind] : (['country', 'character', 'region', 'event', 'organization'] as EntityKind[]))).map((k) => (
                    <Command.Item key={k} value={'create-' + k} onSelect={() => create(k)}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[12.5px] text-accent data-[selected=true]:bg-accent-soft">
                      <Plus className="size-3.5" />새 {KINDS[k].label} "{q.trim()}" 만들기
                    </Command.Item>
                  ))}
                  {!kinds && !createKind && (
                    <select className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-[12px]" value="" onChange={(e) => setCreateKind(e.target.value as EntityKind)}>
                      <option value="">다른 유형으로 만들기…</option>
                      {Object.values(KINDS).map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                    </select>
                  )}
                </div>
              )}
            </Command.List>
          </Command>
        </PopoverContent>
      </Popover>
      {value && !disabled && (
        <Button variant="subtle" size="icon-xs" onClick={() => onChange(null)} aria-label="연결 해제"><X /></Button>
      )}
    </div>
  )
}
