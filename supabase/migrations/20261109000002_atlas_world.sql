-- ATLAS world model: countries, regions, territory, politics, people
-- Column macros used throughout:
--   ref(x) = foreign key (project_id, x) references atlas_entities(project_id, id)
--   temporal = branch_id, valid_from, valid_to, overrides_id, is_tombstone

-- ---------------------------------------------------------------- ideologies
create table public.atlas_ideologies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.atlas_projects(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null default '',
  color text not null default '#888888' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order integer not null default 0,
  parent_id uuid,
  family text not null default '' check (char_length(family) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  unique (project_id, id),
  unique (project_id, name),
  foreign key (project_id, parent_id) references public.atlas_ideologies(project_id, id)
    on delete set null (parent_id) deferrable initially immediate,
  check (parent_id is null or parent_id <> id)
);
create index atlas_ideologies_parent_idx on public.atlas_ideologies(project_id, parent_id);

-- ---------------------------------------------------------------- countries
create table public.atlas_countries (
  id uuid primary key,
  project_id uuid not null,
  official_name text not null default '',
  short_name text not null default '',
  english_name text not null default '',
  code text not null default '' check (char_length(code) <= 8),
  polity_type text not null default 'sovereign' check (polity_type in ('sovereign','kingdom','empire',
    'republic','dominion','colony','protectorate','puppet','government_in_exile','provisional_government',
    'warlord','rebel','de_facto_state','nominal_vassal','international_zone','mandate','occupation_zone','other')),
  is_state boolean not null default true,
  motto text not null default '',
  anthem text not null default '',
  currency text not null default '',
  languages text not null default '',
  religion text not null default '',
  sections jsonb not null default '{}'::jsonb,  -- history, economy, politics, diplomacy, military, culture, territory
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate
);
create index atlas_countries_project_idx on public.atlas_countries(project_id);

create table public.atlas_regions (
  id uuid primary key,
  project_id uuid not null,
  parent_region_id uuid,
  region_type text not null default 'province' check (region_type in ('continent','subcontinent',
    'state','province','district','city','island','colony','territory','sea','other')),
  population bigint check (population is null or population >= 0),
  area_km2 numeric check (area_km2 is null or area_km2 >= 0),
  main_cities text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, parent_region_id) references public.atlas_entities(project_id, id)
    on delete set null (parent_region_id) deferrable initially immediate,
  check (parent_region_id is null or parent_region_id <> id)
);
create index atlas_regions_project_idx on public.atlas_regions(project_id, parent_region_id);

-- time-varying country attributes
create table public.atlas_country_states (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.atlas_projects(id) on delete cascade,
  branch_id uuid not null,
  country_id uuid not null,
  name text not null default '',
  official_name text not null default '',
  flag_path text,
  emblem_path text,
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  capital_id uuid,
  seat_of_government_id uuid,
  government_form text not null default '',
  ideology_id uuid,
  head_of_state_id uuid,
  head_of_government_id uuid,
  population bigint check (population is null or population >= 0),
  area_km2 numeric check (area_km2 is null or area_km2 >= 0),
  gdp text not null default '',
  note text not null default '',
  valid_from date,
  valid_to date,
  overrides_id uuid references public.atlas_country_states(id) on delete set null deferrable initially immediate,
  is_tombstone boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, branch_id) references public.atlas_branches(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, country_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, capital_id) references public.atlas_entities(project_id, id) on delete set null (capital_id) deferrable initially immediate,
  foreign key (project_id, seat_of_government_id) references public.atlas_entities(project_id, id) on delete set null (seat_of_government_id) deferrable initially immediate,
  foreign key (project_id, ideology_id) references public.atlas_ideologies(project_id, id) on delete set null (ideology_id) deferrable initially immediate,
  foreign key (project_id, head_of_state_id) references public.atlas_entities(project_id, id) on delete set null (head_of_state_id) deferrable initially immediate,
  foreign key (project_id, head_of_government_id) references public.atlas_entities(project_id, id) on delete set null (head_of_government_id) deferrable initially immediate,
  check (valid_to is null or valid_from is null or valid_to > valid_from)
);
create index atlas_country_states_country_idx on public.atlas_country_states(project_id, country_id, valid_from);
create index atlas_country_states_branch_idx on public.atlas_country_states(project_id, branch_id);
create index atlas_country_states_overrides_idx on public.atlas_country_states(overrides_id);

-- who actually controls a region and who is nominal sovereign
create table public.atlas_territory_control (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.atlas_projects(id) on delete cascade,
  branch_id uuid not null,
  region_id uuid not null,
  controller_id uuid,          -- de facto control
  sovereign_id uuid,           -- de jure / nominal sovereign
  administrator_id uuid,       -- administrative affiliation
  status text not null default 'integrated' check (status in ('integrated','autonomous','occupied',
    'disputed','colony','mandate','protectorate','international','unclaimed','other')),
  note text not null default '',
  valid_from date,
  valid_to date,
  overrides_id uuid references public.atlas_territory_control(id) on delete set null deferrable initially immediate,
  is_tombstone boolean not null default false,
  source_clause_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, branch_id) references public.atlas_branches(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, region_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, controller_id) references public.atlas_entities(project_id, id) on delete set null (controller_id) deferrable initially immediate,
  foreign key (project_id, sovereign_id) references public.atlas_entities(project_id, id) on delete set null (sovereign_id) deferrable initially immediate,
  foreign key (project_id, administrator_id) references public.atlas_entities(project_id, id) on delete set null (administrator_id) deferrable initially immediate,
  check (valid_to is null or valid_from is null or valid_to > valid_from)
);
create index atlas_territory_control_region_idx on public.atlas_territory_control(project_id, region_id, valid_from);
create index atlas_territory_control_controller_idx on public.atlas_territory_control(project_id, controller_id);
create index atlas_territory_control_sovereign_idx on public.atlas_territory_control(project_id, sovereign_id);
create index atlas_territory_control_branch_idx on public.atlas_territory_control(project_id, branch_id);
create index atlas_territory_control_overrides_idx on public.atlas_territory_control(overrides_id);

create table public.atlas_territory_claims (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.atlas_projects(id) on delete cascade,
  branch_id uuid not null,
  region_id uuid not null,
  claimant_id uuid not null,
  claim_type text not null default 'claim' check (claim_type in ('claim','core','historical','irredentist','de_jure','other')),
  note text not null default '',
  valid_from date,
  valid_to date,
  overrides_id uuid references public.atlas_territory_claims(id) on delete set null deferrable initially immediate,
  is_tombstone boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, branch_id) references public.atlas_branches(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, region_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, claimant_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  check (valid_to is null or valid_from is null or valid_to > valid_from)
);
create index atlas_territory_claims_region_idx on public.atlas_territory_claims(project_id, region_id);
create index atlas_territory_claims_claimant_idx on public.atlas_territory_claims(project_id, claimant_id);
create index atlas_territory_claims_branch_idx on public.atlas_territory_claims(project_id, branch_id);
create index atlas_territory_claims_overrides_idx on public.atlas_territory_claims(overrides_id);

-- ---------------------------------------------------------------- parties, factions, governments
create table public.atlas_parties (
  id uuid primary key,
  project_id uuid not null,
  country_id uuid,
  abbreviation text not null default '',
  ideology_id uuid,
  ideology_detail text not null default '',
  color_mode text not null default 'ideology' check (color_mode in ('ideology','custom')),
  leader_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, country_id) references public.atlas_entities(project_id, id) on delete set null (country_id) deferrable initially immediate,
  foreign key (project_id, ideology_id) references public.atlas_ideologies(project_id, id) on delete set null (ideology_id) deferrable initially immediate,
  foreign key (project_id, leader_id) references public.atlas_entities(project_id, id) on delete set null (leader_id) deferrable initially immediate
);
create index atlas_parties_country_idx on public.atlas_parties(project_id, country_id);
create index atlas_parties_ideology_idx on public.atlas_parties(project_id, ideology_id);
create index atlas_parties_leader_idx on public.atlas_parties(project_id, leader_id);

create table public.atlas_factions (
  id uuid primary key,
  project_id uuid not null,
  party_id uuid,
  leader_id uuid,
  ideology_id uuid,
  support_pct numeric check (support_pct is null or (support_pct >= 0 and support_pct <= 100)),
  split_from_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, party_id) references public.atlas_entities(project_id, id) on delete set null (party_id) deferrable initially immediate,
  foreign key (project_id, leader_id) references public.atlas_entities(project_id, id) on delete set null (leader_id) deferrable initially immediate,
  foreign key (project_id, ideology_id) references public.atlas_ideologies(project_id, id) on delete set null (ideology_id) deferrable initially immediate,
  foreign key (project_id, split_from_id) references public.atlas_entities(project_id, id) on delete set null (split_from_id) deferrable initially immediate
);
create index atlas_factions_party_idx on public.atlas_factions(project_id, party_id);
create index atlas_factions_leader_idx on public.atlas_factions(project_id, leader_id);
create index atlas_factions_ideology_idx on public.atlas_factions(project_id, ideology_id);
create index atlas_factions_split_idx on public.atlas_factions(project_id, split_from_id);

create table public.atlas_governments (
  id uuid primary key,
  project_id uuid not null,
  country_id uuid,
  head_of_state_id uuid,
  head_of_government_id uuid,
  government_form text not null default '',
  regime text not null default '',
  constitution text not null default '',
  policies text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, country_id) references public.atlas_entities(project_id, id) on delete set null (country_id) deferrable initially immediate,
  foreign key (project_id, head_of_state_id) references public.atlas_entities(project_id, id) on delete set null (head_of_state_id) deferrable initially immediate,
  foreign key (project_id, head_of_government_id) references public.atlas_entities(project_id, id) on delete set null (head_of_government_id) deferrable initially immediate
);
create index atlas_governments_country_idx on public.atlas_governments(project_id, country_id);
create index atlas_governments_hos_idx on public.atlas_governments(project_id, head_of_state_id);
create index atlas_governments_hog_idx on public.atlas_governments(project_id, head_of_government_id);

create table public.atlas_government_parties (
  project_id uuid not null,
  government_id uuid not null,
  party_id uuid not null,
  role text not null default 'ruling' check (role in ('ruling','coalition','confidence_supply')),
  primary key (government_id, party_id),
  foreign key (project_id, government_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, party_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate
);
create index atlas_government_parties_party_idx on public.atlas_government_parties(project_id, party_id);

-- ---------------------------------------------------------------- characters
create table public.atlas_characters (
  id uuid primary key,
  project_id uuid not null,
  real_name text not null default '',
  aliases text not null default '',
  nationality_id uuid,
  rank text not null default '',
  biography text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, nationality_id) references public.atlas_entities(project_id, id) on delete set null (nationality_id) deferrable initially immediate
);
create index atlas_characters_nationality_idx on public.atlas_characters(project_id, nationality_id);

-- offices / posts held over time (minister, PM, commander, party leader...)
create table public.atlas_positions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.atlas_projects(id) on delete cascade,
  branch_id uuid not null,
  character_id uuid not null,
  organization_id uuid,         -- country / government / party / unit / organization entity
  title text not null check (char_length(btrim(title)) between 1 and 160),
  position_kind text not null default 'other' check (position_kind in ('head_of_state','head_of_government',
    'minister','legislator','party_leader','commander','diplomat','official','other')),
  rank text not null default '',
  note text not null default '',
  valid_from date,
  valid_to date,
  overrides_id uuid references public.atlas_positions(id) on delete set null deferrable initially immediate,
  is_tombstone boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, branch_id) references public.atlas_branches(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, character_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, organization_id) references public.atlas_entities(project_id, id) on delete set null (organization_id) deferrable initially immediate,
  check (valid_to is null or valid_from is null or valid_to > valid_from)
);
create index atlas_positions_character_idx on public.atlas_positions(project_id, character_id);
create index atlas_positions_org_idx on public.atlas_positions(project_id, organization_id);
create index atlas_positions_branch_idx on public.atlas_positions(project_id, branch_id);
create index atlas_positions_overrides_idx on public.atlas_positions(overrides_id);

-- memberships / affiliations over time (country, party, unit, organization)
create table public.atlas_affiliations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.atlas_projects(id) on delete cascade,
  branch_id uuid not null,
  character_id uuid not null,
  organization_id uuid not null,
  affiliation_type text not null default 'member' check (affiliation_type in ('citizen','member','serviceman','employee','supporter','other')),
  role text not null default '',
  note text not null default '',
  valid_from date,
  valid_to date,
  overrides_id uuid references public.atlas_affiliations(id) on delete set null deferrable initially immediate,
  is_tombstone boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, branch_id) references public.atlas_branches(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, character_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, organization_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  check (valid_to is null or valid_from is null or valid_to > valid_from)
);
create index atlas_affiliations_character_idx on public.atlas_affiliations(project_id, character_id);
create index atlas_affiliations_org_idx on public.atlas_affiliations(project_id, organization_id);
create index atlas_affiliations_branch_idx on public.atlas_affiliations(project_id, branch_id);
create index atlas_affiliations_overrides_idx on public.atlas_affiliations(overrides_id);

-- ---------------------------------------------------------------- parliaments & elections
create table public.atlas_parliaments (
  id uuid primary key,
  project_id uuid not null,
  country_id uuid,
  structure text not null default 'unicameral' check (structure in ('unicameral','bicameral')),
  term_years numeric check (term_years is null or term_years > 0),
  electoral_system text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, country_id) references public.atlas_entities(project_id, id) on delete set null (country_id) deferrable initially immediate
);
create index atlas_parliaments_country_idx on public.atlas_parliaments(project_id, country_id);

create table public.atlas_chambers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  parliament_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  chamber_type text not null default 'single' check (chamber_type in ('single','lower','upper')),
  total_seats integer not null check (total_seats between 1 and 5000),
  majority_seats integer check (majority_seats is null or majority_seats > 0),
  layout text not null default 'hemicycle' check (layout in ('hemicycle','circle','bar')),
  party_order uuid[] not null default '{}',  -- seating order of parties (left -> right), user-arranged
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  unique (project_id, id),
  foreign key (project_id, parliament_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate
);
create index atlas_chambers_parliament_idx on public.atlas_chambers(project_id, parliament_id);

create table public.atlas_elections (
  id uuid primary key,
  project_id uuid not null,
  country_id uuid,
  chamber_id uuid,
  election_type text not null default 'legislative' check (election_type in ('legislative','presidential',
    'referendum','local','party_leadership','other')),
  electoral_system text not null default '',
  turnout_pct numeric check (turnout_pct is null or (turnout_pct >= 0 and turnout_pct <= 100)),
  eligible_voters bigint check (eligible_voters is null or eligible_voters >= 0),
  result_summary text not null default '',
  applied_branch_id uuid,
  applied_from date,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, country_id) references public.atlas_entities(project_id, id) on delete set null (country_id) deferrable initially immediate,
  foreign key (project_id, chamber_id) references public.atlas_chambers(project_id, id) on delete set null (chamber_id) deferrable initially immediate,
  foreign key (project_id, applied_branch_id) references public.atlas_branches(project_id, id) on delete set null (applied_branch_id) deferrable initially immediate
);
create index atlas_elections_country_idx on public.atlas_elections(project_id, country_id);
create index atlas_elections_chamber_idx on public.atlas_elections(project_id, chamber_id);
create index atlas_elections_branch_idx on public.atlas_elections(project_id, applied_branch_id);

create table public.atlas_election_results (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  election_id uuid not null,
  party_id uuid,
  candidate_id uuid,
  label text not null default '',
  votes bigint check (votes is null or votes >= 0),
  vote_share numeric check (vote_share is null or (vote_share >= 0 and vote_share <= 100)),
  seats integer check (seats is null or seats >= 0),
  sort_order integer not null default 0,
  foreign key (project_id, election_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, party_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, candidate_id) references public.atlas_entities(project_id, id) on delete set null (candidate_id) deferrable initially immediate,
  unique (election_id, party_id)
);
create index atlas_election_results_election_idx on public.atlas_election_results(project_id, election_id);
create index atlas_election_results_party_idx on public.atlas_election_results(project_id, party_id);
create index atlas_election_results_candidate_idx on public.atlas_election_results(project_id, candidate_id);

-- composition of a chamber over time
create table public.atlas_seat_allocations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.atlas_projects(id) on delete cascade,
  branch_id uuid not null,
  chamber_id uuid not null,
  party_id uuid not null,
  seats integer not null check (seats >= 0),
  election_id uuid,
  note text not null default '',
  valid_from date,
  valid_to date,
  overrides_id uuid references public.atlas_seat_allocations(id) on delete set null deferrable initially immediate,
  is_tombstone boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, branch_id) references public.atlas_branches(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, chamber_id) references public.atlas_chambers(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, party_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, election_id) references public.atlas_entities(project_id, id) on delete set null (election_id) deferrable initially immediate,
  check (valid_to is null or valid_from is null or valid_to > valid_from)
);
create index atlas_seat_allocations_chamber_idx on public.atlas_seat_allocations(project_id, chamber_id, valid_from);
create index atlas_seat_allocations_party_idx on public.atlas_seat_allocations(project_id, party_id);
create index atlas_seat_allocations_election_idx on public.atlas_seat_allocations(project_id, election_id);
create index atlas_seat_allocations_branch_idx on public.atlas_seat_allocations(project_id, branch_id);
create index atlas_seat_allocations_overrides_idx on public.atlas_seat_allocations(overrides_id);

-- opinion polling (point-in-time; valid_from = poll date). Never fabricated: only user-entered.
create table public.atlas_party_polling (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.atlas_projects(id) on delete cascade,
  branch_id uuid not null,
  party_id uuid not null,
  support_pct numeric not null check (support_pct >= 0 and support_pct <= 100),
  pollster text not null default '',
  note text not null default '',
  valid_from date not null,
  valid_to date,
  overrides_id uuid references public.atlas_party_polling(id) on delete set null deferrable initially immediate,
  is_tombstone boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, branch_id) references public.atlas_branches(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, party_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  check (valid_to is null or valid_to > valid_from)
);
create index atlas_party_polling_party_idx on public.atlas_party_polling(project_id, party_id, valid_from);
create index atlas_party_polling_branch_idx on public.atlas_party_polling(project_id, branch_id);
create index atlas_party_polling_overrides_idx on public.atlas_party_polling(overrides_id);
