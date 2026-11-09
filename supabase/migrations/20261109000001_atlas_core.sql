-- ATLAS core: projects, members, branches, entity registry, relations, change log
-- Conventions
--   * every world table carries project_id and is protected by RLS via atlas_private helpers
--   * temporal facts use half-open ranges [valid_from, valid_to); NULL valid_from = since forever,
--     NULL valid_to = open-ended
--   * branch copy-on-write: a fact row belongs to one branch; descendant branches inherit ancestor rows
--     whose valid_from is before the fork date. Editing an inherited row inserts an override row
--     (overrides_id) in the branch; deleting it inserts a tombstone row.

create extension if not exists pg_trgm with schema extensions;

create schema if not exists atlas_private;
revoke all on schema atlas_private from public;
grant usage on schema atlas_private to authenticated;

-- ---------------------------------------------------------------- generic triggers
create or replace function atlas_private.stamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

-- ---------------------------------------------------------------- profiles
create table public.atlas_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  avatar_path text,
  bio text not null default '' check (char_length(bio) <= 2000),
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.atlas_profiles is 'ATLAS user profile, created lazily on first sign-in.';

-- ---------------------------------------------------------------- projects
create table public.atlas_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 5000),
  cover_path text,
  default_date date not null default '1936-01-01',
  default_map_id uuid,
  settings jsonb not null default '{}'::jsonb,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid()
);
create index atlas_projects_owner_idx on public.atlas_projects(owner_id);

create table public.atlas_project_members (
  project_id uuid not null references public.atlas_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','editor','viewer')),
  is_favorite boolean not null default false,
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index atlas_project_members_user_idx on public.atlas_project_members(user_id);

create table public.atlas_project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.atlas_projects(id) on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  role text not null check (role in ('editor','viewer','owner')),
  invited_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, email)
);
create index atlas_project_invites_email_idx on public.atlas_project_invites(email);
create index atlas_project_invites_invited_by_idx on public.atlas_project_invites(invited_by);

-- ---------------------------------------------------------------- access helpers
create or replace function atlas_private.member_role(p_project uuid)
returns text language sql stable security definer set search_path = '' as $$
  select m.role from public.atlas_project_members m
  where m.project_id = p_project and m.user_id = (select auth.uid())
$$;
create or replace function atlas_private.can_read(p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.atlas_project_members m
                 where m.project_id = p_project and m.user_id = (select auth.uid()))
$$;
create or replace function atlas_private.can_write(p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.atlas_project_members m
                 where m.project_id = p_project and m.user_id = (select auth.uid())
                   and m.role in ('owner','editor'))
$$;
create or replace function atlas_private.is_owner(p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.atlas_project_members m
                 where m.project_id = p_project and m.user_id = (select auth.uid())
                   and m.role = 'owner')
$$;
create or replace function atlas_private.shares_project(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.atlas_project_members a
                 join public.atlas_project_members b on a.project_id = b.project_id
                 where a.user_id = (select auth.uid()) and b.user_id = p_user)
$$;
revoke all on function atlas_private.member_role(uuid), atlas_private.can_read(uuid),
  atlas_private.can_write(uuid), atlas_private.is_owner(uuid), atlas_private.shares_project(uuid) from public;
grant execute on function atlas_private.member_role(uuid), atlas_private.can_read(uuid),
  atlas_private.can_write(uuid), atlas_private.is_owner(uuid), atlas_private.shares_project(uuid) to authenticated;

-- ---------------------------------------------------------------- branches (world lines)
create table public.atlas_branches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.atlas_projects(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '',
  color text not null default '#6366f1' check (color ~ '^#[0-9a-fA-F]{6}$'),
  parent_id uuid,
  fork_date date,           -- NULL on a child branch = full copy-on-write clone of the parent
  is_main boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  unique (project_id, id),
  foreign key (project_id, parent_id) references public.atlas_branches(project_id, id)
    on delete restrict deferrable initially immediate,
  check ((is_main and parent_id is null and fork_date is null) or (not is_main and parent_id is not null)),
  check (parent_id is null or parent_id <> id)
);
create unique index atlas_branches_one_main on public.atlas_branches(project_id) where is_main;
create index atlas_branches_parent_idx on public.atlas_branches(project_id, parent_id);

-- ---------------------------------------------------------------- entity registry
create table public.atlas_entities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.atlas_projects(id) on delete cascade,
  kind text not null check (kind in ('country','region','party','faction','government','parliament',
    'election','character','unit','ship','equipment','event','war','battle','treaty','organization')),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  status text not null default 'tentative'
    check (status in ('confirmed','tentative','idea','undecided','discarded')),
  summary text not null default '' check (char_length(summary) <= 2000),
  body text not null default '' check (char_length(body) <= 200000),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  image_path text,
  tags text[] not null default '{}',
  starts_on date,   -- founded / born / started / commissioned ...
  ends_on date,     -- dissolved / died / ended ... (exclusive)
  origin_branch_id uuid,  -- NULL = exists in every world line
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  unique (project_id, id),
  foreign key (project_id, origin_branch_id) references public.atlas_branches(project_id, id)
    on delete cascade deferrable initially immediate
);
create index atlas_entities_project_kind_idx on public.atlas_entities(project_id, kind, name);
create index atlas_entities_name_trgm on public.atlas_entities using gin (name extensions.gin_trgm_ops);
create index atlas_entities_tags_idx on public.atlas_entities using gin (tags);
create index atlas_entities_origin_idx on public.atlas_entities(project_id, origin_branch_id);
create index atlas_entities_updated_idx on public.atlas_entities(project_id, updated_at desc);

-- entity hidden in a branch (e.g. a war that never happened in this world line)
create table public.atlas_entity_branch_hidden (
  project_id uuid not null,
  branch_id uuid not null,
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  primary key (branch_id, entity_id),
  foreign key (project_id, branch_id) references public.atlas_branches(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, entity_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate
);
create index atlas_entity_branch_hidden_entity_idx on public.atlas_entity_branch_hidden(project_id, entity_id);
create index atlas_entity_branch_hidden_branch_idx on public.atlas_entity_branch_hidden(project_id, branch_id);

-- check that a subtype row matches the entity kind
create or replace function atlas_private.check_entity_kind()
returns trigger language plpgsql set search_path = '' as $$
declare k text;
begin
  select e.kind into k from public.atlas_entities e where e.id = new.id;
  if k is distinct from tg_argv[0] then
    raise exception 'entity % is of kind %, expected %', new.id, k, tg_argv[0] using errcode = '23514';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- generic relations (temporal, branched)
create table public.atlas_entity_relations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.atlas_projects(id) on delete cascade,
  branch_id uuid not null,
  from_id uuid not null,
  to_id uuid not null,
  relation_type text not null check (char_length(relation_type) between 1 and 60),
  note text not null default '',
  valid_from date,
  valid_to date,
  overrides_id uuid references public.atlas_entity_relations(id) on delete set null deferrable initially immediate,
  is_tombstone boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  foreign key (project_id, branch_id) references public.atlas_branches(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, from_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, to_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate,
  check (from_id <> to_id),
  check (valid_to is null or valid_from is null or valid_to > valid_from)
);
create index atlas_entity_relations_from_idx on public.atlas_entity_relations(project_id, from_id);
create index atlas_entity_relations_to_idx on public.atlas_entity_relations(project_id, to_id);
create index atlas_entity_relations_branch_idx on public.atlas_entity_relations(project_id, branch_id);
create index atlas_entity_relations_overrides_idx on public.atlas_entity_relations(overrides_id);

-- ---------------------------------------------------------------- assets (files in storage)
create table public.atlas_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.atlas_projects(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  title text not null default '',
  description text not null default '',
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0 and size_bytes <= 52428800),
  category text not null default 'other' check (category in ('map','flag','emblem','military_flag',
    'portrait','ship','battle_map','document','pdf','other')),
  folder text not null default '' check (char_length(folder) <= 200),
  tags text[] not null default '{}',
  width integer,
  height integer,
  source text not null default '',
  license text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  unique (project_id, id),
  check (split_part(storage_path, '/', 1) = project_id::text)
);
create index atlas_assets_project_idx on public.atlas_assets(project_id, category, created_at desc);
create index atlas_assets_title_trgm on public.atlas_assets using gin (title extensions.gin_trgm_ops);

create table public.atlas_asset_links (
  project_id uuid not null,
  asset_id uuid not null,
  entity_id uuid not null,
  role text not null default 'attachment' check (char_length(role) <= 40),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  primary key (asset_id, entity_id),
  foreign key (project_id, asset_id) references public.atlas_assets(project_id, id) on delete cascade deferrable initially immediate,
  foreign key (project_id, entity_id) references public.atlas_entities(project_id, id) on delete cascade deferrable initially immediate
);
create index atlas_asset_links_entity_idx on public.atlas_asset_links(project_id, entity_id);
create index atlas_asset_links_asset_idx on public.atlas_asset_links(project_id, asset_id);

-- ---------------------------------------------------------------- change log (edit history, not world time)
create table public.atlas_change_logs (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.atlas_projects(id) on delete cascade,
  table_name text not null,
  row_id uuid,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  changed_fields text[] not null default '{}',
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  reverted_at timestamptz
);
create index atlas_change_logs_project_idx on public.atlas_change_logs(project_id, changed_at desc);
create index atlas_change_logs_row_idx on public.atlas_change_logs(row_id);

create or replace function atlas_private.log_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  o jsonb; n jsonb; fields text[] := '{}'; pid uuid; rid uuid;
begin
  if current_setting('atlas.skip_log', true) = 'on' then
    return null;
  end if;
  if tg_op <> 'INSERT' then o := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then n := to_jsonb(new); end if;
  pid := coalesce((n->>'project_id')::uuid, (o->>'project_id')::uuid);
  rid := coalesce((n->>'id')::uuid, (o->>'id')::uuid);
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(k), '{}') into fields
    from jsonb_object_keys(n) k
    where k not in ('updated_at','updated_by') and (o->k) is distinct from (n->k);
    if array_length(fields, 1) is null then return null; end if;
  end if;
  -- the project row itself is gone when a project is deleted; skip logging for cascades
  if not exists (select 1 from public.atlas_projects p where p.id = pid) then
    return null;
  end if;
  insert into public.atlas_change_logs(project_id, table_name, row_id, action, changed_fields, old_data, new_data, changed_by)
  values (pid, tg_table_name, rid, tg_op, fields, o, n, auth.uid());
  return null;
end $$;

-- conflict exceptions (user marks an intentional alternate-history oddity as OK)
create table public.atlas_conflict_exceptions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.atlas_projects(id) on delete cascade,
  conflict_key text not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (project_id, conflict_key)
);
