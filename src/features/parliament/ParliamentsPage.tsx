import { Landmark } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/menu'
import { useTable } from '@/data/hooks'
import type { AnyRow } from '@/data/types'
import { ELECTION_TYPES } from '@/domain/kinds'
import { EntityLink } from '@/features/entities/common'
import { EntityListPage, PageHeader } from '@/features/entities/EntityListPage'

export function ParliamentsPage() {
  const [tab, setTab] = useState('parliaments')
  const parls = useTable<AnyRow>('atlas_parliaments')
  const elections = useTable<AnyRow>('atlas_elections')
  const pById = useMemo(() => new Map((parls.data ?? []).map((p) => [p.id as string, p])), [parls.data])
  const eById = useMemo(() => new Map((elections.data ?? []).map((p) => [p.id as string, p])), [elections.data])
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="의회·선거" icon={<Landmark />} sub="단원제·양원제 의회, 의석 시각화, 선거 기록" />
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="px-4"><TabsTrigger value="parliaments">의회</TabsTrigger><TabsTrigger value="elections">선거</TabsTrigger></TabsList>
        <TabsContent value="parliaments" className="min-h-0 flex-1">
          <EntityListPage kind="parliament" embedded extraColumns={[
            { label: '국가', width: 'minmax(120px,1fr)', render: (e) => <EntityLink id={pById.get(e.id)?.country_id} /> },
            { label: '구조', width: '70px', render: (e) => <span className="text-[12px]">{pById.get(e.id)?.structure === 'bicameral' ? '양원제' : '단원제'}</span> },
          ]} />
        </TabsContent>
        <TabsContent value="elections" className="min-h-0 flex-1">
          <EntityListPage kind="election" embedded extraColumns={[
            { label: '국가', width: 'minmax(120px,1fr)', render: (e) => <EntityLink id={eById.get(e.id)?.country_id} /> },
            { label: '종류', width: '100px', render: (e) => <span className="text-[12px]">{ELECTION_TYPES[eById.get(e.id)?.election_type] ?? '—'}</span> },
            { label: '반영', width: '60px', render: (e) => <span className="text-[12px]">{eById.get(e.id)?.applied_at ? '✓' : ''}</span> },
          ]} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
