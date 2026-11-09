import { Link2 } from 'lucide-react'
import { useMemo } from 'react'
import { Card, CardHeader, Loading } from '@/components/ui/misc'
import { useBacklinks } from '@/data/hooks'
import type { AnyRow, EntityKind } from '@/data/types'
import { useWorld } from '@/data/world'
import { KINDS } from '@/domain/kinds'
import { EntityLink } from './common'
import { TEMPORAL } from './fields'
import { TemporalEditor } from './TemporalEditor'

/** Which column of each table identifies the row's "owner" entity, and a label for the link. */
const OWNER: Record<string, { owner: string; label: Record<string, string> }> = {
  atlas_country_states: { owner: 'country_id', label: { capital_id: '수도로 지정한 국가', seat_of_government_id: '정부 소재지', head_of_state_id: '국가원수로 재임', head_of_government_id: '정부수반으로 재임' } },
  atlas_territory_control: { owner: 'region_id', label: { controller_id: '실효지배 지역', sovereign_id: '명목상 주권 지역', administrator_id: '행정 관할 지역', region_id: '지배 기록' } },
  atlas_territory_claims: { owner: 'region_id', label: { claimant_id: '영유권 주장 지역', region_id: '주장 대상' } },
  atlas_parties: { owner: 'id', label: { country_id: '소속 정당', leader_id: '당수로 있는 정당' } },
  atlas_factions: { owner: 'id', label: { party_id: '당내 계파', leader_id: '이끄는 계파', split_from_id: '분열해 나간 계파' } },
  atlas_governments: { owner: 'id', label: { country_id: '정부', head_of_state_id: '국가원수인 정부', head_of_government_id: '정부수반인 정부' } },
  atlas_government_parties: { owner: 'government_id', label: { party_id: '참여 정부' } },
  atlas_characters: { owner: 'id', label: { nationality_id: '국적 인물' } },
  atlas_positions: { owner: 'character_id', label: { organization_id: '소속 직책자' } },
  atlas_affiliations: { owner: 'character_id', label: { organization_id: '소속 인물' } },
  atlas_parliaments: { owner: 'id', label: { country_id: '의회' } },
  atlas_elections: { owner: 'id', label: { country_id: '선거' } },
  atlas_election_results: { owner: 'election_id', label: { party_id: '참여 선거', candidate_id: '출마 선거' } },
  atlas_seat_allocations: { owner: 'party_id', label: { party_id: '의석 기록' } },
  atlas_unit_states: { owner: 'unit_id', label: { parent_unit_id: '예하 부대', country_id: '소속 부대', commander_id: '지휘한 부대' } },
  atlas_ships: { owner: 'id', label: { country_id: '함선' } },
  atlas_ship_assignments: { owner: 'ship_id', label: { unit_id: '소속 함선' } },
  atlas_equipment: { owner: 'id', label: { origin_country_id: '원산 장비', producer_country_id: '생산 장비' } },
  atlas_equipment_holdings: { owner: 'unit_id', label: { equipment_id: '운용 부대' } },
  atlas_events: { owner: 'id', label: { location_id: '이곳에서 일어난 사건' } },
  atlas_battles: { owner: 'id', label: { war_id: '전투', location_id: '이곳의 전투' } },
  atlas_treaties: { owner: 'id', label: { war_id: '관련 조약' } },
  atlas_treaty_participants: { owner: 'treaty_id', label: { participant_id: '서명한 조약' } },
  atlas_war_participants: { owner: 'war_id', label: { participant_id: '참전한 전쟁' } },
  atlas_diplomatic_relations: { owner: 'a_id', label: { a_id: '외교관계', b_id: '외교관계', treaty_id: '근거 외교관계', event_id: '관련 외교관계' } },
  atlas_regions: { owner: 'id', label: { parent_region_id: '하위 지역' } },
  atlas_markers: { owner: 'entity_id', label: {} },
  atlas_map_features: { owner: 'entity_id', label: {} },
  atlas_map_regions: { owner: 'region_id', label: {} },
  atlas_asset_links: { owner: 'asset_id', label: {} },
  atlas_entity_relations: { owner: 'from_id', label: {} },
}

const SKIP_TABLES = new Set(['atlas_markers', 'atlas_map_features', 'atlas_map_regions', 'atlas_asset_links', 'atlas_entity_relations', 'atlas_entity_branch_hidden'])

/** Bidirectional links: everything that references this entity, grouped by meaning. */
export function BacklinksCard({ entityId }: { entityId: string }) {
  const q = useBacklinks(entityId)
  const { entityMap } = useWorld()
  const groups = useMemo(() => {
    const out = new Map<string, Set<string>>()
    for (const b of q.data ?? []) {
      if (SKIP_TABLES.has(b.table_name)) continue
      const spec = OWNER[b.table_name]
      let owner = spec ? (b.row_data[spec.owner] as string) : (b.row_data.id as string)
      if (b.table_name === 'atlas_diplomatic_relations') owner = (b.column_name === 'a_id' ? b.row_data.b_id : b.row_data.a_id) as string
      if (spec?.owner === 'region_id' && b.column_name === 'region_id') owner = (b.row_data.controller_id ?? b.row_data.claimant_id) as string
      if (b.table_name === 'atlas_seat_allocations') continue
      if (!owner || owner === entityId) continue
      if (b.row_data.is_tombstone) continue
      const label = spec?.label[b.column_name] ?? `${b.table_name.replace('atlas_', '')}.${b.column_name}`
      if (!out.has(label)) out.set(label, new Set())
      out.get(label)!.add(owner)
    }
    return [...out.entries()]
  }, [q.data, entityId])
  return (
    <Card>
      <CardHeader title="연결된 항목 (역참조)" icon={<Link2 />} sub="다른 항목이 이 항목을 참조하는 모든 연결" />
      {q.isLoading ? <Loading /> : groups.length === 0 ? <p className="px-3.5 py-3 text-[12px] text-subtle">아직 이 항목을 참조하는 데이터가 없습니다.</p> : (
        <div className="flex flex-col gap-2.5 p-3.5">
          {groups.map(([label, ids]) => (
            <div key={label}>
              <p className="mb-1 text-[11px] font-medium text-muted">{label}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {[...ids].sort((a, b) => (entityMap.get(a)?.name ?? '').localeCompare(entityMap.get(b)?.name ?? '')).map((id) => (
                  <span key={id} className="text-[12.5px]"><EntityLink id={id} /></span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

/** Generic typed relations (cause/effect/family/rival...) shown from both ends. */
export function RelationsCard({ entityId, kind }: { entityId: string; kind: EntityKind }) {
  const { entityMap } = useWorld()
  const cfg = TEMPORAL.entity_relations
  const defaultType = kind === 'event' ? 'related' : kind === 'character' ? 'ally' : 'related'
  return (
    <TemporalEditor
      config={{ ...cfg, fields: cfg.fields.map((f) => (f.name === 'relation_type' ? { ...f, options: f.options } : f)) }}
      title={`관계 (${KINDS[kind].label})`}
      match={(r) => r.from_id === entityId || r.to_id === entityId}
      fixed={{ from_id: entityId }}
      emptyText={`관련 항목을 연결하세요 (예: ${defaultType === 'related' ? '원인·결과·선행사건' : '가족·동맹·경쟁자'})`}
      renderRow={(r: AnyRow) => {
        const outgoing = r.from_id === entityId
        const other = outgoing ? r.to_id : r.from_id
        const t = cfg.fields.find((f) => f.name === 'relation_type')!.options![r.relation_type] ?? r.relation_type
        return (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-surface-2 px-1.5 text-[11px] text-muted">{outgoing ? t : `${t} (역방향)`}</span>
            <EntityLink id={other} />
            {entityMap.get(other) && <span className="text-[11px] text-subtle">{KINDS[entityMap.get(other)!.kind].label}</span>}
          </span>
        )
      }}
    />
  )
}
