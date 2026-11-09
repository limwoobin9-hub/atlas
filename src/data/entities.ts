import { supabase } from '@/lib/supabase'
import { uuid } from '@/lib/utils'
import { KINDS } from '@/domain/kinds'
import { DbError, deleteRow, insertRow } from './db'
import type { AnyRow, Entity, EntityKind } from './types'

export interface CreateEntityInput {
  projectId: string
  kind: EntityKind
  name: string
  originBranchId: string | null
  base?: Partial<Entity>
  sub?: AnyRow
}

/** Create an entity in the registry plus its typed subtype row. Rolls back the registry row on failure. */
export async function createEntity(input: CreateEntityInput): Promise<Entity> {
  const id = uuid()
  const name = input.name.trim()
  if (!name) throw new DbError('이름을 입력하세요.')
  const entity = await insertRow<Entity>('atlas_entities', {
    status: 'tentative', ...input.base, id, project_id: input.projectId, kind: input.kind, name, origin_branch_id: input.originBranchId,
  })
  const table = KINDS[input.kind].table
  if (table) {
    const { error } = await supabase.from(table).insert({ ...(input.sub ?? {}), id, project_id: input.projectId })
    if (error) {
      await deleteRow('atlas_entities', id).catch(() => {})
      throw new DbError(error.message, error.code)
    }
  }
  return entity
}

export async function deleteEntity(id: string): Promise<void> {
  await deleteRow('atlas_entities', id)
}

/** Duplicate an entity's registry + subtype row (temporal facts are not copied). */
export async function duplicateEntity(e: Entity, originBranchId: string | null): Promise<Entity> {
  const table = KINDS[e.kind].table
  let sub: AnyRow | undefined
  if (table) {
    const { data } = await supabase.from(table).select('*').eq('id', e.id).maybeSingle()
    if (data) {
      const copy: AnyRow = { ...data }
      for (const k of ['id', 'project_id', 'created_at', 'updated_at', 'created_by', 'updated_by']) delete copy[k]
      sub = copy
    }
  }
  const { data: full } = await supabase.from('atlas_entities').select('*').eq('id', e.id).single()
  const base: AnyRow = { ...(full ?? e) }
  for (const k of ['id', 'project_id', 'kind', 'name', 'origin_branch_id', 'created_at', 'updated_at', 'created_by', 'updated_by']) delete base[k]
  return createEntity({ projectId: e.project_id, kind: e.kind, name: `${e.name} (사본)`, originBranchId, base: base as Partial<Entity>, sub })
}
