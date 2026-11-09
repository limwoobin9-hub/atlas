import type { TemporalRow } from '@/domain/timeline'

export type Role = 'owner' | 'editor' | 'viewer'

export type EntityKind =
  | 'country' | 'region' | 'party' | 'faction' | 'government' | 'parliament' | 'election' | 'character'
  | 'unit' | 'ship' | 'equipment' | 'event' | 'war' | 'battle' | 'treaty' | 'organization'

export type EntityStatus = 'confirmed' | 'tentative' | 'idea' | 'undecided' | 'discarded'

export interface Project {
  id: string
  name: string
  description: string
  cover_path: string | null
  default_date: string
  default_map_id: string | null
  settings: ProjectSettings
  owner_id: string
  created_at: string
  updated_at: string
}

export interface ProjectSettings {
  milestones?: { date: string; label: string }[]
  mapLabels?: boolean
}

export interface ProjectListItem extends Project {
  role: Role
  is_favorite: boolean
  last_opened_at: string | null
}

export interface Branch {
  id: string
  project_id: string
  name: string
  description: string
  color: string
  parent_id: string | null
  fork_date: string | null
  is_main: boolean
  sort_order: number
  created_at: string
}

export interface Entity {
  id: string
  project_id: string
  kind: EntityKind
  name: string
  status: EntityStatus
  summary: string
  body: string
  color: string | null
  image_path: string | null
  tags: string[]
  starts_on: string | null
  ends_on: string | null
  origin_branch_id: string | null
  extra: Record<string, unknown>
  created_at: string
  updated_at: string
  updated_by: string | null
}

export interface Ideology {
  id: string
  project_id: string
  name: string
  description: string
  color: string
  sort_order: number
  parent_id: string | null
  family: string
}

export interface Temporal extends TemporalRow {
  project_id: string
  created_at?: string
  updated_at?: string
}

export interface CountryState extends Temporal {
  country_id: string
  name: string
  official_name: string
  flag_path: string | null
  emblem_path: string | null
  color: string | null
  capital_id: string | null
  seat_of_government_id: string | null
  government_form: string
  ideology_id: string | null
  head_of_state_id: string | null
  head_of_government_id: string | null
  population: number | null
  area_km2: number | null
  gdp: string
  note: string
}

export interface TerritoryControl extends Temporal {
  region_id: string
  controller_id: string | null
  sovereign_id: string | null
  administrator_id: string | null
  status: string
  note: string
  source_clause_id: string | null
}

export interface TerritoryClaim extends Temporal {
  region_id: string
  claimant_id: string
  claim_type: string
  note: string
}

export interface SeatAllocation extends Temporal {
  chamber_id: string
  party_id: string
  seats: number
  election_id: string | null
  note: string
}

export interface UnitState extends Temporal {
  unit_id: string
  parent_unit_id: string | null
  country_id: string | null
  commander_id: string | null
  name: string
  strength: number | null
  garrison: string
  training: number | null
  morale: number | null
  loyalty: number | null
  supply: number | null
  note: string
}

export interface DiplomaticRelation extends Temporal {
  a_id: string
  b_id: string
  relation_type: string
  is_public: boolean
  description: string
  treaty_id: string | null
  event_id: string | null
}

export interface WarParticipant extends Temporal {
  war_id: string
  side_id: string
  participant_id: string
  role: string
  note: string
}

export interface EntityRelation extends Temporal {
  from_id: string
  to_id: string
  relation_type: string
  note: string
}

export interface Position extends Temporal {
  character_id: string
  organization_id: string | null
  title: string
  position_kind: string
  rank: string
  note: string
}

export interface Marker extends Temporal {
  map_id: string
  marker_type: string
  x: number
  y: number
  label: string
  entity_id: string | null
  color: string | null
  min_zoom: number
}

export interface MapFeature extends Temporal {
  map_id: string
  feature_type: 'front_line' | 'route' | 'railway' | 'arrow' | 'annotation' | 'area'
  geometry: { type: 'LineString' | 'Polygon' | 'Point'; coordinates: unknown }
  label: string
  style: { color?: string; width?: number; dash?: boolean; fontSize?: number }
  entity_id: string | null
}

export interface AtlasMap {
  id: string
  project_id: string
  name: string
  description: string
  map_kind: 'geojson' | 'svg' | 'raster'
  asset_id: string | null
  width: number | null
  height: number | null
  projection: 'equirectangular' | 'mercator' | 'naturalEarth' | 'equalEarth' | 'orthographic'
  feature_id_property: string
  feature_name_property: string
  source: string
  license: string
  attribution: string
  view: Record<string, unknown>
  sort_order: number
}

export interface MapRegion {
  id: string
  project_id: string
  map_id: string
  feature_key: string
  feature_name: string
  region_id: string | null
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown } | null
}

export interface Asset {
  id: string
  project_id: string
  storage_path: string
  file_name: string
  title: string
  description: string
  mime_type: string
  size_bytes: number
  category: string
  folder: string
  tags: string[]
  width: number | null
  height: number | null
  source: string
  license: string
  created_at: string
}

export interface Chamber {
  id: string
  project_id: string
  parliament_id: string
  name: string
  chamber_type: 'single' | 'lower' | 'upper'
  total_seats: number
  majority_seats: number | null
  layout: 'hemicycle' | 'circle' | 'bar'
  party_order: string[]
  sort_order: number
}

export interface WarSide {
  id: string
  project_id: string
  war_id: string
  name: string
  color: string
  sort_order: number
}

export interface TreatyClause {
  id: string
  project_id: string
  treaty_id: string
  ordinal: number
  title: string
  body: string
  effect_type: 'none' | 'territory_transfer' | 'relation_change' | 'war_end'
  effect: Record<string, unknown>
  applied_branch_id: string | null
  applied_at: string | null
}

export interface ChangeLog {
  id: number
  project_id: string
  table_name: string
  row_id: string | null
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  changed_fields: string[]
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  changed_by: string | null
  changed_at: string
  reverted_at: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRow = Record<string, any>
