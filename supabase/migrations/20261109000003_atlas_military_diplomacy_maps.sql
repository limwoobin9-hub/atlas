-- ATLAS military, diplomacy, wars, treaties, events and maps

-- ---------------------------------------------------------------- military units (armies, corps, fleets, wings...)
create table public.atlas_units (
  id uuid primary key,
  project_id uuid not null,
  service_branch text not null default 'army' check (service_branch in ('army','navy','air_force','marines','paramilitary','other')),
  unit_type text not null default '' check (char_length(unit_type) <= 60),  -- free: army group, corps, division, fleet...
  echelon integer not null default 0,  -- used for icons/sorting only
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate
);
create index atlas_units_project_idx on public.atlas_units(project_id, service_branch);

-- time-varying unit state: parent (order of battle), owner country, commander, readiness
create table public.atlas_unit_states (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.atlas_projects(id) on delete cascade,
  branch_id uuid not null,
  unit_id uuid not null,
  parent_unit_id uuid,
  country_id uuid,
  commander_id uuid,
  name text not null default '',   -- name override during this period (renaming)
  strength integer check (strength is null or strength >= 0),
  garrison text not null default '',
  training integer check (training is null or training between 0 and 100),
  morale integer check (morale is null or morale between 0 and 100),
  loyalty integer check (loyalty is null or loyalty between 0 and 100),
  supply integer check (supply is null or supply between 0 and 100),
  note text not null default '',
  valid_from date,
  valid_to date,
  overrides_id uuid references public.atlas_unit_states(id) on delete set null deferrable initially immediate,
  is_tombstone boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, branch_id) references public.atlas_branches(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, unit_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, parent_unit_id) references public.atlas_entities(project_id, id) on delete set null (parent_unit_id) deferrable initially immediate,
  foreign key (project_id, country_id) references public.atlas_entities(project_id, id) on delete set null (country_id) deferrable initially immediate,
  foreign key (project_id, commander_id) references public.atlas_entities(project_id, id) on delete set null (commander_id) deferrable initially immediate,
  check (parent_unit_id is null or parent_unit_id <> unit_id),
  check (valid_to is null or valid_from is null or valid_to > valid_from)
);
create index atlas_unit_states_unit_idx on public.atlas_unit_states(project_id, unit_id, valid_from);
create index atlas_unit_states_parent_idx on public.atlas_unit_states(project_id, parent_unit_id);
create index atlas_unit_states_country_idx on public.atlas_unit_states(project_id, country_id);
create index atlas_unit_states_commander_idx on public.atlas_unit_states(project_id, commander_id);
create index atlas_unit_states_branch_idx on public.atlas_unit_states(project_id, branch_id);
create index atlas_unit_states_overrides_idx on public.atlas_unit_states(overrides_id);

-- prevent cycles in the order of battle for overlapping periods (conservative across branches)
create or replace function atlas_private.check_unit_cycle()
returns trigger language plpgsql set search_path = '' as $$
declare cycle_found boolean;
begin
  if new.parent_unit_id is null or new.is_tombstone then return new; end if;
  with recursive up(uid, depth) as (
    select new.parent_unit_id, 1
    union
    select s.parent_unit_id, up.depth + 1
    from up join public.atlas_unit_states s on s.unit_id = up.uid
    where s.project_id = new.project_id and s.parent_unit_id is not null and not s.is_tombstone
      and s.id <> new.id
      and (s.valid_to is null or new.valid_from is null or s.valid_to > new.valid_from)
      and (new.valid_to is null or s.valid_from is null or s.valid_from < new.valid_to)
      and up.depth < 64
  )
  select exists (select 1 from up where uid = new.unit_id) into cycle_found;
  if cycle_found then
    raise exception 'order of battle cycle: unit % cannot be under its own subordinate', new.unit_id
      using errcode = '23514';
  end if;
  return new;
end $$;
create trigger atlas_unit_states_cycle before insert or update on public.atlas_unit_states
  for each row execute function atlas_private.check_unit_cycle();

create table public.atlas_ships (
  id uuid primary key,
  project_id uuid not null,
  country_id uuid,
  ship_class text not null default '',
  ship_type text not null default '' check (char_length(ship_type) <= 60),
  builder text not null default '',
  laid_down_on date,
  launched_on date,
  commissioned_on date,
  decommissioned_on date,
  displacement_t numeric check (displacement_t is null or displacement_t >= 0),
  speed_kn numeric check (speed_kn is null or speed_kn >= 0),
  armament text not null default '',
  armor text not null default '',
  crew integer check (crew is null or crew >= 0),
  ship_status text not null default 'active' check (ship_status in ('planned','building','active','reserve','refit','damaged','sunk','scrapped','captured','decommissioned','other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, country_id) references public.atlas_entities(project_id, id) on delete set null (country_id) deferrable initially immediate
);
create index atlas_ships_country_idx on public.atlas_ships(project_id, country_id);

create table public.atlas_ship_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.atlas_projects(id) on delete cascade,
  branch_id uuid not null,
  ship_id uuid not null,
  unit_id uuid,                  -- fleet / squadron (a navy unit)
  ship_name text not null default '',  -- renamed during this period
  is_flagship boolean not null default false,
  ship_status text not null default '',
  refit_note text not null default '',
  valid_from date,
  valid_to date,
  overrides_id uuid references public.atlas_ship_assignments(id) on delete set null deferrable initially immediate,
  is_tombstone boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, branch_id) references public.atlas_branches(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, ship_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, unit_id) references public.atlas_entities(project_id, id) on delete set null (unit_id) deferrable initially immediate,
  check (valid_to is null or valid_from is null or valid_to > valid_from)
);
create index atlas_ship_assignments_ship_idx on public.atlas_ship_assignments(project_id, ship_id);
create index atlas_ship_assignments_unit_idx on public.atlas_ship_assignments(project_id, unit_id);
create index atlas_ship_assignments_branch_idx on public.atlas_ship_assignments(project_id, branch_id);
create index atlas_ship_assignments_overrides_idx on public.atlas_ship_assignments(overrides_id);

create table public.atlas_equipment (
  id uuid primary key,
  project_id uuid not null,
  equipment_type text not null default 'other' check (equipment_type in ('aircraft','tank','armored_vehicle',
    'artillery','infantry','naval','other')),
  origin_country_id uuid,
  producer_country_id uuid,
  manufacturer text not null default '',
  specs jsonb not null default '[]'::jsonb,   -- [{ "key": "...", "value": "..." }]
  produced integer check (produced is null or produced >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, origin_country_id) references public.atlas_entities(project_id, id) on delete set null (origin_country_id) deferrable initially immediate,
  foreign key (project_id, producer_country_id) references public.atlas_entities(project_id, id) on delete set null (producer_country_id) deferrable initially immediate,
  check (jsonb_typeof(specs) = 'array')
);
create index atlas_equipment_origin_idx on public.atlas_equipment(project_id, origin_country_id);
create index atlas_equipment_producer_idx on public.atlas_equipment(project_id, producer_country_id);

-- how many of an equipment model a unit holds, over time
create table public.atlas_equipment_holdings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.atlas_projects(id) on delete cascade,
  branch_id uuid not null,
  unit_id uuid not null,
  equipment_id uuid not null,
  quantity integer not null check (quantity >= 0),
  note text not null default '',
  valid_from date,
  valid_to date,
  overrides_id uuid references public.atlas_equipment_holdings(id) on delete set null deferrable initially immediate,
  is_tombstone boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, branch_id) references public.atlas_branches(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, unit_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, equipment_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  check (valid_to is null or valid_from is null or valid_to > valid_from)
);
create index atlas_equipment_holdings_unit_idx on public.atlas_equipment_holdings(project_id, unit_id);
create index atlas_equipment_holdings_equipment_idx on public.atlas_equipment_holdings(project_id, equipment_id);
create index atlas_equipment_holdings_branch_idx on public.atlas_equipment_holdings(project_id, branch_id);
create index atlas_equipment_holdings_overrides_idx on public.atlas_equipment_holdings(overrides_id);

-- ---------------------------------------------------------------- events, wars, battles, treaties
create table public.atlas_events (
  id uuid primary key,
  project_id uuid not null,
  event_type text not null default 'other' check (char_length(event_type) <= 60),
  location text not null default '',
  location_id uuid,
  is_milestone boolean not null default false,
  background text not null default '',
  causes text not null default '',
  course text not null default '',
  outcome text not null default '',
  impact text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, location_id) references public.atlas_entities(project_id, id) on delete set null (location_id) deferrable initially immediate
);
create index atlas_events_project_idx on public.atlas_events(project_id, event_type);
create index atlas_events_location_idx on public.atlas_events(project_id, location_id);

create table public.atlas_wars (
  id uuid primary key,
  project_id uuid not null,
  war_status text not null default 'ongoing' check (war_status in ('planned','ongoing','ceasefire','frozen','ended')),
  casus_belli text not null default '',
  background text not null default '',
  outcome text not null default '',
  territorial_changes text not null default '',
  losses text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate
);

create table public.atlas_war_sides (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  war_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  color text not null default '#ef4444' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  unique (project_id, id),
  foreign key (project_id, war_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate
);
create index atlas_war_sides_war_idx on public.atlas_war_sides(project_id, war_id);

create table public.atlas_war_participants (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.atlas_projects(id) on delete cascade,
  branch_id uuid not null,
  war_id uuid not null,
  side_id uuid not null,
  participant_id uuid not null,
  role text not null default 'belligerent' check (role in ('leader','belligerent','co_belligerent','supporter','volunteer','other')),
  note text not null default '',
  valid_from date,   -- joined
  valid_to date,     -- left
  overrides_id uuid references public.atlas_war_participants(id) on delete set null deferrable initially immediate,
  is_tombstone boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, branch_id) references public.atlas_branches(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, war_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, side_id) references public.atlas_war_sides(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, participant_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  check (valid_to is null or valid_from is null or valid_to > valid_from)
);
create index atlas_war_participants_war_idx on public.atlas_war_participants(project_id, war_id);
create index atlas_war_participants_side_idx on public.atlas_war_participants(project_id, side_id);
create index atlas_war_participants_participant_idx on public.atlas_war_participants(project_id, participant_id);
create index atlas_war_participants_branch_idx on public.atlas_war_participants(project_id, branch_id);
create index atlas_war_participants_overrides_idx on public.atlas_war_participants(overrides_id);

create table public.atlas_battles (
  id uuid primary key,
  project_id uuid not null,
  war_id uuid,
  location text not null default '',
  location_id uuid,
  attacker_side_id uuid,
  defender_side_id uuid,
  result text not null default '',
  losses text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, war_id) references public.atlas_entities(project_id, id) on delete set null (war_id) deferrable initially immediate,
  foreign key (project_id, location_id) references public.atlas_entities(project_id, id) on delete set null (location_id) deferrable initially immediate,
  foreign key (project_id, attacker_side_id) references public.atlas_war_sides(project_id, id) on delete set null (attacker_side_id) deferrable initially immediate,
  foreign key (project_id, defender_side_id) references public.atlas_war_sides(project_id, id) on delete set null (defender_side_id) deferrable initially immediate
);
create index atlas_battles_war_idx on public.atlas_battles(project_id, war_id);
create index atlas_battles_location_idx on public.atlas_battles(project_id, location_id);
create index atlas_battles_attacker_idx on public.atlas_battles(project_id, attacker_side_id);
create index atlas_battles_defender_idx on public.atlas_battles(project_id, defender_side_id);

create table public.atlas_treaties (
  id uuid primary key,
  project_id uuid not null,
  treaty_type text not null default 'other' check (treaty_type in ('peace','mutual_defense','non_aggression',
    'alliance','trade','border','cession','armistice','disarmament','independence','protectorate','other')),
  signed_on date,
  effective_on date,
  war_id uuid,
  signing_place text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, war_id) references public.atlas_entities(project_id, id) on delete set null (war_id) deferrable initially immediate
);
create index atlas_treaties_war_idx on public.atlas_treaties(project_id, war_id);

create table public.atlas_treaty_participants (
  project_id uuid not null,
  treaty_id uuid not null,
  participant_id uuid not null,
  role text not null default 'signatory' check (role in ('signatory','guarantor','observer','beneficiary','other')),
  signed boolean not null default true,
  primary key (treaty_id, participant_id),
  foreign key (project_id, treaty_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, participant_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate
);
create index atlas_treaty_participants_participant_idx on public.atlas_treaty_participants(project_id, participant_id);
create index atlas_treaty_participants_treaty_idx on public.atlas_treaty_participants(project_id, treaty_id);

create table public.atlas_treaty_clauses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  treaty_id uuid not null,
  ordinal integer not null default 1,
  title text not null default '',
  body text not null default '',
  -- structured effect, applied only when the user explicitly confirms it
  effect_type text not null default 'none' check (effect_type in ('none','territory_transfer','relation_change','war_end')),
  effect jsonb not null default '{}'::jsonb,
  applied_branch_id uuid,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  unique (project_id, id),
  foreign key (project_id, treaty_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, applied_branch_id) references public.atlas_branches(project_id, id) on delete set null (applied_branch_id) deferrable initially immediate
);
create index atlas_treaty_clauses_treaty_idx on public.atlas_treaty_clauses(project_id, treaty_id, ordinal);
create index atlas_treaty_clauses_branch_idx on public.atlas_treaty_clauses(project_id, applied_branch_id);

alter table public.atlas_territory_control
  add foreign key (project_id, source_clause_id) references public.atlas_treaty_clauses(project_id, id)
    on delete set null (source_clause_id) deferrable initially immediate;
create index atlas_territory_control_clause_idx on public.atlas_territory_control(project_id, source_clause_id);

create table public.atlas_diplomatic_relations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.atlas_projects(id) on delete cascade,
  branch_id uuid not null,
  a_id uuid not null,
  b_id uuid not null,
  relation_type text not null check (relation_type in ('alliance','military_cooperation','economic_cooperation',
    'friendly','neutral','tension','hostile','war','subject','protectorate','severed','other')),
  is_public boolean not null default true,
  description text not null default '',
  treaty_id uuid,
  event_id uuid,
  source_clause_id uuid,
  valid_from date,
  valid_to date,
  overrides_id uuid references public.atlas_diplomatic_relations(id) on delete set null deferrable initially immediate,
  is_tombstone boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, branch_id) references public.atlas_branches(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, a_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, b_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, treaty_id) references public.atlas_entities(project_id, id) on delete set null (treaty_id) deferrable initially immediate,
  foreign key (project_id, event_id) references public.atlas_entities(project_id, id) on delete set null (event_id) deferrable initially immediate,
  foreign key (project_id, source_clause_id) references public.atlas_treaty_clauses(project_id, id) on delete set null (source_clause_id) deferrable initially immediate,
  check (a_id <> b_id),
  check (valid_to is null or valid_from is null or valid_to > valid_from)
);
create index atlas_diplomatic_relations_a_idx on public.atlas_diplomatic_relations(project_id, a_id);
create index atlas_diplomatic_relations_b_idx on public.atlas_diplomatic_relations(project_id, b_id);
create index atlas_diplomatic_relations_treaty_idx on public.atlas_diplomatic_relations(project_id, treaty_id);
create index atlas_diplomatic_relations_event_idx on public.atlas_diplomatic_relations(project_id, event_id);
create index atlas_diplomatic_relations_clause_idx on public.atlas_diplomatic_relations(project_id, source_clause_id);
create index atlas_diplomatic_relations_branch_idx on public.atlas_diplomatic_relations(project_id, branch_id);
create index atlas_diplomatic_relations_overrides_idx on public.atlas_diplomatic_relations(overrides_id);

-- ---------------------------------------------------------------- maps
create table public.atlas_maps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.atlas_projects(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '',
  map_kind text not null check (map_kind in ('geojson','svg','raster')),
  asset_id uuid,                 -- source file in storage
  width numeric,                 -- svg viewBox / raster pixel width
  height numeric,
  projection text not null default 'equirectangular' check (projection in ('equirectangular','mercator','naturalEarth','equalEarth','orthographic')),
  feature_id_property text not null default '',
  feature_name_property text not null default '',
  source text not null default '',
  license text not null default '',
  attribution text not null default '',
  view jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  unique (project_id, id),
  foreign key (project_id, asset_id) references public.atlas_assets(project_id, id) on delete set null (asset_id) deferrable initially immediate
);
create index atlas_maps_project_idx on public.atlas_maps(project_id, sort_order);
create index atlas_maps_asset_idx on public.atlas_maps(project_id, asset_id);

alter table public.atlas_projects
  add constraint atlas_projects_default_map_fk foreign key (default_map_id)
  references public.atlas_maps(id) on delete set null deferrable initially immediate;
create index atlas_projects_default_map_idx on public.atlas_projects(default_map_id);

-- one row per feature of a vector map (or user-drawn polygon), linked to a region entity
create table public.atlas_map_regions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  map_id uuid not null,
  feature_key text not null,
  feature_name text not null default '',
  region_id uuid,
  geometry jsonb,               -- user-drawn or edited geometry (map coordinates); overrides file geometry
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  unique (map_id, feature_key),
  foreign key (project_id, map_id) references public.atlas_maps(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, region_id) references public.atlas_entities(project_id, id) on delete set null (region_id) deferrable initially immediate
);
create index atlas_map_regions_region_idx on public.atlas_map_regions(project_id, region_id);
create index atlas_map_regions_map_idx on public.atlas_map_regions(project_id, map_id);

create table public.atlas_markers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.atlas_projects(id) on delete cascade,
  branch_id uuid not null,
  map_id uuid not null,
  marker_type text not null default 'custom' check (marker_type in ('country','capital','city','naval_base',
    'air_base','unit','fleet','battle','event','dispute','treaty','character','custom')),
  x double precision not null,    -- map coordinates: lon for geojson, svg units, or normalized 0..1 for raster
  y double precision not null,
  label text not null default '',
  entity_id uuid,
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  min_zoom numeric not null default 0,
  valid_from date,
  valid_to date,
  overrides_id uuid references public.atlas_markers(id) on delete set null deferrable initially immediate,
  is_tombstone boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, branch_id) references public.atlas_branches(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, map_id) references public.atlas_maps(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, entity_id) references public.atlas_entities(project_id, id) on delete set null (entity_id) deferrable initially immediate,
  check (valid_to is null or valid_from is null or valid_to > valid_from)
);
create index atlas_markers_map_idx on public.atlas_markers(project_id, map_id);
create index atlas_markers_entity_idx on public.atlas_markers(project_id, entity_id);
create index atlas_markers_branch_idx on public.atlas_markers(project_id, branch_id);
create index atlas_markers_overrides_idx on public.atlas_markers(overrides_id);

-- free-form vector features: front lines, routes, arrows, text annotations, user polygons
create table public.atlas_map_features (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.atlas_projects(id) on delete cascade,
  branch_id uuid not null,
  map_id uuid not null,
  feature_type text not null check (feature_type in ('front_line','route','railway','arrow','annotation','area')),
  geometry jsonb not null,       -- { type: 'LineString'|'Polygon'|'Point', coordinates } in map coordinates
  label text not null default '',
  style jsonb not null default '{}'::jsonb,
  entity_id uuid,
  valid_from date,
  valid_to date,
  overrides_id uuid references public.atlas_map_features(id) on delete set null deferrable initially immediate,
  is_tombstone boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, branch_id) references public.atlas_branches(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, map_id) references public.atlas_maps(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, entity_id) references public.atlas_entities(project_id, id) on delete set null (entity_id) deferrable initially immediate,
  check (valid_to is null or valid_from is null or valid_to > valid_from)
);
create index atlas_map_features_map_idx on public.atlas_map_features(project_id, map_id);
create index atlas_map_features_entity_idx on public.atlas_map_features(project_id, entity_id);
create index atlas_map_features_branch_idx on public.atlas_map_features(project_id, branch_id);
create index atlas_map_features_overrides_idx on public.atlas_map_features(overrides_id);
