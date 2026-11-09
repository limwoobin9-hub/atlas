import { useMemo, useState } from 'react'
import { assignSeats, circleSeats, hemicycleSeats, majorityThreshold, type PartySeats } from '@/domain/parliament'

export interface ChartParty extends PartySeats { name: string; color: string; government?: boolean }

/** Seat-by-seat parliament chart: hemicycle, circle or stacked bar. */
export function SeatChart({ total, parties, layout, majority }: { total: number; parties: ChartParty[]; layout: 'hemicycle' | 'circle' | 'bar'; majority?: number | null }) {
  const [hover, setHover] = useState<string | null>(null)
  const seats = useMemo(() => (layout === 'circle' ? circleSeats(total) : hemicycleSeats(total)), [total, layout])
  const assigned = useMemo(() => assignSeats(seats, parties), [seats, parties])
  const byId = new Map(parties.map((p) => [p.partyId, p]))
  const maj = majorityThreshold(total, majority)
  const filled = parties.reduce((a, p) => a + p.seats, 0)

  if (layout === 'bar') {
    return (
      <div className="flex flex-col gap-2 p-1">
        <div className="relative flex h-10 overflow-hidden rounded-md border border-border">
          {parties.map((p) => (
            <div key={p.partyId} title={`${p.name} ${p.seats}석`} style={{ width: `${(p.seats / total) * 100}%`, background: p.color }}
              className="flex items-center justify-center text-[10.5px] font-semibold text-white/90" onMouseEnter={() => setHover(p.partyId)} onMouseLeave={() => setHover(null)}>
              {p.seats / total > 0.06 ? p.seats : ''}
            </div>
          ))}
          <div className="absolute inset-y-0 border-l-2 border-dashed border-fg/70" style={{ left: `${(maj / total) * 100}%` }} title={`과반 ${maj}석`} />
        </div>
        <Legend parties={parties} total={total} hover={hover} />
      </div>
    )
  }

  const r = layout === 'circle' ? 0.022 * Math.sqrt(300 / Math.max(total, 30)) * 1.35 : 0.028 * Math.sqrt(300 / Math.max(total, 30))
  const vb = layout === 'circle' ? '-1.08 -1.08 2.16 2.16' : '-1.06 -1.06 2.12 1.16'
  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={vb} className="mx-auto w-full max-w-xl" role="img" aria-label={`의석도 ${filled}/${total}석`} data-testid="seat-chart">
        {seats.map((s, i) => {
          const pid = assigned[i]
          const p = pid ? byId.get(pid) : null
          return (
            <circle key={i} cx={s.x} cy={s.y} r={Math.min(r, 0.05)} fill={p ? p.color : 'var(--surface-3)'} stroke="var(--surface)" strokeWidth={0.004}
              opacity={hover && pid !== hover ? 0.25 : 1} onMouseEnter={() => pid && setHover(pid)} onMouseLeave={() => setHover(null)}>
              <title>{p ? `${p.name} (${p.seats}석)` : '공석'}</title>
            </circle>
          )
        })}
        {layout === 'hemicycle' && (
          <>
            <text x={0} y={-0.08} textAnchor="middle" fontSize={0.16} fontWeight={700} fill="var(--fg)">{filled}</text>
            <text x={0} y={0.04} textAnchor="middle" fontSize={0.06} fill="var(--muted)">/ {total}석 · 과반 {maj}</text>
          </>
        )}
        {layout === 'circle' && <text x={0} y={0.04} textAnchor="middle" fontSize={0.12} fontWeight={700} fill="var(--fg)">{filled}/{total}</text>}
      </svg>
      <Legend parties={parties} total={total} hover={hover} />
    </div>
  )
}

function Legend({ parties, total, hover }: { parties: ChartParty[]; total: number; hover: string | null }) {
  return (
    <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
      {parties.map((p) => (
        <span key={p.partyId} className={`inline-flex items-center gap-1 text-[11.5px] ${hover && hover !== p.partyId ? 'opacity-40' : ''}`}>
          <span className="size-2.5 rounded-sm" style={{ background: p.color }} />{p.name} <b className="tabular-nums">{p.seats}</b>
          <span className="text-subtle">({((p.seats / total) * 100).toFixed(1)}%)</span>{p.government && <span className="text-[10px] text-accent">여</span>}
        </span>
      ))}
    </div>
  )
}
