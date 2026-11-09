import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Copy, GripVertical, Plus, Search, Shield, Star } from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Badge, Empty, Loading, Tooltip } from '@/components/ui/misc'
import { applyPlan } from '@/data/db'
import { duplicateEntity } from '@/data/entities'
import { useInvalidateTable, useTable, useTemporal } from '@/data/hooks'
import type { AnyRow, Entity, UnitState } from '@/data/types'
import { useWorld } from '@/data/world'
import { formatDate } from '@/domain/dates'
import { SERVICE_BRANCHES } from '@/domain/kinds'
import { buildOob, filterOob, flattenOob, wouldCycle, type OobNode } from '@/domain/oob'
import { planSetFrom } from '@/domain/timeline'
import { friendlyError } from '@/lib/errors'
import { cn, formatNumber } from '@/lib/utils'
import { useSession } from '@/stores/session'
import { EntityLink } from '@/features/entities/common'
import { useCreateDialog } from '@/features/entities/CreateEntityDialog'

type Node = OobNode<Entity, UnitState>
const STATE_FIELDS = ['unit_id', 'parent_unit_id', 'country_id', 'commander_id', 'name', 'strength', 'garrison', 'training', 'morale', 'loyalty', 'supply', 'note'] as const

/** Copy the attributes of the current state for a new period (so a move keeps commander etc.). */
export function carryState(unitId: string, s: UnitState | undefined): Partial<UnitState> {
  const out: AnyRow = { unit_id: unitId }
  if (s) for (const f of STATE_FIELDS) out[f] = (s as AnyRow)[f]
  return out as Partial<UnitState>
}

export function useOob() {
  const { entities, date } = useWorld()
  const states = useTemporal<UnitState>('atlas_unit_states')
  const unitsSub = useTable<AnyRow>('atlas_units')
  const units = useMemo(() => entities.filter((e) => e.kind === 'unit'), [entities])
  const subById = useMemo(() => new Map((unitsSub.data ?? []).map((u) => [u.id as string, u])), [unitsSub.data])
  const roots = useMemo(() => buildOob(units, states.visible, date, (u) => Number(subById.get(u.id)?.echelon ?? 0) * 1000 + Number(subById.get(u.id)?.sort_order ?? 0)), [units, states.visible, date, subById])
  return { roots, states, subById, loading: states.isLoading || unitsSub.isLoading }
}

export function OrderOfBattleTree({ countryId, service }: { countryId?: string; service?: string }) {
  const { date, canEdit, branchId, projectId } = useWorld()
  const { roots, states, subById, loading } = useOob()
  const invalidate = useInvalidateTable()
  const openCreate = useCreateDialog((s) => s.open)
  const [q, setQ] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const shown = useMemo(() => {
    let r = roots as Node[]
    if (countryId) r = filterOob(r, (n) => n.countryId === countryId)
    if (service) r = filterOob(r, (n) => subById.get(n.unit.id)?.service_branch === service)
    if (q.trim()) r = filterOob(r, (n) => n.unit.name.toLowerCase().includes(q.trim().toLowerCase()) || (n.state?.name ?? '').toLowerCase().includes(q.trim().toLowerCase()))
    return r
  }, [roots, countryId, service, q, subById])
  const all = useMemo(() => flattenOob(roots as Node[]), [roots])
  const parentOf = useMemo(() => new Map(all.map((n) => [n.unit.id, n.state?.parent_unit_id ?? null])), [all])
  const nodeById = useMemo(() => new Map(all.map((n) => [n.unit.id, n])), [all])

  const move = async (unitId: string, newParent: string | null) => {
    if (unitId === newParent) return
    if (wouldCycle(parentOf, unitId, newParent)) return toast.error('순환참조: 하위 부대 아래로 상위 부대를 옮길 수 없습니다.')
    const node = nodeById.get(unitId)
    if ((node?.state?.parent_unit_id ?? null) === newParent) return
    try {
      const keyRows = states.visible.filter((s) => s.unit_id === unitId)
      const values = { ...carryState(unitId, node?.state), parent_unit_id: newParent }
      await applyPlan('atlas_unit_states', planSetFrom(keyRows, date, values), branchId, { project_id: projectId })
      invalidate('atlas_unit_states')
      toast.success(`${formatDate(date)}부로 편제를 변경했습니다.`)
    } catch (e) { toast.error(friendlyError(e)) }
  }

  const onDragEnd = (e: DragEndEvent) => {
    const unitId = String(e.active.id)
    const over = e.over?.id ? String(e.over.id) : null
    if (!over) return
    move(unitId, over === '__root__' ? null : over)
  }

  if (loading) return <Loading />
  const toggle = (id: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <div className="relative w-56"><Search className="absolute left-2.5 top-2 size-4 text-subtle" /><Input className="pl-8" placeholder="부대 검색" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Button size="sm" variant="ghost" onClick={() => setCollapsed(new Set())}><ChevronsUpDown />모두 펼치기</Button>
        <Button size="sm" variant="ghost" onClick={() => setCollapsed(new Set(all.filter((n) => n.children.length).map((n) => n.unit.id)))}><ChevronsDownUp />모두 접기</Button>
        <span className="ml-auto text-[11.5px] text-subtle">{formatDate(date)} 기준 · 드래그하여 상위부대 변경 (이 날짜부터 적용)</span>
      </div>
      {shown.length === 0 ? <Empty icon={<Shield />} title="이 날짜에 존재하는 부대가 없습니다" description="부대를 만들고 편제·이력 탭에서 상위부대와 소속 국가를 지정하세요." action={canEdit && <Button onClick={() => openCreate('unit', { navigate: false })}><Plus />부대 생성</Button>} /> : (
        <DndContext sensors={sensors} onDragEnd={canEdit ? onDragEnd : undefined}>
          <RootDrop enabled={canEdit} />
          <ul className="flex flex-col" role="tree" data-testid="oob-tree">
            {shown.map((n) => <TreeNode key={n.unit.id} node={n} collapsed={collapsed} toggle={toggle} subById={subById} canEdit={canEdit} />)}
          </ul>
        </DndContext>
      )}
    </div>
  )
}

function RootDrop({ enabled }: { enabled: boolean }) {
  const { setNodeRef, isOver, active } = useDroppable({ id: '__root__', disabled: !enabled })
  if (!active) return null
  return <div ref={setNodeRef} className={cn('rounded-md border border-dashed border-border px-3 py-1.5 text-[11.5px] text-muted', isOver && 'border-accent bg-accent-soft text-accent')}>여기에 놓으면 최상위 부대가 됩니다</div>
}

const TreeNode = memo(function TreeNode({ node, collapsed, toggle, subById, canEdit }: { node: Node; collapsed: Set<string>; toggle: (id: string) => void; subById: Map<string, AnyRow>; canEdit: boolean }) {
  const { projectId, branchId } = useWorld()
  const openPanel = useSession((s) => s.openPanel)
  const openCreate = useCreateDialog((s) => s.open)
  const invalidate = useInvalidateTable()
  const drag = useDraggable({ id: node.unit.id, disabled: !canEdit })
  const drop = useDroppable({ id: node.unit.id, disabled: !canEdit })
  const isCollapsed = collapsed.has(node.unit.id)
  const sub = subById.get(node.unit.id)
  const s = node.state
  return (
    <li role="treeitem" aria-expanded={node.children.length ? !isCollapsed : undefined}>
      <div ref={drop.setNodeRef} className={cn('group flex items-center gap-1.5 rounded-md py-1 pr-2 text-[12.5px] hover:bg-surface-2', drop.isOver && 'bg-accent-soft ring-1 ring-accent', drag.isDragging && 'opacity-40')}
        style={{ paddingLeft: 4 + node.depth * 18 }} data-unit={node.unit.name}>
        <button className="flex size-4 items-center justify-center text-subtle" onClick={() => toggle(node.unit.id)} aria-label="펼치기/접기" disabled={!node.children.length}>
          {node.children.length ? (isCollapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />) : <span className="size-1 rounded-full bg-border-strong" />}
        </button>
        {canEdit && <span ref={drag.setNodeRef} {...drag.listeners} {...drag.attributes} className="cursor-grab text-subtle opacity-0 group-hover:opacity-100" aria-label="끌어서 이동"><GripVertical className="size-3.5" /></span>}
        <span className="rounded bg-surface-3 px-1 text-[10px] text-muted">{sub?.unit_type || SERVICE_BRANCHES[sub?.service_branch] || '부대'}</span>
        <EntityLink id={node.unit.id} showIcon={false}>{s?.name || node.unit.name}</EntityLink>
        {s?.commander_id && <span className="flex items-center gap-0.5 text-[11px] text-muted"><Star className="size-3" /><EntityLink id={s.commander_id} showIcon={false} /></span>}
        {s?.strength ? <span className="text-[11px] tabular-nums text-subtle">{formatNumber(s.strength)}명</span> : null}
        {s?.garrison && <span className="truncate text-[11px] text-subtle">@{s.garrison}</span>}
        {!s && <Tooltip content="이 날짜의 편제 기록이 없습니다"><Badge tone="muted">미배치</Badge></Tooltip>}
        <span className="ml-auto flex gap-0.5 opacity-0 group-hover:opacity-100">
          {canEdit && <Tooltip content="하위부대 추가"><Button size="icon-xs" variant="subtle" aria-label="하위부대 추가" onClick={() => openCreate('unit', {
            navigate: false, sub: { service_branch: sub?.service_branch ?? 'army', echelon: Number(sub?.echelon ?? 0) + 1 },
            onCreated: async (id) => {
              try {
                await applyPlan('atlas_unit_states', [{ kind: 'insert', values: { unit_id: id, parent_unit_id: node.unit.id, country_id: node.countryId, valid_from: null, valid_to: null } as Partial<UnitState> }], branchId, { project_id: projectId })
                invalidate('atlas_unit_states')
              } catch (e) { toast.error(friendlyError(e)) }
            },
          })}><Plus /></Button></Tooltip>}
          {canEdit && <Tooltip content="부대 복제 (같은 상위부대)"><Button size="icon-xs" variant="subtle" aria-label="복제" onClick={async () => {
            try {
              const copy = await duplicateEntity(node.unit, node.unit.origin_branch_id)
              await applyPlan('atlas_unit_states', [{ kind: 'insert', values: { ...carryState(copy.id, s), unit_id: copy.id, valid_from: null, valid_to: null } as Partial<UnitState> }], branchId, { project_id: projectId })
              invalidate('atlas_entities', 'atlas_unit_states', 'atlas_units')
              toast.success('부대를 복제했습니다.')
            } catch (e) { toast.error(friendlyError(e)) }
          }}><Copy /></Button></Tooltip>}
          <Button size="xs" variant="subtle" onClick={() => openPanel(node.unit.id)}>보기</Button>
        </span>
      </div>
      {!isCollapsed && node.children.length > 0 && (
        <ul role="group">{node.children.map((c) => <TreeNode key={c.unit.id} node={c as Node} collapsed={collapsed} toggle={toggle} subById={subById} canEdit={canEdit} />)}</ul>
      )}
    </li>
  )
})

export function MilitaryPage() {
  const { canEdit } = useWorld()
  const openCreate = useCreateDialog((s) => s.open)
  const [country, setCountry] = useState('')
  const [service, setService] = useState('')
  const { entities } = useWorld()
  const countries = entities.filter((e) => e.kind === 'country')
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-5 py-3">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft text-accent"><Shield className="size-4" /></span>
        <div className="flex-1"><h1 className="text-[16px] font-semibold">군 편제</h1><p className="text-[12px] text-muted">계층형 편제 트리 · 날짜에 따라 편제가 달라집니다</p></div>
        <Select className="w-40" value={country} onChange={(e) => setCountry(e.target.value)}><option value="">모든 국가</option>{countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select className="w-32" value={service} onChange={(e) => setService(e.target.value)}><option value="">모든 군종</option>{Object.entries(SERVICE_BRANCHES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        {canEdit && <Button onClick={() => openCreate('unit', { navigate: false })} data-testid="create-unit"><Plus />부대 생성</Button>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4"><OrderOfBattleTree countryId={country || undefined} service={service || undefined} /></div>
    </div>
  )
}
