import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Flag, RotateCcw, SkipBack, SkipForward } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger, Tooltip } from '@/components/ui/misc'
import { useTable } from '@/data/hooks'
import { useWorld } from '@/data/world'
import { addDays, addMonths, addYears, formatDate, fromYearFraction, isValidDate, parseLooseDate, toYearFraction } from '@/domain/dates'

const EVENTFUL = new Set(['event', 'war', 'battle', 'treaty', 'election', 'government'])

/** All dates with a recorded happening in the current world line, sorted. */
export function useEventDates() {
  const { entities } = useWorld()
  return useMemo(() => {
    const s = new Map<string, string>()
    for (const e of entities) {
      if (!EVENTFUL.has(e.kind)) continue
      if (e.starts_on && !s.has(e.starts_on)) s.set(e.starts_on, e.name)
      if (e.ends_on && !s.has(e.ends_on)) s.set(e.ends_on, `${e.name} 종료`)
    }
    return [...s.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [entities])
}

export function DateControl() {
  const { date, setDate, project, entities } = useWorld()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const eventDates = useEventDates()
  const milestonesQ = useTable<{ id: string; is_milestone: boolean }>('atlas_events', { is_milestone: true })
  const milestones = useMemo(() => {
    const ids = new Set((milestonesQ.data ?? []).map((m) => m.id))
    const fromEvents = entities.filter((e) => ids.has(e.id) && e.starts_on).map((e) => ({ date: e.starts_on!, label: e.name }))
    const custom = project.settings?.milestones ?? []
    return [...fromEvents, ...custom].sort((a, b) => a.date.localeCompare(b.date))
  }, [milestonesQ.data, entities, project.settings])

  const prev = [...eventDates].reverse().find(([d]) => d < date)
  const next = eventDates.find(([d]) => d > date)

  const range = useMemo(() => {
    const years = eventDates.map(([d]) => Number(d.slice(0, 4)))
    const base = Number(project.default_date.slice(0, 4))
    const cur = Number(date.slice(0, 4))
    const lo = Math.min(base, cur, ...years) - 1
    const hi = Math.max(base + 15, cur, ...years) + 1
    return [lo, hi]
  }, [eventDates, project.default_date, date])

  const commitText = () => {
    const d = parseLooseDate(text)
    if (d) setDate(d)
    setText('')
  }

  return (
    <div className="flex items-center gap-0.5" data-testid="date-control">
      <Tooltip content="이전 사건"><Button variant="subtle" size="icon-xs" disabled={!prev} onClick={() => prev && setDate(prev[0])} aria-label="이전 사건"><SkipBack /></Button></Tooltip>
      <Tooltip content="1개월 전"><Button variant="subtle" size="icon-xs" onClick={() => setDate(addMonths(date, -1))} aria-label="1개월 전"><ChevronLeft /></Button></Tooltip>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 text-[13px] font-semibold tabular-nums hover:border-border-strong focus-ring" data-testid="current-date">
            <CalendarDays className="size-3.5 text-accent" />{formatDate(date)}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[340px]" align="center">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1">
              <Button variant="secondary" size="icon-sm" onClick={() => setDate(addYears(date, -1))} aria-label="1년 전"><ChevronsLeft /></Button>
              <Button variant="secondary" size="icon-sm" onClick={() => setDate(addMonths(date, -1))} aria-label="1개월 전"><ChevronLeft /></Button>
              <Button variant="secondary" size="icon-sm" onClick={() => setDate(addDays(date, -1))} aria-label="1일 전">-1</Button>
              <Input type="date" value={date} onChange={(e) => isValidDate(e.target.value) && setDate(e.target.value)} className="flex-1 text-center" aria-label="날짜" data-testid="date-input" />
              <Button variant="secondary" size="icon-sm" onClick={() => setDate(addDays(date, 1))} aria-label="1일 후">+1</Button>
              <Button variant="secondary" size="icon-sm" onClick={() => setDate(addMonths(date, 1))} aria-label="1개월 후"><ChevronRight /></Button>
              <Button variant="secondary" size="icon-sm" onClick={() => setDate(addYears(date, 1))} aria-label="1년 후"><ChevronsRight /></Button>
            </div>
            <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); commitText() }}>
              <Input placeholder="직접 입력: 1941 / 1941.6.22 / 1941년 6월" value={text} onChange={(e) => setText(e.target.value)} />
              <Button type="submit" variant="secondary">이동</Button>
            </form>
            <div className="flex items-center gap-2">
              <span className="w-10 text-[11.5px] text-muted">연도</span>
              <Input type="number" className="w-24" value={date.slice(0, 4).replace(/^0+/, '')} min={1} max={9999}
                onChange={(e) => { const y = Number(e.target.value); if (y >= 1 && y <= 9999) setDate(`${String(y).padStart(4, '0')}${date.slice(4)}`.replace(/-02-29$/, (m) => ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? m : '-02-28'))) }} />
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setDate(project.default_date)}><RotateCcw />기본 날짜</Button>
            </div>
            <div>
              <input type="range" className="w-full accent-[var(--accent)]" min={range[0]} max={range[1] + 0.999} step={1 / 12}
                value={toYearFraction(date)} onChange={(e) => setDate(fromYearFraction(Number(e.target.value)))} aria-label="타임라인 슬라이더" />
              <div className="flex justify-between text-[10.5px] text-subtle"><span>{range[0]}</span><span>{range[1]}</span></div>
            </div>
            <div className="flex gap-1">
              <Button variant="secondary" size="sm" className="flex-1" disabled={!prev} onClick={() => prev && setDate(prev[0])}><SkipBack />이전 사건</Button>
              <Button variant="secondary" size="sm" className="flex-1" disabled={!next} onClick={() => next && setDate(next[0])}>다음 사건<SkipForward /></Button>
            </div>
            {(prev || next) && (
              <div className="text-[11px] text-subtle">{prev && <>◀ {formatDate(prev[0], 'short')} {prev[1]}</>}{prev && next && ' · '}{next && <>{formatDate(next[0], 'short')} {next[1]} ▶</>}</div>
            )}
            {milestones.length > 0 && (
              <div className="flex flex-col gap-1 border-t border-border pt-2">
                <span className="flex items-center gap-1 text-[11px] font-medium text-muted"><Flag className="size-3" />주요 역사 날짜</span>
                <div className="flex max-h-36 flex-col overflow-y-auto">
                  {milestones.map((m, i) => (
                    <button key={i} onClick={() => { setDate(m.date); setOpen(false) }} className="flex items-center gap-2 rounded px-1.5 py-1 text-left text-[12px] hover:bg-surface-2">
                      <span className="tabular-nums text-subtle">{formatDate(m.date, 'short')}</span><span className="truncate">{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
      <Tooltip content="1개월 후"><Button variant="subtle" size="icon-xs" onClick={() => setDate(addMonths(date, 1))} aria-label="1개월 후"><ChevronRight /></Button></Tooltip>
      <Tooltip content="다음 사건"><Button variant="subtle" size="icon-xs" disabled={!next} onClick={() => next && setDate(next[0])} aria-label="다음 사건"><SkipForward /></Button></Tooltip>
    </div>
  )
}
