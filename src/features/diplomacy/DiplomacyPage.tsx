import { Handshake } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { NetworkGraph, type GraphEdge, type GraphNode } from '@/components/NetworkGraph'
import { Select } from '@/components/ui/input'
import { Card, CardHeader, Empty, Switch } from '@/components/ui/misc'
import { useTemporal } from '@/data/hooks'
import type { DiplomaticRelation } from '@/data/types'
import { useWorld } from '@/data/world'
import { formatDate } from '@/domain/dates'
import { RELATION_TYPES } from '@/domain/kinds'
import { rowsAt } from '@/domain/timeline'
import { entityHref } from '@/features/entities/common'
import { PageHeader } from '@/features/entities/EntityListPage'
import { TEMPORAL } from '@/features/entities/fields'
import { TemporalEditor } from '@/features/entities/TemporalEditor'
import { useCountryStatesAt } from '@/features/wars/useCountryFlags'

export function DiplomacyPage() {
  const { date, entityMap, projectId } = useWorld()
  const nav = useNavigate()
  const rel = useTemporal<DiplomaticRelation>('atlas_diplomatic_relations')
  const states = useCountryStatesAt()
  const [type, setType] = useState('')
  const [showSecret, setShowSecret] = useState(true)
  const current = useMemo(() => rowsAt(rel.visible, date).filter((r) => (!type || r.relation_type === type) && (showSecret || r.is_public) && entityMap.has(r.a_id) && entityMap.has(r.b_id)), [rel.visible, date, type, showSecret, entityMap])
  const { nodes, edges } = useMemo(() => {
    const ids = new Set(current.flatMap((r) => [r.a_id, r.b_id]))
    const ns: GraphNode[] = [...ids].map((id) => ({ id, label: states.get(id)?.name || entityMap.get(id)!.name, color: states.get(id)?.color ?? entityMap.get(id)!.color ?? '#6366f1' }))
    const es: GraphEdge[] = current.map((r) => ({ source: r.a_id, target: r.b_id, label: RELATION_TYPES[r.relation_type]?.label, color: RELATION_TYPES[r.relation_type]?.color, dashed: !r.is_public, directed: ['subject', 'protectorate'].includes(r.relation_type) }))
    return { nodes: ns, edges: es }
  }, [current, entityMap, states])

  return (
    <div className="flex flex-col">
      <PageHeader title="외교" icon={<Handshake />} sub={`${formatDate(date)} 외교관계 그래프 · 점선은 비밀 관계`} actions={<>
        <Select className="w-36" value={type} onChange={(e) => setType(e.target.value)}><option value="">모든 관계 유형</option>{Object.entries(RELATION_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
        <label className="flex items-center gap-1.5 text-[12px] text-muted"><Switch checked={showSecret} onCheckedChange={setShowSecret} />비밀 관계 표시</label>
      </>} />
      <div className="flex flex-col gap-4 p-5">
        <Card>
          <CardHeader title="외교관계 그래프" sub="노드를 클릭하면 국가 페이지로 이동 · 드래그하여 배치" />
          {nodes.length === 0 ? <div className="p-4"><Empty title="이 날짜의 외교관계가 없습니다" description="아래에서 국가 간 관계를 기록하세요." /></div> : (
            <NetworkGraph nodes={nodes} edges={edges} height={480} onNodeClick={(id) => { const e = entityMap.get(id); if (e) nav(entityHref(projectId, e)) }} />
          )}
          <div className="flex flex-wrap gap-3 border-t border-border px-4 py-2">
            {Object.entries(RELATION_TYPES).map(([k, v]) => <span key={k} className="flex items-center gap-1 text-[11px] text-muted"><span className="h-0.5 w-4" style={{ background: v.color }} />{v.label}</span>)}
          </div>
        </Card>
        <TemporalEditor config={TEMPORAL.diplomatic_relations} title="전체 외교관계 기록" />
      </div>
    </div>
  )
}
