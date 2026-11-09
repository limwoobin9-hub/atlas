import { ExternalLink, X } from 'lucide-react'
import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge, Loading } from '@/components/ui/misc'
import { useBacklinks, useSubtype, useTemporal } from '@/data/hooks'
import type { AnyRow, CountryState, Entity, TerritoryControl, UnitState } from '@/data/types'
import { useWorld } from '@/data/world'
import { formatDate, formatRange } from '@/domain/dates'
import { CONTROL_STATUS, KINDS } from '@/domain/kinds'
import { entityActiveAt, rowAt } from '@/domain/timeline'
import { EntityAvatar, EntityLink, StatusBadge, StorageImage, entityHref } from '@/features/entities/common'
import { SUBTYPE_FIELDS } from '@/features/entities/fields'
import { useSession } from '@/stores/session'

/** Resizable quick-view panel. Its content scrolls independently so the main view keeps its position. */
export function RightPanel() {
  const panel = useSession((s) => s.panel)
  const close = useSession((s) => s.closePanel)
  const setWidth = useSession((s) => s.setPanelWidth)
  const { entityMap } = useWorld()
  const dragging = useRef(false)
  if (!panel.open || !panel.entityId) return null
  const e = entityMap.get(panel.entityId)

  return (
    <aside className="relative flex shrink-0 flex-col border-l border-border bg-surface" style={{ width: panel.width }} aria-label="빠른 보기">
      <div className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize hover:bg-accent/30"
        onPointerDown={(ev) => {
          dragging.current = true
          const startX = ev.clientX
          const startW = panel.width
          const move = (m: PointerEvent) => dragging.current && setWidth(startW + (startX - m.clientX))
          const up = () => { dragging.current = false; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
          window.addEventListener('pointermove', move)
          window.addEventListener('pointerup', up)
        }} />
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-[12px] font-medium text-muted">빠른 보기</span>
        <div className="flex-1" />
        <Button variant="subtle" size="icon-xs" onClick={close} aria-label="패널 닫기"><X /></Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {e ? <QuickView key={e.id} entity={e} /> : <p className="p-4 text-[12px] text-subtle">이 세계선에 없는 항목입니다.</p>}
      </div>
    </aside>
  )
}

function QuickView({ entity }: { entity: Entity }) {
  const { projectId, date } = useWorld()
  const meta = KINDS[entity.kind]
  const sub = useSubtype<AnyRow>(meta.table, entity.id)
  const backlinks = useBacklinks(entity.id)
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <EntityAvatar entity={entity} size={44} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold leading-tight">{entity.name}</h2>
          <div className="mt-1 flex flex-wrap gap-1"><Badge>{meta.label}</Badge><StatusBadge status={entity.status} />{!entityActiveAt(entity, date) && <Badge tone="muted">현재 미존재</Badge>}</div>
        </div>
      </div>
      <Button size="sm" variant="secondary" asChild><Link to={entityHref(projectId, entity)}><ExternalLink />상세 페이지로 이동</Link></Button>
      <p className="text-[12px] text-muted">{meta.startLabel}~{meta.endLabel}: {formatRange(entity.starts_on, entity.ends_on)}</p>
      {entity.summary && <p className="prose-atlas text-[12.5px]">{entity.summary}</p>}
      {entity.kind === 'country' && <CountryNow id={entity.id} />}
      {entity.kind === 'region' && <RegionNow id={entity.id} />}
      {entity.kind === 'unit' && <UnitNow id={entity.id} />}
      {sub.isLoading ? <Loading /> : sub.data && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-3 text-[12px]">
          {(SUBTYPE_FIELDS[entity.kind] ?? []).filter((f) => !['longtext', 'textarea', 'specs'].includes(f.type) && sub.data![f.name] !== null && sub.data![f.name] !== '' && sub.data![f.name] !== undefined).slice(0, 10).map((f) => (
            <div key={f.name} className="min-w-0">
              <dt className="text-[10.5px] text-subtle">{f.label}</dt>
              <dd className="truncate">{f.type === 'entity' ? <EntityLink id={sub.data![f.name]} /> : f.type === 'select' ? f.options?.[sub.data![f.name]] ?? String(sub.data![f.name]) : f.type === 'boolean' ? (sub.data![f.name] ? '예' : '아니오') : f.type === 'date' ? formatDate(sub.data![f.name], 'short') : String(sub.data![f.name])}</dd>
            </div>
          ))}
        </dl>
      )}
      {entity.tags.length > 0 && <div className="flex flex-wrap gap-1">{entity.tags.map((t) => <Badge key={t}>#{t}</Badge>)}</div>}
      <div className="border-t border-border pt-3">
        <p className="mb-1.5 text-[11px] font-medium text-muted">연결된 항목 {backlinks.data ? `(${backlinks.data.length})` : ''}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
          {[...new Set((backlinks.data ?? []).map((b) => (b.row_data.id && b.row_data.id !== entity.id && !b.row_data.branch_id ? b.row_data.id : b.row_data.country_id ?? b.row_data.character_id ?? b.row_data.unit_id ?? b.row_data.region_id ?? b.row_data.war_id) as string).filter((x) => x && x !== entity.id))].slice(0, 30).map((id) => <EntityLink key={id} id={id} />)}
        </div>
      </div>
    </div>
  )
}

function CountryNow({ id }: { id: string }) {
  const { date } = useWorld()
  const q = useTemporal<CountryState>('atlas_country_states', { country_id: id })
  const c = rowAt(q.visible, date)
  if (!c) return <p className="text-[11.5px] text-subtle">{formatDate(date)} 상태 기록 없음</p>
  return (
    <div className="flex gap-3 rounded-md bg-surface-2 p-2.5 text-[12px]">
      {c.flag_path && <StorageImage path={c.flag_path} className="h-10 w-16 rounded-sm object-contain" />}
      <div className="min-w-0">
        <p className="font-medium">{c.official_name || c.name}</p>
        <p className="text-muted">{c.government_form || '정치체제 미기록'}</p>
        {c.head_of_state_id && <p>원수 <EntityLink id={c.head_of_state_id} /></p>}
      </div>
    </div>
  )
}

function RegionNow({ id }: { id: string }) {
  const { date } = useWorld()
  const q = useTemporal<TerritoryControl>('atlas_territory_control', { region_id: id })
  const c = rowAt(q.visible, date)
  return <p className="rounded-md bg-surface-2 p-2.5 text-[12px]">{formatDate(date, 'short')} 지배: <EntityLink id={c?.controller_id} fallback="없음" /> {c && <span className="text-muted">({CONTROL_STATUS[c.status]})</span>}</p>
}

function UnitNow({ id }: { id: string }) {
  const { date } = useWorld()
  const q = useTemporal<UnitState>('atlas_unit_states', { unit_id: id })
  const s = rowAt(q.visible, date)
  if (!s) return <p className="text-[11.5px] text-subtle">편제 기록 없음</p>
  return (
    <div className="rounded-md bg-surface-2 p-2.5 text-[12px]">
      <p>상위부대: <EntityLink id={s.parent_unit_id} fallback="최상위" /></p>
      <p>지휘관: <EntityLink id={s.commander_id} fallback="미지정" /></p>
      {s.strength ? <p>병력: {s.strength.toLocaleString()}</p> : null}
    </div>
  )
}
