import {
  Anchor, Archive, BookOpen, Building2, CalendarRange, ChevronDown, ChevronsLeft, ChevronsRight, Crown, FileText, Flag, GitBranch,
  Handshake, History, Landmark, LayoutDashboard, Map, MapPinned, Plane, Search, Settings, Shield, ShieldAlert, Swords, Users, Vote, Zap,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink, useParams } from 'react-router-dom'
import { Tooltip } from '@/components/ui/misc'
import { cn } from '@/lib/utils'
import { useSession } from '@/stores/session'

interface Item { to: string; label: string; icon: ReactNode; end?: boolean }
interface Group { id: string; label: string; items: Item[] }

export const NAV: Group[] = [
  { id: 'overview', label: '개요', items: [
    { to: '', label: '대시보드', icon: <LayoutDashboard />, end: true },
    { to: 'map', label: '세계 지도', icon: <Map /> },
    { to: 'timeline', label: '연표', icon: <CalendarRange /> },
  ] },
  { id: 'state', label: '국가·영토', items: [
    { to: 'countries', label: '국가', icon: <Flag /> },
    { to: 'regions', label: '지역·영토', icon: <MapPinned /> },
  ] },
  { id: 'politics', label: '정치', items: [
    { to: 'politics', label: '정치·정당', icon: <Landmark /> },
    { to: 'parliaments', label: '의회·선거', icon: <Vote /> },
  ] },
  { id: 'world', label: '외교·전쟁', items: [
    { to: 'diplomacy', label: '외교', icon: <Handshake /> },
    { to: 'wars', label: '전쟁', icon: <Swords /> },
    { to: 'treaties', label: '조약', icon: <FileText /> },
  ] },
  { id: 'military', label: '군사', items: [
    { to: 'military', label: '군대', icon: <Shield /> },
    { to: 'ships', label: '함대·함선', icon: <Anchor /> },
    { to: 'equipment', label: '항공기·장비', icon: <Plane /> },
  ] },
  { id: 'records', label: '기록', items: [
    { to: 'characters', label: '인물', icon: <Users /> },
    { to: 'events', label: '사건', icon: <Zap /> },
    { to: 'organizations', label: '단체', icon: <Building2 /> },
    { to: 'assets', label: '자료실', icon: <Archive /> },
  ] },
  { id: 'tools', label: '도구', items: [
    { to: 'search', label: '전체 검색', icon: <Search /> },
    { to: 'branches', label: '세계선', icon: <GitBranch /> },
    { to: 'conflicts', label: '설정 충돌', icon: <ShieldAlert /> },
    { to: 'history', label: '변경 기록', icon: <History /> },
    { to: 'settings', label: '프로젝트 설정', icon: <Settings /> },
  ] },
]

export function Sidebar() {
  const { projectId } = useParams()
  const collapsed = useSession((s) => s.sidebarCollapsed)
  const setCollapsed = useSession((s) => s.setSidebarCollapsed)
  const groups = useSession((s) => s.collapsedGroups)
  const toggle = useSession((s) => s.toggleGroup)

  return (
    <nav className={cn('flex shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-150', collapsed ? 'w-12' : 'w-52')} aria-label="주 메뉴">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-2">
        {NAV.map((g) => (
          <div key={g.id} className="mb-1 px-1.5">
            {!collapsed && (
              <button onClick={() => toggle(g.id)} className="flex w-full items-center gap-1 px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-subtle hover:text-muted">
                <ChevronDown className={cn('size-3 transition-transform', groups[g.id] && '-rotate-90')} />{g.label}
              </button>
            )}
            {(!groups[g.id] || collapsed) && g.items.map((it) => (
              <Tooltip key={it.to} content={collapsed ? it.label : null} side="right">
                <NavLink to={`/p/${projectId}/${it.to}`} end={it.end}
                  className={({ isActive }) => cn('flex h-7 items-center gap-2 rounded-md px-2 text-[12.5px] text-muted transition-colors hover:bg-surface-2 hover:text-fg [&_svg]:size-4 [&_svg]:shrink-0',
                    isActive && 'bg-accent-soft font-medium text-accent hover:bg-accent-soft hover:text-accent', collapsed && 'justify-center px-0')}>
                  {it.icon}{!collapsed && <span className="truncate">{it.label}</span>}
                </NavLink>
              </Tooltip>
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center border-t border-border p-1.5">
        {!collapsed && <span className="flex flex-1 items-center gap-1.5 px-1.5 text-[11px] text-subtle"><BookOpen className="size-3.5" /><Crown className="size-3.5" />ATLAS</span>}
        <button onClick={() => setCollapsed(!collapsed)} className="mx-auto flex size-7 items-center justify-center rounded-md text-muted hover:bg-surface-2" aria-label="사이드바 접기">
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
        </button>
      </div>
    </nav>
  )
}
