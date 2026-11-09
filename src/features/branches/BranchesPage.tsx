import { useQuery } from '@tanstack/react-query'
import { Eye, GitBranch, GitCompare, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, useConfirm } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Badge, Card, CardHeader, ColorDot, Empty, Loading, Switch } from '@/components/ui/misc'
import { deleteRow, deleteWhere, fetchAll, insertRow, updateRow, TEMPORAL_TABLES } from '@/data/db'
import { useHiddenQuery, useInvalidateTable } from '@/data/hooks'
import type { Branch } from '@/data/types'
import { useWorld } from '@/data/world'
import { DIFF_SPECS, diffBranches } from '@/domain/branchDiff'
import { formatDate } from '@/domain/dates'
import { KINDS } from '@/domain/kinds'
import { branchChain } from '@/domain/timeline'
import { friendlyError } from '@/lib/errors'
import { EntityLink } from '@/features/entities/common'
import { ColorInput } from '@/features/entities/FieldInput'
import { PageHeader } from '@/features/entities/EntityListPage'

export function BranchesPage() {
  const { branches, branch, setBranch, canEdit, projectId, allEntities } = useWorld()
  const hidden = useHiddenQuery(projectId)
  const invalidate = useInvalidateTable()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<Branch | 'new' | null>(null)
  const children = (id: string | null) => branches.filter((b) => b.parent_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at))

  const remove = async (b: Branch) => {
    if (children(b.id).length) return toast.error('하위 분기가 있는 세계선은 삭제할 수 없습니다. 하위 분기를 먼저 삭제하세요.')
    if (!(await confirm({ title: `세계선 "${b.name}"을(를) 삭제할까요?`, description: '이 세계선에서만 작성한 기록과 이 세계선 전용 항목이 모두 삭제됩니다. 상위 세계선의 데이터는 영향을 받지 않습니다.', danger: true, confirmLabel: '삭제' }))) return
    try {
      await deleteRow('atlas_branches', b.id)
      if (b.id === branch.id) setBranch(branches.find((x) => x.is_main)!.id)
      invalidate('atlas_branches', 'atlas_entities')
      toast.success('세계선을 삭제했습니다.')
    } catch (e) { toast.error(friendlyError(e)) }
  }

  const renderTree = (parent: string | null, depth: number): React.ReactNode => children(parent).map((b) => (
    <div key={b.id}>
      <div className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2" style={{ marginLeft: depth * 22 }} data-testid="branch-row">
        <GitBranch className="size-4" style={{ color: b.color }} />
        <span className="font-medium">{b.name}</span>
        {b.is_main && <Badge tone="accent">기본</Badge>}
        {b.id === branch.id && <Badge tone="success">선택됨</Badge>}
        <span className="text-[11.5px] text-muted">{b.is_main ? '' : b.fork_date ? `${formatDate(b.fork_date)} 분기` : '전체 복제 (사본)'}</span>
        {b.description && <span className="truncate text-[11.5px] text-subtle">— {b.description}</span>}
        <span className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100">
          {b.id !== branch.id && <Button size="xs" variant="secondary" onClick={() => setBranch(b.id)}>선택</Button>}
          {canEdit && <Button size="icon-xs" variant="subtle" onClick={() => setEditing(b)} aria-label="수정"><Pencil /></Button>}
          {canEdit && !b.is_main && <Button size="icon-xs" variant="subtle" onClick={() => remove(b)} aria-label="삭제"><Trash2 /></Button>}
        </span>
      </div>
      {renderTree(b.id, depth + 1)}
    </div>
  ))

  const hides = (hidden.data ?? []).map((h) => ({ ...h, entity: allEntities.find((e) => e.id === h.entity_id), branch: branches.find((b) => b.id === h.branch_id) }))

  return (
    <div className="flex flex-col">
      <PageHeader title="세계선" icon={<GitBranch />} sub="역사 분기 관리 · 분기 세계선은 분기일 이전의 역사를 공유하고, 이후는 독립적으로 기록됩니다 (copy-on-write)"
        actions={canEdit && <Button onClick={() => setEditing('new')} data-testid="new-branch"><Plus />새 분기</Button>} />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-5">
        <Card><CardHeader title="세계선 계보" /><div className="p-2 text-[12.5px]">{renderTree(null, 0)}</div></Card>
        <BranchCompare />
        <Card>
          <CardHeader title="세계선에서 숨긴 항목" icon={<Eye />} sub="특정 세계선에서 '존재하지 않음'으로 처리한 항목 (하위 분기에 상속)" />
          {hides.length === 0 ? <p className="px-4 py-3 text-[12px] text-subtle">없음</p> : (
            <ul className="divide-y divide-border">{hides.map((h) => (
              <li key={h.branch_id + h.entity_id} className="flex items-center gap-3 px-4 py-1.5 text-[12.5px]">
                <ColorDot color={h.branch?.color} /><span className="w-40 truncate text-muted">{h.branch?.name}</span><span className="flex-1">{h.entity?.name ?? '?'} <span className="text-[11px] text-subtle">{h.entity ? KINDS[h.entity.kind].label : ''}</span></span>
                {canEdit && <Button size="xs" variant="ghost" onClick={async () => { try { await deleteWhere('atlas_entity_branch_hidden', { branch_id: h.branch_id, entity_id: h.entity_id }); invalidate('atlas_entity_branch_hidden') } catch (e) { toast.error(friendlyError(e)) } }}>숨김 해제</Button>}
              </li>
            ))}</ul>
          )}
        </Card>
      </div>
      {editing && <BranchDialog branch={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function BranchDialog({ branch, onClose }: { branch: Branch | null; onClose: () => void }) {
  const { branches, branch: current, projectId, date, setBranch } = useWorld()
  const invalidate = useInvalidateTable()
  const [name, setName] = useState(branch?.name ?? '')
  const [desc, setDesc] = useState(branch?.description ?? '')
  const [color, setColor] = useState<string | null>(branch?.color ?? '#f59e0b')
  const [parent, setParent] = useState(branch?.parent_id ?? current.id)
  const [fork, setFork] = useState(branch?.fork_date ?? date)
  const [clone, setClone] = useState(false)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!name.trim()) return toast.error('이름을 입력하세요.')
    setBusy(true)
    try {
      if (branch) await updateRow('atlas_branches', branch.id, { name: name.trim(), description: desc, color: color ?? '#6366f1', ...(branch.is_main ? {} : { fork_date: clone ? null : fork || null }) })
      else {
        const b = await insertRow<Branch>('atlas_branches', { project_id: projectId, name: name.trim(), description: desc, color: color ?? '#f59e0b', parent_id: parent, fork_date: clone ? null : fork || null })
        setBranch(b.id)
        toast.success(`분기 "${b.name}"을(를) 만들고 선택했습니다.`)
      }
      invalidate('atlas_branches')
      onClose()
    } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={branch ? '세계선 수정' : '새 분기 세계선'} description={branch ? undefined : '데이터를 통째로 복사하지 않습니다. 분기일 이전 기록은 상위 세계선에서 상속되고, 분기 이후 수정은 이 세계선에만 저장됩니다.'}
        footer={<><Button variant="secondary" onClick={onClose}>취소</Button><Button onClick={save} disabled={busy} data-testid="branch-save">{branch ? '저장' : '분기 생성'}</Button></>}>
        <div className="flex flex-col gap-3">
          <Field label="이름"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 분기 A — 전쟁 회피" data-testid="branch-name" /></Field>
          <Field label="설명"><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} /></Field>
          <Field label="색상"><ColorInput value={color} onChange={setColor} /></Field>
          {!branch && <Field label="분기 원본 세계선"><Select value={parent} onChange={(e) => setParent(e.target.value)}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>}
          {!branch?.is_main && (
            <>
              <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-[12.5px]">
                <span><span className="block font-medium">전체 복제 (세계선 사본)</span><span className="block text-[11.5px] text-subtle">원본의 모든 시점 기록을 상속한 뒤 독립적으로 수정합니다.</span></span>
                <Switch checked={clone || (!!branch && !branch.fork_date)} onCheckedChange={setClone} />
              </label>
              {!clone && !(branch && !branch.fork_date) && <Field label="분기 시작 날짜" hint="이 날짜부터 원본과 다른 역사가 진행됩니다."><Input type="date" value={fork} onChange={(e) => setFork(e.target.value)} data-testid="branch-fork" /></Field>}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function BranchCompare() {
  const { branches, branch, projectId, date, allEntities } = useWorld()
  const hidden = useHiddenQuery(projectId)
  const [a, setA] = useState(branches.find((b) => b.is_main)!.id)
  const [b, setB] = useState(branch.is_main ? branches.find((x) => !x.is_main)?.id ?? branch.id : branch.id)
  const [at, setAt] = useState(date)
  const [run, setRun] = useState(false)
  const ids = useMemo(() => [...new Set([...branchChain(branches, a), ...branchChain(branches, b)].map((c) => c.branchId))], [branches, a, b])
  const data = useQuery({
    queryKey: ['compare', projectId, ids.join(','), run],
    enabled: run,
    queryFn: async () => {
      const tables: Record<string, never[]> = {}
      for (const t of TEMPORAL_TABLES) if (DIFF_SPECS.some((s) => s.table === t)) tables[t] = (await fetchAll(t, { projectId, in: { branch_id: ids } })) as never[]
      return tables
    },
  })
  const diff = useMemo(() => {
    if (!data.data || !hidden.data) return null
    return diffBranches({ date: at, chainA: branchChain(branches, a), chainB: branchChain(branches, b), entities: allEntities, hides: hidden.data, tables: data.data, specs: DIFF_SPECS })
  }, [data.data, hidden.data, at, branches, a, b, allEntities])
  const nameA = branches.find((x) => x.id === a)?.name
  const nameB = branches.find((x) => x.id === b)?.name
  return (
    <Card>
      <CardHeader title="두 세계선 비교" icon={<GitCompare />} sub="지정한 날짜의 상태 차이와 한쪽에만 있는 항목" />
      <div className="flex flex-wrap items-end gap-2 border-b border-border p-3">
        <Field label="세계선 A"><Select className="w-48" value={a} onChange={(e) => { setA(e.target.value); setRun(false) }}>{branches.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        <Field label="세계선 B"><Select className="w-48" value={b} onChange={(e) => { setB(e.target.value); setRun(false) }}>{branches.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        <Field label="비교 날짜"><Input type="date" className="w-40" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
        <Button onClick={() => { setRun(true); data.refetch() }} disabled={a === b} data-testid="compare-run"><GitCompare />비교</Button>
      </div>
      {!run ? <p className="px-4 py-3 text-[12px] text-subtle">세계선과 날짜를 고르고 비교를 누르세요.</p> : data.isLoading || !diff ? <Loading /> : (
        <div className="flex flex-col gap-3 p-4 text-[12.5px]" data-testid="compare-result">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div><p className="mb-1 text-[11.5px] font-medium text-muted">{nameA}에만 있는 항목 ({diff.onlyA.length})</p><div className="flex flex-wrap gap-x-3 gap-y-1">{diff.onlyA.map((e) => <span key={e.id}>{e.name} <span className="text-[10.5px] text-subtle">{KINDS[e.kind as keyof typeof KINDS]?.label}</span></span>)}{diff.onlyA.length === 0 && <span className="text-subtle">없음</span>}</div></div>
            <div><p className="mb-1 text-[11.5px] font-medium text-muted">{nameB}에만 있는 항목 ({diff.onlyB.length})</p><div className="flex flex-wrap gap-x-3 gap-y-1">{diff.onlyB.map((e) => <span key={e.id}>{e.name} <span className="text-[10.5px] text-subtle">{KINDS[e.kind as keyof typeof KINDS]?.label}</span></span>)}{diff.onlyB.length === 0 && <span className="text-subtle">없음</span>}</div></div>
          </div>
          {diff.items.length === 0 ? <Empty title={`${formatDate(at)} 시점 상태 차이가 없습니다`} /> : (
            <table className="w-full">
              <thead className="bg-surface-2 text-[11px] text-muted"><tr><th className="px-2 py-1 text-left font-medium">분류</th><th className="text-left font-medium">대상</th><th className="text-left font-medium">{nameA}</th><th className="text-left font-medium">{nameB}</th></tr></thead>
              <tbody className="divide-y divide-border">{diff.items.map((d) => (
                <tr key={d.category + d.key}><td className="px-2 py-1 text-muted">{d.category}</td><td>{d.label.includes('?') ? <EntityLink id={d.key} /> : d.label}</td><td>{d.a}</td><td className="font-medium text-accent">{d.b}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}
    </Card>
  )
}
