import { useQuery } from '@tanstack/react-query'
import { ImageIcon, PanelRightOpen } from 'lucide-react'
import type { MouseEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/misc'
import { signedUrl } from '@/data/db'
import type { Entity, EntityKind } from '@/data/types'
import { useWorld } from '@/data/world'
import { KINDS, STATUS } from '@/domain/kinds'
import { cn } from '@/lib/utils'
import { useSession } from '@/stores/session'
import { KindIcon } from './KindIcon'

export function entityHref(projectId: string, e: { id: string; kind: EntityKind }) {
  return `/p/${projectId}/${KINDS[e.kind].route}/${e.id}`
}

export function StatusBadge({ status }: { status: Entity['status'] }) {
  const s = STATUS[status]
  return <Badge tone={s.tone}>{s.label}</Badge>
}

/** Link to an entity; shift/alt-click or the panel icon opens the quick panel. */
export function EntityLink({ id, fallback, className, showIcon = true, children }: { id: string | null | undefined; fallback?: ReactNode; className?: string; showIcon?: boolean; children?: ReactNode }) {
  const { entityMap, projectId, allEntities } = useWorld()
  const openPanel = useSession((s) => s.openPanel)
  if (!id) return <span className="text-subtle">{fallback ?? '—'}</span>
  const e = entityMap.get(id) ?? allEntities.find((x) => x.id === id)
  if (!e) return <span className="text-subtle line-through" title="삭제되었거나 이 세계선에 없는 항목">{fallback ?? '알 수 없음'}</span>
  const onClick = (ev: MouseEvent) => {
    if (ev.shiftKey || ev.altKey) { ev.preventDefault(); openPanel(e.id) }
  }
  return (
    <span className={cn('group/el inline-flex max-w-full items-center gap-1 align-middle', className)}>
      <Link to={entityHref(projectId, e)} onClick={onClick} className="inline-flex min-w-0 items-center gap-1 rounded text-fg hover:text-accent hover:underline">
        {showIcon && <EntityAvatar entity={e} size={16} />}
        <span className="truncate">{children ?? e.name}</span>
      </Link>
      <button type="button" onClick={() => openPanel(e.id)} className="hidden text-subtle hover:text-accent group-hover/el:inline-flex" aria-label="빠른 보기">
        <PanelRightOpen className="size-3" />
      </button>
    </span>
  )
}

export function useSignedUrl(path: string | null | undefined) {
  return useQuery({ queryKey: ['signed', path], enabled: !!path, staleTime: 40 * 60 * 1000, queryFn: () => signedUrl(path) })
}

export function StorageImage({ path, className, alt = '', fallback, style }: { path: string | null | undefined; className?: string; alt?: string; fallback?: ReactNode; style?: React.CSSProperties }) {
  const url = useSignedUrl(path)
  if (!path) return <>{fallback ?? null}</>
  if (!url.data) return <span style={style} className={cn('flex items-center justify-center bg-surface-2 text-subtle', className)}><ImageIcon className="size-4" /></span>
  return <img src={url.data} alt={alt} className={className} style={style} loading="lazy" />
}

export function EntityAvatar({ entity, size = 20, path }: { entity: Pick<Entity, 'kind' | 'color' | 'image_path' | 'name'>; size?: number; path?: string | null }) {
  const p = path ?? entity.image_path
  if (p) return <StorageImage path={p} style={{ width: size, height: size }} className="shrink-0 rounded-sm border border-black/10 object-cover" alt={entity.name} />
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-sm" style={{ width: size, height: size, background: (entity.color ?? KINDS[entity.kind].color) + '22', color: entity.color ?? KINDS[entity.kind].color }}>
      <KindIcon kind={entity.kind} className="size-[70%]" />
    </span>
  )
}
