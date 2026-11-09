-- ATLAS triggers, row level security, RPC functions

-- ---------------------------------------------------------------- stamping + kind checks + change log
do $$
declare t text;
begin
  foreach t in array array[
    'atlas_projects','atlas_branches','atlas_entities','atlas_entity_relations','atlas_assets',
    'atlas_ideologies','atlas_countries','atlas_regions','atlas_country_states','atlas_territory_control',
    'atlas_territory_claims','atlas_parties','atlas_factions','atlas_governments','atlas_characters',
    'atlas_positions','atlas_affiliations','atlas_parliaments','atlas_chambers','atlas_elections',
    'atlas_seat_allocations','atlas_party_polling','atlas_units','atlas_unit_states','atlas_ships',
    'atlas_ship_assignments','atlas_equipment','atlas_equipment_holdings','atlas_events','atlas_wars',
    'atlas_war_sides','atlas_war_participants','atlas_battles','atlas_treaties','atlas_treaty_clauses',
    'atlas_diplomatic_relations','atlas_maps','atlas_map_regions','atlas_markers','atlas_map_features']
  loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function atlas_private.stamp()', t || '_stamp', t);
  end loop;

  foreach t in array array[
    'atlas_branches','atlas_entities','atlas_entity_relations','atlas_assets','atlas_asset_links',
    'atlas_ideologies','atlas_countries','atlas_regions','atlas_country_states','atlas_territory_control',
    'atlas_territory_claims','atlas_parties','atlas_factions','atlas_governments','atlas_government_parties',
    'atlas_characters','atlas_positions','atlas_affiliations','atlas_parliaments','atlas_chambers',
    'atlas_elections','atlas_election_results','atlas_seat_allocations','atlas_party_polling','atlas_units',
    'atlas_unit_states','atlas_ships','atlas_ship_assignments','atlas_equipment','atlas_equipment_holdings',
    'atlas_events','atlas_wars','atlas_war_sides','atlas_war_participants','atlas_battles','atlas_treaties',
    'atlas_treaty_participants','atlas_treaty_clauses','atlas_diplomatic_relations','atlas_maps',
    'atlas_map_regions','atlas_markers','atlas_map_features','atlas_entity_branch_hidden']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function atlas_private.log_change()', t || '_log', t);
  end loop;
end $$;

create trigger atlas_countries_kind before insert or update on public.atlas_countries for each row execute function atlas_private.check_entity_kind('country');
create trigger atlas_regions_kind before insert or update on public.atlas_regions for each row execute function atlas_private.check_entity_kind('region');
create trigger atlas_parties_kind before insert or update on public.atlas_parties for each row execute function atlas_private.check_entity_kind('party');
create trigger atlas_factions_kind before insert or update on public.atlas_factions for each row execute function atlas_private.check_entity_kind('faction');
create trigger atlas_governments_kind before insert or update on public.atlas_governments for each row execute function atlas_private.check_entity_kind('government');
create trigger atlas_characters_kind before insert or update on public.atlas_characters for each row execute function atlas_private.check_entity_kind('character');
create trigger atlas_parliaments_kind before insert or update on public.atlas_parliaments for each row execute function atlas_private.check_entity_kind('parliament');
create trigger atlas_elections_kind before insert or update on public.atlas_elections for each row execute function atlas_private.check_entity_kind('election');
create trigger atlas_units_kind before insert or update on public.atlas_units for each row execute function atlas_private.check_entity_kind('unit');
create trigger atlas_ships_kind before insert or update on public.atlas_ships for each row execute function atlas_private.check_entity_kind('ship');
create trigger atlas_equipment_kind before insert or update on public.atlas_equipment for each row execute function atlas_private.check_entity_kind('equipment');
create trigger atlas_events_kind before insert or update on public.atlas_events for each row execute function atlas_private.check_entity_kind('event');
create trigger atlas_wars_kind before insert or update on public.atlas_wars for each row execute function atlas_private.check_entity_kind('war');
create trigger atlas_battles_kind before insert or update on public.atlas_battles for each row execute function atlas_private.check_entity_kind('battle');
create trigger atlas_treaties_kind before insert or update on public.atlas_treaties for each row execute function atlas_private.check_entity_kind('treaty');

-- an entity's kind is immutable once typed rows may reference it
create or replace function atlas_private.lock_entity_kind()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.kind <> old.kind then
    raise exception 'entity kind cannot be changed' using errcode = '23514';
  end if;
  if new.project_id <> old.project_id then
    raise exception 'entity cannot move between projects' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger atlas_entities_lock_kind before update on public.atlas_entities
  for each row execute function atlas_private.lock_entity_kind();

-- profile stamp
create or replace function atlas_private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger atlas_profiles_touch before update on public.atlas_profiles
  for each row execute function atlas_private.touch_updated_at();

-- ---------------------------------------------------------------- branch / membership guards
create or replace function atlas_private.guard_branch()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.is_main and exists (select 1 from public.atlas_projects p where p.id = old.project_id) then
      raise exception 'the main world line cannot be deleted' using errcode = '23514';
    end if;
    return old;
  end if;
  if new.parent_id is distinct from old.parent_id or new.is_main <> old.is_main or new.project_id <> old.project_id then
    raise exception 'branch ancestry cannot be changed after creation' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger atlas_branches_guard before update or delete on public.atlas_branches
  for each row execute function atlas_private.guard_branch();

create or replace function atlas_private.guard_last_owner()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from public.atlas_projects p where p.id = old.project_id)
     and not exists (select 1 from public.atlas_project_members m
                     where m.project_id = old.project_id and m.role = 'owner' and m.user_id <> old.user_id) then
    raise exception 'a project must keep at least one owner' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger atlas_members_last_owner before update or delete on public.atlas_project_members
  for each row execute function atlas_private.guard_last_owner();

-- ---------------------------------------------------------------- row level security
alter table public.atlas_profiles enable row level security;
alter table public.atlas_projects enable row level security;
alter table public.atlas_project_members enable row level security;
alter table public.atlas_project_invites enable row level security;
alter table public.atlas_change_logs enable row level security;
alter table public.atlas_conflict_exceptions enable row level security;

create policy atlas_profiles_select on public.atlas_profiles for select to authenticated
  using (id = (select auth.uid()) or atlas_private.shares_project(id));
create policy atlas_profiles_insert on public.atlas_profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy atlas_profiles_update on public.atlas_profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy atlas_projects_select on public.atlas_projects for select to authenticated
  using (atlas_private.can_read(id));
create policy atlas_projects_update on public.atlas_projects for update to authenticated
  using (atlas_private.can_write(id)) with check (atlas_private.can_write(id));
create policy atlas_projects_delete on public.atlas_projects for delete to authenticated
  using (atlas_private.is_owner(id));

create policy atlas_members_select on public.atlas_project_members for select to authenticated
  using (atlas_private.can_read(project_id));
create policy atlas_members_update on public.atlas_project_members for update to authenticated
  using (atlas_private.is_owner(project_id)) with check (atlas_private.is_owner(project_id));
create policy atlas_members_delete on public.atlas_project_members for delete to authenticated
  using (atlas_private.is_owner(project_id) or user_id = (select auth.uid()));

create policy atlas_invites_select on public.atlas_project_invites for select to authenticated
  using (atlas_private.is_owner(project_id));
create policy atlas_invites_delete on public.atlas_project_invites for delete to authenticated
  using (atlas_private.is_owner(project_id));

create policy atlas_change_logs_select on public.atlas_change_logs for select to authenticated
  using (atlas_private.can_read(project_id));

create policy atlas_conflict_exceptions_select on public.atlas_conflict_exceptions for select to authenticated
  using (atlas_private.can_read(project_id));
create policy atlas_conflict_exceptions_insert on public.atlas_conflict_exceptions for insert to authenticated
  with check (atlas_private.can_write(project_id));
create policy atlas_conflict_exceptions_delete on public.atlas_conflict_exceptions for delete to authenticated
  using (atlas_private.can_write(project_id));

do $$
declare t text;
begin
  foreach t in array array[
    'atlas_branches','atlas_entities','atlas_entity_branch_hidden','atlas_entity_relations','atlas_assets',
    'atlas_asset_links','atlas_ideologies','atlas_countries','atlas_regions','atlas_country_states',
    'atlas_territory_control','atlas_territory_claims','atlas_parties','atlas_factions','atlas_governments',
    'atlas_government_parties','atlas_characters','atlas_positions','atlas_affiliations','atlas_parliaments',
    'atlas_chambers','atlas_elections','atlas_election_results','atlas_seat_allocations','atlas_party_polling',
    'atlas_units','atlas_unit_states','atlas_ships','atlas_ship_assignments','atlas_equipment',
    'atlas_equipment_holdings','atlas_events','atlas_wars','atlas_war_sides','atlas_war_participants',
    'atlas_battles','atlas_treaties','atlas_treaty_participants','atlas_treaty_clauses',
    'atlas_diplomatic_relations','atlas_maps','atlas_map_regions','atlas_markers','atlas_map_features']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (atlas_private.can_read(project_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (atlas_private.can_write(project_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (atlas_private.can_write(project_id)) with check (atlas_private.can_write(project_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (atlas_private.can_write(project_id))', t || '_delete', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

revoke all on public.atlas_profiles, public.atlas_projects, public.atlas_project_members,
  public.atlas_project_invites, public.atlas_change_logs, public.atlas_conflict_exceptions from anon;
grant select, insert, update on public.atlas_profiles to authenticated;
grant select, update, delete on public.atlas_projects to authenticated;
grant select, update, delete on public.atlas_project_members to authenticated;
grant select, delete on public.atlas_project_invites to authenticated;
grant select on public.atlas_change_logs to authenticated;
grant select, insert, delete on public.atlas_conflict_exceptions to authenticated;

-- ---------------------------------------------------------------- RPC: projects & members
create or replace function public.atlas_create_project(
  p_name text, p_description text default '', p_default_date date default '1936-01-01',
  p_seed_ideologies boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare pid uuid; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  insert into public.atlas_projects(name, description, default_date, owner_id, created_by, updated_by)
  values (p_name, coalesce(p_description, ''), coalesce(p_default_date, '1936-01-01'), uid, uid, uid)
  returning id into pid;
  insert into public.atlas_project_members(project_id, user_id, role, last_opened_at) values (pid, uid, 'owner', now());
  insert into public.atlas_branches(project_id, name, description, is_main, color, created_by, updated_by)
  values (pid, '기본 세계선', '프로젝트의 기본 역사', true, '#6366f1', uid, uid);
  if p_seed_ideologies then
    insert into public.atlas_ideologies(project_id, name, color, sort_order, family, created_by, updated_by)
    select pid, v.name, v.color, v.ord, v.family, uid, uid from (values
      ('공산주의', '#b91c1c', 10, 'left'), ('사회주의', '#e11d48', 20, 'left'),
      ('진보주의', '#f97316', 30, 'centre_left'), ('자유주의', '#eab308', 40, 'centre'),
      ('자유보수주의', '#0ea5e9', 50, 'centre_right'), ('보수주의', '#2563eb', 60, 'right'),
      ('가부장주의', '#6d28d9', 70, 'right'), ('전제주의', '#64748b', 80, 'authoritarian'),
      ('파시즘', '#78350f', 90, 'far_right'), ('국가사회주의', '#3f3f46', 100, 'far_right'),
      ('국수주의', '#7c2d12', 110, 'far_right')
    ) as v(name, color, ord, family);
  end if;
  return pid;
end $$;

create or replace function public.atlas_touch_project(p_project uuid, p_favorite boolean default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.atlas_project_members
     set last_opened_at = now(), is_favorite = coalesce(p_favorite, is_favorite)
   where project_id = p_project and user_id = auth.uid();
end $$;

create or replace function public.atlas_list_members(p_project uuid)
returns table(user_id uuid, role text, email text, display_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not atlas_private.can_read(p_project) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select m.user_id, m.role, u.email::text, coalesce(p.display_name, ''), m.created_at
    from public.atlas_project_members m
    join auth.users u on u.id = m.user_id
    left join public.atlas_profiles p on p.id = m.user_id
    where m.project_id = p_project
    order by case m.role when 'owner' then 0 when 'editor' then 1 else 2 end, m.created_at;
end $$;

create or replace function public.atlas_invite_member(p_project uuid, p_email text, p_role text)
returns text language plpgsql security definer set search_path = '' as $$
declare target uuid; e text := lower(btrim(p_email));
begin
  if not atlas_private.is_owner(p_project) then raise exception 'only owners can invite' using errcode = '42501'; end if;
  if p_role not in ('owner','editor','viewer') then raise exception 'invalid role' using errcode = '22023'; end if;
  select u.id into target from auth.users u where lower(u.email) = e;
  if target is not null then
    insert into public.atlas_project_members(project_id, user_id, role) values (p_project, target, p_role)
    on conflict (project_id, user_id) do update set role = excluded.role;
    return 'added';
  end if;
  insert into public.atlas_project_invites(project_id, email, role) values (p_project, e, p_role)
  on conflict (project_id, email) do update set role = excluded.role;
  return 'invited';
end $$;

create or replace function public.atlas_accept_invites()
returns integer language plpgsql security definer set search_path = '' as $$
declare e text; n integer;
begin
  select lower(u.email) into e from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null;
  if e is null then return 0; end if;
  insert into public.atlas_project_members(project_id, user_id, role)
  select i.project_id, auth.uid(), i.role from public.atlas_project_invites i where i.email = e
  on conflict (project_id, user_id) do nothing;
  get diagnostics n = row_count;
  delete from public.atlas_project_invites where email = e;
  return n;
end $$;

-- ---------------------------------------------------------------- RPC: import rows (backup restore / duplicate)
-- Rows must already carry the target project id and fresh UUIDs (remapped client-side).
-- Runs as the caller, so every insert is checked by RLS.
create or replace function public.atlas_import_rows(p_project uuid, p_tables jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  t text; n integer; result jsonb := '{}'::jsonb;
  ordered text[] := array[
    'atlas_branches','atlas_assets','atlas_ideologies','atlas_entities','atlas_entity_branch_hidden',
    'atlas_countries','atlas_regions','atlas_characters','atlas_parties','atlas_factions','atlas_governments',
    'atlas_government_parties','atlas_parliaments','atlas_chambers','atlas_elections','atlas_election_results',
    'atlas_units','atlas_ships','atlas_equipment','atlas_events','atlas_wars','atlas_war_sides','atlas_battles',
    'atlas_treaties','atlas_treaty_participants','atlas_treaty_clauses','atlas_maps','atlas_map_regions',
    'atlas_asset_links','atlas_entity_relations','atlas_country_states','atlas_territory_control',
    'atlas_territory_claims','atlas_positions','atlas_affiliations','atlas_seat_allocations',
    'atlas_party_polling','atlas_unit_states','atlas_ship_assignments','atlas_equipment_holdings',
    'atlas_war_participants','atlas_diplomatic_relations','atlas_markers','atlas_map_features',
    'atlas_conflict_exceptions'];
  bad integer;
begin
  if not atlas_private.can_write(p_project) then raise exception 'forbidden' using errcode = '42501'; end if;
  perform set_config('atlas.skip_log', 'on', true);
  set constraints all deferred;
  foreach t in array ordered loop
    if p_tables ? t and jsonb_typeof(p_tables->t) = 'array' and jsonb_array_length(p_tables->t) > 0 then
      select count(*) into bad from jsonb_array_elements(p_tables->t) r where (r->>'project_id')::uuid is distinct from p_project;
      if bad > 0 then raise exception 'row of % belongs to another project', t using errcode = '22023'; end if;
      execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)', t, t)
        using p_tables->t;
      get diagnostics n = row_count;
      result := result || jsonb_build_object(t, n);
    end if;
  end loop;
  perform set_config('atlas.skip_log', 'off', true);
  return result;
end $$;

-- ---------------------------------------------------------------- RPC: revert a logged change
create or replace function public.atlas_revert_change(p_change_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.atlas_change_logs; cols text; tbl text;
begin
  select * into c from public.atlas_change_logs where id = p_change_id;
  if not found then raise exception 'change not found' using errcode = 'P0002'; end if;
  if not atlas_private.can_write(c.project_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if c.reverted_at is not null then raise exception 'change already reverted' using errcode = '22023'; end if;
  tbl := c.table_name;
  if tbl !~ '^atlas_[a-z_]+$' or tbl in ('atlas_projects','atlas_project_members','atlas_project_invites','atlas_change_logs','atlas_profiles') then
    raise exception 'table cannot be reverted' using errcode = '22023';
  end if;
  if c.row_id is null then raise exception 'this change cannot be reverted automatically' using errcode = '22023'; end if;
  if c.action = 'INSERT' then
    execute format('delete from public.%I where id = $1 and project_id = $2', tbl) using c.row_id, c.project_id;
  elsif c.action = 'DELETE' then
    if (c.old_data->>'project_id')::uuid <> c.project_id then raise exception 'project mismatch'; end if;
    execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)', tbl, tbl) using c.old_data;
  else
    select string_agg(format('%I', f), ', ') into cols from unnest(c.changed_fields) f
      where f not in ('id','project_id','created_at','created_by');
    if cols is null then raise exception 'nothing to revert' using errcode = '22023'; end if;
    execute format('update public.%I set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) where id = $2 and project_id = $3',
                   tbl, cols, cols, tbl) using c.old_data, c.row_id, c.project_id;
  end if;
  update public.atlas_change_logs set reverted_at = now() where id = p_change_id;
end $$;

revoke all on function public.atlas_create_project(text, text, date, boolean), public.atlas_touch_project(uuid, boolean),
  public.atlas_list_members(uuid), public.atlas_invite_member(uuid, text, text), public.atlas_accept_invites(),
  public.atlas_import_rows(uuid, jsonb), public.atlas_revert_change(bigint) from public, anon;
grant execute on function public.atlas_create_project(text, text, date, boolean), public.atlas_touch_project(uuid, boolean),
  public.atlas_list_members(uuid), public.atlas_invite_member(uuid, text, text), public.atlas_accept_invites(),
  public.atlas_import_rows(uuid, jsonb), public.atlas_revert_change(bigint) to authenticated;

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('atlas-assets', 'atlas-assets', false, 52428800, array[
  'image/png','image/jpeg','image/webp','image/gif','image/svg+xml','application/pdf',
  'application/json','application/geo+json','text/plain','text/markdown','application/zip',
  'application/octet-stream'])
on conflict (id) do nothing;

create or replace function atlas_private.try_uuid(p text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin return p::uuid; exception when others then return null; end $$;
grant execute on function atlas_private.try_uuid(text) to authenticated;

create policy atlas_assets_read on storage.objects for select to authenticated
  using (bucket_id = 'atlas-assets' and atlas_private.can_read(atlas_private.try_uuid((storage.foldername(name))[1])));
create policy atlas_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'atlas-assets' and atlas_private.can_write(atlas_private.try_uuid((storage.foldername(name))[1])));
create policy atlas_assets_update on storage.objects for update to authenticated
  using (bucket_id = 'atlas-assets' and atlas_private.can_write(atlas_private.try_uuid((storage.foldername(name))[1])))
  with check (bucket_id = 'atlas-assets' and atlas_private.can_write(atlas_private.try_uuid((storage.foldername(name))[1])));
create policy atlas_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'atlas-assets' and atlas_private.can_write(atlas_private.try_uuid((storage.foldername(name))[1])));
