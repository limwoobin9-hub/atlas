/**
 * Backup format + pure transformations used by export / import / duplicate.
 * Import never overwrites: every UUID gets a fresh value and every reference is rewritten.
 */
export const BACKUP_FORMAT = 'atlas-backup'
export const BACKUP_VERSION = 1

/** Insert order: referenced tables first. */
export const BACKUP_TABLES = [
  'atlas_branches', 'atlas_assets', 'atlas_ideologies', 'atlas_entities', 'atlas_entity_branch_hidden',
  'atlas_countries', 'atlas_regions', 'atlas_characters', 'atlas_parties', 'atlas_factions', 'atlas_governments',
  'atlas_government_parties', 'atlas_parliaments', 'atlas_chambers', 'atlas_elections', 'atlas_election_results',
  'atlas_units', 'atlas_ships', 'atlas_equipment', 'atlas_events', 'atlas_wars', 'atlas_war_sides', 'atlas_battles',
  'atlas_treaties', 'atlas_treaty_participants', 'atlas_treaty_clauses', 'atlas_maps', 'atlas_map_regions',
  'atlas_asset_links', 'atlas_entity_relations', 'atlas_country_states', 'atlas_territory_control',
  'atlas_territory_claims', 'atlas_positions', 'atlas_affiliations', 'atlas_seat_allocations',
  'atlas_party_polling', 'atlas_unit_states', 'atlas_ship_assignments', 'atlas_equipment_holdings',
  'atlas_war_participants', 'atlas_diplomatic_relations', 'atlas_markers', 'atlas_map_features',
  'atlas_conflict_exceptions',
] as const

export type Row = Record<string, unknown>

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: number
  exported_at: string
  app: string
  project: Row
  tables: Record<string, Row[]>
  /** storage files included in a ZIP backup: storage_path -> zip entry name */
  files?: Record<string, string>
}

export interface ValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  counts: Record<string, number>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validateBackup(data: unknown): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const counts: Record<string, number> = {}
  const d = data as Partial<BackupFile> | null
  if (!d || typeof d !== 'object') return { ok: false, errors: ['JSON 객체가 아닙니다.'], warnings, counts }
  if (d.format !== BACKUP_FORMAT) errors.push('ATLAS 백업 파일이 아닙니다 (format 불일치).')
  if (typeof d.version !== 'number') errors.push('백업 버전 정보가 없습니다.')
  else if (d.version > BACKUP_VERSION) errors.push(`이 백업(v${d.version})은 현재 앱(v${BACKUP_VERSION})보다 새 버전입니다. 앱을 업데이트하세요.`)
  if (!d.project || typeof d.project !== 'object' || !UUID_RE.test(String((d.project as Row).id))) errors.push('프로젝트 정보가 올바르지 않습니다.')
  if (!d.tables || typeof d.tables !== 'object') errors.push('테이블 데이터가 없습니다.')
  if (errors.length) return { ok: false, errors, warnings, counts }

  const pid = String(d.project!.id)
  for (const [table, rows] of Object.entries(d.tables!)) {
    if (!(BACKUP_TABLES as readonly string[]).includes(table)) {
      warnings.push(`알 수 없는 테이블 ${table} 은(는) 무시됩니다.`)
      continue
    }
    if (!Array.isArray(rows)) { errors.push(`${table} 데이터가 배열이 아닙니다.`); continue }
    counts[table] = rows.length
    // subtype tables share ids with atlas_entities by design, so uniqueness is per table
    const ids = new Set<string>()
    for (const r of rows) {
      if (r.project_id !== pid) { errors.push(`${table}에 다른 프로젝트의 행이 섞여 있습니다.`); break }
      if (typeof r.id === 'string') {
        if (ids.has(r.id)) { errors.push(`중복된 ID ${r.id} (${table})`); break }
        ids.add(r.id)
      }
    }
  }
  const branches = (d.tables!.atlas_branches ?? []) as Row[]
  if (!branches.some((b) => b.is_main)) errors.push('기본 세계선이 없습니다.')
  if (d.files) {
    const assetPaths = new Set(((d.tables!.atlas_assets ?? []) as Row[]).map((a) => String(a.storage_path)))
    for (const p of Object.keys(d.files)) if (!assetPaths.has(p)) warnings.push(`자료 목록에 없는 파일 ${p}`)
  }
  return { ok: errors.length === 0, errors, warnings, counts }
}

/** Build an old->new id map for every row id plus the project id. */
export function buildIdMap(backup: BackupFile, newProjectId: string, newMainBranchId: string, newId: () => string): Map<string, string> {
  const map = new Map<string, string>()
  map.set(String(backup.project.id), newProjectId)
  for (const rows of Object.values(backup.tables)) {
    for (const r of rows) {
      if (typeof r.id !== 'string' || map.has(r.id)) continue
      map.set(r.id, r.is_main === true && 'fork_date' in r ? newMainBranchId : newId())
    }
  }
  return map
}

/** Deeply rewrite every UUID string found in the id map and every storage path of the old project. */
export function remapValue(v: unknown, map: Map<string, string>, oldPid: string, newPid: string): unknown {
  if (typeof v === 'string') {
    const hit = map.get(v)
    if (hit) return hit
    if (v.startsWith(oldPid + '/')) return newPid + v.slice(oldPid.length)
    return v
  }
  if (Array.isArray(v)) return v.map((x) => remapValue(x, map, oldPid, newPid))
  if (v && typeof v === 'object') {
    const out: Row = {}
    for (const [k, x] of Object.entries(v as Row)) out[k] = remapValue(x, map, oldPid, newPid)
    return out
  }
  return v
}

const SELF_REF: Record<string, string[]> = {
  atlas_branches: ['parent_id'],
  atlas_ideologies: ['parent_id'],
}

/** Order rows so that a row referencing another row of the same table comes after it. */
export function topoSort(table: string, rows: Row[]): Row[] {
  const fields = [...(SELF_REF[table] ?? []), 'overrides_id']
  const byId = new Map(rows.map((r) => [r.id as string, r]))
  const out: Row[] = []
  const state = new Map<string, 1 | 2>()
  const visit = (r: Row) => {
    const id = r.id as string | undefined
    if (id) {
      if (state.get(id) === 2) return
      if (state.get(id) === 1) return // cycle: leave order as is (DB will report)
      state.set(id, 1)
    }
    for (const f of fields) {
      const ref = r[f]
      if (typeof ref === 'string' && byId.has(ref) && ref !== id) visit(byId.get(ref)!)
    }
    if (id) state.set(id, 2)
    out.push(r)
  }
  for (const r of rows) visit(r)
  return out
}

/** Produce the table payload for a new project. The old main branch is merged into the new one. */
export function prepareImport(backup: BackupFile, newProjectId: string, newMainBranchId: string, newId: () => string) {
  const map = buildIdMap(backup, newProjectId, newMainBranchId, newId)
  const oldPid = String(backup.project.id)
  const tables: Record<string, Row[]> = {}
  let mainBranch: Row | null = null
  for (const t of BACKUP_TABLES) {
    const rows = (backup.tables[t] ?? []) as Row[]
    let mapped = rows.map((r) => remapValue(r, map, oldPid, newProjectId) as Row)
    if (t === 'atlas_branches') {
      mainBranch = mapped.find((b) => b.is_main) ?? null
      mapped = mapped.filter((b) => !b.is_main)
    }
    tables[t] = topoSort(t, mapped)
  }
  const project = remapValue(backup.project, map, oldPid, newProjectId) as Row
  return { tables, project, mainBranch, idMap: map }
}
