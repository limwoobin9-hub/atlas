import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Input, Select } from '@/components/ui/input'
import { Badge, Card, Empty, Switch } from '@/components/ui/misc'
import { useTable } from '@/data/hooks'
import type { Asset, EntityKind } from '@/data/types'
import { useWorld } from '@/data/world'
import { formatRange, rangesOverlap } from '@/domain/dates'
import { KINDS, KIND_LIST, STATUS } from '@/domain/kinds'
import { EntityAvatar, StatusBadge, entityHref } from '@/features/entities/common'
import { PageHeader } from '@/features/entities/EntityListPage'
import { ASSET_CATEGORIES } from '@/data/assets'

function highlight(text: string, q: string) {
  if (!q) return text
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return text
  return <>{text.slice(0, i)}<mark className="rounded bg-warning-soft px-0.5 text-fg">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>
}

export function SearchPage() {
  const { entities, allEntities, projectId, date } = useWorld()
  const assets = useTable<Asset>('atlas_assets', undefined, 'created_at')
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [kind, setKind] = useState<EntityKind | '' | 'asset'>('')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [atDate, setAtDate] = useState(false)
  const [allLines, setAllLines] = useState(false)

  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    const pool = allLines ? allEntities : entities
    return pool.filter((e) => {
      if (kind && kind !== 'asset' && e.kind !== kind) return false
      if (kind === 'asset') return false
      if (status && e.status !== status) return false
      if (atDate && !((!e.starts_on || e.starts_on <= date) && (!e.ends_on || date < e.ends_on))) return false
      if ((from || to) && !rangesOverlap(e.starts_on, e.ends_on, from || null, to || null)) return false
      if (!s) return true
      return e.name.toLowerCase().includes(s) || e.summary.toLowerCase().includes(s) || e.tags.some((t) => t.toLowerCase().includes(s))
    }).slice(0, 300)
  }, [q, kind, status, from, to, atDate, entities, allEntities, allLines, date])

  const assetResults = (kind === '' || kind === 'asset') && q.trim()
    ? (assets.data ?? []).filter((a) => `${a.title} ${a.file_name} ${a.description} ${a.tags.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 50) : []

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of results) m.set(r.kind, (m.get(r.kind) ?? 0) + 1)
    return m
  }, [results])

  return (
    <div className="flex flex-col">
      <PageHeader title="전체 검색" icon={<Search />} sub="국가·지역·정당·정부·의회·선거·인물·부대·함선·장비·사건·전쟁·조약·자료" />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-5">
        <div className="relative"><Search className="absolute left-3 top-2.5 size-4.5 text-subtle" />
          <Input autoFocus className="h-10 pl-10 text-[14px]" placeholder="이름, 요약, 태그로 검색" value={q} onChange={(e) => { setQ(e.target.value); setParams({ q: e.target.value }, { replace: true }) }} data-testid="search-input" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select className="w-32" value={kind} onChange={(e) => setKind(e.target.value as EntityKind)}><option value="">모든 유형</option>{KIND_LIST.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}<option value="asset">자료(파일)</option></Select>
          <Select className="w-28" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">모든 상태</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
          <span className="text-[12px] text-muted">기간</span>
          <Input type="date" className="w-36" value={from} onChange={(e) => setFrom(e.target.value)} />~<Input type="date" className="w-36" value={to} onChange={(e) => setTo(e.target.value)} />
          <label className="flex items-center gap-1.5 text-[12px] text-muted"><Switch checked={atDate} onCheckedChange={setAtDate} />현재 날짜에 존재</label>
          <label className="flex items-center gap-1.5 text-[12px] text-muted"><Switch checked={allLines} onCheckedChange={setAllLines} />모든 세계선</label>
        </div>
        {results.length > 0 && <div className="flex flex-wrap gap-1.5">{[...counts.entries()].map(([k, n]) => <Badge key={k} className="cursor-pointer" onClick={() => setKind(k as EntityKind)}>{KINDS[k as EntityKind].label} {n}</Badge>)}</div>}
        {results.length === 0 && assetResults.length === 0 ? <Empty icon={<Search />} title="검색 결과가 없습니다" /> : (
          <Card>
            <ul className="divide-y divide-border" data-testid="search-results">
              {results.map((e) => (
                <li key={e.id}>
                  <Link to={entityHref(projectId, e)} className="flex items-center gap-3 px-4 py-2 hover:bg-surface-2">
                    <EntityAvatar entity={e} size={24} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{highlight(e.name, q.trim())}</p>
                      <p className="truncate text-[11.5px] text-muted">{e.summary ? highlight(e.summary, q.trim()) : e.tags.map((t) => '#' + t).join(' ')}</p>
                    </div>
                    <span className="text-[11px] text-subtle">{formatRange(e.starts_on, e.ends_on)}</span>
                    <Badge>{KINDS[e.kind].label}</Badge><StatusBadge status={e.status} />
                  </Link>
                </li>
              ))}
              {assetResults.map((a) => (
                <li key={a.id}><Link to={`/p/${projectId}/assets`} className="flex items-center gap-3 px-4 py-2 hover:bg-surface-2">
                  <span className="flex size-6 items-center justify-center rounded bg-surface-2 text-[10px]">FILE</span>
                  <span className="flex-1 truncate text-[13px]">{highlight(a.title || a.file_name, q.trim())}</span><Badge>자료 · {ASSET_CATEGORIES[a.category]}</Badge>
                </Link></li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  )
}
