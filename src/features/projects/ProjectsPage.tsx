import { useQueryClient } from '@tanstack/react-query'
import { Copy, FolderOpen, MoreHorizontal, Pencil, Plus, Search, Star, Trash2, Upload, UserRound } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, useConfirm } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/menu'
import { Badge, Empty, Loading, Switch } from '@/components/ui/misc'
import { duplicateProject, importBackup, readBackupFile } from '@/data/backup'
import { qk, rpc } from '@/data/db'
import { useProjects } from '@/data/hooks'
import type { ProjectListItem } from '@/data/types'
import { validateBackup } from '@/domain/backup'
import { formatDate, isValidDate } from '@/domain/dates'
import { friendlyError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { Logo } from '@/features/shell/Logo'
import { ThemeToggle } from '@/features/shell/ThemeToggle'
import { useAuth } from '@/features/auth/AuthProvider'

const ROLE_LABEL = { owner: '소유자', editor: '편집자', viewer: '열람자' } as const

export function ProjectsPage() {
  const { user } = useAuth()
  const projects = useProjects()
  const qc = useQueryClient()
  const nav = useNavigate()
  const confirm = useConfirm()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'favorite' | 'recent'>('all')
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<ProjectListItem | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const list = useMemo(() => {
    let items = projects.data ?? []
    if (q.trim()) {
      const s = q.trim().toLowerCase()
      items = items.filter((p) => p.name.toLowerCase().includes(s) || p.description.toLowerCase().includes(s))
    }
    if (filter === 'favorite') items = items.filter((p) => p.is_favorite)
    return [...items].sort((a, b) => {
      if (filter !== 'recent' && a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1
      return (b.last_opened_at ?? b.updated_at).localeCompare(a.last_opened_at ?? a.updated_at)
    })
  }, [projects.data, q, filter])

  const refresh = () => qc.invalidateQueries({ queryKey: qk.projects })

  const toggleFavorite = async (p: ProjectListItem) => {
    try {
      await rpc('atlas_touch_project', { p_project: p.id, p_favorite: !p.is_favorite })
      refresh()
    } catch (e) { toast.error(friendlyError(e)) }
  }

  const remove = async (p: ProjectListItem) => {
    const ok = await confirm({ title: `"${p.name}" 프로젝트를 삭제할까요?`, description: '모든 세계선, 지도, 자료와 데이터가 영구 삭제됩니다. 먼저 백업을 내려받는 것을 권장합니다.', confirmLabel: '영구 삭제', danger: true })
    if (!ok) return
    const { data: files } = await supabase.from('atlas_assets').select('storage_path').eq('project_id', p.id)
    const { error } = await supabase.from('atlas_projects').delete().eq('id', p.id)
    if (error) return toast.error(friendlyError(error))
    if (files?.length) await supabase.storage.from('atlas-assets').remove(files.map((f) => f.storage_path))
    toast.success('프로젝트를 삭제했습니다.')
    refresh()
  }

  const duplicate = async (p: ProjectListItem) => {
    setBusy('복제 준비 중…')
    try {
      const id = await duplicateProject(p.id, `${p.name} (사본)`, setBusy)
      toast.success('프로젝트를 복제했습니다.')
      refresh()
      nav(`/p/${id}`)
    } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(null) }
  }

  const onImportFile = async (f: File) => {
    setBusy('백업 파일을 확인하는 중…')
    try {
      const parsed = await readBackupFile(f)
      const v = validateBackup(parsed.backup)
      if (!v.ok) throw new Error(v.errors.join(' '))
      const total = Object.values(v.counts).reduce((a, b) => a + b, 0)
      const ok = await confirm({ title: '백업에서 새 프로젝트 만들기', description: <>"{String(parsed.backup.project.name)}" ({total.toLocaleString()}개 행)를 새 프로젝트로 가져옵니다. 기존 프로젝트는 덮어쓰지 않습니다.{v.warnings.length > 0 && <span className="mt-2 block text-warning">{v.warnings.slice(0, 3).join(' / ')}</span>}</>, confirmLabel: '가져오기' })
      if (!ok) return
      const id = await importBackup(parsed, {}, setBusy)
      toast.success('백업을 새 프로젝트로 가져왔습니다.')
      refresh()
      nav(`/p/${id}`)
    } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(null) }
  }

  return (
    <div className="min-h-full bg-bg">
      <header className="sticky top-0 z-10 flex h-12 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur">
        <Logo size={24} withText />
        <div className="flex-1" />
        <ThemeToggle />
        <Button variant="subtle" size="sm" asChild><Link to="/account"><UserRound />{user?.email}</Link></Button>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-semibold">세계관 프로젝트</h1>
            <p className="mt-0.5 text-[12.5px] text-muted">하나의 프로젝트가 하나의 세계관입니다. 세계선 분기는 프로젝트 안에서 관리합니다.</p>
          </div>
          <input ref={fileRef} type="file" accept=".json,.zip,application/json,application/zip" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onImportFile(f) }} />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}><Upload />백업 가져오기</Button>
          <Button onClick={() => setCreating(true)}><Plus />새 프로젝트</Button>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative w-72">
            <Search className="absolute left-2.5 top-2 size-4 text-subtle" />
            <Input placeholder="프로젝트 검색" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
          </div>
          <div className="flex rounded-md border border-border bg-surface p-0.5">
            {(['all', 'favorite', 'recent'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={cn('rounded px-2.5 py-1 text-[12px] text-muted', filter === f && 'bg-surface-2 text-fg font-medium')}>
                {f === 'all' ? '전체' : f === 'favorite' ? '즐겨찾기' : '최근 연 순'}
              </button>
            ))}
          </div>
        </div>
        {busy && <div className="mb-4 rounded-md border border-border bg-accent-soft px-3 py-2 text-[12.5px] text-accent">{busy}</div>}
        {projects.isLoading ? <Loading /> : projects.error ? (
          <Empty title="프로젝트를 불러오지 못했습니다" description={friendlyError(projects.error)} action={<Button variant="secondary" onClick={() => projects.refetch()}>다시 시도</Button>} />
        ) : list.length === 0 ? (
          <Empty icon={<FolderOpen />} title={q || filter !== 'all' ? '조건에 맞는 프로젝트가 없습니다' : '아직 프로젝트가 없습니다'}
            description="새 프로젝트를 만들면 기본 세계선과 1936년 1월 1일 기준 날짜가 설정됩니다."
            action={<Button onClick={() => setCreating(true)}><Plus />새 프로젝트</Button>} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((p) => (
              <div key={p.id} className="group relative flex flex-col rounded-xl border border-border bg-surface transition-shadow hover:shadow-md">
                <Link to={`/p/${p.id}`} className="flex flex-1 flex-col gap-2 p-4" data-testid="project-card">
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft text-[13px] font-bold text-accent">{p.name.slice(0, 1)}</span>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-[14px] font-semibold">{p.name}</h2>
                      <p className="text-[11.5px] text-subtle">기준일 {formatDate(p.default_date)}</p>
                    </div>
                  </div>
                  <p className="line-clamp-2 min-h-[2.4em] text-[12.5px] text-muted">{p.description || '설명 없음'}</p>
                  <div className="flex items-center gap-1.5">
                    <Badge tone={p.role === 'owner' ? 'accent' : 'default'}>{ROLE_LABEL[p.role]}</Badge>
                    <span className="text-[11px] text-subtle">수정 {new Date(p.updated_at).toLocaleDateString('ko-KR')}</span>
                  </div>
                </Link>
                <div className="absolute right-2 top-2 flex items-center gap-0.5">
                  <Button variant="subtle" size="icon-xs" aria-label="즐겨찾기" onClick={() => toggleFavorite(p)}>
                    <Star className={cn(p.is_favorite && 'fill-amber-400 text-amber-400')} />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="subtle" size="icon-xs" aria-label="메뉴"><MoreHorizontal /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem icon={<Pencil />} disabled={p.role === 'viewer'} onSelect={() => setRenaming(p)}>이름·설명 변경</DropdownMenuItem>
                      <DropdownMenuItem icon={<Copy />} onSelect={() => duplicate(p)}>복제</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem icon={<Trash2 />} danger disabled={p.role !== 'owner'} onSelect={() => remove(p)}>삭제</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <CreateProjectDialog open={creating} onOpenChange={setCreating} onCreated={(id) => { refresh(); nav(`/p/${id}`) }} />
      {renaming && <RenameDialog project={renaming} onClose={() => setRenaming(null)} onSaved={refresh} />}
    </div>
  )
}

function CreateProjectDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [date, setDate] = useState('1936-01-01')
  const [seed, setSeed] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="새 세계관 프로젝트" description="기본 세계선이 함께 생성됩니다."
        footer={<>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>취소</Button>
          <Button disabled={busy} form="create-project" type="submit">{busy ? '생성 중…' : '만들기'}</Button>
        </>}>
        <form id="create-project" className="flex flex-col gap-3" onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim()) return setErr('이름을 입력하세요.')
          if (!isValidDate(date)) return setErr('기본 날짜 형식이 올바르지 않습니다.')
          setBusy(true)
          try {
            const id = await rpc<string>('atlas_create_project', { p_name: name.trim(), p_description: desc, p_default_date: date, p_seed_ideologies: seed })
            toast.success('프로젝트를 만들었습니다.')
            onOpenChange(false)
            setName(''); setDesc('')
            onCreated(id)
          } catch (e2) { setErr(friendlyError(e2)) } finally { setBusy(false) }
        }}>
          <Field label="프로젝트 이름" error={err}><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="예: 1936 대체역사 세계관" /></Field>
          <Field label="설명"><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={5000} /></Field>
          <Field label="기본 날짜" hint="날짜 선택기의 시작점입니다. 언제든 바꿀 수 있습니다."><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
            <span>
              <span className="block text-[12.5px] font-medium">기본 정치 이념 팔레트 추가</span>
              <span className="block text-[11.5px] text-subtle">공산주의~국수주의 11개 이념과 색상. 이후 자유롭게 수정·삭제할 수 있습니다.</span>
            </span>
            <Switch checked={seed} onCheckedChange={setSeed} />
          </label>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RenameDialog({ project, onClose, onSaved }: { project: ProjectListItem; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(project.name)
  const [desc, setDesc] = useState(project.description)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="프로젝트 이름·설명 변경" footer={<>
        <Button variant="secondary" onClick={onClose}>취소</Button>
        <Button onClick={async () => {
          if (!name.trim()) return toast.error('이름을 입력하세요.')
          const { error } = await supabase.from('atlas_projects').update({ name: name.trim(), description: desc }).eq('id', project.id)
          if (error) return toast.error(friendlyError(error))
          toast.success('저장했습니다.')
          onSaved(); onClose()
        }}>저장</Button>
      </>}>
        <div className="flex flex-col gap-3">
          <Field label="이름"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Field>
          <Field label="설명"><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
        </div>
      </DialogContent>
    </Dialog>
  )
}
