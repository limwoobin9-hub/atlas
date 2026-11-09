-- The kind check only matters when a subtype row is created or re-pointed. Running it on every
-- UPDATE broke cascading deletes (e.g. ON DELETE SET NULL on atlas_elections.applied_branch_id
-- fires while the parent entity is already being deleted).
do $$
declare r record;
begin
  for r in select * from (values
    ('atlas_countries','country'),('atlas_regions','region'),('atlas_parties','party'),('atlas_factions','faction'),
    ('atlas_governments','government'),('atlas_characters','character'),('atlas_parliaments','parliament'),
    ('atlas_elections','election'),('atlas_units','unit'),('atlas_ships','ship'),('atlas_equipment','equipment'),
    ('atlas_events','event'),('atlas_wars','war'),('atlas_battles','battle'),('atlas_treaties','treaty')) as t(tbl, kind)
  loop
    execute format('drop trigger if exists %I on public.%I', r.tbl || '_kind', r.tbl);
    execute format('create trigger %I before insert or update of id on public.%I for each row execute function atlas_private.check_entity_kind(%L)', r.tbl || '_kind', r.tbl, r.kind);
  end loop;
end $$;
