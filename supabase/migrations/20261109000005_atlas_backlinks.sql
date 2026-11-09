-- Every row (in any ATLAS table) whose foreign key points at the given entity.
-- SECURITY INVOKER: rows are filtered by the caller's RLS.
create or replace function public.atlas_entity_backlinks(p_project uuid, p_entity uuid)
returns table(table_name text, column_name text, row_data jsonb)
language plpgsql stable security invoker set search_path = '' as $$
declare r record;
begin
  for r in
    select cl.relname::text as tbl, a.attname::text as col
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class cl on cl.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = cl.relnamespace and n.nspname = 'public'
    join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f'
      and c.confrelid = 'public.atlas_entities'::regclass
      and cl.relname like 'atlas\_%'
      and a.attname <> 'project_id'
  loop
    return query execute format(
      'select %L::text, %L::text, to_jsonb(t) from public.%I t where t.project_id = $1 and t.%I = $2 limit 500',
      r.tbl, r.col, r.tbl, r.col) using p_project, p_entity;
  end loop;
end $$;
revoke all on function public.atlas_entity_backlinks(uuid, uuid) from public, anon;
grant execute on function public.atlas_entity_backlinks(uuid, uuid) to authenticated;
