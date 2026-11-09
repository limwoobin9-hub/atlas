import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Download, Flag, Settings, Trash2, UserPlus, Users } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Badge, Card, CardHeader, Loading } from '@/components/ui/misc'
import { downloadJsonBackup, downloadZipBackup } from '@/data/backup'
import { deleteWhere, qk, rpc, updateRow } from '@/data/db'
import { useTable } from '@/data/hooks'
import type { AtlasMap, ProjectSettings, Role } from '@/data/types'
import { useWorld } from '@/data/world'
import { formatDate, isValidDate } from '@/domain/dates'
import { friendlyError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { PageHeader } from '@/features/entities/EntityListPage'
import { ImageInput } from '@/features/entities/FieldInput'

const ROLE: Record<Role, string> = { owner: '소유자', editor: '편집자', viewer: '열람자' }

export function SettingsPage() {
  const { project, canEdit, isOwner, projectId } = useWorld()
  const qc = useQueryClient()
  const nav = useNavigate()
  const confirm = useConfirm()
  const maps = useTable<AtlasMap>('atlas_maps', undefined, 'sort_order')
  const [name, setName] = useState(project.name)
  const [desc, setDesc] = useState(project.description)
  const [defDate, setDefDate] = useState(project.default_date)
  const [busy, setBusy] = useState<string | null>(null)
  const settings: ProjectSettings = project.settings ?? {}
  const [milestone, setMilestone] = useState({ date: '', label: '' })

  const save = async (patch: Record<string, unknown>) => {
    try { await updateRow('atlas_projects', projectId, patch); qc.invalidateQueries({ queryKey: qk.project(projectId) }); qc.invalidateQueries({ queryKey: qk.projects }); toast.success('저장했습니다.') } catch (e) { toast.error(friendlyError(e)) }
  }

  return (
    <div className="flex flex-col">
      <PageHeader title="프로젝트 설정" icon={<Settings />} />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-5">
        <Card>
          <CardHeader title="기본 정보" />
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
            <Field label="프로젝트 이름"><Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} /></Field>
            <Field label="기본 날짜" hint="날짜 선택기의 '기본 날짜' 버튼이 이동하는 날짜"><Input type="date" value={defDate} onChange={(e) => setDefDate(e.target.value)} disabled={!canEdit} /></Field>
            <Field label="설명" className="sm:col-span-2"><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} disabled={!canEdit} /></Field>
            <Field label="기본 지도"><Select value={project.default_map_id ?? ''} onChange={(e) => save({ default_map_id: e.target.value || null })} disabled={!canEdit}><option value="">—</option>{(maps.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
            <Field label="대표 이미지"><ImageInput value={project.cover_path} onChange={(v) => save({ cover_path: v })} disabled={!canEdit} /></Field>
            {canEdit && <div className="sm:col-span-2"><Button onClick={() => { if (!name.trim()) return toast.error('이름을 입력하세요.'); if (!isValidDate(defDate)) return toast.error('날짜가 올바르지 않습니다.'); save({ name: name.trim(), description: desc, default_date: defDate }) }}>저장</Button></div>}
          </div>
        </Card>

        <Card>
          <CardHeader title="주요 역사 날짜" icon={<Flag />} sub="날짜 선택기의 빠른 이동 목록 (사건의 '주요 역사 날짜' 표시와 함께 표시)" />
          <ul className="divide-y divide-border">
            {(settings.milestones ?? []).map((m, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-1.5 text-[12.5px]"><span className="w-28 tabular-nums text-muted">{formatDate(m.date, 'short')}</span><span className="flex-1">{m.label}</span>
                {canEdit && <Button size="icon-xs" variant="subtle" aria-label="삭제" onClick={() => save({ settings: { ...settings, milestones: settings.milestones!.filter((_, j) => j !== i) } })}><Trash2 /></Button>}</li>
            ))}
          </ul>
          {canEdit && <div className="flex gap-2 border-t border-border p-3">
            <Input type="date" className="w-40" value={milestone.date} onChange={(e) => setMilestone({ ...milestone, date: e.target.value })} />
            <Input placeholder="이름 (예: 전쟁 발발)" value={milestone.label} onChange={(e) => setMilestone({ ...milestone, label: e.target.value })} />
            <Button variant="secondary" onClick={() => { if (!isValidDate(milestone.date) || !milestone.label.trim()) return toast.error('날짜와 이름을 입력하세요.'); save({ settings: { ...settings, milestones: [...(settings.milestones ?? []), { date: milestone.date, label: milestone.label.trim() }].sort((a, b) => a.date.localeCompare(b.date)) } }); setMilestone({ date: '', label: '' }) }}>추가</Button>
          </div>}
        </Card>

        <Members />

        <Card>
          <CardHeader title="백업 및 복구" icon={<Archive />} sub="복구는 프로젝트 목록의 '백업 가져오기'로 새 프로젝트를 만듭니다 (기존 프로젝트를 덮어쓰지 않음)" />
          <div className="flex flex-wrap items-center gap-2 p-4">
            <Button variant="secondary" disabled={!!busy} onClick={async () => { setBusy('JSON 생성 중…'); try { await downloadJsonBackup(projectId); toast.success('JSON 백업을 내려받았습니다.') } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(null) } }} data-testid="export-json"><Download />JSON 내보내기</Button>
            <Button variant="secondary" disabled={!!busy} onClick={async () => { setBusy('ZIP 생성 중…'); try { await downloadZipBackup(projectId, setBusy); toast.success('ZIP 백업(파일 포함)을 내려받았습니다.') } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(null) } }}><Archive />ZIP 백업 (자료 파일 포함)</Button>
            {busy && <span className="text-[12px] text-muted">{busy}</span>}
          </div>
        </Card>

        {isOwner && (
          <Card className="border-danger/40">
            <CardHeader title="위험 구역" />
            <div className="flex items-center justify-between gap-3 p-4">
              <p className="text-[12.5px] text-muted">프로젝트와 모든 세계선·데이터·자료 파일을 영구 삭제합니다. 소유자만 가능합니다.</p>
              <Button variant="danger" onClick={async () => {
                if (!(await confirm({ title: `"${project.name}" 프로젝트를 삭제할까요?`, description: '되돌릴 수 없습니다. 먼저 백업을 내려받으세요.', danger: true, confirmLabel: '영구 삭제' }))) return
                const { data: files } = await supabase.from('atlas_assets').select('storage_path').eq('project_id', projectId)
                const { error } = await supabase.from('atlas_projects').delete().eq('id', projectId)
                if (error) return toast.error(friendlyError(error))
                if (files?.length) await supabase.storage.from('atlas-assets').remove(files.map((f) => f.storage_path))
                qc.invalidateQueries({ queryKey: qk.projects })
                toast.success('삭제했습니다.')
                nav('/projects')
              }}><Trash2 />프로젝트 삭제</Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

function Members() {
  const { projectId, isOwner } = useWorld()
  const { user } = useAuth()
  const confirm = useConfirm()
  const nav = useNavigate()
  const members = useQuery({ queryKey: ['members', projectId], queryFn: () => rpc<{ user_id: string; role: Role; email: string; display_name: string }[]>('atlas_list_members', { p_project: projectId }) })
  const invites = useQuery({ queryKey: ['invites', projectId], enabled: isOwner, queryFn: async () => { const { data, error } = await supabase.from('atlas_project_invites').select('*').eq('project_id', projectId); if (error) throw error; return data as { id: string; email: string; role: Role }[] } })
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('editor')
  const refresh = () => { members.refetch(); invites.refetch() }
  return (
    <Card>
      <CardHeader title="멤버와 권한" icon={<Users />} sub="소유자: 전체 권한·삭제·멤버 관리 / 편집자: 세계관 편집 / 열람자: 읽기 전용 — 데이터베이스(RLS)에서 강제됩니다" />
      {members.isLoading ? <Loading /> : (
        <ul className="divide-y divide-border">
          {(members.data ?? []).map((m) => (
            <li key={m.user_id} className="flex items-center gap-3 px-4 py-2 text-[12.5px]" data-testid="member-row">
              <div className="min-w-0 flex-1"><p className="font-medium">{m.display_name || m.email}</p><p className="text-[11.5px] text-muted">{m.email}</p></div>
              {m.user_id === user?.id && <Badge>나</Badge>}
              {isOwner ? (
                <Select className="w-28" value={m.role} onChange={async (e) => { const { error } = await supabase.from('atlas_project_members').update({ role: e.target.value }).eq('project_id', projectId).eq('user_id', m.user_id); if (error) toast.error(friendlyError(error)); else { toast.success('권한을 변경했습니다.'); refresh() } }}>
                  {Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              ) : <Badge>{ROLE[m.role]}</Badge>}
              {(isOwner || m.user_id === user?.id) && (
                <Button size="icon-xs" variant="subtle" aria-label={m.user_id === user?.id ? '프로젝트 나가기' : '제거'} onClick={async () => {
                  if (!(await confirm({ title: m.user_id === user?.id ? '이 프로젝트에서 나갈까요?' : `${m.email}을(를) 제거할까요?`, danger: true }))) return
                  const { error } = await supabase.from('atlas_project_members').delete().eq('project_id', projectId).eq('user_id', m.user_id)
                  if (error) return toast.error(friendlyError(error))
                  if (m.user_id === user?.id) nav('/projects'); else refresh()
                }}><Trash2 /></Button>
              )}
            </li>
          ))}
          {(invites.data ?? []).map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-4 py-2 text-[12.5px] text-muted">
              <span className="flex-1">{i.email} <Badge tone="warning">가입 대기 초대</Badge></span><Badge>{ROLE[i.role]}</Badge>
              <Button size="icon-xs" variant="subtle" aria-label="초대 취소" onClick={async () => { try { await deleteWhere('atlas_project_invites', { id: i.id }); refresh() } catch (e) { toast.error(friendlyError(e)) } }}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      )}
      {isOwner && (
        <form className="flex gap-2 border-t border-border p-3" onSubmit={async (e) => {
          e.preventDefault()
          if (!/^\S+@\S+\.\S+$/.test(email.trim())) return toast.error('올바른 이메일을 입력하세요.')
          try {
            const r = await rpc<string>('atlas_invite_member', { p_project: projectId, p_email: email.trim(), p_role: role })
            toast.success(r === 'added' ? '멤버로 추가했습니다.' : '초대를 등록했습니다. 해당 이메일로 가입·로그인하면 자동으로 참여합니다.')
            setEmail('')
            refresh()
          } catch (err) { toast.error(friendlyError(err)) }
        }}>
          <Input type="email" placeholder="초대할 이메일" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="invite-email" />
          <Select className="w-28" value={role} onChange={(e) => setRole(e.target.value as Role)}>{Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <Button type="submit"><UserPlus />초대</Button>
        </form>
      )}
    </Card>
  )
}
