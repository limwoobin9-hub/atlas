import { CalendarRange, LocateFixed } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Card, Empty } from '@/components/ui/misc'
import { useTable, useTemporal } from '@/data/hooks'
import type { AnyRow, Entity, EntityKind , Temporal } from '@/data/types'
import { useWorld } from '@/data/world'
import { compareDates, formatDate, formatRange, toYearFraction } from '@/domain/dates'
import { KINDS } from '@/domain/kinds'
import { cn } from '@/lib/utils'
import { EntityAvatar, EntityLink, entityHref } from '@/features/entities/common'
import { PageHeader } from '@/features/entities/EntityListPage'
import { EntityPicker } from '@/features/entities/EntityPicker'

const TIMELINE_KINDS: EntityKind[] = ['event', 'war', 'battle', 'treaty', 'election', 'government']
type Mode = 'list' | 'cards' | 'years' | 'periods'

/** id -> set of ids it is connected to (relations, participations, ownership columns). */
function useRelatedIndex() {
  const rels = useTemporal<Temporal & AnyRow & { from_id: string; to_id: string }>('atlas_entity_relations')
  const wp = useTemporal<Temporal & AnyRow & { war_id: string; participant_id: string }>('atlas_war_participants')
  const tp = useTable<AnyRow>('atlas_treaty_participants', undefined, 'treaty_id')
  const battles = useTable<AnyRow>('atlas_battles')
  const elections = useTable<AnyRow>('atlas_elections')
  const govs = useTable<AnyRow>('atlas_governments')
  return useMemo(() => {
    const idx = new Map<string, Set<string>>()
    const link = (a: string | null | undefined, b: string | null | undefined) => {
      if (!a || !b) return
      if (!idx.has(a)) idx.set(a, new Set())
      if (!idx.has(b)) idx.set(b, new Set())
      idx.get(a)!.add(b)
      idx.get(b)!.add(a)
    }
    for (const r of rels.visible) link(r.from_id, r.to_id)
    for (const r of wp.visible) link(r.war_id, r.participant_id)
    for (const r of tp.data ?? []) link(r.treaty_id, r.participant_id)
    for (const r of battles.data ?? []) link(r.id, r.war_id)
    for (const r of elections.data ?? []) link(r.id, r.country_id)
    for (const r of govs.data ?? []) link(r.id, r.country_id)
    return idx
  }, [rels.visible, wp.visible, tp.data, battles.data, elections.data, govs.data])
}

export function TimelinePage() {
  const { entities, date, setDate, projectId } = useWorld()
  const related = useRelatedIndex()
  const eventTypes = useTable<AnyRow>('atlas_events')
  const [mode, setMode] = useState<Mode>('list')
  const [kinds, setKinds] = useState<Set<EntityKind>>(new Set(TIMELINE_KINDS))
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [country, setCountry] = useState<string | null>(null)
  const [person, setPerson] = useState<string | null>(null)
  const [war, setWar] = useState<string | null>(null)
  const [eventType, setEventType] = useState('')
  const typeById = useMemo(() => new Map((eventTypes.data ?? []).map((e) => [e.id as string, e.event_type as string])), [eventTypes.data])

  const items = useMemo(() => {
    const has = (id: string, other: string | null) => !other || id === other || related.get(id)?.has(other) || [...(related.get(id) ?? [])].some((x) => related.get(x)?.has(other) && entities.find((e) => e.id === x)?.kind === 'war')
    return entities
      .filter((e) => kinds.has(e.kind) && e.starts_on)
      .filter((e) => (!from || (e.ends_on ?? e.starts_on!) >= from) && (!to || e.starts_on! <= to))
      .filter((e) => !eventType || typeById.get(e.id) === eventType)
      .filter((e) => has(e.id, country) && has(e.id, person) && (!war || e.id === war || related.get(e.id)?.has(war)))
      .sort((a, b) => compareDates(a.starts_on, b.starts_on))
  }, [entities, kinds, from, to, country, person, war, related, eventType, typeById])

  const types = [...new Set([...typeById.values()].filter(Boolean))]
  const toggleKind = (k: EntityKind) => setKinds((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })

  return (
    <div className="flex flex-col">
      <PageHeader title="연표" icon={<CalendarRange />} sub={`${items.length}개 항목 · 항목의 날짜를 누르면 그 시점의 세계로 이동합니다`} actions={
        <div className="flex rounded-md border border-border bg-surface p-0.5">
          {([['list', '연대순 목록'], ['cards', '카드형'], ['years', '연도별'], ['periods', '기간형']] as [Mode, string][]).map(([m, l]) => (
            <button key={m} onClick={() => setMode(m)} className={cn('rounded px-2.5 py-1 text-[12px] text-muted', mode === m && 'bg-surface-2 font-medium text-fg')}>{l}</button>
          ))}
        </div>} />
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-5 py-2">
        {TIMELINE_KINDS.map((k) => (
          <button key={k} onClick={() => toggleKind(k)} className={cn('rounded-full border px-2.5 py-0.5 text-[11.5px]', kinds.has(k) ? 'border-transparent text-white' : 'border-border text-muted')} style={kinds.has(k) ? { background: KINDS[k].color } : undefined}>{KINDS[k].label}</button>
        ))}
        <span className="mx-1 h-5 w-px bg-border" />
        <Input type="date" className="w-36" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="시작" />
        <span className="text-subtle">~</span>
        <Input type="date" className="w-36" value={to} onChange={(e) => setTo(e.target.value)} aria-label="끝" />
        {types.length > 0 && <Select className="w-28" value={eventType} onChange={(e) => setEventType(e.target.value)}><option value="">사건 유형</option>{types.map((t) => <option key={t}>{t}</option>)}</Select>}
        <div className="w-40"><EntityPicker value={country} onChange={setCountry} kinds={['country']} placeholder="국가별 연표" allowCreate={false} /></div>
        <div className="w-36"><EntityPicker value={person} onChange={setPerson} kinds={['character']} placeholder="관련 인물" allowCreate={false} /></div>
        <div className="w-36"><EntityPicker value={war} onChange={setWar} kinds={['war']} placeholder="관련 전쟁" allowCreate={false} /></div>
      </div>
      <div className="p-5">
        {items.length === 0 ? <Empty icon={<CalendarRange />} title="표시할 항목이 없습니다" description="사건·전쟁·조약·선거에 시작일을 입력하면 연표에 나타납니다." /> :
          mode === 'list' ? <ListMode items={items} date={date} onDate={setDate} /> :
          mode === 'cards' ? <CardMode items={items} date={date} onDate={setDate} projectId={projectId} /> :
          mode === 'years' ? <YearMode items={items} date={date} onDate={setDate} /> :
          <PeriodMode items={items} date={date} onDate={setDate} projectId={projectId} />}
      </div>
    </div>
  )
}

function DateButton({ d, current, onDate }: { d: string | null; current: string; onDate: (d: string) => void }) {
  if (!d) return null
  return <button className={cn('tabular-nums hover:underline', d <= current ? 'text-muted' : 'text-accent')} title="이 날짜로 이동" onClick={() => onDate(d)}>{formatDate(d, 'short')}</button>
}

function ListMode({ items, date, onDate }: { items: Entity[]; date: string; onDate: (d: string) => void }) {
  let marked = false
  return (
    <ol className="relative mx-auto max-w-3xl border-l border-border">
      {items.map((e) => {
        const showNow = !marked && e.starts_on! > date
        if (showNow) marked = true
        return (
          <li key={e.id}>
            {showNow && <div className="relative my-1 -ml-px flex items-center gap-2 border-l-2 border-accent py-1 pl-4 text-[11.5px] font-medium text-accent"><LocateFixed className="size-3.5" />현재 날짜 {formatDate(date)}</div>}
            <div className="relative py-2 pl-5">
              <span className="absolute -left-[5px] top-3.5 size-2.5 rounded-full border-2 border-bg" style={{ background: KINDS[e.kind].color }} />
              <div className="flex flex-wrap items-center gap-2 text-[11.5px]"><DateButton d={e.starts_on} current={date} onDate={onDate} />{e.ends_on && <>~ <DateButton d={e.ends_on} current={date} onDate={onDate} /></>}<span className="text-subtle">{KINDS[e.kind].label}</span></div>
              <div className="text-[13px] font-medium"><EntityLink id={e.id} /></div>
              {e.summary && <p className="text-[12px] text-muted">{e.summary}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function CardMode({ items, date, onDate, projectId }: { items: Entity[]; date: string; onDate: (d: string) => void; projectId: string }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {items.map((e) => (
        <Card key={e.id} className={cn('w-60 shrink-0 p-3', e.starts_on! <= date && (!e.ends_on || date < e.ends_on) && 'ring-2 ring-accent')} style={{ borderTop: `3px solid ${KINDS[e.kind].color}` }}>
          <div className="flex items-center gap-2 text-[11px] text-muted"><DateButton d={e.starts_on} current={date} onDate={onDate} /><span>{KINDS[e.kind].label}</span></div>
          <Link to={entityHref(projectId, e)} className="mt-1 flex items-center gap-2 text-[13px] font-semibold hover:text-accent"><EntityAvatar entity={e} size={18} />{e.name}</Link>
          <p className="mt-1 line-clamp-4 text-[12px] text-muted">{e.summary || formatRange(e.starts_on, e.ends_on)}</p>
        </Card>
      ))}
    </div>
  )
}

function YearMode({ items, date, onDate }: { items: Entity[]; date: string; onDate: (d: string) => void }) {
  const groups = new Map<string, Entity[]>()
  for (const e of items) { const y = e.starts_on!.slice(0, 4); if (!groups.has(y)) groups.set(y, []); groups.get(y)!.push(e) }
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {[...groups.entries()].map(([y, list]) => (
        <Card key={y}>
          <div className="flex items-center justify-between border-b border-border px-3.5 py-2"><span className="text-[15px] font-semibold tabular-nums">{Number(y)}년</span><Button size="xs" variant="ghost" onClick={() => onDate(`${y}-01-01`)}>이 해로 이동</Button></div>
          <ul className="divide-y divide-border">{list.map((e) => <li key={e.id} className="flex items-center gap-2 px-3.5 py-1.5 text-[12.5px]"><span className="w-14 text-[11px]"><DateButton d={e.starts_on} current={date} onDate={onDate} /></span><EntityLink id={e.id} /></li>)}</ul>
        </Card>
      ))}
    </div>
  )
}

function PeriodMode({ items, date, onDate, projectId }: { items: Entity[]; date: string; onDate: (d: string) => void; projectId: string }) {
  const starts = items.map((e) => toYearFraction(e.starts_on!))
  const ends = items.map((e) => toYearFraction(e.ends_on ?? e.starts_on!))
  const lo = Math.floor(Math.min(...starts, toYearFraction(date)))
  const hi = Math.ceil(Math.max(...ends, toYearFraction(date))) + 1
  const span = Math.max(1, hi - lo)
  const pct = (v: number) => ((v - lo) / span) * 100
  const years = Array.from({ length: span + 1 }, (_, i) => lo + i)
  return (
    <Card className="overflow-x-auto p-3">
      <div className="relative min-w-[720px]">
        <div className="relative ml-48 h-6 border-b border-border text-[10.5px] text-subtle">
          {years.map((y) => <span key={y} className="absolute -translate-x-1/2" style={{ left: `${pct(y)}%` }}>{y}</span>)}
        </div>
        <div className="absolute bottom-0 top-6 z-10 ml-48 w-[calc(100%-12rem)]"><div className="absolute inset-y-0 w-0.5 bg-accent/70" style={{ left: `${pct(toYearFraction(date))}%` }} /></div>
        {items.map((e) => {
          const s = toYearFraction(e.starts_on!)
          const en = e.ends_on ? toYearFraction(e.ends_on) : s + 0.02
          return (
            <div key={e.id} className="flex h-7 items-center">
              <Link to={entityHref(projectId, e)} className="w-48 truncate pr-2 text-[12px] hover:text-accent">{e.name}</Link>
              <div className="relative h-full flex-1">
                <button title={`${e.name} ${formatRange(e.starts_on, e.ends_on)}`} onClick={() => onDate(e.starts_on!)}
                  className="absolute top-1.5 h-4 min-w-1.5 rounded-sm opacity-90 hover:opacity-100" style={{ left: `${pct(s)}%`, width: `${Math.max(0.4, pct(en) - pct(s))}%`, background: e.color ?? KINDS[e.kind].color }} />
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
