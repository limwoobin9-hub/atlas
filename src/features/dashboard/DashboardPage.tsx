import { AlertTriangle, Anchor, CalendarDays, Clock, Flag, HelpCircle, LayoutDashboard, Map as MapIcon, Plus, Shield, Star, Swords, Users, Vote, Zap } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardHeader, Empty, Stat } from '@/components/ui/misc'
import { useTemporal } from '@/data/hooks'
import type { EntityKind, TerritoryClaim, TerritoryControl } from '@/data/types'
import { useWorld } from '@/data/world'
import { addYears, compareDates, formatDate, formatRange } from '@/domain/dates'
import { KINDS } from '@/domain/kinds'
import { entityActiveAt, rowsAt } from '@/domain/timeline'
import { EntityAvatar, EntityLink, StatusBadge, entityHref } from '@/features/entities/common'
import { useCreateDialog } from '@/features/entities/CreateEntityDialog'
import { PageHeader } from '@/features/entities/EntityListPage'
import { useConflicts } from '@/features/conflicts/ConflictsPage'
import { MapPreview } from '@/features/map/MapPreview'

const QUICK: EntityKind[] = ['country', 'character', 'event', 'war', 'party', 'unit', 'region', 'treaty']

export function DashboardPage() {
  const { entities, date, projectId, project, branch, canEdit, setDate } = useWorld()
  const nav = useNavigate()
  const openCreate = useCreateDialog((s) => s.open)
  const control = useTemporal<TerritoryControl>('atlas_territory_control')
  const claims = useTemporal<TerritoryClaim>('atlas_territory_claims')
  const { conflicts, loading: cLoading } = useConflicts()

  const stats = useMemo(() => {
    const active = (k: EntityKind) => entities.filter((e) => e.kind === k && entityActiveAt(e, date)).length
    const now = rowsAt(control.visible, date)
    const ctrl = new Map(now.map((r) => [r.region_id, r]))
    const disputes = new Set<string>()
    for (const c of rowsAt(claims.visible, date)) if (ctrl.get(c.region_id)?.controller_id !== c.claimant_id) disputes.add(c.region_id)
    for (const r of now) if (r.status === 'disputed' || (r.sovereign_id && r.controller_id && r.sovereign_id !== r.controller_id)) disputes.add(r.region_id)
    return {
      countries: active('country'), parties: active('party'), characters: active('character'), events: entities.filter((e) => e.kind === 'event').length,
      wars: active('war'), units: active('unit'), ships: entities.filter((e) => e.kind === 'ship' && entityActiveAt(e, date)).length, disputes: disputes.size,
    }
  }, [entities, date, control.visible, claims.visible])

  const recent = useMemo(() => [...entities].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 8), [entities])
  const around = useMemo(() => {
    const lo = addYears(date, -1)
    const hi = addYears(date, 1)
    return entities.filter((e) => ['event', 'war', 'battle', 'treaty', 'election'].includes(e.kind) && e.starts_on && e.starts_on >= lo && e.starts_on <= hi).sort((a, b) => compareDates(a.starts_on, b.starts_on)).slice(0, 12)
  }, [entities, date])
  const undecided = entities.filter((e) => e.status === 'undecided' || e.status === 'idea').slice(0, 10)
  const favorites = entities.filter((e) => e.tags.includes('즐겨찾기') || e.tags.includes('favorite')).slice(0, 8)

  return (
    <div className="flex flex-col">
      <PageHeader title={project.name} icon={<LayoutDashboard />} sub={`${branch.name} · ${formatDate(date)} 기준 세계 현황`} actions={
        <Button variant="secondary" size="sm" onClick={() => setDate(project.default_date)}><CalendarDays />기본 날짜 ({formatDate(project.default_date, 'short')})</Button>} />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-5">
        {canEdit && (
          <div className="flex flex-wrap gap-2" data-testid="quick-create">
            {QUICK.map((k) => <Button key={k} variant="secondary" size="sm" onClick={() => openCreate(k)}><Plus />{KINDS[k].label} 생성</Button>)}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-8" data-testid="dashboard-stats">
          <Stat label="활성 국가" value={stats.countries} icon={<Flag />} onClick={() => nav(`/p/${projectId}/countries`)} />
          <Stat label="정당" value={stats.parties} icon={<Vote />} onClick={() => nav(`/p/${projectId}/politics`)} />
          <Stat label="인물" value={stats.characters} icon={<Users />} sub="생존 기준" onClick={() => nav(`/p/${projectId}/characters`)} />
          <Stat label="사건" value={stats.events} icon={<Zap />} onClick={() => nav(`/p/${projectId}/events`)} />
          <Stat label="진행 중인 전쟁" value={stats.wars} icon={<Swords />} onClick={() => nav(`/p/${projectId}/wars`)} />
          <Stat label="군부대" value={stats.units} icon={<Shield />} onClick={() => nav(`/p/${projectId}/military`)} />
          <Stat label="함선" value={stats.ships} icon={<Anchor />} onClick={() => nav(`/p/${projectId}/ships`)} />
          <Stat label="영토 분쟁" value={stats.disputes} icon={<MapIcon />} onClick={() => nav(`/p/${projectId}/regions`)} />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="지도 미리보기" icon={<MapIcon />} sub={`${formatDate(date)} 영토 상태`} actions={<Button size="xs" variant="secondary" asChild><Link to={`/p/${projectId}/map`}>지도 열기</Link></Button>} />
            <MapPreview />
          </Card>
          <Card>
            <CardHeader title="현재 날짜 주변 사건" icon={<CalendarDays />} sub="±1년" />
            {around.length === 0 ? <p className="px-4 py-3 text-[12px] text-subtle">이 시기에 기록된 사건이 없습니다.</p> : (
              <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                {around.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 px-3.5 py-1.5 text-[12.5px]">
                    <button className={`w-20 shrink-0 text-left text-[11px] tabular-nums ${e.starts_on! <= date ? 'text-muted' : 'text-accent'} hover:underline`} onClick={() => setDate(e.starts_on!)}>{formatDate(e.starts_on, 'short')}</button>
                    <EntityLink id={e.id} /><span className="ml-auto text-[10.5px] text-subtle">{KINDS[e.kind].label}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader title="설정 충돌 경고" icon={<AlertTriangle />} actions={<Button size="xs" variant="ghost" asChild><Link to={`/p/${projectId}/conflicts`}>전체 보기</Link></Button>} />
            {cLoading ? <p className="px-4 py-3 text-[12px] text-subtle">검사 중…</p> : conflicts.length === 0 ? <p className="px-4 py-3 text-[12px] text-success">발견된 모순이 없습니다.</p> : (
              <ul className="divide-y divide-border">{conflicts.slice(0, 6).map((c) => (
                <li key={c.key} className="flex items-start gap-2 px-3.5 py-1.5 text-[12px]"><Badge tone={c.severity === 'error' ? 'danger' : 'warning'}>{c.category}</Badge><span className="line-clamp-2">{c.title}</span></li>
              ))}</ul>
            )}
          </Card>
          <Card>
            <CardHeader title="미정·아이디어 설정" icon={<HelpCircle />} sub="채워 넣을 항목" />
            {undecided.length === 0 ? <p className="px-4 py-3 text-[12px] text-subtle">미정 항목이 없습니다.</p> : (
              <ul className="divide-y divide-border">{undecided.map((e) => <li key={e.id} className="flex items-center gap-2 px-3.5 py-1.5 text-[12.5px]"><EntityLink id={e.id} /><span className="ml-auto"><StatusBadge status={e.status} /></span></li>)}</ul>
            )}
          </Card>
          <Card>
            <CardHeader title="최근 변경" icon={<Clock />} actions={<Button size="xs" variant="ghost" asChild><Link to={`/p/${projectId}/history`}>변경 기록</Link></Button>} />
            {recent.length === 0 ? <div className="p-4"><Empty title="아직 데이터가 없습니다" description="위의 빠른 생성 버튼으로 시작하세요." /></div> : (
              <ul className="divide-y divide-border">{recent.map((e) => (
                <li key={e.id} className="flex items-center gap-2 px-3.5 py-1.5 text-[12.5px]">
                  <EntityAvatar entity={e} size={18} /><Link to={entityHref(projectId, e)} className="truncate hover:text-accent">{e.name}</Link>
                  <span className="ml-auto shrink-0 text-[10.5px] text-subtle">{new Date(e.updated_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </li>
              ))}</ul>
            )}
          </Card>
        </div>
        {favorites.length > 0 && (
          <Card>
            <CardHeader title="즐겨찾기" icon={<Star />} sub="'즐겨찾기' 태그가 붙은 항목" />
            <div className="flex flex-wrap gap-3 p-4">{favorites.map((e) => <span key={e.id}><EntityLink id={e.id} /> <span className="text-[11px] text-subtle">{formatRange(e.starts_on, e.ends_on)}</span></span>)}</div>
          </Card>
        )}
      </div>
    </div>
  )
}
