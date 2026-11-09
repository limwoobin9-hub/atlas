/**
 * Declarative field definitions. Forms, temporal editors and list columns are generated from these,
 * so every kind gets the same validation, autosave and relation pickers.
 */
import type { EntityKind } from '@/data/types'
import {
  CLAIM_TYPES, CONTROL_STATUS, ELECTION_TYPES, ENTITY_RELATION_TYPES, EQUIPMENT_TYPES, POLITY_TYPES, POSITION_KINDS,
  REGION_TYPES, RELATION_TYPES, SERVICE_BRANCHES, SHIP_STATUS, TREATY_TYPES, WAR_STATUS,
} from '@/domain/kinds'

export type FieldType =
  | 'text' | 'textarea' | 'longtext' | 'number' | 'integer' | 'percent' | 'date' | 'select' | 'boolean' | 'color'
  | 'entity' | 'ideology' | 'chamber' | 'warSide' | 'image' | 'specs' | 'tags'

export interface FieldDef {
  name: string
  label: string
  type: FieldType
  options?: Record<string, string>
  kinds?: EntityKind[]
  span?: 1 | 2 | 3
  hint?: string
  required?: boolean
  placeholder?: string
  /** for `select` with free typing */
  suggestions?: string[]
  min?: number
  max?: number
}

const opts = (o: Record<string, string>) => o
const RELATION_OPTIONS = Object.fromEntries(Object.entries(RELATION_TYPES).map(([k, v]) => [k, v.label]))

// ------------------------------------------------------------------ subtype fields (static info)
export const SUBTYPE_FIELDS: Partial<Record<EntityKind, FieldDef[]>> = {
  country: [
    { name: 'official_name', label: '정식 국호', type: 'text', span: 2 },
    { name: 'short_name', label: '약칭', type: 'text' },
    { name: 'english_name', label: '영문명', type: 'text' },
    { name: 'code', label: '국가 코드', type: 'text', placeholder: 'ABC' },
    { name: 'polity_type', label: '국가·정치세력 유형', type: 'select', options: POLITY_TYPES },
    { name: 'is_state', label: '국가로 취급 (비국가 세력이면 해제)', type: 'boolean' },
    { name: 'motto', label: '국가 표어', type: 'text', span: 2 },
    { name: 'anthem', label: '국가(國歌)', type: 'text' },
    { name: 'currency', label: '통화', type: 'text' },
    { name: 'languages', label: '공용어', type: 'text' },
    { name: 'religion', label: '국교 (선택)', type: 'text' },
  ],
  region: [
    { name: 'region_type', label: '지역 유형', type: 'select', options: REGION_TYPES },
    { name: 'parent_region_id', label: '상위 지역', type: 'entity', kinds: ['region'] },
    { name: 'population', label: '인구', type: 'integer' },
    { name: 'area_km2', label: '면적 (km²)', type: 'number' },
    { name: 'main_cities', label: '주요 도시', type: 'text', span: 2 },
  ],
  party: [
    { name: 'abbreviation', label: '약칭', type: 'text' },
    { name: 'country_id', label: '소속 국가', type: 'entity', kinds: ['country'] },
    { name: 'ideology_id', label: '이념', type: 'ideology' },
    { name: 'ideology_detail', label: '상세 이념', type: 'text' },
    { name: 'color_mode', label: '정당 색상', type: 'select', options: opts({ ideology: '이념 색상 사용', custom: '직접 지정 (위 색상)' }) },
    { name: 'leader_id', label: '당수', type: 'entity', kinds: ['character'] },
  ],
  faction: [
    { name: 'party_id', label: '소속 정당', type: 'entity', kinds: ['party'] },
    { name: 'leader_id', label: '지도자', type: 'entity', kinds: ['character'] },
    { name: 'ideology_id', label: '이념', type: 'ideology' },
    { name: 'support_pct', label: '당내 지지율 (%)', type: 'percent' },
    { name: 'split_from_id', label: '분열 원천 (계파/정당)', type: 'entity', kinds: ['faction', 'party'] },
  ],
  government: [
    { name: 'country_id', label: '국가', type: 'entity', kinds: ['country'] },
    { name: 'head_of_state_id', label: '국가원수', type: 'entity', kinds: ['character'] },
    { name: 'head_of_government_id', label: '정부수반', type: 'entity', kinds: ['character'] },
    { name: 'regime', label: '정치체제', type: 'text', suggestions: ['입헌군주제', '절대군주제', '대통령제', '의원내각제', '일당제', '군사정부', '전시내각'] },
    { name: 'government_form', label: '정부 형태', type: 'text', suggestions: ['단독정부', '연립정부', '거국내각', '과도정부', '망명정부'] },
    { name: 'constitution', label: '헌법', type: 'text', span: 2 },
    { name: 'policies', label: '주요 정책', type: 'textarea', span: 3 },
  ],
  parliament: [
    { name: 'country_id', label: '국가', type: 'entity', kinds: ['country'] },
    { name: 'structure', label: '의회 유형', type: 'select', options: opts({ unicameral: '단원제', bicameral: '양원제' }) },
    { name: 'term_years', label: '임기 (년)', type: 'number' },
    { name: 'electoral_system', label: '선거제도', type: 'text', suggestions: ['소선거구 다수대표제', '비례대표제', '혼합형', '대선거구제', '간선제', '임명제'] },
  ],
  election: [
    { name: 'country_id', label: '국가', type: 'entity', kinds: ['country'] },
    { name: 'election_type', label: '선거 종류', type: 'select', options: ELECTION_TYPES },
    { name: 'chamber_id', label: '선거 대상 의회(원)', type: 'chamber' },
    { name: 'electoral_system', label: '선거제도', type: 'text' },
    { name: 'turnout_pct', label: '투표율 (%)', type: 'percent' },
    { name: 'eligible_voters', label: '유권자 수', type: 'integer' },
    { name: 'result_summary', label: '선거 결과 요약', type: 'textarea', span: 3 },
  ],
  character: [
    { name: 'real_name', label: '본명', type: 'text' },
    { name: 'aliases', label: '별칭', type: 'text' },
    { name: 'nationality_id', label: '국적', type: 'entity', kinds: ['country'] },
    { name: 'rank', label: '계급', type: 'text' },
    { name: 'biography', label: '약력', type: 'longtext', span: 3 },
  ],
  unit: [
    { name: 'service_branch', label: '군종', type: 'select', options: SERVICE_BRANCHES },
    { name: 'unit_type', label: '부대 유형', type: 'text', suggestions: [] },
    { name: 'echelon', label: '제대 단계 (정렬용, 0=최상위)', type: 'integer' },
  ],
  ship: [
    { name: 'country_id', label: '국적', type: 'entity', kinds: ['country'] },
    { name: 'ship_class', label: '함급', type: 'text' },
    { name: 'ship_type', label: '함종', type: 'text', suggestions: ['전함', '순양전함', '중순양함', '경순양함', '항공모함', '구축함', '호위함', '잠수함', '어뢰정', '수송선', '기타'] },
    { name: 'builder', label: '조선소', type: 'text' },
    { name: 'laid_down_on', label: '건조 시작', type: 'date' },
    { name: 'launched_on', label: '진수일', type: 'date' },
    { name: 'displacement_t', label: '배수량 (t)', type: 'number' },
    { name: 'speed_kn', label: '속력 (kn)', type: 'number' },
    { name: 'crew', label: '승조원', type: 'integer' },
    { name: 'ship_status', label: '상태', type: 'select', options: SHIP_STATUS },
    { name: 'armament', label: '무장', type: 'textarea', span: 3 },
    { name: 'armor', label: '장갑', type: 'text', span: 3 },
  ],
  equipment: [
    { name: 'equipment_type', label: '장비 유형', type: 'select', options: EQUIPMENT_TYPES },
    { name: 'manufacturer', label: '개발사', type: 'text' },
    { name: 'origin_country_id', label: '원산지', type: 'entity', kinds: ['country'] },
    { name: 'producer_country_id', label: '생산 국가', type: 'entity', kinds: ['country'] },
    { name: 'produced', label: '생산량', type: 'integer' },
    { name: 'specs', label: '주요 제원', type: 'specs', span: 3 },
  ],
  event: [
    { name: 'event_type', label: '유형', type: 'text', suggestions: ['정치', '외교', '군사', '경제', '사회', '문화', '재해', '혁명', '쿠데타', '선거', '기타'] },
    { name: 'location', label: '장소', type: 'text' },
    { name: 'location_id', label: '장소 (지역 연결)', type: 'entity', kinds: ['region'] },
    { name: 'is_milestone', label: '주요 역사 날짜로 표시', type: 'boolean' },
    { name: 'background', label: '배경', type: 'longtext', span: 3 },
    { name: 'causes', label: '원인', type: 'longtext', span: 3 },
    { name: 'course', label: '경과', type: 'longtext', span: 3 },
    { name: 'outcome', label: '결과', type: 'longtext', span: 3 },
    { name: 'impact', label: '장기적 영향', type: 'longtext', span: 3 },
  ],
  war: [
    { name: 'war_status', label: '전쟁 상태', type: 'select', options: WAR_STATUS },
    { name: 'casus_belli', label: '직접 원인', type: 'textarea', span: 3 },
    { name: 'background', label: '역사적 배경', type: 'longtext', span: 3 },
    { name: 'outcome', label: '결과', type: 'longtext', span: 3 },
    { name: 'territorial_changes', label: '영토 변화', type: 'textarea', span: 3 },
    { name: 'losses', label: '기록된 손실', type: 'textarea', span: 3 },
  ],
  battle: [
    { name: 'war_id', label: '전쟁', type: 'entity', kinds: ['war'] },
    { name: 'location', label: '장소', type: 'text' },
    { name: 'location_id', label: '장소 (지역 연결)', type: 'entity', kinds: ['region'] },
    { name: 'attacker_side_id', label: '공격 진영', type: 'warSide' },
    { name: 'defender_side_id', label: '방어 진영', type: 'warSide' },
    { name: 'result', label: '결과', type: 'text', span: 3 },
    { name: 'losses', label: '손실', type: 'textarea', span: 3 },
  ],
  treaty: [
    { name: 'treaty_type', label: '조약 유형', type: 'select', options: TREATY_TYPES },
    { name: 'signed_on', label: '체결일', type: 'date' },
    { name: 'signing_place', label: '체결 장소', type: 'text' },
    { name: 'war_id', label: '관련 전쟁', type: 'entity', kinds: ['war'] },
  ],
}

/** Country long-form sections stored in atlas_countries.sections */
export const COUNTRY_SECTIONS: { key: string; label: string }[] = [
  { key: 'history', label: '역사' }, { key: 'politics', label: '정치' }, { key: 'economy', label: '경제' },
  { key: 'diplomacy', label: '외교' }, { key: 'military', label: '군사' }, { key: 'culture', label: '문화' }, { key: 'territory', label: '영토' },
]

// ------------------------------------------------------------------ temporal tables
export interface TemporalConfig {
  table: string
  label: string
  /** column that ties a row to the owning entity in the detail page */
  keyField: string
  fields: FieldDef[]
  /** short human label for a row */
  describe?: (row: Record<string, unknown>, name: (id: unknown) => string) => string
}

export const TEMPORAL: Record<string, TemporalConfig> = {
  country_states: {
    table: 'atlas_country_states', label: '국가 상태 이력', keyField: 'country_id',
    fields: [
      { name: 'name', label: '국가명 (이 시기)', type: 'text' },
      { name: 'official_name', label: '정식 국호 (이 시기)', type: 'text' },
      { name: 'color', label: '대표 색상', type: 'color' },
      { name: 'flag_path', label: '국기', type: 'image' },
      { name: 'emblem_path', label: '국장', type: 'image' },
      { name: 'government_form', label: '정치체제', type: 'text', suggestions: ['입헌군주제', '절대군주제', '공화정', '대통령제', '의원내각제', '일당독재', '군사정부', '전시내각', '임시정부'] },
      { name: 'ideology_id', label: '공식 이념', type: 'ideology' },
      { name: 'capital_id', label: '수도', type: 'entity', kinds: ['region'] },
      { name: 'seat_of_government_id', label: '정부 소재지', type: 'entity', kinds: ['region'] },
      { name: 'head_of_state_id', label: '국가원수', type: 'entity', kinds: ['character'] },
      { name: 'head_of_government_id', label: '정부수반', type: 'entity', kinds: ['character'] },
      { name: 'population', label: '인구', type: 'integer' },
      { name: 'area_km2', label: '면적 (km²)', type: 'number' },
      { name: 'gdp', label: '경제 규모', type: 'text' },
      { name: 'note', label: '메모', type: 'textarea', span: 3 },
    ],
    describe: (r) => [r.name, r.government_form].filter(Boolean).join(' · ') || '상태',
  },
  territory_control: {
    table: 'atlas_territory_control', label: '영토 지배 이력', keyField: 'region_id',
    fields: [
      { name: 'region_id', label: '지역', type: 'entity', kinds: ['region'], required: true },
      { name: 'controller_id', label: '실효지배국', type: 'entity', kinds: ['country', 'organization'] },
      { name: 'sovereign_id', label: '명목상 주권국', type: 'entity', kinds: ['country'] },
      { name: 'administrator_id', label: '행정 소속', type: 'entity', kinds: ['country', 'region', 'organization'] },
      { name: 'status', label: '지배 상태', type: 'select', options: CONTROL_STATUS },
      { name: 'note', label: '메모', type: 'textarea', span: 3 },
    ],
    describe: (r, n) => `${n(r.region_id)} → ${n(r.controller_id)}`,
  },
  territory_claims: {
    table: 'atlas_territory_claims', label: '영유권 주장', keyField: 'region_id',
    fields: [
      { name: 'region_id', label: '지역', type: 'entity', kinds: ['region'], required: true },
      { name: 'claimant_id', label: '주장 국가', type: 'entity', kinds: ['country', 'organization'], required: true },
      { name: 'claim_type', label: '주장 유형', type: 'select', options: CLAIM_TYPES },
      { name: 'note', label: '메모', type: 'textarea', span: 3 },
    ],
    describe: (r, n) => `${n(r.claimant_id)} ⇢ ${n(r.region_id)}`,
  },
  positions: {
    table: 'atlas_positions', label: '직책 경력', keyField: 'character_id',
    fields: [
      { name: 'character_id', label: '인물', type: 'entity', kinds: ['character'], required: true },
      { name: 'title', label: '직책', type: 'text', required: true, placeholder: '예: 외무장관' },
      { name: 'position_kind', label: '직책 구분', type: 'select', options: POSITION_KINDS },
      { name: 'organization_id', label: '소속 기관', type: 'entity', kinds: ['country', 'government', 'party', 'unit', 'organization', 'parliament'] },
      { name: 'rank', label: '계급', type: 'text' },
      { name: 'note', label: '메모', type: 'textarea', span: 3 },
    ],
    describe: (r, n) => `${r.title}${r.organization_id ? ` (${n(r.organization_id)})` : ''}`,
  },
  affiliations: {
    table: 'atlas_affiliations', label: '소속 이력', keyField: 'character_id',
    fields: [
      { name: 'character_id', label: '인물', type: 'entity', kinds: ['character'], required: true },
      { name: 'organization_id', label: '소속 (국가·정당·부대·단체)', type: 'entity', kinds: ['country', 'party', 'faction', 'unit', 'organization', 'government'], required: true },
      { name: 'affiliation_type', label: '소속 형태', type: 'select', options: opts({ citizen: '국민·시민', member: '당원·회원', serviceman: '군 복무', employee: '직원', supporter: '지지자', other: '기타' }) },
      { name: 'role', label: '역할', type: 'text' },
      { name: 'note', label: '메모', type: 'textarea', span: 3 },
    ],
    describe: (r, n) => `${n(r.organization_id)}${r.role ? ` · ${r.role}` : ''}`,
  },
  unit_states: {
    table: 'atlas_unit_states', label: '편제·상태 이력', keyField: 'unit_id',
    fields: [
      { name: 'unit_id', label: '부대', type: 'entity', kinds: ['unit'], required: true },
      { name: 'parent_unit_id', label: '상위부대', type: 'entity', kinds: ['unit'] },
      { name: 'country_id', label: '소속 국가', type: 'entity', kinds: ['country', 'organization'] },
      { name: 'commander_id', label: '지휘관', type: 'entity', kinds: ['character'] },
      { name: 'name', label: '이 시기 부대명', type: 'text' },
      { name: 'strength', label: '병력', type: 'integer' },
      { name: 'garrison', label: '주둔지', type: 'text' },
      { name: 'training', label: '훈련도 (0-100)', type: 'integer', min: 0, max: 100 },
      { name: 'morale', label: '사기 (0-100)', type: 'integer', min: 0, max: 100 },
      { name: 'loyalty', label: '충성도 (0-100)', type: 'integer', min: 0, max: 100 },
      { name: 'supply', label: '보급 상태 (0-100)', type: 'integer', min: 0, max: 100 },
      { name: 'note', label: '메모', type: 'textarea', span: 3 },
    ],
    describe: (r, n) => [r.parent_unit_id ? `상위: ${n(r.parent_unit_id)}` : '최상위', r.commander_id ? `지휘: ${n(r.commander_id)}` : ''].filter(Boolean).join(' · '),
  },
  ship_assignments: {
    table: 'atlas_ship_assignments', label: '소속·명칭 이력', keyField: 'ship_id',
    fields: [
      { name: 'ship_id', label: '함선', type: 'entity', kinds: ['ship'], required: true },
      { name: 'unit_id', label: '소속 함대·전대', type: 'entity', kinds: ['unit'] },
      { name: 'ship_name', label: '이 시기 함명', type: 'text' },
      { name: 'is_flagship', label: '기함', type: 'boolean' },
      { name: 'ship_status', label: '상태', type: 'text' },
      { name: 'refit_note', label: '개장 내역', type: 'textarea', span: 3 },
    ],
    describe: (r, n) => `${n(r.unit_id)}${r.is_flagship ? ' · 기함' : ''}${r.ship_name ? ` · ${r.ship_name}` : ''}`,
  },
  equipment_holdings: {
    table: 'atlas_equipment_holdings', label: '장비 보유', keyField: 'unit_id',
    fields: [
      { name: 'unit_id', label: '부대', type: 'entity', kinds: ['unit'], required: true },
      { name: 'equipment_id', label: '장비', type: 'entity', kinds: ['equipment'], required: true },
      { name: 'quantity', label: '수량', type: 'integer', required: true },
      { name: 'note', label: '메모', type: 'text', span: 3 },
    ],
    describe: (r, n) => `${n(r.unit_id)} · ${n(r.equipment_id)} ×${r.quantity}`,
  },
  diplomatic_relations: {
    table: 'atlas_diplomatic_relations', label: '외교관계', keyField: 'a_id',
    fields: [
      { name: 'a_id', label: '주체 A', type: 'entity', kinds: ['country', 'organization'], required: true },
      { name: 'b_id', label: '주체 B', type: 'entity', kinds: ['country', 'organization'], required: true },
      { name: 'relation_type', label: '관계 유형', type: 'select', options: RELATION_OPTIONS, required: true },
      { name: 'is_public', label: '공개 관계 (해제 시 비밀 외교)', type: 'boolean' },
      { name: 'treaty_id', label: '관련 조약', type: 'entity', kinds: ['treaty'] },
      { name: 'event_id', label: '관련 사건', type: 'entity', kinds: ['event', 'war'] },
      { name: 'description', label: '설명', type: 'textarea', span: 3 },
    ],
    describe: (r, n) => `${n(r.a_id)} ↔ ${n(r.b_id)} · ${RELATION_TYPES[String(r.relation_type)]?.label ?? r.relation_type}`,
  },
  war_participants: {
    table: 'atlas_war_participants', label: '참전 기록', keyField: 'war_id',
    fields: [
      { name: 'war_id', label: '전쟁', type: 'entity', kinds: ['war'], required: true },
      { name: 'participant_id', label: '참전국·세력', type: 'entity', kinds: ['country', 'organization'], required: true },
      { name: 'side_id', label: '진영', type: 'warSide', required: true },
      { name: 'role', label: '역할', type: 'select', options: opts({ leader: '진영 주도국', belligerent: '교전국', co_belligerent: '공동교전국', supporter: '지원국', volunteer: '의용군', other: '기타' }) },
      { name: 'note', label: '메모', type: 'text', span: 3 },
    ],
    describe: (r, n) => `${n(r.participant_id)}`,
  },
  entity_relations: {
    table: 'atlas_entity_relations', label: '관계', keyField: 'from_id',
    fields: [
      { name: 'from_id', label: '항목', type: 'entity', required: true },
      { name: 'relation_type', label: '관계', type: 'select', options: ENTITY_RELATION_TYPES, required: true },
      { name: 'to_id', label: '대상', type: 'entity', required: true },
      { name: 'note', label: '메모', type: 'text', span: 3 },
    ],
    describe: (r, n) => `${n(r.from_id)} → ${ENTITY_RELATION_TYPES[String(r.relation_type)] ?? r.relation_type} → ${n(r.to_id)}`,
  },
  party_polling: {
    table: 'atlas_party_polling', label: '지지율 조사', keyField: 'party_id',
    fields: [
      { name: 'party_id', label: '정당', type: 'entity', kinds: ['party'], required: true },
      { name: 'support_pct', label: '지지율 (%)', type: 'percent', required: true },
      { name: 'pollster', label: '조사 기관', type: 'text' },
      { name: 'note', label: '메모', type: 'text' },
    ],
    describe: (r) => `${r.support_pct}%`,
  },
}
