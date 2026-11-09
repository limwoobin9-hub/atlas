import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Copy, EyeOff, MoreHorizontal, PanelRightOpen, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/menu'
import { Badge, Empty } from '@/components/ui/misc'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/menu'
import { insertRow, qk } from '@/data/db'
import { deleteEntity, duplicateEntity } from '@/data/entities'
import { useBacklinks, useInvalidateTable } from '@/data/hooks'
import type { Entity } from '@/data/types'
import { useWorld } from '@/data/world'
import { formatRange } from '@/domain/dates'
import { KINDS } from '@/domain/kinds'
import { entityActiveAt } from '@/domain/timeline'
import { friendlyError } from '@/lib/errors'
import { useSession } from '@/stores/session'
import { EntityAvatar, StatusBadge, entityHref } from './common'
import { detailTabsFor } from './detailTabs'

export function EntityDetailPage({ kindRoute }: { kindRoute: string }) {
  const { entityId } = useParams()
  const { entityMap, allEntities, projectId, branch } = useWorld()
  const entity = entityMap.get(entityId ?? '')
  const otherLine = !entity ? allEntities.find((e) => e.id === entityId) : undefined
  if (!entity) {
    return (
      <div className="p-8">
        <Empty title={otherLine ? '이 세계선에 존재하지 않는 항목입니다' : '항목을 찾을 수 없습니다'}
          description={otherLine ? `"${otherLine.name}"은(는) 현재 세계선 "${branch.name}"에 없거나 숨겨져 있습니다. 세계선을 바꾸거나 세계선 관리에서 숨김을 해제하세요.` : '삭제되었거나 접근 권한이 없는 항목입니다.'}
          action={<Button variant="secondary" asChild><Link to={`/p/${projectId}/${kindRoute}`}>목록으로</Link></Button>} />
      </div>
    )
  }
  return <EntityDetail key={entity.id} entity={entity} />
}

function EntityDetail({ entity }: { entity: Entity }) {
  const { projectId, canEdit, date, branchId, branch, branches } = useWorld()
  const meta = KINDS[entity.kind]
  const nav = useNavigate()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const invalidate = useInvalidateTable()
  const openPanel = useSession((s) => s.openPanel)
  const backlinks = useBacklinks(entity.id)
  const tabs = detailTabsFor(entity)
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState(params.get('tab') ?? tabs[0].id)
  const active = entityActiveAt(entity, date)
  const origin = entity.origin_branch_id ? branches.find((b) => b.id === entity.origin_branch_id) : null

  const remove = async () => {
    const refs = (backlinks.data ?? []).length
    const ok = await confirm({
      title: `"${entity.name}"을(를) 삭제할까요?`,
      description: <>모든 세계선에서 삭제되며 이 항목의 시점별 기록도 함께 삭제됩니다.{refs > 0 && <> 이 항목을 참조하는 <b>{refs}개</b>의 연결은 자동으로 해제됩니다 (참조 무결성 유지).</>} 변경 기록에서 기본 정보는 복원할 수 있습니다.</>,
      danger: true, confirmLabel: '삭제',
    })
    if (!ok) return
    try {
      await deleteEntity(entity.id)
      qc.setQueryData<Entity[]>(qk.entities(projectId), (old) => old?.filter((e) => e.id !== entity.id))
      invalidate('atlas_entities')
      toast.success('삭제했습니다.')
      nav(`/p/${projectId}/${meta.route}`)
    } catch (e) { toast.error(friendlyError(e)) }
  }

  const hide = async () => {
    const ok = await confirm({ title: `현재 세계선 "${branch.name}"에서 숨길까요?`, description: '이 세계선(과 하위 분기)에서는 이 항목이 존재하지 않는 것으로 처리됩니다. 다른 세계선과 원본 데이터는 그대로 유지됩니다. 세계선 관리 화면에서 되돌릴 수 있습니다.', confirmLabel: '숨기기' })
    if (!ok) return
    try {
      await insertRow('atlas_entity_branch_hidden', { project_id: projectId, branch_id: branchId, entity_id: entity.id })
      invalidate('atlas_entity_branch_hidden')
      toast.success('현재 세계선에서 숨겼습니다.')
      nav(`/p/${projectId}/${meta.route}`)
    } catch (e) { toast.error(friendlyError(e)) }
  }

  const duplicate = async () => {
    try {
      const copy = await duplicateEntity(entity, entity.origin_branch_id)
      invalidate('atlas_entities')
      toast.success('복제했습니다.')
      nav(entityHref(projectId, copy))
    } catch (e) { toast.error(friendlyError(e)) }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border bg-surface px-5 pt-3">
        <div className="flex items-start gap-3">
          <Button variant="subtle" size="icon-sm" asChild aria-label="목록"><Link to={`/p/${projectId}/${meta.route}`}><ArrowLeft /></Link></Button>
          <EntityAvatar entity={entity} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[18px] font-semibold" data-testid="entity-title">{entity.name}</h1>
              <StatusBadge status={entity.status} />
              <Badge>{meta.label}</Badge>
              {!active && <Badge tone="muted">현재 날짜에 존재하지 않음</Badge>}
              {origin && !origin.is_main && <Badge tone="accent">{origin.name} 전용</Badge>}
            </div>
            <p className="mt-0.5 text-[12px] text-muted">{meta.startLabel}~{meta.endLabel}: {formatRange(entity.starts_on, entity.ends_on)}{entity.summary && <> · {entity.summary}</>}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => openPanel(entity.id)}><PanelRightOpen />빠른 보기</Button>
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="secondary" size="icon-sm" aria-label="더보기"><MoreHorizontal /></Button></DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem icon={<Copy />} onSelect={duplicate}>복제</DropdownMenuItem>
                <DropdownMenuItem icon={<EyeOff />} onSelect={hide}>현재 세계선에서 숨기기</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem icon={<Trash2 />} danger onSelect={remove}>삭제</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <Tabs value={tab} onValueChange={(v) => { setTab(v); setParams((p) => { p.set('tab', v); return p }, { replace: true }) }}>
          <TabsList className="mt-2 border-b-0">
            {tabs.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-bg">
        <Tabs value={tab}>
          {tabs.map((t) => (
            <TabsContent key={t.id} value={t.id} className="mx-auto flex max-w-6xl flex-col gap-4 p-5 outline-none">
              {t.render()}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  )
}
