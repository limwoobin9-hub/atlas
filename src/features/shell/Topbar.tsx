import { Check, ChevronDown, GitBranch, LogOut, Search, Settings, UserRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/menu'
import { Badge, ColorDot, Kbd } from '@/components/ui/misc'
import { useWorld } from '@/data/world'
import { formatDate } from '@/domain/dates'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { DateControl } from './DateControl'
import { Logo } from './Logo'
import { SaveIndicator } from './SaveIndicator'
import { ThemeToggle } from './ThemeToggle'

const ROLE = { owner: '소유자', editor: '편집자', viewer: '열람 전용' } as const

export function Topbar({ onSearch }: { onSearch: () => void }) {
  const { project, branches, branch, setBranch, role } = useWorld()
  const { user } = useAuth()
  const nav = useNavigate()
  const depth = (id: string | null): number => {
    let d = 0
    let cur = branches.find((b) => b.id === id)
    while (cur?.parent_id && d < 20) { d++; cur = branches.find((b) => b.id === cur!.parent_id) }
    return d
  }
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-surface px-2.5">
      <Link to="/projects" className="flex items-center gap-2 pr-1" aria-label="프로젝트 목록"><Logo size={22} /></Link>
      <span className="max-w-48 truncate text-[13px] font-semibold" title={project.name}>{project.name}</span>
      {role === 'viewer' && <Badge tone="warning">{ROLE[role]}</Badge>}
      <span className="text-border-strong">/</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="max-w-56" data-testid="branch-select">
            <GitBranch style={{ color: branch.color }} /><span className="truncate">{branch.name}</span><ChevronDown className="text-subtle" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel>세계선 선택</DropdownMenuLabel>
          {[...branches].sort((a, b) => (a.is_main ? -1 : b.is_main ? 1 : a.created_at.localeCompare(b.created_at))).map((b) => (
            <DropdownMenuItem key={b.id} onSelect={() => setBranch(b.id)}>
              <span style={{ paddingLeft: depth(b.id) * 12 }} className="flex min-w-0 flex-1 items-center gap-2">
                <ColorDot color={b.color} /><span className="truncate">{b.name}</span>
                {b.fork_date && <span className="ml-auto text-[10.5px] text-subtle">{formatDate(b.fork_date, 'short')} 분기</span>}
              </span>
              {b.id === branch.id && <Check className="!text-accent" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={<GitBranch />} onSelect={() => nav(`/p/${project.id}/branches`)}>세계선 관리·비교</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="flex flex-1 justify-center"><DateControl /></div>
      <button onClick={onSearch} className="hidden h-7 w-56 items-center gap-2 rounded-md border border-border bg-surface-2 px-2 text-[12px] text-subtle hover:border-border-strong md:flex" data-testid="open-search">
        <Search className="size-3.5" /><span className="flex-1 text-left">전체 검색</span><Kbd>Ctrl K</Kbd>
      </button>
      <div className="hidden w-32 justify-end lg:flex"><SaveIndicator /></div>
      <ThemeToggle />
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="subtle" size="icon-sm" aria-label="사용자 메뉴"><UserRound /></Button></DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>{user?.email} · {ROLE[role]}</DropdownMenuLabel>
          <DropdownMenuItem icon={<UserRound />} onSelect={() => nav('/account')}>계정 설정</DropdownMenuItem>
          <DropdownMenuItem icon={<Settings />} onSelect={() => nav(`/p/${project.id}/settings`)}>프로젝트 설정</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={<LogOut />} onSelect={() => supabase.auth.signOut()}>로그아웃</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
