import { useInfiniteQuery } from '@tanstack/react-query'
import { History, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/dialog'
import { Select } from '@/components/ui/input'
import { Badge, Card, Empty, Loading } from '@/components/ui/misc'
import { rpc } from '@/data/db'
import { useInvalidateProject } from '@/data/hooks'
import type { ChangeLog } from '@/data/types'
import { useWorld } from '@/data/world'
import { friendlyError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { EntityLink } from '@/features/entities/common'
import { PageHeader } from '@/features/entities/EntityListPage'

const TABLE_LABEL: Record<string, string> = {
  atlas_entities: '항목 기본정보', atlas_countries: '국가', atlas_regions: '지역', atlas_country_states: '국가 상태', atlas_territory_control: '영토 지배',
  atlas_territory_claims: '영유권', atlas_parties: '정당', atlas_factions: '계파', atlas_governments: '정부', atlas_characters: '인물', atlas_positions: '직책',
  atlas_affiliations: '소속', atlas_parliaments: '의회', atlas_chambers: '원', atlas_elections: '선거', atlas_election_results: '선거 결과',
  atlas_seat_allocations: '의석 배분', atlas_party_polling: '지지율', atlas_units: '부대', atlas_unit_states: '편제', atlas_ships: '함선',
  atlas_ship_assignments: '함선 소속', atlas_equipment: '장비', atlas_equipment_holdings: '장비 보유', atlas_events: '사건', atlas_wars: '전쟁',
  atlas_war_sides: '전쟁 진영', atlas_war_participants: '참전', atlas_battles: '전투', atlas_treaties: '조약', atlas_treaty_clauses: '조항',
  atlas_treaty_participants: '서명국', atlas_diplomatic_relations: '외교관계', atlas_maps: '지도', atlas_map_regions: '지도 영역', atlas_markers: '마커',
  atlas_map_features: '지도 도형', atlas_assets: '자료', atlas_asset_links: '자료 연결', atlas_ideologies: '이념', atlas_branches: '세계선',
  atlas_entity_relations: '관계', atlas_entity_branch_hidden: '세계선 숨김', atlas_government_parties: '정부 정당',
}
const ACTION = { INSERT: { l: '생성', t: 'success' }, UPDATE: { l: '수정', t: 'accent' }, DELETE: { l: '삭제', t: 'danger' } } as const
const SKIP = new Set(['updated_at', 'updated_by', 'created_at', 'created_by', 'project_id', 'id'])

function short(v: unknown): string {
  if (v === null || v === undefined || v === '') return '∅'
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return s.length > 80 ? s.slice(0, 80) + '…' : s
}

export function HistoryPage() {
  const { projectId, canEdit, entityMap } = useWorld()
  const confirm = useConfirm()
  const invalidateAll = useInvalidateProject()
  const [table, setTable] = useState('')
  const q = useInfiniteQuery({
    queryKey: ['changes', projectId, table],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      let qb = supabase.from('atlas_change_logs').select('*').eq('project_id', projectId).order('changed_at', { ascending: false }).range(pageParam, pageParam + 49)
      if (table) qb = qb.eq('table_name', table)
      const { data, error } = await qb
      if (error) throw error
      return data as ChangeLog[]
    },
    getNextPageParam: (last, all) => (last.length === 50 ? all.length * 50 : undefined),
  })
  const rows = q.data?.pages.flat() ?? []
  const revert = async (c: ChangeLog) => {
    if (!(await confirm({ title: '이 변경을 되돌릴까요?', description: c.action === 'INSERT' ? '생성된 행을 삭제합니다.' : c.action === 'DELETE' ? '삭제된 행을 복원합니다.' : `변경된 필드(${c.changed_fields.filter((f) => !SKIP.has(f)).join(', ')})를 이전 값으로 되돌립니다.` }))) return
    try { await rpc('atlas_revert_change', { p_change_id: c.id }); toast.success('되돌렸습니다.'); invalidateAll(); q.refetch() } catch (e) { toast.error(friendlyError(e)) }
  }
  const subject = (c: ChangeLog) => {
    const d = (c.new_data ?? c.old_data ?? {}) as Record<string, unknown>
    const id = (d.country_id ?? d.region_id ?? d.character_id ?? d.unit_id ?? d.ship_id ?? d.war_id ?? d.party_id ?? d.from_id ?? d.a_id ?? d.entity_id ?? d.treaty_id ?? d.election_id ?? d.parliament_id ?? (c.table_name === 'atlas_entities' || entityMap.has(String(d.id)) ? d.id : null)) as string | null
    return id && entityMap.has(id) ? <EntityLink id={id} /> : <span className="text-muted">{String(d.name ?? d.title ?? d.label ?? '')}</span>
  }
  return (
    <div className="flex flex-col">
      <PageHeader title="변경 기록" icon={<History />} sub="실제 편집 이력 (세계관 내부의 역사적 시간과 별개) · 수정 날짜·사용자·대상·변경 필드·전후 값"
        actions={<Select className="w-44" value={table} onChange={(e) => setTable(e.target.value)}><option value="">모든 데이터</option>{Object.entries(TABLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>} />
      <div className="mx-auto w-full max-w-5xl p-5">
        {q.isLoading ? <Loading /> : rows.length === 0 ? <Empty icon={<History />} title="변경 기록이 없습니다" /> : (
          <Card>
            <ul className="divide-y divide-border">
              {rows.map((c) => (
                <li key={c.id} className="flex items-start gap-3 px-4 py-2" data-testid="change-row">
                  <div className="w-32 shrink-0 text-[11px] tabular-nums text-muted">{new Date(c.changed_at).toLocaleString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                  <Badge tone={ACTION[c.action].t}>{ACTION[c.action].l}</Badge>
                  <div className="min-w-0 flex-1 text-[12.5px]">
                    <div className="flex flex-wrap items-center gap-2"><span className="text-[11.5px] text-muted">{TABLE_LABEL[c.table_name] ?? c.table_name}</span>{subject(c)}{c.reverted_at && <Badge tone="muted">되돌림</Badge>}</div>
                    {c.action === 'UPDATE' && (
                      <ul className="mt-0.5 text-[11.5px]">
                        {c.changed_fields.filter((f) => !SKIP.has(f)).slice(0, 6).map((f) => (
                          <li key={f} className="truncate"><span className="text-subtle">{f}</span>: <span className="text-danger line-through">{short(c.old_data?.[f])}</span> → <span className="text-success">{short(c.new_data?.[f])}</span></li>
                        ))}
                      </ul>
                    )}
                    <p className="text-[10.5px] text-subtle">사용자 {c.changed_by?.slice(0, 8) ?? '시스템'}</p>
                  </div>
                  {canEdit && !c.reverted_at && c.row_id && <Button size="xs" variant="ghost" onClick={() => revert(c)}><RotateCcw />되돌리기</Button>}
                </li>
              ))}
            </ul>
            {q.hasNextPage && <div className="border-t border-border p-2 text-center"><Button variant="ghost" size="sm" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>더 보기</Button></div>}
          </Card>
        )}
      </div>
    </div>
  )
}
