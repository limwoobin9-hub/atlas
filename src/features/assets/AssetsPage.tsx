import { Archive, Download, FileText, Folder, Link2, Search, Trash2, Upload, ZoomIn, ZoomOut } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, useConfirm } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Badge, Empty, Loading } from '@/components/ui/misc'
import { ASSET_CATEGORIES, deleteAsset, uploadAsset } from '@/data/assets'
import { deleteWhere, insertRow, signedUrl, updateRow } from '@/data/db'
import { useInvalidateTable, useTable } from '@/data/hooks'
import type { Asset } from '@/data/types'
import { useWorld } from '@/data/world'
import { friendlyError } from '@/lib/errors'
import { cn, formatBytes } from '@/lib/utils'
import { EntityLink, StorageImage, useSignedUrl } from '@/features/entities/common'
import { EntityPicker } from '@/features/entities/EntityPicker'
import { TagsInput } from '@/features/entities/FieldInput'
import { PageHeader } from '@/features/entities/EntityListPage'

export function AssetsPage() {
  const { projectId, canEdit } = useWorld()
  const assets = useTable<Asset>('atlas_assets', undefined, 'created_at')
  const invalidate = useInvalidateTable()
  const ref = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [folder, setFolder] = useState<string | null>(null)
  const [uploadCat, setUploadCat] = useState('other')
  const [busy, setBusy] = useState<string | null>(null)
  const [open, setOpen] = useState<Asset | null>(null)
  const folders = useMemo(() => [...new Set((assets.data ?? []).map((a) => a.folder).filter(Boolean))].sort(), [assets.data])
  const list = (assets.data ?? []).filter((a) => (!cat || a.category === cat) && (folder === null || a.folder === folder) && (!q || `${a.title} ${a.file_name} ${a.description} ${a.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase()))).reverse()

  const upload = async (files: File[]) => {
    let n = 0
    for (const f of files) {
      n++
      setBusy(`업로드 ${n}/${files.length}: ${f.name}`)
      try { await uploadAsset(projectId, f, { category: uploadCat, folder: folder ?? '' }) } catch (e) { toast.error(friendlyError(e)) }
    }
    setBusy(null)
    invalidate('atlas_assets')
  }

  return (
    <div className="flex h-full min-h-0 flex-col" onDragOver={(e) => { if (canEdit) e.preventDefault() }} onDrop={(e) => { if (!canEdit) return; e.preventDefault(); upload([...e.dataTransfer.files]) }}>
      <PageHeader title="자료실" icon={<Archive />} sub={`${assets.data?.length ?? 0}개 파일 · 파일을 끌어다 놓아도 업로드됩니다 (최대 50MB)`} actions={canEdit && <>
        <Select className="w-32" value={uploadCat} onChange={(e) => setUploadCat(e.target.value)} aria-label="업로드 분류">{Object.entries(ASSET_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <input ref={ref} type="file" multiple hidden onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; upload(f) }} data-testid="asset-upload-input" />
        <Button onClick={() => ref.current?.click()} disabled={!!busy}><Upload />업로드</Button>
      </>} />
      <div className="flex min-h-0 flex-1">
        <aside className="w-48 shrink-0 overflow-y-auto border-r border-border bg-surface p-2 text-[12.5px]">
          <button className={cn('flex w-full items-center gap-2 rounded px-2 py-1', folder === null && 'bg-accent-soft text-accent')} onClick={() => setFolder(null)}><Archive className="size-3.5" />전체</button>
          <button className={cn('flex w-full items-center gap-2 rounded px-2 py-1', folder === '' && 'bg-accent-soft text-accent')} onClick={() => setFolder('')}><Folder className="size-3.5" />(폴더 없음)</button>
          {folders.map((f) => <button key={f} className={cn('flex w-full items-center gap-2 truncate rounded px-2 py-1', folder === f && 'bg-accent-soft text-accent')} onClick={() => setFolder(f)}><Folder className="size-3.5" />{f}</button>)}
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            <div className="relative w-64"><Search className="absolute left-2.5 top-2 size-4 text-subtle" /><Input className="pl-8" placeholder="제목·파일명·태그 검색" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <Select className="w-36" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">모든 분류</option>{Object.entries(ASSET_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          </div>
          {busy && <p className="mb-3 rounded-md bg-accent-soft px-3 py-1.5 text-[12px] text-accent">{busy}</p>}
          {assets.isLoading ? <Loading /> : list.length === 0 ? <Empty icon={<Archive />} title="자료가 없습니다" description="지도, 국기, 국장, 인물 사진, 문서, PDF 등을 업로드하고 항목에 연결하세요." /> : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {list.map((a) => (
                <button key={a.id} onClick={() => setOpen(a)} className="group overflow-hidden rounded-lg border border-border bg-surface text-left transition-shadow hover:shadow-md" data-testid="asset-card">
                  <div className="flex h-28 items-center justify-center bg-surface-2">
                    {a.mime_type.startsWith('image/') ? <StorageImage path={a.storage_path} className="h-full w-full object-contain" /> : <FileText className="size-8 text-subtle" />}
                  </div>
                  <div className="px-2.5 py-2">
                    <p className="truncate text-[12.5px] font-medium">{a.title || a.file_name}</p>
                    <p className="flex items-center gap-1 text-[11px] text-subtle"><Badge>{ASSET_CATEGORIES[a.category] ?? a.category}</Badge>{formatBytes(a.size_bytes)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {open && <AssetDialog asset={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function AssetDialog({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const { canEdit, projectId } = useWorld()
  const invalidate = useInvalidateTable()
  const confirm = useConfirm()
  const url = useSignedUrl(asset.storage_path)
  const links = useTable<{ asset_id: string; entity_id: string }>('atlas_asset_links', { asset_id: asset.id }, 'entity_id')
  const [form, setForm] = useState({ title: asset.title, description: asset.description, category: asset.category, folder: asset.folder, tags: asset.tags, source: asset.source, license: asset.license, file_name: asset.file_name })
  const [zoom, setZoom] = useState(1)
  const [link, setLink] = useState<string | null>(null)
  const save = async () => {
    try { await updateRow('atlas_assets', asset.id, form); invalidate('atlas_assets'); toast.success('저장했습니다.'); onClose() } catch (e) { toast.error(friendlyError(e)) }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide="xl" title={asset.title || asset.file_name} description={`${asset.mime_type} · ${formatBytes(asset.size_bytes)}${asset.width ? ` · ${asset.width}×${asset.height}px` : ''}`}
        footer={<>
          {canEdit && <Button variant="danger-ghost" className="mr-auto" onClick={async () => {
            if (!(await confirm({ title: '파일을 삭제할까요?', description: '연결된 항목에서도 해제되며, 이 파일을 쓰는 지도는 원본을 잃습니다.', danger: true }))) return
            try { await deleteAsset(asset); invalidate('atlas_assets', 'atlas_asset_links'); onClose() } catch (e) { toast.error(friendlyError(e)) }
          }}><Trash2 />삭제</Button>}
          <Button variant="secondary" onClick={async () => { const u = await signedUrl(asset.storage_path); if (u) window.open(u, '_blank') }}><Download />다운로드</Button>
          {canEdit && <Button onClick={save}>저장</Button>}
        </>}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_300px]">
          <div className="flex flex-col gap-2">
            <div className="flex h-[52vh] items-center justify-center overflow-auto rounded-md border border-border bg-surface-2">
              {!url.data ? <Loading /> : asset.mime_type.startsWith('image/') ? <img src={url.data} alt={asset.title} style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }} className="max-h-full max-w-full object-contain transition-transform" />
                : asset.mime_type === 'application/pdf' ? <iframe src={url.data} title={asset.title} className="h-full w-full" />
                : <p className="text-[12px] text-muted">미리보기를 지원하지 않는 형식입니다. 다운로드하여 확인하세요.</p>}
            </div>
            {asset.mime_type.startsWith('image/') && <div className="flex items-center gap-2"><Button size="icon-sm" variant="secondary" onClick={() => setZoom((z) => Math.max(0.25, z / 1.25))} aria-label="축소"><ZoomOut /></Button><span className="w-12 text-center text-[12px] tabular-nums">{Math.round(zoom * 100)}%</span><Button size="icon-sm" variant="secondary" onClick={() => setZoom((z) => Math.min(6, z * 1.25))} aria-label="확대"><ZoomIn /></Button></div>}
          </div>
          <div className="flex flex-col gap-2.5">
            <Field label="제목"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} disabled={!canEdit} /></Field>
            <Field label="파일 이름"><Input value={form.file_name} onChange={(e) => setForm({ ...form, file_name: e.target.value })} disabled={!canEdit} /></Field>
            <Field label="분류"><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} disabled={!canEdit}>{Object.entries(ASSET_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="폴더"><Input value={form.folder} onChange={(e) => setForm({ ...form, folder: e.target.value })} disabled={!canEdit} placeholder="예: 국기/1936" /></Field>
            <Field label="태그"><TagsInput value={form.tags} onChange={(t) => setForm({ ...form, tags: t })} disabled={!canEdit} /></Field>
            <Field label="설명"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={!canEdit} rows={2} /></Field>
            <Field label="출처"><Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} disabled={!canEdit} /></Field>
            <Field label="사용 권한·라이선스"><Input value={form.license} onChange={(e) => setForm({ ...form, license: e.target.value })} disabled={!canEdit} /></Field>
            <div>
              <p className="mb-1 flex items-center gap-1 text-[12px] font-medium text-muted"><Link2 className="size-3.5" />연결된 항목</p>
              <div className="flex flex-col gap-1 text-[12.5px]">
                {(links.data ?? []).map((l) => (
                  <span key={l.entity_id} className="flex items-center justify-between"><EntityLink id={l.entity_id} />
                    {canEdit && <button className="text-[11px] text-subtle hover:text-danger" onClick={async () => { try { await deleteWhere('atlas_asset_links', { asset_id: asset.id, entity_id: l.entity_id }); invalidate('atlas_asset_links') } catch (e) { toast.error(friendlyError(e)) } }}>해제</button>}</span>
                ))}
                {canEdit && <div className="flex gap-1"><EntityPicker value={link} onChange={setLink} className="flex-1" placeholder="항목 연결" />
                  <Button size="sm" variant="secondary" disabled={!link} onClick={async () => { try { await insertRow('atlas_asset_links', { project_id: projectId, asset_id: asset.id, entity_id: link }); setLink(null); invalidate('atlas_asset_links') } catch (e) { toast.error(friendlyError(e)) } }}>연결</Button></div>}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
