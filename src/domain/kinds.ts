import type { EntityKind, EntityStatus } from '@/data/types'

export interface KindMeta {
  kind: EntityKind
  label: string
  route: string
  /** subtype table holding kind-specific columns (null = only atlas_entities) */
  table: string | null
  startLabel: string
  endLabel: string
  color: string
}

export const KINDS: Record<EntityKind, KindMeta> = {
  country: { kind: 'country', label: '국가', route: 'countries', table: 'atlas_countries', startLabel: '건국일', endLabel: '멸망일', color: '#4f46e5' },
  region: { kind: 'region', label: '지역', route: 'regions', table: 'atlas_regions', startLabel: '성립일', endLabel: '소멸일', color: '#0d9488' },
  party: { kind: 'party', label: '정당', route: 'parties', table: 'atlas_parties', startLabel: '창당일', endLabel: '해산일', color: '#db2777' },
  faction: { kind: 'faction', label: '계파', route: 'factions', table: 'atlas_factions', startLabel: '결성일', endLabel: '해산일', color: '#c026d3' },
  government: { kind: 'government', label: '정부', route: 'governments', table: 'atlas_governments', startLabel: '출범일', endLabel: '종료일', color: '#7c3aed' },
  parliament: { kind: 'parliament', label: '의회', route: 'parliaments', table: 'atlas_parliaments', startLabel: '구성일', endLabel: '해산일', color: '#9333ea' },
  election: { kind: 'election', label: '선거', route: 'elections', table: 'atlas_elections', startLabel: '선거일', endLabel: '종료일', color: '#e11d48' },
  character: { kind: 'character', label: '인물', route: 'characters', table: 'atlas_characters', startLabel: '출생일', endLabel: '사망일', color: '#ea580c' },
  unit: { kind: 'unit', label: '군부대', route: 'military', table: 'atlas_units', startLabel: '창설일', endLabel: '해체일', color: '#65a30d' },
  ship: { kind: 'ship', label: '함선', route: 'ships', table: 'atlas_ships', startLabel: '취역일', endLabel: '퇴역일', color: '#0284c7' },
  equipment: { kind: 'equipment', label: '장비', route: 'equipment', table: 'atlas_equipment', startLabel: '도입일', endLabel: '퇴역일', color: '#57534e' },
  event: { kind: 'event', label: '사건', route: 'events', table: 'atlas_events', startLabel: '시작일', endLabel: '종료일', color: '#ca8a04' },
  war: { kind: 'war', label: '전쟁', route: 'wars', table: 'atlas_wars', startLabel: '개전일', endLabel: '종전일', color: '#dc2626' },
  battle: { kind: 'battle', label: '전투', route: 'battles', table: 'atlas_battles', startLabel: '시작일', endLabel: '종료일', color: '#b91c1c' },
  treaty: { kind: 'treaty', label: '조약', route: 'treaties', table: 'atlas_treaties', startLabel: '발효일', endLabel: '종료일', color: '#0891b2' },
  organization: { kind: 'organization', label: '단체', route: 'organizations', table: null, startLabel: '설립일', endLabel: '해산일', color: '#475569' },
}

export const KIND_LIST = Object.values(KINDS)

export function kindByRoute(route: string): KindMeta | undefined {
  return KIND_LIST.find((k) => k.route === route)
}

export const STATUS: Record<EntityStatus, { label: string; tone: string }> = {
  confirmed: { label: '확정', tone: 'success' },
  tentative: { label: '잠정', tone: 'accent' },
  idea: { label: '아이디어', tone: 'warning' },
  undecided: { label: '미정', tone: 'muted' },
  discarded: { label: '폐기', tone: 'danger' },
}

export const POLITY_TYPES: Record<string, string> = {
  sovereign: '주권국가', kingdom: '왕국', empire: '제국', republic: '공화국', dominion: '자치령', colony: '식민지',
  protectorate: '보호국', puppet: '괴뢰국', government_in_exile: '망명정부', provisional_government: '임시정부',
  warlord: '군벌', rebel: '반군 세력', de_facto_state: '사실상 독립국', nominal_vassal: '명목상 종속국',
  international_zone: '국제관리지역', mandate: '국제연맹 위임통치령', occupation_zone: '점령지역', other: '기타',
}

export const REGION_TYPES: Record<string, string> = {
  continent: '대륙', subcontinent: '아대륙', state: '주/도', province: '성/지방', district: '구역', city: '도시',
  island: '섬', colony: '식민지', territory: '영토', sea: '해역', other: '기타',
}

export const CONTROL_STATUS: Record<string, string> = {
  integrated: '본토 편입', autonomous: '자치', occupied: '점령', disputed: '분쟁', colony: '식민지',
  mandate: '위임통치', protectorate: '보호령', international: '국제관리', unclaimed: '무주지', other: '기타',
}

export const CLAIM_TYPES: Record<string, string> = {
  claim: '영유권 주장', core: '핵심 영토', historical: '역사적 연고', irredentist: '실지회복', de_jure: '법적 주권', other: '기타',
}

export const RELATION_TYPES: Record<string, { label: string; color: string }> = {
  alliance: { label: '동맹', color: '#2563eb' },
  military_cooperation: { label: '군사협력', color: '#0891b2' },
  economic_cooperation: { label: '경제협력', color: '#0d9488' },
  friendly: { label: '우호', color: '#16a34a' },
  neutral: { label: '중립', color: '#94a3b8' },
  tension: { label: '긴장', color: '#f59e0b' },
  hostile: { label: '적대', color: '#ea580c' },
  war: { label: '전쟁', color: '#dc2626' },
  subject: { label: '종속', color: '#7c3aed' },
  protectorate: { label: '보호국 관계', color: '#a855f7' },
  severed: { label: '외교관계 단절', color: '#52525b' },
  other: { label: '기타', color: '#64748b' },
}

export const SERVICE_BRANCHES: Record<string, string> = {
  army: '육군', navy: '해군', air_force: '공군', marines: '해병대', paramilitary: '준군사조직', other: '기타',
}

export const UNIT_TYPE_PRESETS = [
  '국군', '육군', '해군', '공군', '집단군', '군집단', '야전군', '군단', '사단', '보병사단', '기갑사단', '산악사단',
  '여단', '연대', '대대', '함대', '전대', '분함대', '항공군', '비행단', '비행대', '헌병대', '기타',
]

export const EQUIPMENT_TYPES: Record<string, string> = {
  aircraft: '항공기', tank: '전차', armored_vehicle: '장갑차', artillery: '포병 장비', infantry: '보병 장비', naval: '함정 장비', other: '기타',
}

export const TREATY_TYPES: Record<string, string> = {
  peace: '평화조약', mutual_defense: '상호방위조약', non_aggression: '불가침조약', alliance: '동맹조약', trade: '무역협정',
  border: '국경조약', cession: '영토할양조약', armistice: '휴전협정', disarmament: '군축조약', independence: '독립승인조약',
  protectorate: '보호국 설정', other: '기타 사용자 정의',
}

export const WAR_STATUS: Record<string, string> = {
  planned: '계획', ongoing: '진행 중', ceasefire: '휴전', frozen: '동결', ended: '종결',
}

export const SHIP_STATUS: Record<string, string> = {
  planned: '계획', building: '건조 중', active: '현역', reserve: '예비', refit: '개장 중', damaged: '손상',
  sunk: '침몰', scrapped: '해체', captured: '나포', decommissioned: '퇴역', other: '기타',
}

export const ELECTION_TYPES: Record<string, string> = {
  legislative: '의회 선거', presidential: '대통령 선거', referendum: '국민투표', local: '지방 선거', party_leadership: '당 지도부 선거', other: '기타',
}

export const MARKER_TYPES: Record<string, { label: string; color: string; glyph: string }> = {
  country: { label: '국가', color: '#4f46e5', glyph: '◆' },
  capital: { label: '수도', color: '#111827', glyph: '★' },
  city: { label: '도시', color: '#374151', glyph: '●' },
  naval_base: { label: '군항', color: '#0369a1', glyph: '⚓' },
  air_base: { label: '공군기지', color: '#0e7490', glyph: '✈' },
  unit: { label: '군부대', color: '#4d7c0f', glyph: '▣' },
  fleet: { label: '함대', color: '#1d4ed8', glyph: '⛴' },
  battle: { label: '전투', color: '#b91c1c', glyph: '⚔' },
  event: { label: '사건', color: '#a16207', glyph: '!' },
  dispute: { label: '분쟁지역', color: '#c2410c', glyph: '⚑' },
  treaty: { label: '조약 체결 장소', color: '#0e7490', glyph: '✎' },
  character: { label: '인물 관련 장소', color: '#9a3412', glyph: '☺' },
  custom: { label: '사용자 지정', color: '#6b7280', glyph: '•' },
}

export const ENTITY_RELATION_TYPES: Record<string, string> = {
  related: '관련', cause: '원인', effect: '결과', precedes: '선행사건', follows: '후속사건',
  family: '가족', ally: '동맹', rival: '정치적 경쟁자', superior: '상관', subordinate: '부하', mentor: '스승', student: '제자',
  member_of: '소속', founded: '설립', participated: '참여', located_in: '위치', other: '기타',
}

export const POSITION_KINDS: Record<string, string> = {
  head_of_state: '국가원수', head_of_government: '정부수반', minister: '장관', legislator: '의원', party_leader: '당수',
  commander: '지휘관', diplomat: '외교관', official: '관료', other: '기타',
}
