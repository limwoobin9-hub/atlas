import { Swords } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/menu'
import { Badge } from '@/components/ui/misc'
import { useTable } from '@/data/hooks'
import type { AnyRow } from '@/data/types'
import { useWorld } from '@/data/world'
import { WAR_STATUS } from '@/domain/kinds'
import { entityActiveAt } from '@/domain/timeline'
import { EntityLink } from '@/features/entities/common'
import { EntityListPage, PageHeader } from '@/features/entities/EntityListPage'

export function WarsPage() {
  const [tab, setTab] = useState('wars')
  const { date } = useWorld()
  const wars = useTable<AnyRow>('atlas_wars')
  const battles = useTable<AnyRow>('atlas_battles')
  const wById = useMemo(() => new Map((wars.data ?? []).map((w) => [w.id as string, w])), [wars.data])
  const bById = useMemo(() => new Map((battles.data ?? []).map((w) => [w.id as string, w])), [battles.data])
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="전쟁" icon={<Swords />} sub="전쟁·진영·참전국·전투" />
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="px-4"><TabsTrigger value="wars">전쟁</TabsTrigger><TabsTrigger value="battles">전투</TabsTrigger></TabsList>
        <TabsContent value="wars" className="min-h-0 flex-1">
          <EntityListPage kind="war" embedded extraColumns={[
            { label: '상태', width: '120px', render: (e) => <span className="flex gap-1"><Badge>{WAR_STATUS[wById.get(e.id)?.war_status ?? 'ongoing']}</Badge>{entityActiveAt(e, date) && <Badge tone="danger">교전 중</Badge>}</span> },
          ]} />
        </TabsContent>
        <TabsContent value="battles" className="min-h-0 flex-1">
          <EntityListPage kind="battle" embedded extraColumns={[{ label: '전쟁', width: 'minmax(120px,1fr)', render: (e) => <EntityLink id={bById.get(e.id)?.war_id} /> }]} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
