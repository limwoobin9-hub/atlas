/** Seat chart geometry and parliament arithmetic. Pure functions. */

export interface Seat { x: number; y: number; angle: number; row: number }
export interface PartySeats { partyId: string; seats: number }

/**
 * Hemicycle seat positions: rows of concentric arcs, seats per row proportional to arc length.
 * Returned in left-to-right order (by angle), so seats can be assigned to parties in order.
 * Coordinates: centre (0,0), outer radius 1, y grows downward negative (upper half: y <= 0).
 */
export function hemicycleSeats(total: number, opts: { innerRatio?: number } = {}): Seat[] {
  if (total <= 0) return []
  const inner = opts.innerRatio ?? 0.38
  // choose number of rows so seat spacing ~ row spacing
  let rows = 1
  for (let r = 1; r < 60; r++) {
    const spacing = (1 - inner) / r
    let capacity = 0
    for (let i = 0; i < r; i++) {
      const radius = inner + spacing * (i + 0.5)
      capacity += Math.floor((Math.PI * radius) / spacing)
    }
    rows = r
    if (capacity >= total) break
  }
  const spacing = (1 - inner) / rows
  const radii = Array.from({ length: rows }, (_, i) => inner + spacing * (i + 0.5))
  const sumR = radii.reduce((a, b) => a + b, 0)
  const counts = radii.map((r) => Math.floor((total * r) / sumR))
  let rest = total - counts.reduce((a, b) => a + b, 0)
  for (let i = rows - 1; rest > 0; i = (i - 1 + rows) % rows) { counts[i]++; rest-- }
  const seats: Seat[] = []
  radii.forEach((r, row) => {
    const n = counts[row]
    for (let j = 0; j < n; j++) {
      const angle = n === 1 ? Math.PI / 2 : Math.PI - (Math.PI * j) / (n - 1)
      seats.push({ x: r * Math.cos(angle), y: -r * Math.sin(angle), angle, row })
    }
  })
  return seats.sort((a, b) => b.angle - a.angle || a.row - b.row)
}

/** Full-circle seat layout (e.g. round-table chambers). */
export function circleSeats(total: number): Seat[] {
  if (total <= 0) return []
  const inner = 0.3
  let rows = 1
  for (let r = 1; r < 60; r++) {
    const spacing = (1 - inner) / r
    let cap = 0
    for (let i = 0; i < r; i++) cap += Math.floor((2 * Math.PI * (inner + spacing * (i + 0.5))) / spacing)
    rows = r
    if (cap >= total) break
  }
  const spacing = (1 - inner) / rows
  const radii = Array.from({ length: rows }, (_, i) => inner + spacing * (i + 0.5))
  const sumR = radii.reduce((a, b) => a + b, 0)
  const counts = radii.map((r) => Math.floor((total * r) / sumR))
  let rest = total - counts.reduce((a, b) => a + b, 0)
  for (let i = rows - 1; rest > 0; i = (i - 1 + rows) % rows) { counts[i]++; rest-- }
  const seats: Seat[] = []
  radii.forEach((r, row) => {
    const n = counts[row]
    for (let j = 0; j < n; j++) {
      const angle = Math.PI / 2 + (2 * Math.PI * j) / n
      seats.push({ x: r * Math.cos(angle), y: -r * Math.sin(angle), angle: ((angle - Math.PI / 2) / (2 * Math.PI)) % 1, row })
    }
  })
  return seats.sort((a, b) => a.angle - b.angle || a.row - b.row)
}

/** Assign party ids to ordered seats; leftover seats are null (vacant). */
export function assignSeats(seats: Seat[], parties: PartySeats[]): (string | null)[] {
  const out: (string | null)[] = new Array(seats.length).fill(null)
  let i = 0
  for (const p of parties) {
    for (let k = 0; k < p.seats && i < seats.length; k++) out[i++] = p.partyId
  }
  return out
}

/** Order parties by a saved order, unknown parties appended by size. */
export function orderParties<T extends PartySeats>(parties: T[], order: string[]): T[] {
  const idx = new Map(order.map((id, i) => [id, i]))
  return [...parties].sort((a, b) => {
    const ia = idx.get(a.partyId)
    const ib = idx.get(b.partyId)
    if (ia !== undefined && ib !== undefined) return ia - ib
    if (ia !== undefined) return -1
    if (ib !== undefined) return 1
    return b.seats - a.seats
  })
}

export function majorityThreshold(total: number, override?: number | null): number {
  return override && override > 0 ? override : Math.floor(total / 2) + 1
}

export interface ElectionResultLite { partyId: string; seats: number | null; share: number | null }

export interface ElectionComparison {
  partyId: string
  seats: number | null
  prevSeats: number | null
  seatDelta: number | null
  share: number | null
  prevShare: number | null
  shareDelta: number | null
}

export function compareElections(current: ElectionResultLite[], previous: ElectionResultLite[] | null) {
  const prev = new Map((previous ?? []).map((r) => [r.partyId, r]))
  const rows: ElectionComparison[] = current.map((r) => {
    const p = prev.get(r.partyId)
    return {
      partyId: r.partyId, seats: r.seats, prevSeats: p?.seats ?? (previous ? 0 : null),
      seatDelta: r.seats !== null && previous ? r.seats - (p?.seats ?? 0) : null,
      share: r.share, prevShare: p?.share ?? null,
      shareDelta: r.share !== null && p?.share !== null && p?.share !== undefined ? +(r.share - p.share).toFixed(2) : null,
    }
  })
  const first = (list: ElectionResultLite[]) => [...list].sort((a, b) => (b.seats ?? 0) - (a.seats ?? 0) || (b.share ?? 0) - (a.share ?? 0))[0]?.partyId ?? null
  const firstNow = first(current)
  const firstPrev = previous ? first(previous) : null
  return { rows, firstParty: firstNow, firstPartyChanged: previous ? firstNow !== firstPrev : false, previousFirstParty: firstPrev }
}
