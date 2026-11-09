import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { branchChain, chainIds, entityInBranch, hiddenSet, visibleRows, type TemporalRow } from '@/domain/timeline'
import { fetchAll, qk, rpc, type TemporalTable } from './db'
import type { AnyRow, Branch, Entity, Ideology, Project, ProjectListItem, Role } from './types'
import { useWorld } from './world'

const ENTITY_COLUMNS =
  'id,project_id,kind,name,status,summary,color,image_path,tags,starts_on,ends_on,origin_branch_id,extra,created_at,updated_at,updated_by'

export function useProjects() {
  return useQuery({
    queryKey: qk.projects,
    queryFn: async (): Promise<ProjectListItem[]> => {
      const { data: u } = await supabase.auth.getUser()
      if (!u.user) return []
      const { data, error } = await supabase
        .from('atlas_project_members')
        .select('role,is_favorite,last_opened_at,project:atlas_projects(*)')
        .eq('user_id', u.user.id)
      if (error) throw error
      return (data as unknown as { role: Role; is_favorite: boolean; last_opened_at: string | null; project: Project }[])
        .filter((r) => r.project)
        .map((r) => ({ ...r.project, role: r.role, is_favorite: r.is_favorite, last_opened_at: r.last_opened_at }))
    },
  })
}

export function useProjectQuery(pid: string | undefined) {
  return useQuery({
    queryKey: qk.project(pid ?? ''),
    enabled: !!pid,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser()
      const [{ data: project, error }, { data: member }] = await Promise.all([
        supabase.from('atlas_projects').select('*').eq('id', pid!).maybeSingle(),
        supabase.from('atlas_project_members').select('role').eq('project_id', pid!).eq('user_id', u.user?.id ?? '').maybeSingle(),
      ])
      if (error) throw error
      if (!project) return null
      return { project: project as Project, role: (member?.role ?? 'viewer') as Role }
    },
  })
}

export function useBranchesQuery(pid: string | undefined) {
  return useQuery({
    queryKey: qk.branches(pid ?? ''),
    enabled: !!pid,
    queryFn: async () => (await fetchAll('atlas_branches', { projectId: pid!, order: 'created_at' })) as Branch[],
  })
}

export function useEntitiesQuery(pid: string | undefined) {
  return useQuery({
    queryKey: qk.entities(pid ?? ''),
    enabled: !!pid,
    queryFn: async () => (await fetchAll('atlas_entities', { projectId: pid!, select: ENTITY_COLUMNS, order: 'name' })) as Entity[],
  })
}

export function useHiddenQuery(pid: string | undefined) {
  return useQuery({
    queryKey: qk.hidden(pid ?? ''),
    enabled: !!pid,
    queryFn: async () =>
      (await fetchAll('atlas_entity_branch_hidden', { projectId: pid!, select: 'branch_id,entity_id', order: 'entity_id' })) as {
        branch_id: string
        entity_id: string
      }[],
  })
}

/** Any project table (non-temporal), optionally filtered. */
export function useTable<T = AnyRow>(table: string, filters?: Record<string, unknown>, order = 'id') {
  const { projectId } = useWorld()
  return useQuery({
    queryKey: qk.table(table, projectId, filters ?? null),
    queryFn: async () => (await fetchAll(table, { projectId, eq: filters, order })) as T[],
  })
}

/** Temporal table rows resolved for the current world line (copy-on-write aware). */
export function useTemporal<T extends TemporalRow = TemporalRow & AnyRow>(table: TemporalTable, filters?: Record<string, unknown>) {
  const { projectId, chain } = useWorld()
  const ids = chainIds(chain)
  const key = ids.join(',') + JSON.stringify(filters ?? {})
  const q = useQuery({
    queryKey: qk.temporal(table, projectId, key),
    enabled: ids.length > 0,
    queryFn: async () => (await fetchAll(table, { projectId, eq: filters, in: { branch_id: ids }, order: 'valid_from' })) as T[],
  })
  const visible = useMemo(() => (q.data ? visibleRows(q.data, chain) : []), [q.data, chain])
  return { ...q, rows: q.data ?? [], visible }
}

/** Subtype row of one entity (atlas_countries etc). */
export function useSubtype<T = AnyRow>(table: string | null, id: string | undefined) {
  return useQuery({
    queryKey: qk.subtype(table ?? 'none', id ?? ''),
    enabled: !!table && !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from(table!).select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data as T | null
    },
  })
}

export function useBacklinks(id: string | undefined) {
  const { projectId } = useWorld()
  return useQuery({
    queryKey: qk.backlinks(projectId, id ?? ''),
    enabled: !!id,
    queryFn: () => rpc<{ table_name: string; column_name: string; row_data: AnyRow }[]>('atlas_entity_backlinks', { p_project: projectId, p_entity: id }),
  })
}

export function useIdeologies() {
  return useTable<Ideology>('atlas_ideologies', undefined, 'sort_order')
}

/** Invalidate everything for the current project after bulk changes. */
export function useInvalidateProject() {
  const qc = useQueryClient()
  const { projectId } = useWorld()
  return () => {
    qc.invalidateQueries({ predicate: (q) => (q.queryKey as unknown[]).includes(projectId) })
    qc.invalidateQueries({ queryKey: ['subtype'] })
    qc.invalidateQueries({ queryKey: ['backlinks'] })
  }
}

export function useInvalidateTable() {
  const qc = useQueryClient()
  const { projectId } = useWorld()
  return (...tables: string[]) => {
    for (const t of tables) {
      if (t === 'atlas_entities') qc.invalidateQueries({ queryKey: qk.entities(projectId) })
      else if (t === 'atlas_branches') qc.invalidateQueries({ queryKey: qk.branches(projectId) })
      else if (t === 'atlas_entity_branch_hidden') qc.invalidateQueries({ queryKey: qk.hidden(projectId) })
      else qc.invalidateQueries({ queryKey: ['table', t, projectId] })
      // single-row caches of the same table (detail pages)
      qc.invalidateQueries({ queryKey: ['subtype', t] })
    }
    qc.invalidateQueries({ queryKey: ['backlinks', projectId] })
  }
}

export function useWorldMutation<A>(fn: (a: A) => Promise<unknown>, tables: string[]) {
  const invalidate = useInvalidateTable()
  return useMutation({ mutationFn: fn, onSuccess: () => invalidate(...tables) })
}

/** Derived helper: visible entities in branch. */
export function computeVisibleEntities(
  entities: Entity[], branches: Branch[], branchId: string | null, hides: { branch_id: string; entity_id: string }[],
) {
  const chain = branchChain(branches, branchId)
  const hidden = hiddenSet(hides, chain)
  return { chain, hidden, visible: entities.filter((e) => entityInBranch(e, chain, hidden)) }
}
