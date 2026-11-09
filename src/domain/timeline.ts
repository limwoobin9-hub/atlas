/**
 * World-line (branch) resolution and temporal state planning.
 *
 * Copy-on-write model
 *  - Every temporal fact row belongs to exactly one branch.
 *  - A branch sees its own rows plus rows of each ancestor whose valid_from is before the
 *    point where the branch's line diverged from that ancestor (the "cutoff").
 *    A NULL fork date on a branch means it is a full clone: no cutoff.
 *  - Editing an inherited row creates an override row in the branch (overrides_id -> original).
 *  - Deleting an inherited row creates a tombstone override.
 *  - Overridden rows and tombstones are hidden from resolution.
 *
 * All functions here are pure so they are unit tested and shared by every screen.
 */
import { compareDates, inRange, minDate, type ISODate } from './dates'

export interface BranchLike {
  id: string
  parent_id: string | null
  fork_date: string | null
  is_main: boolean
  name?: string
}

export interface ChainLink {
  branchId: string
  /** rows of this branch are visible only if valid_from < cutoff (null = no limit) */
  cutoff: ISODate | null
  depth: number
}

export interface TemporalRow {
  id: string
  branch_id: string
  valid_from: string | null
  valid_to: string | null
  overrides_id: string | null
  is_tombstone: boolean
}

export function branchChain(branches: BranchLike[], branchId: string | null | undefined): ChainLink[] {
  if (!branchId) return []
  const byId = new Map(branches.map((b) => [b.id, b]))
  const chain: ChainLink[] = []
  let current = byId.get(branchId)
  let cutoff: ISODate | null = null
  let depth = 0
  const seen = new Set<string>()
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    chain.push({ branchId: current.id, cutoff, depth })
    if (!current.parent_id) break
    // rows of the parent are visible only if they started before this branch's fork date
    cutoff = current.fork_date ? minDate(cutoff, current.fork_date) : cutoff
    current = byId.get(current.parent_id)
    depth++
  }
  return chain
}

export function chainIds(chain: ChainLink[]): string[] {
  return chain.map((c) => c.branchId)
}

/** Resolve which rows are visible in the branch described by `chain`. */
export function visibleRows<T extends TemporalRow>(rows: T[], chain: ChainLink[]): T[] {
  const link = new Map(chain.map((c) => [c.branchId, c]))
  const candidates: T[] = []
  for (const r of rows) {
    const l = link.get(r.branch_id)
    if (!l) continue
    if (l.depth > 0 && l.cutoff && r.valid_from && !(r.valid_from < l.cutoff)) continue
    candidates.push(r)
  }
  const overridden = new Set<string>()
  for (const r of candidates) if (r.overrides_id) overridden.add(r.overrides_id)
  return candidates.filter((r) => !r.is_tombstone && !overridden.has(r.id))
}

/** Rows valid on `date` (half-open ranges). */
export function rowsAt<T extends { valid_from: string | null; valid_to: string | null }>(rows: T[], date: ISODate): T[] {
  return rows.filter((r) => inRange(date, r.valid_from, r.valid_to))
}

/** The row for a key valid at a date, latest valid_from wins if overlapping. */
export function rowAt<T extends { valid_from: string | null; valid_to: string | null }>(rows: T[], date: ISODate): T | undefined {
  let best: T | undefined
  for (const r of rows) {
    if (!inRange(date, r.valid_from, r.valid_to)) continue
    if (!best || compareDates(r.valid_from, best.valid_from) > 0) best = r
  }
  return best
}

export interface EntityVisibility {
  id: string
  origin_branch_id: string | null
  starts_on: string | null
}

/** Is an entity part of the world line? (does not consider dates of existence) */
export function entityInBranch(e: EntityVisibility, chain: ChainLink[], hidden: Set<string>): boolean {
  if (hidden.has(e.id)) return false
  if (!e.origin_branch_id) return true
  const l = chain.find((c) => c.branchId === e.origin_branch_id)
  if (!l) return false
  if (l.depth === 0 || !l.cutoff) return true
  return !e.starts_on || e.starts_on < l.cutoff
}

/** Hidden entity ids that apply to this chain (hides made in an ancestor are inherited). */
export function hiddenSet(hides: { branch_id: string; entity_id: string }[], chain: ChainLink[]): Set<string> {
  const ids = new Set(chain.map((c) => c.branchId))
  return new Set(hides.filter((h) => ids.has(h.branch_id)).map((h) => h.entity_id))
}

/** Is an entity alive/active on the date according to starts_on / ends_on? */
export function entityActiveAt(e: { starts_on: string | null; ends_on: string | null }, date: ISODate): boolean {
  return inRange(date, e.starts_on, e.ends_on)
}

// ------------------------------------------------------------------ planning operations

export type PlannedOp<T extends TemporalRow> =
  | { kind: 'insert'; values: Partial<T> }
  | { kind: 'update'; row: T; patch: Partial<T> }
  | { kind: 'delete'; row: T }

/**
 * Plan "from `date` on, the value for this key becomes `values`" over the visible rows of one key.
 * Earlier history is preserved (the current row is closed at `date`) and later rows are never touched:
 * the new row runs until the next existing change.
 */
export function planSetFrom<T extends TemporalRow>(keyRows: T[], date: ISODate, values: Partial<T>): PlannedOp<T>[] {
  const current = rowAt(keyRows, date)
  const next = keyRows
    .filter((r) => r !== current && r.valid_from && r.valid_from > date)
    .sort((a, b) => compareDates(a.valid_from, b.valid_from))[0]
  const ops: PlannedOp<T>[] = []
  if (current && current.valid_from === date) {
    ops.push({ kind: 'update', row: current, patch: values })
    return ops
  }
  let end: string | null = next?.valid_from ?? null
  if (current) {
    end = minDate(current.valid_to, end)
    ops.push({ kind: 'update', row: current, patch: { valid_to: date } as Partial<T> })
  }
  ops.push({ kind: 'insert', values: { ...values, valid_from: date, valid_to: end } as Partial<T> })
  return ops
}

/** Plan "from `date` on, this key has no value" (e.g. unassign a region). */
export function planClearFrom<T extends TemporalRow>(keyRows: T[], date: ISODate): PlannedOp<T>[] {
  const current = rowAt(keyRows, date)
  if (!current) return []
  if (current.valid_from === date) return [{ kind: 'delete', row: current }]
  return [{ kind: 'update', row: current, patch: { valid_to: date } as Partial<T> }]
}

export type DbOp =
  | { kind: 'insert'; values: Record<string, unknown> }
  | { kind: 'update'; id: string; patch: Record<string, unknown> }
  | { kind: 'delete'; id: string }

const SYSTEM_FIELDS = ['id', 'created_at', 'updated_at', 'created_by', 'updated_by']

function copyForOverride<T extends TemporalRow>(row: T, branchId: string, newId: string): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...(row as unknown as Record<string, unknown>) }
  for (const f of SYSTEM_FIELDS) delete copy[f]
  copy.id = newId
  copy.branch_id = branchId
  copy.overrides_id = row.id
  return copy
}

/**
 * Turn planned operations into concrete DB operations for `branchId`, applying copy-on-write:
 *  - rows owned by the branch are updated/deleted directly
 *  - inherited rows get an override row (update) or a tombstone (delete)
 *  - deleting an own row that overrides an ancestor row turns it into a tombstone,
 *    otherwise the ancestor row would reappear.
 */
export function materialize<T extends TemporalRow>(
  ops: PlannedOp<T>[], branchId: string, newId: () => string, base: Record<string, unknown> = {},
): DbOp[] {
  const out: DbOp[] = []
  for (const op of ops) {
    if (op.kind === 'insert') {
      out.push({
        kind: 'insert',
        values: { ...base, ...op.values, id: newId(), branch_id: branchId, overrides_id: null, is_tombstone: false },
      })
    } else if (op.kind === 'update') {
      if (op.row.branch_id === branchId) out.push({ kind: 'update', id: op.row.id, patch: op.patch as Record<string, unknown> })
      else out.push({ kind: 'insert', values: { ...copyForOverride(op.row, branchId, newId()), ...op.patch } })
    } else {
      if (op.row.branch_id === branchId) {
        if (op.row.overrides_id) out.push({ kind: 'update', id: op.row.id, patch: { is_tombstone: true } })
        else out.push({ kind: 'delete', id: op.row.id })
      } else {
        out.push({ kind: 'insert', values: { ...copyForOverride(op.row, branchId, newId()), is_tombstone: true } })
      }
    }
  }
  return out
}

/** Detect overlapping ranges within the rows of one key (used by the conflict checker). */
export function findOverlaps<T extends { id: string; valid_from: string | null; valid_to: string | null }>(rows: T[]): [T, T][] {
  const sorted = [...rows].sort((a, b) => compareDates(a.valid_from, b.valid_from))
  const out: [T, T][] = []
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]
      const b = sorted[j]
      if ((!a.valid_to || !b.valid_from || b.valid_from < a.valid_to) && (!b.valid_to || !a.valid_from || a.valid_from < b.valid_to)) {
        out.push([a, b])
      }
    }
  }
  return out
}

/** All distinct change dates in a set of temporal rows (for "previous/next change" navigation). */
export function changeDates(rows: { valid_from: string | null; valid_to: string | null }[]): ISODate[] {
  const s = new Set<string>()
  for (const r of rows) {
    if (r.valid_from) s.add(r.valid_from)
    if (r.valid_to) s.add(r.valid_to)
  }
  return [...s].sort()
}
