/**
 * WorldContext: the single source for "which project, which world line, which date"
 * plus the cached entity registry. Every feature reads time/branch from here.
 */
import { createContext, useContext } from 'react'
import type { ChainLink } from '@/domain/timeline'
import type { Branch, Entity, Project, Role } from './types'

export interface World {
  projectId: string
  project: Project
  role: Role
  canEdit: boolean
  isOwner: boolean
  branches: Branch[]
  branchId: string
  branch: Branch
  chain: ChainLink[]
  date: string
  setDate: (d: string) => void
  setBranch: (id: string) => void
  /** all entities of the project (every world line) */
  allEntities: Entity[]
  /** entities that belong to the current world line */
  entities: Entity[]
  entityMap: Map<string, Entity>
  hidden: Set<string>
}

export const WorldContext = createContext<World | null>(null)

export function useWorld(): World {
  const w = useContext(WorldContext)
  if (!w) throw new Error('useWorld must be used inside a project')
  return w
}

export function useOptionalWorld(): World | null {
  return useContext(WorldContext)
}
