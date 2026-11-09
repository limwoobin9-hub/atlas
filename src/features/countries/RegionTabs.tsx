import { MapPinned } from 'lucide-react'
import { Badge, Card, CardHeader } from '@/components/ui/misc'
import { useTable, useTemporal } from '@/data/hooks'
import type { AnyRow, Entity, TerritoryClaim, TerritoryControl } from '@/data/types'
import { useWorld } from '@/data/world'
import { formatDate } from '@/domain/dates'
import { CLAIM_TYPES, CONTROL_STATUS } from '@/domain/kinds'
import { rowAt, rowsAt } from '@/domain/timeline'
import { EntityLink } from '@/features/entities/common'
import { TEMPORAL } from '@/features/entities/fields'
import { TemporalEditor } from '@/features/entities/TemporalEditor'

export function RegionTerritory({ entity }: { entity: Entity }) {
  const { date, entities } = useWorld()
  const control = useTemporal<TerritoryControl>('atlas_territory_control', { region_id: entity.id })
  const claims = useTemporal<TerritoryClaim>('atlas_territory_claims', { region_id: entity.id })
  const subs = useTable<AnyRow>('atlas_regions', { parent_region_id: entity.id })
  const mapRegions = useTable<AnyRow>('atlas_map_regions', { region_id: entity.id })
  const now = rowAt(control.visible, date)
  const activeClaims = rowsAt(claims.visible, date)
  const disputed = activeClaims.some((c) => c.claimant_id !== now?.controller_id)
  return (
    <>
      <Card>
        <CardHeader title={`${formatDate(date)} 지배 상태`} icon={<MapPinned />} />
        <dl className="grid grid-cols-2 gap-3 p-4 text-[12.5px] md:grid-cols-4">
          <div><dt className="text-[11px] text-subtle">실효지배</dt><dd><EntityLink id={now?.controller_id} fallback="미지정" /></dd></div>
          <div><dt className="text-[11px] text-subtle">명목상 주권</dt><dd><EntityLink id={now?.sovereign_id} fallback="—" /></dd></div>
          <div><dt className="text-[11px] text-subtle">행정 소속</dt><dd><EntityLink id={now?.administrator_id} fallback="—" /></dd></div>
          <div><dt className="text-[11px] text-subtle">상태</dt><dd>{now ? CONTROL_STATUS[now.status] : '—'} {disputed && <Badge tone="warning">분쟁</Badge>}</dd></div>
          <div className="col-span-full"><dt className="text-[11px] text-subtle">영유권 주장국</dt><dd className="flex flex-wrap gap-3">{activeClaims.length === 0 ? '없음' : activeClaims.map((c) => <span key={c.id}><EntityLink id={c.claimant_id} /> <span className="text-[11px] text-subtle">({CLAIM_TYPES[c.claim_type]})</span></span>)}</dd></div>
          <div className="col-span-full"><dt className="text-[11px] text-subtle">하위 지역</dt><dd className="flex flex-wrap gap-3">{(subs.data ?? []).length === 0 ? '없음' : subs.data!.map((s) => <EntityLink key={s.id} id={s.id} />)}</dd></div>
          <div className="col-span-full text-[11.5px] text-muted">지도 연결: {(mapRegions.data ?? []).length}개 지도 영역{entities.length === 0 ? '' : ''}</div>
        </dl>
      </Card>
      <TemporalEditor config={TEMPORAL.territory_control} filters={{ region_id: entity.id }} singleValued title="지배 이력 (실효지배·주권·행정)" />
      <TemporalEditor config={TEMPORAL.territory_claims} filters={{ region_id: entity.id }} title="영유권 주장 (지배와 독립적으로 기록)" />
    </>
  )
}
