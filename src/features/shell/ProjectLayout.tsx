import { useEffect, useMemo, useState } from 'react'
import { Link, Outlet, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Empty, Loading } from '@/components/ui/misc'
import { rpc } from '@/data/db'
import { computeVisibleEntities, useBranchesQuery, useEntitiesQuery, useHiddenQuery, useProjectQuery } from '@/data/hooks'
import { WorldContext, type World } from '@/data/world'
import { isValidDate } from '@/domain/dates'
import { friendlyError } from '@/lib/errors'
import { useSession } from '@/stores/session'
import { CreateEntityDialog, useCreateDialog } from '@/features/entities/CreateEntityDialog'
import type { EntityKind } from '@/data/types'
import { CommandPalette } from './CommandPalette'
import { ErrorBoundary } from './ErrorBoundary'
import { RightPanel } from './RightPanel'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function ProjectLayout() {
  const { projectId = '' } = useParams()
  const pq = useProjectQuery(projectId)
  const bq = useBranchesQuery(projectId)
  const eq = useEntitiesQuery(projectId)
  const hq = useHiddenQuery(projectId)
  const view = useSession((s) => s.views[projectId])
  const setDateStore = useSession((s) => s.setDate)
  const setBranchStore = useSession((s) => s.setBranch)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const openCreate = useCreateDialog((s) => s.open)

  useEffect(() => { if (projectId) rpc('atlas_touch_project', { p_project: projectId }).catch(() => {}) }, [projectId])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((v) => !v) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const world = useMemo<World | null>(() => {
    if (!pq.data || !bq.data || !eq.data || !hq.data) return null
    const { project, role } = pq.data
    const branches = bq.data
    const main = branches.find((b) => b.is_main) ?? branches[0]
    if (!main) return null
    const branch = branches.find((b) => b.id === view?.branchId) ?? main
    const date = view?.date && isValidDate(view.date) ? view.date : project.default_date
    const { chain, hidden, visible } = computeVisibleEntities(eq.data, branches, branch.id, hq.data)
    return {
      projectId, project, role, canEdit: role !== 'viewer', isOwner: role === 'owner', branches, branchId: branch.id, branch, chain, date,
      setDate: (d) => setDateStore(projectId, d), setBranch: (id) => setBranchStore(projectId, id),
      allEntities: eq.data, entities: visible, entityMap: new Map(visible.map((e) => [e.id, e])), hidden,
    }
  }, [pq.data, bq.data, eq.data, hq.data, view, projectId, setDateStore, setBranchStore])

  const err = pq.error ?? bq.error ?? eq.error ?? hq.error
  if (err) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Empty title="프로젝트를 불러올 수 없습니다" description={friendlyError(err)}
          action={<div className="flex gap-2"><Button variant="secondary" onClick={() => { pq.refetch(); bq.refetch(); eq.refetch(); hq.refetch() }}>다시 시도</Button><Button asChild><Link to="/projects">프로젝트 목록</Link></Button></div>} />
      </div>
    )
  }
  if (pq.data === null) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Empty title="접근할 수 없는 프로젝트입니다" description="프로젝트가 삭제되었거나, 이 계정이 멤버로 초대되지 않았습니다." action={<Button asChild><Link to="/projects">프로젝트 목록</Link></Button>} />
      </div>
    )
  }
  if (!world) return <Loading label="세계관을 불러오는 중…" className="h-full" />

  return (
    <WorldContext.Provider value={world}>
      <div className="flex h-full flex-col">
        <Topbar onSearch={() => setPaletteOpen(true)} />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main className="relative min-w-0 flex-1 overflow-hidden" id="main">
            <ErrorBoundary key={projectId}>
              <div className="h-full overflow-y-auto"><Outlet /></div>
            </ErrorBoundary>
          </main>
          <RightPanel />
        </div>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onCreate={(k) => openCreate(k as EntityKind)} />
      <CreateEntityDialog />
    </WorldContext.Provider>
  )
}
