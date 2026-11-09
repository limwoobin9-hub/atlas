import { Network } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { NetworkGraph, type GraphEdge, type GraphNode } from '@/components/NetworkGraph'
import { Card, CardHeader, Empty } from '@/components/ui/misc'
import { Select } from '@/components/ui/input'
import { useTemporal } from '@/data/hooks'
import type { Entity, EntityRelation } from '@/data/types'
import { useWorld } from '@/data/world'
import { formatDate } from '@/domain/dates'
import { ENTITY_RELATION_TYPES, KINDS } from '@/domain/kinds'
import { rowsAt } from '@/domain/timeline'
import { entityHref } from '@/features/entities/common'
import { TEMPORAL } from '@/features/entities/fields'
import { TemporalEditor } from '@/features/entities/TemporalEditor'

export function CharacterCareer({ entity }: { entity: Entity }) {
  return (
    <>
      <TemporalEditor config={TEMPORAL.positions} filters={{ character_id: entity.id }} title="직책 경력 (예: 1936~1938 외무장관 → 1938~1940 총리)" />
      <TemporalEditor config={TEMPORAL.affiliations} filters={{ character_id: entity.id }} title="소속 이력 (국가·정당·부대·단체)" />
    </>
  )
}

const REL_COLORS: Record<string, string> = { family: '#16a34a', ally: '#2563eb', rival: '#dc2626', superior: '#7c3aed', subordinate: '#a855f7', mentor: '#ca8a04', student: '#eab308' }

/** Relation graph of user-entered relations around this character (1 or 2 hops). */
export function CharacterNetwork({ entity }: { entity: Entity }) {
  const { entityMap, date, projectId } = useWorld()
  const nav = useNavigate()
  const rels = useTemporal<EntityRelation>('atlas_entity_relations')
  const [depth, setDepth] = useState(2)
  const [atDate, setAtDate] = useState(false)
  const { nodes, edges } = useMemo(() => {
    const rows = (atDate ? rowsAt(rels.visible, date) : rels.visible).filter((r) => entityMap.has(r.from_id) && entityMap.has(r.to_id))
    const ids = new Set([entity.id])
    for (let d = 0; d < depth; d++) {
      for (const r of rows) {
        if (ids.has(r.from_id) || ids.has(r.to_id)) { ids.add(r.from_id); ids.add(r.to_id) }
      }
    }
    const ns: GraphNode[] = [...ids].map((id) => {
      const e = entityMap.get(id)!
      return { id, label: e.name, color: e.color ?? KINDS[e.kind].color, highlight: id === entity.id }
    })
    const es: GraphEdge[] = rows.filter((r) => ids.has(r.from_id) && ids.has(r.to_id)).map((r) => ({
      source: r.from_id, target: r.to_id, label: ENTITY_RELATION_TYPES[r.relation_type] ?? r.relation_type,
      color: REL_COLORS[r.relation_type], directed: !['family', 'ally', 'rival', 'related'].includes(r.relation_type),
    }))
    return { nodes: ns, edges: es }
  }, [rels.visible, entity.id, entityMap, depth, atDate, date])

  return (
    <Card>
      <CardHeader title="인물 관계도" icon={<Network />} sub="관계·연결 탭에서 입력한 관계를 그래프로 표시 (클릭하여 이동, 드래그로 배치)"
        actions={<div className="flex gap-2">
          <Select className="h-7 w-28" value={depth} onChange={(e) => setDepth(Number(e.target.value))}><option value={1}>1단계</option><option value={2}>2단계</option><option value={3}>3단계</option></Select>
          <Select className="h-7 w-40" value={atDate ? 'date' : 'all'} onChange={(e) => setAtDate(e.target.value === 'date')}><option value="all">전체 기간</option><option value="date">{formatDate(date, 'short')} 시점만</option></Select>
        </div>} />
      {nodes.length <= 1 ? <div className="p-4"><Empty title="연결된 관계가 없습니다" description="관계·연결 탭에서 가족·동맹·경쟁자·상관·스승 등의 관계를 추가하세요." /></div> : (
        <NetworkGraph nodes={nodes} edges={edges} onNodeClick={(id) => { const e = entityMap.get(id); if (e && id !== entity.id) nav(entityHref(projectId, e)) }} />
      )}
    </Card>
  )
}
