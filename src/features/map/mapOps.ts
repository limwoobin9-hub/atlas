/** Map editing operations. Every world-state change goes through the copy-on-write planner and is recorded for undo. */
import { applyPlan, insertRows, runDbOps, type RecordedMutation } from '@/data/db'
import type { MapRegion, TerritoryClaim, TerritoryControl } from '@/data/types'
import { planClearFrom, planSetFrom, rowAt } from '@/domain/timeline'
import { uuid } from '@/lib/utils'

export interface Ctx { projectId: string; branchId: string; originBranchId: string | null; date: string }

/** Make sure each feature key has a map_region linked to a region entity; creates missing ones in bulk. */
export async function ensureRegions(ctx: Ctx, mapId: string, items: { key: string; name: string }[], existing: MapRegion[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const byKey = new Map(existing.map((r) => [r.feature_key, r]))
  const entities: Record<string, unknown>[] = []
  const regions: Record<string, unknown>[] = []
  const linkNew: Record<string, unknown>[] = []
  const linkUpdate: { id: string; region_id: string }[] = []
  for (const it of items) {
    const mr = byKey.get(it.key)
    if (mr?.region_id) { out.set(it.key, mr.region_id); continue }
    const id = uuid()
    entities.push({ id, project_id: ctx.projectId, kind: 'region', name: (it.name || it.key).slice(0, 200), status: 'tentative', origin_branch_id: ctx.originBranchId, tags: ['지도'] })
    regions.push({ id, project_id: ctx.projectId, region_type: 'territory' })
    if (mr) linkUpdate.push({ id: mr.id, region_id: id })
    else linkNew.push({ project_id: ctx.projectId, map_id: mapId, feature_key: it.key, feature_name: it.name, region_id: id })
    out.set(it.key, id)
  }
  if (entities.length) {
    await insertRows('atlas_entities', entities)
    await insertRows('atlas_regions', regions)
    await insertRows('atlas_map_regions', linkNew)
    for (const u of linkUpdate) await runDbOps('atlas_map_regions', [{ kind: 'update', id: u.id, patch: { region_id: u.region_id } }])
  }
  return out
}

export async function setControl(ctx: Ctx, regionIds: string[], control: TerritoryControl[], values: { controller_id: string | null; sovereign_id?: string | null; status?: string }): Promise<RecordedMutation[]> {
  const rec: RecordedMutation[] = []
  for (const regionId of regionIds) {
    const keyRows = control.filter((r) => r.region_id === regionId)
    const cur = rowAt(keyRows, ctx.date)
    if (cur && cur.controller_id === values.controller_id && (values.sovereign_id === undefined || cur.sovereign_id === values.sovereign_id) && (!values.status || cur.status === values.status)) continue
    const plan = values.controller_id === null && values.sovereign_id == null
      ? planClearFrom(keyRows, ctx.date)
      : planSetFrom(keyRows, ctx.date, {
        region_id: regionId, controller_id: values.controller_id,
        sovereign_id: values.sovereign_id === undefined ? (cur?.sovereign_id && cur.sovereign_id !== cur.controller_id ? cur.sovereign_id : values.controller_id) : values.sovereign_id,
        administrator_id: values.controller_id, status: values.status ?? 'integrated', note: '', source_clause_id: null,
      } as Partial<TerritoryControl>)
    rec.push(...await applyPlan('atlas_territory_control', plan, ctx.branchId, { project_id: ctx.projectId }))
  }
  return rec
}

export async function toggleClaim(ctx: Ctx, regionId: string, claimantId: string, claims: TerritoryClaim[], claimType = 'claim'): Promise<RecordedMutation[]> {
  const keyRows = claims.filter((r) => r.region_id === regionId && r.claimant_id === claimantId)
  const cur = rowAt(keyRows, ctx.date)
  const plan = cur ? planClearFrom(keyRows, ctx.date) : planSetFrom(keyRows, ctx.date, { region_id: regionId, claimant_id: claimantId, claim_type: claimType, note: '' } as Partial<TerritoryClaim>)
  return applyPlan('atlas_territory_claims', plan, ctx.branchId, { project_id: ctx.projectId })
}
