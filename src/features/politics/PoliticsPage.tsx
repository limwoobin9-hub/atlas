import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Landmark, Palette, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/dialog'
import { Input, Select } from '@/components/ui/input'
import { Card, CardHeader, ColorDot, Empty, Loading } from '@/components/ui/misc'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/menu'
import { deleteRow, insertRow, updateRow } from '@/data/db'
import { useIdeologies, useInvalidateTable, useTable } from '@/data/hooks'
import type { AnyRow, Ideology } from '@/data/types'
import { useWorld } from '@/data/world'
import { friendlyError } from '@/lib/errors'
import { EntityListPage, PageHeader } from '@/features/entities/EntityListPage'
import { EntityLink } from '@/features/entities/common'
import { ColorInput } from '@/features/entities/FieldInput'
import { usePartyColors } from '@/features/parliament/ParliamentChambers'
import { PollingComparison } from './PartyTabs'

export function PoliticsPage() {
  const [tab, setTab] = useState('parties')
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="정치·정당" icon={<Landmark />} sub="이념 · 정당 · 계파 · 정부 · 지지율" />
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="px-4">
          <TabsTrigger value="parties">정당</TabsTrigger><TabsTrigger value="ideologies">정치 이념</TabsTrigger>
          <TabsTrigger value="factions">계파</TabsTrigger><TabsTrigger value="governments">정부</TabsTrigger><TabsTrigger value="polling">지지율 비교</TabsTrigger>
        </TabsList>
        <TabsContent value="parties" className="min-h-0 flex-1"><PartyList /></TabsContent>
        <TabsContent value="ideologies" className="min-h-0 flex-1 overflow-y-auto p-5"><IdeologyManager /></TabsContent>
        <TabsContent value="factions" className="min-h-0 flex-1"><EntityListPage kind="faction" embedded /></TabsContent>
        <TabsContent value="governments" className="min-h-0 flex-1"><EntityListPage kind="government" embedded /></TabsContent>
        <TabsContent value="polling" className="min-h-0 flex-1 overflow-y-auto p-5"><PollingTab /></TabsContent>
      </Tabs>
    </div>
  )
}

function PartyList() {
  const parties = useTable<AnyRow>('atlas_parties')
  const ideologies = useIdeologies()
  const colors = usePartyColors()
  const byId = useMemo(() => new Map((parties.data ?? []).map((p) => [p.id as string, p])), [parties.data])
  return (
    <EntityListPage kind="party" embedded extraColumns={[
      { label: '색상', width: '50px', render: (e) => <ColorDot color={colors.get(e.id)} className="size-3.5" /> },
      { label: '소속 국가', width: 'minmax(110px,1fr)', render: (e) => <EntityLink id={byId.get(e.id)?.country_id} /> },
      { label: '이념', width: '110px', render: (e) => <span className="text-[12px]">{ideologies.data?.find((i) => i.id === byId.get(e.id)?.ideology_id)?.name ?? '—'}</span> },
    ]} />
  )
}

function PollingTab() {
  const { entities } = useWorld()
  const parties = useTable<AnyRow>('atlas_parties')
  const [country, setCountry] = useState('')
  const countries = entities.filter((e) => e.kind === 'country')
  const ids = (parties.data ?? []).filter((p) => !country || p.country_id === country).map((p) => p.id as string)
  return (
    <Card>
      <CardHeader title="정당 지지율 비교" sub="입력된 여론조사만 표시합니다 (지지율 ≠ 의석)" actions={
        <Select className="h-7 w-40" value={country} onChange={(e) => setCountry(e.target.value)}><option value="">모든 국가</option>{countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>} />
      <PollingComparison partyIds={ids} />
    </Card>
  )
}

function IdeologyManager() {
  const q = useIdeologies()
  const { projectId, canEdit } = useWorld()
  const invalidate = useInvalidateTable()
  const confirm = useConfirm()
  const [name, setName] = useState('')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const list = q.data ?? []
  const save = async (i: Ideology, patch: Partial<Ideology>) => {
    try { await updateRow('atlas_ideologies', i.id, patch); invalidate('atlas_ideologies', 'atlas_parties') } catch (e) { toast.error(friendlyError(e)) }
  }
  const onDragEnd = async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const ids = list.map((i) => i.id)
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)))
    try {
      await Promise.all(next.map((id, idx) => updateRow('atlas_ideologies', id, { sort_order: (idx + 1) * 10 })))
      invalidate('atlas_ideologies')
    } catch (err) { toast.error(friendlyError(err)) }
  }
  if (q.isLoading) return <Loading />
  return (
    <Card className="mx-auto max-w-4xl">
      <CardHeader title="정치 이념" icon={<Palette />} sub="정당 색상은 '이념 색상 사용' 설정 시 여기 색상을 따릅니다 (같은 이념 정당은 명도로 구분). 드래그로 좌→우 정렬 순서 변경." />
      {list.length === 0 ? <div className="p-4"><Empty title="이념이 없습니다" /></div> : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={canEdit ? onDragEnd : undefined}>
          <SortableContext items={list.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <ul className="divide-y divide-border">{list.map((i) => <IdeologyRow key={i.id} ideology={i} all={list} canEdit={canEdit} onSave={save} onDelete={async () => {
              if (!(await confirm({ title: `"${i.name}" 이념을 삭제할까요?`, description: '이 이념을 쓰는 정당·국가 상태의 이념 연결이 해제됩니다.', danger: true }))) return
              try { await deleteRow('atlas_ideologies', i.id); invalidate('atlas_ideologies', 'atlas_parties') } catch (e) { toast.error(friendlyError(e)) }
            }} />)}</ul>
          </SortableContext>
        </DndContext>
      )}
      {canEdit && (
        <form className="flex gap-2 border-t border-border p-3" onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim()) return
          try { await insertRow('atlas_ideologies', { project_id: projectId, name: name.trim(), sort_order: (list.length + 1) * 10, color: '#888888' }); setName(''); invalidate('atlas_ideologies') } catch (err) { toast.error(friendlyError(err)) }
        }}>
          <Input placeholder="새 이념 이름" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit"><Plus />추가</Button>
        </form>
      )}
    </Card>
  )
}

function IdeologyRow({ ideology: i, all, canEdit, onSave, onDelete }: { ideology: Ideology; all: Ideology[]; canEdit: boolean; onSave: (i: Ideology, p: Partial<Ideology>) => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: i.id, disabled: !canEdit })
  const [name, setName] = useState(i.name)
  const [desc, setDesc] = useState(i.description)
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="flex flex-wrap items-center gap-2 bg-surface px-3 py-2">
      <button {...attributes} {...listeners} className="cursor-grab text-subtle" aria-label="순서 이동" disabled={!canEdit}><GripVertical className="size-4" /></button>
      <ColorInput value={i.color} onChange={(c) => c && onSave(i, { color: c })} disabled={!canEdit} />
      <Input className="w-36" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== i.name && onSave(i, { name: name.trim() })} disabled={!canEdit} />
      <Select className="w-36" value={i.parent_id ?? ''} onChange={(e) => onSave(i, { parent_id: e.target.value || null })} disabled={!canEdit}>
        <option value="">상위 분류 없음</option>{all.filter((x) => x.id !== i.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </Select>
      <Input className="min-w-40 flex-1" placeholder="설명" value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== i.description && onSave(i, { description: desc })} disabled={!canEdit} />
      {canEdit && <Button variant="subtle" size="icon-sm" onClick={onDelete} aria-label="삭제"><Trash2 /></Button>}
    </li>
  )
}
