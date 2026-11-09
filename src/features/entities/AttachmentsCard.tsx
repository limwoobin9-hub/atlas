import { Download, Paperclip, Plus, Unlink, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, Empty, Loading } from '@/components/ui/misc'
import { uploadAsset } from '@/data/assets'
import { deleteWhere, insertRow, signedUrl } from '@/data/db'
import { useInvalidateTable, useTable } from '@/data/hooks'
import type { Asset } from '@/data/types'
import { useWorld } from '@/data/world'
import { friendlyError } from '@/lib/errors'
import { formatBytes } from '@/lib/utils'
import { StorageImage } from './common'

export function AttachmentsCard({ entityId }: { entityId: string }) {
  const { projectId, canEdit } = useWorld()
  const links = useTable<{ asset_id: string; entity_id: string; role: string }>('atlas_asset_links', { entity_id: entityId }, 'asset_id')
  const assets = useTable<Asset>('atlas_assets', undefined, 'created_at')
  const invalidate = useInvalidateTable()
  const ref = useRef<HTMLInputElement>(null)
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const linked = (links.data ?? []).map((l) => (assets.data ?? []).find((a) => a.id === l.asset_id)).filter(Boolean) as Asset[]

  const link = async (assetId: string) => {
    try {
      await insertRow('atlas_asset_links', { project_id: projectId, asset_id: assetId, entity_id: entityId })
      invalidate('atlas_asset_links')
    } catch (e) { toast.error(friendlyError(e)) }
  }

  return (
    <Card>
      <CardHeader title="자료" icon={<Paperclip />} sub="연결된 이미지·문서 (자료실과 공유)" actions={canEdit && (
        <div className="flex gap-1">
          <input ref={ref} type="file" hidden multiple onChange={async (e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            setBusy(true)
            for (const f of files) {
              try {
                const a = await uploadAsset(projectId, f, { category: f.type.startsWith('image/') ? 'other' : f.type === 'application/pdf' ? 'pdf' : 'document' })
                await link(a.id)
              } catch (err) { toast.error(friendlyError(err)) }
            }
            setBusy(false)
            invalidate('atlas_assets')
          }} />
          <Button size="xs" variant="secondary" disabled={busy} onClick={() => ref.current?.click()}><Upload />{busy ? '업로드 중…' : '업로드'}</Button>
          <Button size="xs" variant="ghost" onClick={() => setPicking(true)}><Plus />자료실에서</Button>
        </div>
      )} />
      {links.isLoading || assets.isLoading ? <Loading /> : linked.length === 0 ? <p className="px-3.5 py-3 text-[12px] text-subtle">연결된 자료가 없습니다.</p> : (
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-4">
          {linked.map((a) => (
            <div key={a.id} className="group relative overflow-hidden rounded-md border border-border">
              {a.mime_type.startsWith('image/') ? <StorageImage path={a.storage_path} className="h-24 w-full bg-surface-2 object-contain" /> : (
                <div className="flex h-24 items-center justify-center bg-surface-2 text-[11px] text-muted">{a.mime_type.split('/')[1]?.toUpperCase()}</div>
              )}
              <div className="truncate px-2 py-1 text-[11.5px]" title={a.title}>{a.title || a.file_name}</div>
              <div className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">
                <Button size="icon-xs" variant="secondary" aria-label="다운로드" onClick={async () => { const u = await signedUrl(a.storage_path); if (u) window.open(u, '_blank') }}><Download /></Button>
                {canEdit && <Button size="icon-xs" variant="secondary" aria-label="연결 해제" onClick={async () => {
                  try { await deleteWhere('atlas_asset_links', { asset_id: a.id, entity_id: entityId }); invalidate('atlas_asset_links') } catch (e) { toast.error(friendlyError(e)) }
                }}><Unlink /></Button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {picking && <AssetPickerDialog exclude={linked.map((a) => a.id)} onClose={() => setPicking(false)} onPick={(id) => { link(id); setPicking(false) }} />}
    </Card>
  )
}

export function AssetPickerDialog({ onPick, onClose, exclude = [], filter }: { onPick: (id: string) => void; onClose: () => void; exclude?: string[]; filter?: (a: Asset) => boolean }) {
  const assets = useTable<Asset>('atlas_assets', undefined, 'created_at')
  const [q, setQ] = useState('')
  const list = (assets.data ?? []).filter((a) => !exclude.includes(a.id) && (!filter || filter(a)) && (!q || (a.title + a.file_name + a.tags.join(' ')).toLowerCase().includes(q.toLowerCase())))
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide title="자료실에서 선택">
        <Input placeholder="검색" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3" />
        {assets.isLoading ? <Loading /> : list.length === 0 ? <Empty title="자료가 없습니다" /> : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {list.map((a) => (
              <button key={a.id} onClick={() => onPick(a.id)} className="overflow-hidden rounded-md border border-border text-left hover:border-accent">
                {a.mime_type.startsWith('image/') ? <StorageImage path={a.storage_path} className="h-20 w-full bg-surface-2 object-contain" /> : <div className="flex h-20 items-center justify-center bg-surface-2 text-[11px] text-muted">{a.mime_type}</div>}
                <div className="truncate px-1.5 py-1 text-[11px]">{a.title || a.file_name} · {formatBytes(a.size_bytes)}</div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
