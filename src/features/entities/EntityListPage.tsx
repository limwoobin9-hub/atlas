import { useVirtualizer } from '@tanstack/react-virtual'
import { Plus, Search } from 'lucide-react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Empty, Switch } from '@/components/ui/misc'
import type { Entity, EntityKind } from '@/data/types'
import { useWorld } from '@/data/world'
import { formatRange } from '@/domain/dates'
import { KINDS, STATUS } from '@/domain/kinds'
import { entityActiveAt } from '@/domain/timeline'
import { cn, sortBy } from '@/lib/utils'
import { useSession } from '@/stores/session'
import { EntityAvatar, StatusBadge, entityHref } from './common'
import { useCreateDialog } from './CreateEntityDialog'
import { KindIcon } from './KindIcon'

export function PageHeader({ title, icon, sub, actions }: { title: ReactNode; icon?: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-5 py-3">
      {icon && <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft text-accent [&_svg]:size-4">{icon}</span>}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[16px] font-semibold">{title}</h1>
        {sub && <p className="truncate text-[12px] text-muted">{sub}</p>}
      </div>
      {actions}
    </div>
  )
}

/** Virtualised, filterable list for any entity kind. */
export function EntityListPage({ kind, extraColumns, headerExtra, embedded, filter }: {
  kind: EntityKind
  extraColumns?: { label: string; width: string; render: (e: Entity) => ReactNode }[]
  headerExtra?: ReactNode
  embedded?: boolean
  filter?: (e: Entity) => boolean
}) {
  const { entities, date, projectId, canEdit } = useWorld()
  const openCreate = useCreateDialog((s) => s.open)
  const openPanel = useSession((s) => s.openPanel)
  const meta = KINDS[kind]
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [activeOnly, setActiveOnly] = useState(false)
  const [sort, setSort] = useState<'name' | 'start' | 'updated'>('name')
  const parentRef = useRef<HTMLDivElement>(null)

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    let items = entities.filter((e) => e.kind === kind && (!filter || filter(e)))
    if (s) items = items.filter((e) => e.name.toLowerCase().includes(s) || e.summary.toLowerCase().includes(s) || e.tags.some((t) => t.toLowerCase().includes(s)))
    if (status) items = items.filter((e) => e.status === status)
    if (activeOnly) items = items.filter((e) => entityActiveAt(e, date))
    return sort === 'name' ? sortBy(items, (e) => e.name) : sort === 'start' ? sortBy(items, (e) => e.starts_on) : sortBy(items, (e) => e.updated_at, -1)
  }, [entities, kind, q, status, activeOnly, date, sort, filter])

  const virt = useVirtualizer({ count: list.length, getScrollElement: () => parentRef.current, estimateSize: () => 44, overscan: 12 })
  const cols = `minmax(220px,2fr) 84px 190px ${extraColumns?.map((c) => c.width).join(' ') ?? ''} minmax(160px,2fr)`

  return (
    <div className={cn('flex min-h-0 flex-col', embedded ? 'h-[70vh]' : 'h-full')}>
      {!embedded && (
        <PageHeader title={meta.label} icon={<KindIcon kind={kind} />} sub={`${list.length}개 표시 · 현재 세계선 기준`}
          actions={<>{headerExtra}{canEdit && <Button onClick={() => openCreate(kind)} data-testid={`create-${kind}`}><Plus />{meta.label} 생성</Button>}</>} />
      )}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-2">
        <div className="relative w-64"><Search className="absolute left-2.5 top-2 size-4 text-subtle" /><Input className="pl-8" placeholder={`${meta.label} 검색 (이름·요약·태그)`} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select className="w-28" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">모든 상태</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        <Select className="w-32" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="name">이름순</option><option value="start">{meta.startLabel}순</option><option value="updated">최근 수정순</option>
        </Select>
        <label className="flex items-center gap-1.5 text-[12px] text-muted"><Switch checked={activeOnly} onCheckedChange={setActiveOnly} />현재 날짜에 존재하는 항목만</label>
        {embedded && canEdit && <Button size="sm" className="ml-auto" onClick={() => openCreate(kind)}><Plus />{meta.label} 생성</Button>}
      </div>
      {list.length === 0 ? (
        <div className="p-5"><Empty icon={<KindIcon kind={kind} />} title={`${meta.label}이(가) 없습니다`} description={q || status || activeOnly ? '필터 조건을 바꿔 보세요.' : `첫 ${meta.label}을(를) 만들어 세계관을 채워 보세요.`}
          action={canEdit && !q ? <Button onClick={() => openCreate(kind)}><Plus />{meta.label} 생성</Button> : undefined} /></div>
      ) : (
        <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
          <div className="sticky top-0 z-10 grid border-b border-border bg-surface-2 px-5 py-1.5 text-[11px] font-medium text-muted" style={{ gridTemplateColumns: cols }}>
            <span>이름</span><span>상태</span><span>{meta.startLabel} ~ {meta.endLabel}</span>{extraColumns?.map((c) => <span key={c.label}>{c.label}</span>)}<span>요약</span>
          </div>
          <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
            {virt.getVirtualItems().map((v) => {
              const e = list[v.index]
              const active = entityActiveAt(e, date)
              return (
                <div key={e.id} className="absolute left-0 right-0 grid items-center border-b border-border px-5 text-[12.5px] hover:bg-surface-2" style={{ top: v.start, height: v.size, gridTemplateColumns: cols }}>
                  <span className="flex min-w-0 items-center gap-2">
                    <EntityAvatar entity={e} size={22} />
                    <Link to={entityHref(projectId, e)} onClick={(ev) => { if (ev.shiftKey) { ev.preventDefault(); openPanel(e.id) } }} className={cn('truncate font-medium hover:text-accent', !active && 'text-muted')}>{e.name}</Link>
                    {e.color && <span className="size-2 shrink-0 rounded-full" style={{ background: e.color }} />}
                  </span>
                  <span><StatusBadge status={e.status} /></span>
                  <span className="tabular-nums text-[11.5px] text-muted">{formatRange(e.starts_on, e.ends_on)}</span>
                  {extraColumns?.map((c) => <span key={c.label} className="min-w-0 truncate">{c.render(e)}</span>)}
                  <span className="truncate text-[12px] text-subtle">{e.summary || (e.tags.length ? e.tags.map((t) => '#' + t).join(' ') : '')}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
