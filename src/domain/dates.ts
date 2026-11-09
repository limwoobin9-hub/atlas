/**
 * Central world-date utilities. World dates are ISO calendar strings 'YYYY-MM-DD'
 * (proleptic Gregorian, years 0001-9999). Ranges are half-open: [from, to).
 * A null `from` means "since forever" and a null `to` means "open ended".
 */
export type ISODate = string

const RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseDate(s: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!s) return null
  const m = RE.exec(s)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (y < 1 || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null
  return { y, m: mo, d }
}

export function isValidDate(s: string | null | undefined): s is ISODate {
  return parseDate(s) !== null
}

export function daysInMonth(y: number, m: number): number {
  return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
}

export function isLeap(y: number) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

export function makeDate(y: number, m: number, d: number): ISODate {
  const yy = Math.min(9999, Math.max(1, Math.trunc(y)))
  const mm = Math.min(12, Math.max(1, Math.trunc(m)))
  const dd = Math.min(daysInMonth(yy, mm), Math.max(1, Math.trunc(d)))
  return `${String(yy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

export function addMonths(s: ISODate, n: number): ISODate {
  const p = parseDate(s)
  if (!p) return s
  const total = p.y * 12 + (p.m - 1) + n
  const y = Math.floor(total / 12)
  const m = (total % 12) + 1
  return makeDate(y, m, Math.min(p.d, daysInMonth(y, m)))
}

export function addYears(s: ISODate, n: number): ISODate {
  return addMonths(s, n * 12)
}

export function addDays(s: ISODate, n: number): ISODate {
  const p = parseDate(s)
  if (!p) return s
  const dt = new Date(Date.UTC(2000, p.m - 1, p.d))
  dt.setUTCFullYear(p.y)
  dt.setUTCDate(dt.getUTCDate() + n)
  return makeDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

/** Lexicographic compare is valid because years are zero padded to 4 digits. */
export function compareDates(a: ISODate | null | undefined, b: ISODate | null | undefined): number {
  if (a === b) return 0
  if (!a) return -1
  if (!b) return 1
  return a < b ? -1 : 1
}

export function minDate(a: ISODate | null, b: ISODate | null): ISODate | null {
  if (!a) return b
  if (!b) return a
  return a < b ? a : b
}

/** Is `date` inside the half-open range [from, to)? */
export function inRange(date: ISODate, from: ISODate | null | undefined, to: ISODate | null | undefined): boolean {
  return (!from || from <= date) && (!to || date < to)
}

/** Do two half-open ranges overlap? */
export function rangesOverlap(
  aFrom: ISODate | null | undefined, aTo: ISODate | null | undefined,
  bFrom: ISODate | null | undefined, bTo: ISODate | null | undefined,
): boolean {
  return (!aTo || !bFrom || bFrom < aTo) && (!bTo || !aFrom || aFrom < bTo)
}

export function formatDate(s: ISODate | null | undefined, style: 'long' | 'short' | 'year' = 'long'): string {
  const p = parseDate(s)
  if (!p) return '—'
  if (style === 'year') return `${p.y}년`
  if (style === 'short') return `${p.y}.${String(p.m).padStart(2, '0')}.${String(p.d).padStart(2, '0')}`
  return `${p.y}년 ${p.m}월 ${p.d}일`
}

export function formatRange(from: ISODate | null | undefined, to: ISODate | null | undefined): string {
  if (!from && !to) return '전 기간'
  return `${from ? formatDate(from, 'short') : '…'} ~ ${to ? formatDate(to, 'short') : '현재'}`
}

export function yearOf(s: ISODate | null | undefined): number | null {
  return parseDate(s)?.y ?? null
}

/** Parse loose user input like "1936", "1936-3", "1936.3.1", "1936년 3월 1일". */
export function parseLooseDate(input: string): ISODate | null {
  const nums = input.match(/\d+/g)
  if (!nums || nums.length === 0) return null
  const y = Number(nums[0])
  const m = nums[1] ? Number(nums[1]) : 1
  const d = nums[2] ? Number(nums[2]) : 1
  if (y < 1 || y > 9999 || m < 1 || m > 12) return null
  if (d < 1 || d > daysInMonth(y, m)) return null
  return makeDate(y, m, d)
}

/** Fractional year for charts/sliders. */
export function toYearFraction(s: ISODate): number {
  const p = parseDate(s)
  if (!p) return 0
  let doy = p.d
  for (let i = 1; i < p.m; i++) doy += daysInMonth(p.y, i)
  return p.y + (doy - 1) / (isLeap(p.y) ? 366 : 365)
}

export function fromYearFraction(v: number): ISODate {
  const y = Math.floor(v)
  const total = isLeap(y) ? 366 : 365
  let doy = Math.round((v - y) * total) + 1
  let m = 1
  while (m < 12 && doy > daysInMonth(y, m)) {
    doy -= daysInMonth(y, m)
    m++
  }
  return makeDate(y, m, Math.min(doy, daysInMonth(y, m)))
}
