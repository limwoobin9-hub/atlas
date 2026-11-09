import { Anchor, Plane, Shield } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/misc'
import { useTemporal } from '@/data/hooks'
import type { AnyRow, Entity , Temporal } from '@/data/types'
import { useWorld } from '@/data/world'
import { formatDate, formatRange, inRange } from '@/domain/dates'
import { rowsAt } from '@/domain/timeline'
import { flattenOob } from '@/domain/oob'
import { sortBy } from '@/lib/utils'
import { EntityLink } from '@/features/entities/common'
import { TEMPORAL } from '@/features/entities/fields'
import { TemporalEditor } from '@/features/entities/TemporalEditor'
import { useOob } from './OrderOfBattle'

export function UnitHistory({ entity }: { entity: Entity }) {
  const { date } = useWorld()
  const { roots } = useOob()
  const node = flattenOob(roots).find((n) => n.unit.id === entity.id)
  const chain: string[] = []
  const all = flattenOob(roots)
  let cur = node?.state?.parent_unit_id
  while (cur && chain.length < 20) { chain.unshift(cur); cur = all.find((n) => n.unit.id === cur)?.state?.parent_unit_id }
  return (
    <>
      <Card>
        <CardHeader title={`${formatDate(date)} 편제 위치`} icon={<Shield />} />
        <div className="flex flex-col gap-2 p-4 text-[12.5px]">
          <div className="flex flex-wrap items-center gap-1 text-muted">{chain.length === 0 ? '최상위 부대' : chain.map((id) => <span key={id} className="flex items-center gap-1"><EntityLink id={id} showIcon={false} /> ›</span>)} <b className="text-fg">{entity.name}</b></div>
          {node && node.children.length > 0 && (
            <div><span className="text-[11px] text-subtle">예하 부대</span><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">{node.children.map((c) => <EntityLink key={c.unit.id} id={c.unit.id} />)}</div></div>
          )}
        </div>
      </Card>
      <TemporalEditor config={TEMPORAL.unit_states} filters={{ unit_id: entity.id }} singleValued title="편제·지휘·상태 이력 (상위부대, 소속 국가, 지휘관, 병력, 사기 등)" />
    </>
  )
}

export function UnitEquipment({ entity }: { entity: Entity }) {
  const { date } = useWorld()
  const ships = useTemporal<Temporal & AnyRow & { ship_id: string; unit_id: string; is_flagship: boolean }>('atlas_ship_assignments', { unit_id: entity.id })
  const current = rowsAt(ships.visible, date)
  return (
    <>
      <TemporalEditor config={TEMPORAL.equipment_holdings} filters={{ unit_id: entity.id }} title="보유 장비 (모델별 수량)" emptyText="장비 모델과 보유 수량을 기록하세요" />
      <Card>
        <CardHeader title={`소속 함선 (${formatDate(date, 'short')})`} icon={<Anchor />} sub="함대·전대로 쓰는 부대에 배속된 함선" />
        {current.length === 0 ? <p className="px-4 py-3 text-[12px] text-subtle">배속된 함선이 없습니다. 함선의 소속 이력에서 이 부대를 지정하세요.</p> : (
          <ul className="divide-y divide-border">{current.map((s) => <li key={s.id} className="flex items-center gap-2 px-4 py-1.5 text-[12.5px]"><EntityLink id={s.ship_id} />{s.is_flagship && <span className="text-[11px] text-accent">기함</span>}</li>)}</ul>
        )}
      </Card>
    </>
  )
}

export function ShipHistory({ entity }: { entity: Entity }) {
  return <TemporalEditor config={TEMPORAL.ship_assignments} filters={{ ship_id: entity.id }} singleValued title="소속 함대·명칭·개장 이력" />
}

export function EquipmentUsers({ entity }: { entity: Entity }) {
  const { date } = useWorld()
  const h = useTemporal<Temporal & AnyRow & { unit_id: string; quantity: number }>('atlas_equipment_holdings', { equipment_id: entity.id })
  const now = rowsAt(h.visible, date)
  const total = now.reduce((a, r) => a + r.quantity, 0)
  return (
    <Card>
      <CardHeader title="운용 부대" icon={<Plane />} sub={`${formatDate(date)} 운용량 합계 ${total.toLocaleString()}`} />
      {h.visible.length === 0 ? <p className="px-4 py-3 text-[12px] text-subtle">이 장비를 보유한 부대 기록이 없습니다. 부대의 장비 탭에서 추가하세요.</p> : (
        <ul className="divide-y divide-border">
          {sortBy(h.visible, (r) => r.valid_from).map((r) => (
            <li key={r.id} className={`flex items-center gap-3 px-4 py-1.5 text-[12.5px] ${inRange(date, r.valid_from, r.valid_to) ? 'bg-accent-soft/50' : ''}`}>
              <span className="w-44 text-[11.5px] tabular-nums text-muted">{formatRange(r.valid_from, r.valid_to)}</span>
              <EntityLink id={r.unit_id} /><span className="ml-auto tabular-nums font-medium">{r.quantity.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
