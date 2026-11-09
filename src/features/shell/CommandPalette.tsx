import { Command } from 'cmdk'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorld } from '@/data/world'
import { formatRange } from '@/domain/dates'
import { KINDS, KIND_LIST } from '@/domain/kinds'
import { EntityAvatar, entityHref } from '@/features/entities/common'
import { NAV } from './Sidebar'

export function CommandPalette({ open, onOpenChange, onCreate }: { open: boolean; onOpenChange: (v: boolean) => void; onCreate: (kind: string) => void }) {
  const { entities, projectId, canEdit } = useWorld()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  useEffect(() => { if (!open) setQ('') }, [open])

  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return entities.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 12)
    return entities
      .map((e) => {
        const name = e.name.toLowerCase()
        const score = name === s ? 0 : name.startsWith(s) ? 1 : name.includes(s) ? 2 : e.tags.some((t) => t.toLowerCase().includes(s)) ? 3 : e.summary.toLowerCase().includes(s) ? 4 : 9
        return { e, score }
      })
      .filter((x) => x.score < 9)
      .sort((a, b) => a.score - b.score || a.e.name.localeCompare(b.e.name))
      .slice(0, 40)
      .map((x) => x.e)
  }, [entities, q])

  const go = (path: string) => { onOpenChange(false); nav(path) }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/30" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[12vh] z-[60] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
          <DialogPrimitive.Title className="sr-only">전체 검색</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">항목, 화면, 생성 명령을 검색합니다</DialogPrimitive.Description>
          <Command shouldFilter={false} label="전체 검색">
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="size-4 text-subtle" />
              <Command.Input value={q} onValueChange={setQ} placeholder="국가, 인물, 사건, 부대… 이름이나 태그로 검색" className="h-11 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-subtle" data-testid="palette-input" />
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-1.5">
              <Command.Empty className="px-3 py-6 text-center text-[12.5px] text-muted">결과가 없습니다.</Command.Empty>
              {results.length > 0 && (
                <Command.Group heading={q ? '항목' : '최근 수정'} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-subtle">
                  {results.map((e) => (
                    <Command.Item key={e.id} value={e.id} onSelect={() => go(entityHref(projectId, e))}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] data-[selected=true]:bg-surface-2">
                      <EntityAvatar entity={e} size={20} />
                      <span className="min-w-0 flex-1 truncate">{e.name}</span>
                      <span className="text-[11px] text-subtle">{KINDS[e.kind].label}</span>
                      {(e.starts_on || e.ends_on) && <span className="text-[10.5px] tabular-nums text-subtle">{formatRange(e.starts_on, e.ends_on)}</span>}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading="이동" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-subtle">
                {NAV.flatMap((g) => g.items).filter((i) => !q || i.label.includes(q)).slice(0, q ? 10 : 6).map((i) => (
                  <Command.Item key={i.to} value={'nav-' + i.to} onSelect={() => go(`/p/${projectId}/${i.to}`)} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] data-[selected=true]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted">
                    {i.icon}{i.label}
                  </Command.Item>
                ))}
              </Command.Group>
              {canEdit && (
                <Command.Group heading="새로 만들기" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-subtle">
                  {KIND_LIST.filter((k) => !q || k.label.includes(q)).slice(0, q ? 16 : 5).map((k) => (
                    <Command.Item key={k.kind} value={'new-' + k.kind} onSelect={() => { onOpenChange(false); onCreate(k.kind) }} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] data-[selected=true]:bg-surface-2">
                      <Plus className="size-4 text-muted" />{k.label} 생성
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
            <div className="border-t border-border px-3 py-1.5 text-[11px] text-subtle">
              <button className="hover:text-fg" onClick={() => go(`/p/${projectId}/search?q=${encodeURIComponent(q)}`)}>고급 검색 (유형·날짜 필터) →</button>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
