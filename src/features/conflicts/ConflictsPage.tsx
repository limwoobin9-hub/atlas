import { CheckCircle2, ShieldAlert, ShieldCheck, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import { Badge, Card, Empty, Loading } from '@/components/ui/misc'
import { deleteWhere, insertRow } from '@/data/db'
import { useInvalidateTable, useTable, useTemporal } from '@/data/hooks'
import type { AnyRow, Chamber } from '@/data/types'
import { useWorld } from '@/data/world'
import { checkConflicts, type Conflict } from '@/domain/conflicts'
import { friendlyError } from '@/lib/errors'
import { EntityLink } from '@/features/entities/common'
import { PageHeader } from '@/features/entities/EntityListPage'

export function useConflicts() {
  const { entities, allEntities } = useWorld()
  const cs = useTemporal('atlas_country_states')
  const control = useTemporal('atlas_territory_control')
  const units = useTemporal('atlas_unit_states')
  const pos = useTemporal('atlas_positions')
  const aff = useTemporal('atlas_affiliations')
  const seats = useTemporal('atlas_seat_allocations')
  const ships = useTemporal('atlas_ship_assignments')
  const wp = useTemporal('atlas_war_participants')
  const chambers = useTable<Chamber>('atlas_chambers')
  const govs = useTable<AnyRow>('atlas_governments')
  const elections = useTable<AnyRow>('atlas_elections')
  const results = useTable<AnyRow>('atlas_election_results')
  const exceptions = useTable<{ id: string; conflict_key: string; note: string }>('atlas_conflict_exceptions')
  const loading = [cs, control, units, pos, aff, seats, ships, wp, chambers, govs, elections, results, exceptions].some((q) => q.isLoading)
  const all = useMemo(() => {
    if (loading) return []
    const inLine = new Set(entities.map((e) => e.id))
    return checkConflicts({
      entities, foreignIds: new Set(allEntities.filter((e) => !inLine.has(e.id)).map((e) => e.id)),
      countryStates: cs.visible as never, control: control.visible as never, unitStates: units.visible as never, positions: pos.visible as never,
      affiliations: aff.visible as never, seats: seats.visible as never, shipAssignments: ships.visible as never, warParticipants: wp.visible as never,
      chambers: chambers.data ?? [], governments: (govs.data ?? []) as never, elections: (elections.data ?? []) as never, electionResults: (results.data ?? []) as never,
    })
  }, [loading, entities, allEntities, cs.visible, control.visible, units.visible, pos.visible, aff.visible, seats.visible, ships.visible, wp.visible, chambers.data, govs.data, elections.data, results.data])
  const ex = new Map((exceptions.data ?? []).map((e) => [e.conflict_key, e]))
  return { loading, conflicts: all.filter((c) => !ex.has(c.key)), excepted: all.filter((c) => ex.has(c.key)), exceptions: ex }
}

export function ConflictsPage() {
  const { projectId, canEdit, branch } = useWorld()
  const { loading, conflicts, excepted } = useConflicts()
  const invalidate = useInvalidateTable()
  const [cat, setCat] = useState('')
  const [showExcepted, setShowExcepted] = useState(false)
  const cats = [...new Set(conflicts.map((c) => c.category))]
  const list = (showExcepted ? excepted : conflicts).filter((c) => !cat || c.category === cat)

  const except = async (c: Conflict) => {
    const note = window.prompt('예외로 처리하는 이유 (대체역사적 특수상황 등)', '') ?? null
    if (note === null) return
    try { await insertRow('atlas_conflict_exceptions', { project_id: projectId, conflict_key: c.key, note }); invalidate('atlas_conflict_exceptions'); toast.success('예외로 처리했습니다.') } catch (e) { toast.error(friendlyError(e)) }
  }
  const unexcept = async (c: Conflict) => {
    try { await deleteWhere('atlas_conflict_exceptions', { project_id: projectId, conflict_key: c.key }); invalidate('atlas_conflict_exceptions') } catch (e) { toast.error(friendlyError(e)) }
  }

  return (
    <div className="flex flex-col">
      <PageHeader title="설정 충돌 검사" icon={<ShieldAlert />} sub={`세계선 "${branch.name}" 전체 데이터의 모순 검출`} actions={<>
        <Select className="w-52" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">모든 유형</option>{cats.map((c) => <option key={c}>{c}</option>)}</Select>
        <Button variant={showExcepted ? 'default' : 'secondary'} onClick={() => setShowExcepted((v) => !v)}>예외 처리됨 ({excepted.length})</Button>
      </>} />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-5">
        <Card className="flex flex-wrap items-center gap-4 p-4 text-[12.5px]">
          <ShieldCheck className="size-5 text-success" />
          <span className="flex-1 text-muted">데이터베이스 구조로 보장됨: 프로젝트 간 잘못된 연결 없음 · 삭제된 항목에 대한 관계 없음 (복합 외래키) · 부대 순환 편제 저장 차단 (트리거)</span>
          <Badge tone={conflicts.some((c) => c.severity === 'error') ? 'danger' : conflicts.length ? 'warning' : 'success'}>{conflicts.length}건 검출</Badge>
        </Card>
        {loading ? <Loading label="검사 중…" /> : list.length === 0 ? (
          <Empty icon={<CheckCircle2 />} title={showExcepted ? '예외 처리된 항목이 없습니다' : '발견된 설정 충돌이 없습니다'} description="날짜 오류, 사망 이후 활동, 해체된 부대 소속, 의석 합계, 순환 편제, 기간 중복, 선거 반영 불일치를 검사합니다." />
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {list.map((c) => (
                <li key={c.key} className="flex items-start gap-3 px-4 py-2.5" data-testid="conflict">
                  <Badge tone={c.severity === 'error' ? 'danger' : 'warning'}>{c.severity === 'error' ? '오류' : '경고'}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-medium">{c.title}</p>
                    <p className="text-[11.5px] text-muted">{c.category} · {c.detail}</p>
                    {c.entityIds.length > 0 && <div className="mt-1 flex flex-wrap gap-2 text-[12px]">{c.entityIds.map((id) => <EntityLink key={id} id={id} />)}</div>}
                  </div>
                  {canEdit && (showExcepted ? <Button size="xs" variant="ghost" onClick={() => unexcept(c)}><Undo2 />예외 해제</Button> : <Button size="xs" variant="ghost" onClick={() => except(c)}>의도된 설정 (예외)</Button>)}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  )
}
