/** Order-of-battle (military hierarchy) resolution at a date. Pure. */
import { rowAt } from './timeline'

export interface UnitLike { id: string; name: string; starts_on: string | null; ends_on: string | null }
export interface UnitStateLike {
  unit_id: string; parent_unit_id: string | null; country_id: string | null; commander_id: string | null; name: string
  valid_from: string | null; valid_to: string | null
}

export interface OobNode<U extends UnitLike = UnitLike, S extends UnitStateLike = UnitStateLike> {
  unit: U
  state: S | undefined
  countryId: string | null
  children: OobNode<U, S>[]
  depth: number
}

export function buildOob<U extends UnitLike, S extends UnitStateLike>(units: U[], states: S[], date: string, sortKey?: (u: U) => number): OobNode<U, S>[] {
  const alive = units.filter((u) => (!u.starts_on || u.starts_on <= date) && (!u.ends_on || date < u.ends_on))
  const byUnit = new Map<string, S[]>()
  for (const s of states) {
    if (!byUnit.has(s.unit_id)) byUnit.set(s.unit_id, [])
    byUnit.get(s.unit_id)!.push(s)
  }
  const nodes = new Map<string, OobNode<U, S>>()
  for (const u of alive) {
    const state = rowAt(byUnit.get(u.id) ?? [], date)
    nodes.set(u.id, { unit: u, state, countryId: state?.country_id ?? null, children: [], depth: 0 })
  }
  const roots: OobNode<U, S>[] = []
  for (const n of nodes.values()) {
    const pid = n.state?.parent_unit_id
    const parent = pid ? nodes.get(pid) : undefined
    // guard against cycles in bad data: attach to root if ancestor chain loops
    if (parent && !isAncestor(nodes, n.unit.id, pid!)) parent.children.push(n)
    else roots.push(n)
  }
  const sort = (list: OobNode<U, S>[]) => list.sort((a, b) => (sortKey ? sortKey(a.unit) - sortKey(b.unit) : 0) || a.unit.name.localeCompare(b.unit.name))
  const walk = (list: OobNode<U, S>[], depth: number, inheritedCountry: string | null) => {
    sort(list)
    for (const n of list) {
      n.depth = depth
      if (!n.countryId) n.countryId = inheritedCountry
      walk(n.children, depth + 1, n.countryId)
    }
  }
  walk(roots, 0, null)
  return roots
}

function isAncestor<U extends UnitLike, S extends UnitStateLike>(nodes: Map<string, OobNode<U, S>>, unitId: string, startParent: string): boolean {
  let cur: string | null | undefined = startParent
  const seen = new Set<string>()
  while (cur && !seen.has(cur)) {
    if (cur === unitId) return true
    seen.add(cur)
    cur = nodes.get(cur)?.state?.parent_unit_id
  }
  return false
}

/** Would making `newParent` the parent of `unitId` create a cycle (given current parents)? */
export function wouldCycle(parentOf: Map<string, string | null>, unitId: string, newParent: string | null): boolean {
  let cur = newParent
  const seen = new Set<string>()
  while (cur && !seen.has(cur)) {
    if (cur === unitId) return true
    seen.add(cur)
    cur = parentOf.get(cur) ?? null
  }
  return false
}

export function flattenOob<N extends { children: N[] }>(roots: N[]): N[] {
  const out: N[] = []
  const rec = (l: N[]) => { for (const n of l) { out.push(n); rec(n.children) } }
  rec(roots)
  return out
}

export function filterOob<N extends OobNode>(roots: N[], pred: (n: N) => boolean): N[] {
  const rec = (list: N[]): N[] => list.flatMap((n) => {
    const kids = rec(n.children as N[])
    return pred(n) || kids.length ? [{ ...n, children: kids }] : []
  })
  return rec(roots)
}
