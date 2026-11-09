import { Globe, Pencil, Plus, Star, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, useConfirm } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Badge, Empty } from '@/components/ui/misc'
import { uploadAsset } from '@/data/assets'
import { deleteRow, insertRow, qk, updateRow } from '@/data/db'
import { useInvalidateTable } from '@/data/hooks'
import type { AtlasMap } from '@/data/types'
import { useWorld } from '@/data/world'
import { friendlyError } from '@/lib/errors'
import { useQueryClient } from '@tanstack/react-query'
import { MAP_PRESETS, sanitizeSvg, toFeatureCollection } from './model'
import { useMaps } from './useMapView'

const PROJECTIONS: Record<AtlasMap['projection'], string> = { equirectangular: '정거원통 (Equirectangular)', naturalEarth: 'Natural Earth', equalEarth: 'Equal Earth', mercator: '메르카토르', orthographic: '정사 (지구본)' }

export function MapManager({ onClose, onSelect }: { onClose: () => void; onSelect: (id: string) => void }) {
  const maps = useMaps()
  const { project, projectId, canEdit } = useWorld()
  const invalidate = useInvalidateTable()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [mode, setMode] = useState<'list' | 'new' | AtlasMap>('list')
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide title="지도 관리" description="SVG · GeoJSON · TopoJSON · PNG · JPG · WebP 지도를 가져와 국가·지역과 연결합니다.">
        {mode === 'list' ? (
          <div className="flex flex-col gap-2">
            {(maps.data ?? []).length === 0 ? <Empty icon={<Globe />} title="지도가 없습니다" description="역사 지도 프리셋을 가져오거나 직접 파일을 올리세요." /> : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {(maps.data ?? []).map((m) => (
                  <li key={m.id} className="flex items-center gap-2 px-3 py-2 text-[12.5px]">
                    <button className="flex-1 text-left font-medium hover:text-accent" onClick={() => { onSelect(m.id); onClose() }}>{m.name}</button>
                    <Badge>{m.map_kind.toUpperCase()}</Badge>{project.default_map_id === m.id && <Badge tone="accent">기본</Badge>}
                    {m.license && <span className="max-w-40 truncate text-[11px] text-subtle" title={m.license}>{m.license}</span>}
                    {canEdit && <>
                      <Button size="icon-xs" variant="subtle" aria-label="기본 지도로" onClick={async () => { try { await updateRow('atlas_projects', projectId, { default_map_id: m.id }); qc.invalidateQueries({ queryKey: qk.project(projectId) }); toast.success('기본 지도로 지정했습니다.') } catch (e) { toast.error(friendlyError(e)) } }}><Star /></Button>
                      <Button size="icon-xs" variant="subtle" aria-label="설정" onClick={() => setMode(m)}><Pencil /></Button>
                      <Button size="icon-xs" variant="subtle" aria-label="삭제" onClick={async () => {
                        if (!(await confirm({ title: `"${m.name}" 지도를 삭제할까요?`, description: '이 지도의 마커·도형·영역 연결이 삭제됩니다. 지역 항목과 영토 지배 기록은 유지됩니다.', danger: true }))) return
                        try { await deleteRow('atlas_maps', m.id); invalidate('atlas_maps', 'atlas_map_regions', 'atlas_markers', 'atlas_map_features') } catch (e) { toast.error(friendlyError(e)) }
                      }}><Trash2 /></Button>
                    </>}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && <div><Button onClick={() => setMode('new')} data-testid="new-map"><Plus />지도 추가</Button></div>}
          </div>
        ) : mode === 'new' ? <NewMap onDone={(id) => { onSelect(id); onClose() }} onCancel={() => setMode('list')} /> : <EditMap map={mode} onDone={() => setMode('list')} />}
      </DialogContent>
    </Dialog>
  )
}

function NewMap({ onDone, onCancel }: { onDone: (id: string) => void; onCancel: () => void }) {
  const { projectId, project } = useWorld()
  const invalidate = useInvalidateTable()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preset, setPreset] = useState<string>('')
  const [name, setName] = useState('')
  const [projection, setProjection] = useState<AtlasMap['projection']>('naturalEarth')
  const [props, setProps] = useState<string[]>([])
  const [nameProp, setNameProp] = useState('')
  const [idProp, setIdProp] = useState('')
  const [source, setSource] = useState('')
  const [license, setLicense] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const inspect = async (f: File) => {
    setFile(f)
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''))
    if (/\.(geo|topo)?json$/i.test(f.name)) {
      try {
        const fc = toFeatureCollection(JSON.parse(await f.text()))
        const keys = new Set<string>()
        for (const ft of fc.features.slice(0, 30)) Object.keys(ft.properties ?? {}).forEach((k) => keys.add(k))
        setProps([...keys])
        const guess = [...keys].find((k) => /^(NAME|name|NAME_EN|ADMIN)$/.test(k))
        if (guess) setNameProp(guess)
        toast.success(`${fc.features.length}개 영역을 인식했습니다.`)
      } catch (e) { toast.error(friendlyError(e)); setFile(null) }
    } else if (/\.svg$/i.test(f.name)) {
      try { const s = sanitizeSvg(await f.text()); toast.success(`SVG ${Math.round(s.width)}×${Math.round(s.height)}, id가 있는 영역 ${s.ids.length}개`) } catch (e) { toast.error(friendlyError(e)); setFile(null) }
    }
  }

  const loadPreset = async (id: string) => {
    const p = MAP_PRESETS.find((x) => x.id === id)
    if (!p) return
    setPreset(id)
    setBusy('지도 데이터를 내려받는 중…')
    try {
      const res = await fetch(p.url)
      if (!res.ok) throw new Error(`내려받기 실패 (${res.status})`)
      const blob = await res.blob()
      const f = new File([blob], p.url.split('/').pop()!, { type: 'application/json' })
      setName(p.name); setProjection(p.projection); setSource(p.source); setLicense(p.license)
      await inspect(f)
      setNameProp(p.nameProp)
    } catch (e) { toast.error(friendlyError(e)); setPreset('') } finally { setBusy(null) }
  }

  const create = async () => {
    if (!file) return toast.error('지도 파일을 선택하세요.')
    if (!name.trim()) return toast.error('지도 이름을 입력하세요.')
    const kind: AtlasMap['map_kind'] = /\.svg$/i.test(file.name) ? 'svg' : /\.(geo|topo)?json$/i.test(file.name) ? 'geojson' : /\.(png|jpe?g|webp)$/i.test(file.name) ? 'raster' : (() => { throw new Error('지원하지 않는 형식') })()
    setBusy('업로드 중…')
    try {
      const f = kind === 'geojson' && !file.type ? new File([file], file.name, { type: 'application/json' }) : file
      const asset = await uploadAsset(projectId, f, { category: 'map', title: name.trim(), source, license })
      const m = await insertRow<AtlasMap>('atlas_maps', {
        project_id: projectId, name: name.trim(), map_kind: kind, asset_id: asset.id, projection, feature_id_property: idProp, feature_name_property: nameProp,
        width: kind === 'raster' ? asset.width : null, height: kind === 'raster' ? asset.height : null, source, license, attribution: license,
      })
      if (!project.default_map_id) { await updateRow('atlas_projects', projectId, { default_map_id: m.id }); qc.invalidateQueries({ queryKey: qk.project(projectId) }) }
      invalidate('atlas_maps', 'atlas_assets')
      toast.success('지도를 추가했습니다.')
      onDone(m.id)
    } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(null) }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border border-border p-3">
        <p className="mb-2 text-[12px] font-medium">역사 지도 프리셋</p>
        <div className="flex flex-col gap-1.5">
          {MAP_PRESETS.map((p) => (
            <button key={p.id} disabled={!!busy} onClick={() => loadPreset(p.id)} className={`rounded-md border px-3 py-2 text-left text-[12px] hover:border-accent ${preset === p.id ? 'border-accent bg-accent-soft' : 'border-border'}`} data-testid={`preset-${p.id}`}>
              <span className="font-medium">{p.name}</span><span className="block text-[11px] text-muted">{p.note} · 라이선스: {p.license}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input ref={fileRef} type="file" hidden accept=".svg,.geojson,.json,.topojson,.png,.jpg,.jpeg,.webp" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setPreset(''); inspect(f) } }} data-testid="map-file-input" />
        <Button variant="secondary" onClick={() => fileRef.current?.click()}><Upload />파일에서 가져오기</Button>
        <span className="truncate text-[12px] text-muted">{file ? `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)` : 'SVG, GeoJSON, TopoJSON, PNG, JPG, WebP'}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="지도 이름" className="col-span-2"><Input value={name} onChange={(e) => setName(e.target.value)} data-testid="map-name" /></Field>
        {file && /json$/i.test(file.name) && <>
          <Field label="투영법"><Select value={projection} onChange={(e) => setProjection(e.target.value as AtlasMap['projection'])}>{Object.entries(PROJECTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="영역 이름 속성"><Select value={nameProp} onChange={(e) => setNameProp(e.target.value)}><option value="">자동</option>{props.map((p) => <option key={p}>{p}</option>)}</Select></Field>
          <Field label="영역 ID 속성 (고유값)" hint="비우면 이름(중복 시 #번호)으로 식별"><Select value={idProp} onChange={(e) => setIdProp(e.target.value)}><option value="">자동</option>{props.map((p) => <option key={p}>{p}</option>)}</Select></Field>
        </>}
        <Field label="출처"><Input value={source} onChange={(e) => setSource(e.target.value)} /></Field>
        <Field label="사용 권한·라이선스" className="col-span-2"><Textarea rows={2} value={license} onChange={(e) => setLicense(e.target.value)} placeholder="예: CC BY-SA 4.0, 직접 제작" /></Field>
      </div>
      <div className="flex items-center justify-end gap-2">
        {busy && <span className="mr-auto text-[12px] text-muted">{busy}</span>}
        <Button variant="secondary" onClick={onCancel}>취소</Button>
        <Button onClick={create} disabled={!!busy || !file} data-testid="map-create">지도 추가</Button>
      </div>
    </div>
  )
}

function EditMap({ map, onDone }: { map: AtlasMap; onDone: () => void }) {
  const invalidate = useInvalidateTable()
  const qc = useQueryClient()
  const [f, setF] = useState({ name: map.name, description: map.description, projection: map.projection, feature_name_property: map.feature_name_property, source: map.source, license: map.license, attribution: map.attribution })
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="이름" className="col-span-2"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        {map.map_kind === 'geojson' && <Field label="투영법" hint="바꾸면 영역 연결은 유지되고 모양만 다시 그려집니다."><Select value={f.projection} onChange={(e) => setF({ ...f, projection: e.target.value as AtlasMap['projection'] })}>{Object.entries(PROJECTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>}
        <Field label="출처"><Input value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} /></Field>
        <Field label="라이선스" className="col-span-2"><Input value={f.license} onChange={(e) => setF({ ...f, license: e.target.value })} /></Field>
        <Field label="표기 (attribution)" className="col-span-2"><Input value={f.attribution} onChange={(e) => setF({ ...f, attribution: e.target.value })} /></Field>
        <Field label="설명" className="col-span-2"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onDone}>뒤로</Button><Button onClick={async () => {
        try { await updateRow('atlas_maps', map.id, f); invalidate('atlas_maps'); qc.invalidateQueries({ queryKey: ['map-source', map.id] }); toast.success('저장했습니다.'); onDone() } catch (e) { toast.error(friendlyError(e)) }
      }}>저장</Button></div>
    </div>
  )
}
