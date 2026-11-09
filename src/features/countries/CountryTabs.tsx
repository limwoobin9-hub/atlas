import { Anchor, Calendar, Crown, Flag, Landmark, Plus, Shield, Swords, Users } from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardHeader, ColorDot, Empty, Loading } from '@/components/ui/misc'
import { useIdeologies, useTable, useTemporal } from '@/data/hooks'
import type { AnyRow, CountryState, DiplomaticRelation, Entity, TerritoryClaim, TerritoryControl, UnitState, WarParticipant , Temporal } from '@/data/types'
import { useWorld } from '@/data/world'
import { compareDates, formatDate, formatRange, inRange } from '@/domain/dates'
import { CLAIM_TYPES, CONTROL_STATUS, POLITY_TYPES, RELATION_TYPES } from '@/domain/kinds'
import { entityActiveAt, rowAt, rowsAt } from '@/domain/timeline'
import { formatNumber, sortBy } from '@/lib/utils'
import { EntityLink, StorageImage } from '@/features/entities/common'
import { useCreateDialog } from '@/features/entities/CreateEntityDialog'
import { EntityForm, JsonSectionEditor } from '@/features/entities/EntityForm'
import { COUNTRY_SECTIONS, TEMPORAL } from '@/features/entities/fields'
import { TemporalEditor } from '@/features/entities/TemporalEditor'
import { ParliamentChambers } from '@/features/parliament/ParliamentChambers'
import { OrderOfBattleTree } from '@/features/military/OrderOfBattle'

/** Resolve a country's state (name, flag, regime...) at the current world date. */
export function useCountryState(countryId: string) {
  const { date } = useWorld()
  const q = useTemporal<CountryState>('atlas_country_states', { country_id: countryId })
  const current = useMemo(() => rowAt(q.visible, date), [q.visible, date])
  return { ...q, current }
}

function Section({ entity, k }: { entity: Entity; k: string }) {
  const s = COUNTRY_SECTIONS.find((x) => x.key === k)!
  return <Card className="p-4"><JsonSectionEditor table="atlas_countries" id={entity.id} column="sections" sectionKey={k} label={`${s.label} (서술)`} /></Card>
}

export function CountryOverview({ entity }: { entity: Entity }) {
  const { date, entityMap } = useWorld()
  const st = useCountryState(entity.id)
  const sub = useTable<AnyRow>('atlas_countries', { id: entity.id })
  const ideologies = useIdeologies()
  const c = st.current
  const ideology = ideologies.data?.find((i) => i.id === c?.ideology_id)
  const polity = sub.data?.[0]?.polity_type as string | undefined
  return (
    <>
      <Card>
        <CardHeader title={`${formatDate(date)} 기준 상태`} icon={<Calendar />} sub={c ? `기록 기간 ${formatRange(c.valid_from, c.valid_to)}` : '이 날짜의 상태 기록이 없습니다. "역사" 탭에서 시점별 상태를 추가하세요.'} />
        <div className="flex flex-wrap gap-5 p-4">
          <div className="flex h-24 w-36 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-2">
            {c?.flag_path || entity.image_path ? <StorageImage path={c?.flag_path ?? entity.image_path} className="h-full w-full object-contain" alt="국기" /> : <Flag className="size-6 text-subtle" />}
          </div>
          <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 text-[12.5px] md:grid-cols-3">
            <Info label="국가명">{c?.name || entity.name}</Info>
            <Info label="정식 국호">{c?.official_name || (sub.data?.[0]?.official_name as string) || '—'}</Info>
            <Info label="유형">{polity ? POLITY_TYPES[polity] : '—'}</Info>
            <Info label="정치체제">{c?.government_form || '—'}</Info>
            <Info label="공식 이념">{ideology ? <span className="inline-flex items-center gap-1"><ColorDot color={ideology.color} />{ideology.name}</span> : '—'}</Info>
            <Info label="대표 색상"><span className="inline-flex items-center gap-1"><ColorDot color={c?.color ?? entity.color} />{c?.color ?? entity.color ?? '—'}</span></Info>
            <Info label="수도"><EntityLink id={c?.capital_id} /></Info>
            <Info label="국가원수"><EntityLink id={c?.head_of_state_id} /></Info>
            <Info label="정부수반"><EntityLink id={c?.head_of_government_id} /></Info>
            <Info label="인구">{formatNumber(c?.population)}</Info>
            <Info label="면적">{c?.area_km2 ? `${formatNumber(c.area_km2)} km²` : '—'}</Info>
            <Info label="존재 여부">{entityActiveAt(entity, date) ? <Badge tone="success">존속</Badge> : <Badge tone="muted">{entity.ends_on && entity.ends_on <= date ? '멸망' : '건국 전'}</Badge>}</Info>
          </dl>
        </div>
        {c?.seat_of_government_id && c.seat_of_government_id !== c.capital_id && <p className="px-4 pb-3 text-[12px] text-muted">정부 소재지: {entityMap.get(c.seat_of_government_id)?.name}</p>}
      </Card>
      <Card className="p-4"><EntityForm key={entity.id} entity={entity} /></Card>
    </>
  )
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-subtle">{label}</dt>
      <dd className="truncate font-medium">{children}</dd>
    </div>
  )
}

export function CountryHistory({ entity }: { entity: Entity }) {
  return (
    <>
      <TemporalEditor config={TEMPORAL.country_states} filters={{ country_id: entity.id }} singleValued title="국가 상태 이력 (국가명·국기·정치체제·원수 등)" />
      <Section entity={entity} k="history" />
    </>
  )
}

export function CountryPolitics({ entity }: { entity: Entity }) {
  const { date, entities } = useWorld()
  const govs = useTable<AnyRow>('atlas_governments', { country_id: entity.id })
  const parties = useTable<AnyRow>('atlas_parties', { country_id: entity.id })
  const ideologies = useIdeologies()
  const open = useCreateDialog((s) => s.open)
  const byId = new Map(entities.map((e) => [e.id, e]))
  const govList = sortBy((govs.data ?? []).map((g) => byId.get(g.id)).filter(Boolean) as Entity[], (e) => e.starts_on)
  const partyRows = (parties.data ?? []).filter((p) => byId.has(p.id))
  return (
    <>
      <Card>
        <CardHeader title="정부" icon={<Crown />} sub="재임 기간별 정부. 현재 날짜의 정부가 강조됩니다." actions={<Button size="xs" variant="secondary" onClick={() => open('government', { sub: { country_id: entity.id } })}><Plus />정부 생성</Button>} />
        {govs.isLoading ? <Loading /> : govList.length === 0 ? <p className="px-4 py-3 text-[12px] text-subtle">기록된 정부가 없습니다.</p> : (
          <ul className="divide-y divide-border">
            {govList.map((g) => {
              const row = govs.data!.find((x) => x.id === g.id)!
              return (
                <li key={g.id} className={`flex items-center gap-3 px-4 py-2 text-[12.5px] ${entityActiveAt(g, date) ? 'bg-accent-soft/50' : ''}`}>
                  <span className="w-44 tabular-nums text-[11.5px] text-muted">{formatRange(g.starts_on, g.ends_on)}</span>
                  <EntityLink id={g.id} />
                  {entityActiveAt(g, date) && <Badge tone="accent">현재</Badge>}
                  <span className="ml-auto text-[11.5px] text-muted">{row.regime} {row.head_of_government_id && <>· 수반 <EntityLink id={row.head_of_government_id} showIcon={false} /></>}</span>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title="정당" icon={<Users />} actions={<Button size="xs" variant="secondary" onClick={() => open('party', { sub: { country_id: entity.id } })}><Plus />정당 생성</Button>} />
        {partyRows.length === 0 ? <p className="px-4 py-3 text-[12px] text-subtle">이 국가의 정당이 없습니다.</p> : (
          <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {partyRows.map((p) => {
              const e = byId.get(p.id)!
              const ideo = ideologies.data?.find((i) => i.id === p.ideology_id)
              const color = p.color_mode === 'custom' && e.color ? e.color : ideo?.color ?? e.color
              return (
                <div key={p.id} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2" style={{ borderLeft: `4px solid ${color ?? 'var(--border)'}` }}>
                  <div className="min-w-0 flex-1"><EntityLink id={p.id} showIcon={false} /><p className="text-[11px] text-subtle">{ideo?.name ?? '이념 미지정'}{p.abbreviation ? ` · ${p.abbreviation}` : ''}</p></div>
                  {!entityActiveAt(e, date) && <Badge tone="muted">비활동</Badge>}
                </div>
              )
            })}
          </div>
        )}
      </Card>
      <Section entity={entity} k="politics" />
    </>
  )
}

export function CountryParliament({ entity }: { entity: Entity }) {
  const parls = useTable<AnyRow>('atlas_parliaments', { country_id: entity.id })
  const { entityMap } = useWorld()
  const open = useCreateDialog((s) => s.open)
  const list = (parls.data ?? []).map((p) => entityMap.get(p.id)).filter(Boolean) as Entity[]
  if (parls.isLoading) return <Loading />
  return (
    <>
      <div className="flex justify-end"><Button size="sm" variant="secondary" onClick={() => open('parliament', { sub: { country_id: entity.id } })}><Plus />의회 생성</Button></div>
      {list.length === 0 ? <Empty icon={<Landmark />} title="의회가 없습니다" description="의회를 만들고 원(院)과 총 의석을 설정하세요." /> : list.map((p) => (
        <div key={p.id} className="flex flex-col gap-2">
          <h3 className="text-[13px] font-semibold"><EntityLink id={p.id} /></h3>
          <ParliamentChambers entity={p} />
        </div>
      ))}
    </>
  )
}

export function CountryMilitary({ entity }: { entity: Entity }) {
  const ships = useTable<AnyRow>('atlas_ships', { country_id: entity.id })
  const { entityMap, date } = useWorld()
  const shipList = (ships.data ?? []).map((s) => entityMap.get(s.id)).filter(Boolean) as Entity[]
  return (
    <>
      <Card>
        <CardHeader title={`군 편제 (${formatDate(date)})`} icon={<Shield />} sub="이 날짜에 이 국가에 소속된 부대의 편제" />
        <div className="p-2"><OrderOfBattleTree countryId={entity.id} /></div>
      </Card>
      <Card>
        <CardHeader title="함선" icon={<Anchor />} sub={`${shipList.length}척`} />
        {shipList.length === 0 ? <p className="px-4 py-3 text-[12px] text-subtle">등록된 함선이 없습니다.</p> : (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 p-4">{shipList.map((s) => <span key={s.id} className={entityActiveAt(s, date) ? '' : 'opacity-50'}><EntityLink id={s.id} /></span>)}</div>
        )}
      </Card>
      <Section entity={entity} k="military" />
    </>
  )
}

export function CountryDiplomacy({ entity }: { entity: Entity }) {
  const { date } = useWorld()
  const wars = useTemporal<WarParticipant>('atlas_war_participants', { participant_id: entity.id })
  const rel = useTemporal<DiplomaticRelation>('atlas_diplomatic_relations')
  const current = rowsAt(rel.visible.filter((r) => r.a_id === entity.id || r.b_id === entity.id), date)
  return (
    <>
      {current.length > 0 && (
        <Card>
          <CardHeader title={`${formatDate(date)} 외교 현황`} />
          <div className="flex flex-wrap gap-2 p-3">
            {current.map((r) => {
              const t = RELATION_TYPES[r.relation_type]
              return (
                <span key={r.id} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[12px]">
                  <span className="size-2 rounded-full" style={{ background: t?.color }} />{t?.label}
                  <EntityLink id={r.a_id === entity.id ? r.b_id : r.a_id} />
                  {!r.is_public && <Badge tone="warning">비밀</Badge>}
                </span>
              )
            })}
          </div>
        </Card>
      )}
      <TemporalEditor config={TEMPORAL.diplomatic_relations} match={(r) => r.a_id === entity.id || r.b_id === entity.id} fixed={{ a_id: entity.id }} title="외교관계 이력" />
      <Card>
        <CardHeader title="참전 기록" icon={<Swords />} />
        {wars.visible.length === 0 ? <p className="px-4 py-3 text-[12px] text-subtle">참전 기록이 없습니다.</p> : (
          <ul className="divide-y divide-border">
            {sortBy(wars.visible, (w) => w.valid_from).map((w) => (
              <li key={w.id} className="flex items-center gap-3 px-4 py-2 text-[12.5px]">
                <span className="w-44 text-[11.5px] tabular-nums text-muted">{formatRange(w.valid_from, w.valid_to)}</span>
                <EntityLink id={w.war_id} />
                {inRange(date, w.valid_from, w.valid_to) && <Badge tone="danger">교전 중</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Section entity={entity} k="diplomacy" />
    </>
  )
}

export function CountryTerritory({ entity }: { entity: Entity }) {
  const { date } = useWorld()
  const control = useTemporal<TerritoryControl>('atlas_territory_control')
  const claims = useTemporal<TerritoryClaim>('atlas_territory_claims', { claimant_id: entity.id })
  const now = rowsAt(control.visible, date)
  const controlled = now.filter((r) => r.controller_id === entity.id)
  const nominal = now.filter((r) => r.sovereign_id === entity.id && r.controller_id !== entity.id)
  const lost = now.filter((r) => r.sovereign_id === entity.id && r.controller_id && r.controller_id !== entity.id)
  const activeClaims = rowsAt(claims.visible, date)
  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <RegionList title="실효지배 지역" rows={controlled} render={(r) => <><EntityLink id={r.region_id} /><span className="text-[11px] text-subtle">{CONTROL_STATUS[r.status]}</span></>} />
        <RegionList title="명목상 주권만 보유" rows={nominal} render={(r) => <><EntityLink id={r.region_id} />{r.controller_id && <span className="text-[11px] text-subtle">점유: <EntityLink id={r.controller_id} showIcon={false} /></span>}</>} empty={lost.length ? undefined : '없음'} />
        <RegionList title="영유권 주장" rows={activeClaims} render={(r) => <><EntityLink id={r.region_id} /><span className="text-[11px] text-subtle">{CLAIM_TYPES[r.claim_type]}</span></>} />
      </div>
      <TemporalEditor config={TEMPORAL.territory_control} match={(r) => r.controller_id === entity.id || r.sovereign_id === entity.id} fixed={{}} title="영토 지배 이력 (이 국가 관련)" compact />
      <TemporalEditor config={TEMPORAL.territory_claims} filters={{ claimant_id: entity.id }} title="영유권 주장 이력" compact />
      <Section entity={entity} k="territory" />
    </>
  )
}

function RegionList<T extends { id: string }>({ title, rows, render, empty }: { title: string; rows: T[]; render: (r: T) => React.ReactNode; empty?: string }) {
  return (
    <Card>
      <CardHeader title={title} sub={`${rows.length}개`} />
      {rows.length === 0 ? <p className="px-3.5 py-3 text-[12px] text-subtle">{empty ?? '없음'}</p> : (
        <ul className="max-h-60 overflow-y-auto">{rows.map((r) => <li key={r.id} className="flex items-center justify-between gap-2 px-3.5 py-1.5 text-[12.5px]">{render(r)}</li>)}</ul>
      )}
    </Card>
  )
}

const EVENT_KINDS = new Set(['event', 'war', 'battle', 'treaty', 'election'])

export function CountryEvents({ entity }: { entity: Entity }) {
  const { entities, date } = useWorld()
  const rels = useTemporal<Temporal & AnyRow & { from_id: string; to_id: string; valid_from: string | null; valid_to: string | null; id: string; branch_id: string; overrides_id: string | null; is_tombstone: boolean }>('atlas_entity_relations')
  const wars = useTemporal<WarParticipant>('atlas_war_participants', { participant_id: entity.id })
  const treaties = useTable<AnyRow>('atlas_treaty_participants', { participant_id: entity.id }, 'treaty_id')
  const elections = useTable<AnyRow>('atlas_elections', { country_id: entity.id })
  const ids = new Set<string>()
  for (const r of rels.visible) {
    if (r.from_id === entity.id) ids.add(r.to_id)
    if (r.to_id === entity.id) ids.add(r.from_id)
  }
  for (const w of wars.visible) ids.add(w.war_id)
  for (const t of treaties.data ?? []) ids.add(t.treaty_id)
  for (const e of elections.data ?? []) ids.add(e.id)
  const list = entities.filter((e) => ids.has(e.id) && EVENT_KINDS.has(e.kind)).sort((a, b) => compareDates(a.starts_on, b.starts_on))
  return (
    <Card>
      <CardHeader title="관련 사건 연표" icon={<Calendar />} sub="관계로 연결된 사건, 참전한 전쟁, 서명한 조약, 이 국가의 선거" />
      {list.length === 0 ? <p className="px-4 py-3 text-[12px] text-subtle">연결된 사건이 없습니다. 사건의 "관계·연결" 탭에서 이 국가를 연결하세요.</p> : (
        <ol className="relative ml-6 border-l border-border py-2">
          {list.map((e) => (
            <li key={e.id} className="relative py-1.5 pl-4">
              <span className={`absolute -left-[5px] top-3 size-2.5 rounded-full border-2 border-surface ${e.starts_on && e.starts_on <= date ? 'bg-accent' : 'bg-surface-3'}`} />
              <span className="mr-2 text-[11.5px] tabular-nums text-muted">{formatRange(e.starts_on, e.ends_on)}</span>
              <EntityLink id={e.id} />
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

export function CountryPeople({ entity }: { entity: Entity }) {
  const { date, entityMap } = useWorld()
  const nationals = useTable<AnyRow>('atlas_characters', { nationality_id: entity.id })
  const aff = useTemporal<Temporal & AnyRow & UnitState>('atlas_affiliations', { organization_id: entity.id })
  const pos = useTemporal<Temporal & AnyRow & UnitState>('atlas_positions', { organization_id: entity.id })
  const current = rowsAt(pos.visible, date)
  const ids = new Set<string>([...(nationals.data ?? []).map((c) => c.id), ...aff.visible.map((a) => a.character_id as string)])
  const people = [...ids].map((id) => entityMap.get(id)).filter(Boolean) as Entity[]
  return (
    <>
      <Card>
        <CardHeader title={`${formatDate(date)} 현직`} icon={<Crown />} />
        {current.length === 0 ? <p className="px-4 py-3 text-[12px] text-subtle">이 날짜에 기록된 직책이 없습니다.</p> : (
          <ul className="divide-y divide-border">{current.map((p) => <li key={p.id} className="flex gap-3 px-4 py-2 text-[12.5px]"><span className="w-40 font-medium">{String(p.title)}</span><EntityLink id={p.character_id as string} /></li>)}</ul>
        )}
      </Card>
      <Card>
        <CardHeader title="국적·소속 인물" icon={<Users />} sub={`${people.length}명`} />
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 p-4">
          {people.length === 0 ? <span className="text-[12px] text-subtle">없음</span> : sortBy(people, (p) => p.name).map((p) => <span key={p.id} className={entityActiveAt(p, date) ? '' : 'opacity-50'}><EntityLink id={p.id} /></span>)}
        </div>
      </Card>
    </>
  )
}
