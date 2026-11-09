import { useQueryClient } from '@tanstack/react-query'
import {
  Brush, Crosshair, Eraser, Expand, Flag, Hand, Layers as LayersIcon, LocateFixed, Map as MapIcon, MapPin, Minus, Move, MousePointer2,
  Pentagon, Plus, Redo2, Route, Search, Settings2, Spline, Trash2, Type, Undo2, Wand2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, useConfirm } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/input'
import { Badge, Empty, Loading, Popover, PopoverContent, PopoverTrigger, Switch, Tooltip } from '@/components/ui/misc'
import { applyPlan, replay, runDbOps, type RecordedMutation } from '@/data/db'
import { useInvalidateTable } from '@/data/hooks'
import type { MapFeature, Marker } from '@/data/types'
import { useWorld } from '@/data/world'
import { formatDate } from '@/domain/dates'
import { CLAIM_TYPES, CONTROL_STATUS, MARKER_TYPES } from '@/domain/kinds'
import { friendlyError } from '@/lib/errors'
import { cn, uuid } from '@/lib/utils'
import { EntityLink } from '@/features/entities/common'
import { EntityPicker } from '@/features/entities/EntityPicker'
import { ColorInput } from '@/features/entities/FieldInput'
import { MapCanvas, type MapCanvasHandle, type Tool } from './MapCanvas'
import { MapManager } from './MapManager'
import { ensureRegions, setControl, toggleClaim, type Ctx } from './mapOps'
import { DEFAULT_LAYERS, useMapSource, useMapView, useMaps, type ColorMode, type Layers } from './useMapView'

const TOOLS: { id: Tool; label: string; icon: ReactNode; key: string; edit?: boolean }[] = [
  { id: 'view', label: '조회 (클릭: 정보, 드래그: 이동)', icon: <Hand />, key: 'v' },
  { id: 'select', label: '영역 선택 (Shift+클릭: 다중 선택)', icon: <MousePointer2 />, key: 's' },
  { id: 'paint', label: '영토 색칠 (드래그로 연속 칠하기)', icon: <Brush />, key: 'b', edit: true },
  { id: 'erase', label: '지배 해제', icon: <Eraser />, key: 'e', edit: true },
  { id: 'claim', label: '영유권 주장 토글', icon: <Flag />, key: 'c', edit: true },
  { id: 'marker', label: '마커 생성', icon: <MapPin />, key: 'm', edit: true },
  { id: 'move', label: '마커·주석 이동', icon: <Move />, key: 'g', edit: true },
  { id: 'polygon', label: '폴리곤(영역) 그리기', icon: <Pentagon />, key: 'p', edit: true },
  { id: 'vertex', label: '경계선(꼭짓점) 편집', icon: <Spline />, key: 'x', edit: true },
  { id: 'line', label: '전선·교통로 그리기', icon: <Route />, key: 'l', edit: true },
  { id: 'text', label: '텍스트 주석', icon: <Type />, key: 't', edit: true },
]

const COLOR_MODES: Record<ColorMode, string> = { control: '실효지배', sovereign: '명목상 주권', ideology: '정치 이념', relations: '외교관계 (기준국)', war: '전쟁 진영', none: '색상 없음' }

export default function MapPage() {
  const { project, canEdit, projectId, branchId, branch, date, entities, entityMap } = useWorld()
  const maps = useMaps()
  const [params, setParams] = useSearchParams()
  const [mapId, setMapId] = useState<string | null>(params.get('map'))
  const map = maps.data?.find((m) => m.id === mapId) ?? maps.data?.find((m) => m.id === project.default_map_id) ?? maps.data?.[0]
  const source = useMapSource(map)
  const [layers, setLayers] = useState<Layers>(() => ({ ...DEFAULT_LAYERS }))
  const view = useMapView(map, source.data, layers)
  const canvas = useRef<MapCanvasHandle>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const invalidate = useInvalidateTable()
  const qc = useQueryClient()
  const confirm = useConfirm()

  const [tool, setTool] = useState<Tool>('view')
  const [paintWith, setPaintWith] = useState<string | null>(null)
  const [paintSovereign, setPaintSovereign] = useState(true)
  const [paintStatus, setPaintStatus] = useState('integrated')
  const [claimant, setClaimant] = useState<string | null>(null)
  const [claimType, setClaimType] = useState('claim')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectedObject, setSelectedObject] = useState<string | null>(null)
  const [drawing, setDrawing] = useState<[number, number][]>([])
  const [pending, setPending] = useState<{ kind: 'marker' | 'polygon' | 'line' | 'text'; world: [number, number][] } | null>(null)
  const [cursor, setCursor] = useState<[number, number] | null>(null)
  const [zoomK, setZoomK] = useState(1)
  const [undo, setUndo] = useState<RecordedMutation[][]>([])
  const [redo, setRedo] = useState<RecordedMutation[][]>([])
  const [busy, setBusy] = useState(false)
  const [managerOpen, setManagerOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const stroke = useRef<Set<string>>(new Set())
  const [lineType, setLineType] = useState<MapFeature['feature_type']>('front_line')
  const [lineEntity, setLineEntity] = useState<string | null>(null)
  const [markerType, setMarkerType] = useState('city')

  const ctx: Ctx = { projectId, branchId, originBranchId: branch.is_main ? null : branchId, date }
  const loaded = source.data
  const featureName = useCallback((key: string) => loaded?.features.find((f) => f.key === key)?.name ?? view.regionByKey.get(key)?.feature_name ?? key, [loaded, view.regionByKey])

  // focus from URL (?focus=entityId) -> war/country colouring & zoom
  useEffect(() => {
    const focus = params.get('focus')
    if (!focus) return
    const e = entityMap.get(focus)
    if (e?.kind === 'war') setLayers((l) => ({ ...l, color: 'war', focusId: focus }))
    else if (e) setLayers((l) => ({ ...l, focusId: focus }))
  }, [params, entityMap])

  const record = (muts: RecordedMutation[], tables: string[]) => {
    if (muts.length) { setUndo((u) => [...u.slice(-49), muts]); setRedo([]) }
    invalidate(...tables)
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn() } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }

  const regionIdsFor = async (keys: string[]) => {
    const ids = await ensureRegions(ctx, map!.id, keys.map((k) => ({ key: k, name: featureName(k) })), view.regions.data ?? [])
    if ([...ids.keys()].some((k) => !view.regionByKey.get(k)?.region_id)) {
      invalidate('atlas_entities', 'atlas_regions', 'atlas_map_regions')
      await qc.invalidateQueries({ queryKey: ['table', 'atlas_map_regions', projectId] })
    }
    return keys.map((k) => ids.get(k)!).filter(Boolean)
  }

  const applyToKeys = (keys: string[], mode: 'paint' | 'erase' | 'claim') => run(async () => {
    if (!keys.length) return
    if (mode === 'paint' && !paintWith) { toast.info('먼저 오른쪽 패널에서 칠할 국가를 선택하세요.'); return }
    if (mode === 'claim' && !claimant) { toast.info('먼저 영유권 주장국을 선택하세요.'); return }
    if (mode === 'erase') keys = keys.filter((k) => view.regionByKey.get(k)?.region_id)
    const regionIds = await regionIdsFor(keys)
    let muts: RecordedMutation[] = []
    if (mode === 'paint') muts = await setControl(ctx, regionIds, view.control.visible, { controller_id: paintWith, sovereign_id: paintSovereign ? paintWith : undefined, status: paintStatus })
    else if (mode === 'erase') muts = await setControl(ctx, regionIds, view.control.visible, { controller_id: null, sovereign_id: null })
    else for (const r of regionIds) muts.push(...await toggleClaim(ctx, r, claimant!, view.claims.visible, claimType))
    record(muts, mode === 'claim' ? ['atlas_territory_claims'] : ['atlas_territory_control'])
  })

  const doUndo = () => run(async () => {
    const last = undo[undo.length - 1]
    if (!last) return
    await replay(last, 'undo')
    setUndo((u) => u.slice(0, -1)); setRedo((r) => [...r, last])
    invalidate(...new Set(last.map((m) => m.table)))
  })
  const doRedo = () => run(async () => {
    const last = redo[redo.length - 1]
    if (!last) return
    await replay(last, 'redo')
    setRedo((r) => r.slice(0, -1)); setUndo((u) => [...u, last])
    invalidate(...new Set(last.map((m) => m.table)))
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable],[role=dialog]')) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); return }
      if (e.key === 'Escape') { setDrawing([]); setSelected(new Set()); setSelectedObject(null); return }
      if (e.key === 'Enter' && drawing.length) finishDrawing()
      const t = TOOLS.find((x) => x.key === e.key.toLowerCase())
      if (t && !e.ctrlKey && !e.metaKey && (!t.edit || canEdit)) { setTool(t.id); setDrawing([]) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const finishDrawing = () => {
    if (tool === 'polygon' && drawing.length >= 3) setPending({ kind: 'polygon', world: drawing })
    else if (tool === 'line' && drawing.length >= 2) setPending({ kind: 'line', world: drawing })
    else toast.info(tool === 'polygon' ? '꼭짓점을 3개 이상 찍으세요.' : '점을 2개 이상 찍으세요.')
    setDrawing([])
  }

  const toMap = (w: [number, number]) => loaded?.invert(w) ?? null

  const selectedMarker = view.markersQ.visible.find((m) => m.id === selectedObject) as Marker | undefined
  const selectedFeature = view.featuresQ.visible.find((f) => f.id === selectedObject) as MapFeature | undefined
  const firstSel = [...selected][0]
  const selRegionId = firstSel ? view.regionByKey.get(firstSel)?.region_id ?? null : null
  const selControl = selRegionId ? view.controlByRegion.get(selRegionId) : undefined

  const jumpTargets = useMemo(() => {
    const countries = entities.filter((e) => e.kind === 'country' || e.kind === 'region')
    return { countries, markers: view.markers }
  }, [entities, view.markers])

  const jumpToEntity = (id: string) => {
    if (!loaded) return
    const m = view.markers.find((x) => view.markersQ.visible.find((r) => r.id === x.id)?.entity_id === id)
    const keys: string[] = []
    for (const [key, mr] of view.regionByKey) {
      if (!mr.region_id) continue
      const c = view.controlByRegion.get(mr.region_id)
      if (mr.region_id === id || c?.controller_id === id) keys.push(key)
    }
    const boxes = keys.map((k) => loaded.features.find((f) => f.key === k)?.bbox).filter(Boolean) as [number, number, number, number][]
    for (const r of view.userRegions) if (keys.includes(r.key) && r.vertices?.length) {
      const xs = r.vertices.map((v) => v[0]); const ys = r.vertices.map((v) => v[1])
      boxes.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)])
    }
    if (boxes.length) {
      canvas.current?.fitBounds([Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))])
      setSelected(new Set(keys))
    } else if (m) { canvas.current?.centerOn(m.x, m.y); setSelectedObject(m.id) }
    else toast.info(`${formatDate(date)} 지도에 표시된 영역이나 마커가 없습니다.`)
  }

  if (maps.isLoading) return <Loading />
  if (!map) {
    return (
      <div className="p-8">
        <Empty icon={<MapIcon />} title="아직 지도가 없습니다" description="1936년 세계관 제작용 역사 정치지도를 가져오거나, 직접 만든 SVG·GeoJSON·이미지 지도를 올리세요."
          action={canEdit && <Button onClick={() => setManagerOpen(true)} data-testid="open-map-manager"><Plus />지도 추가</Button>} />
        {managerOpen && <MapManager onClose={() => setManagerOpen(false)} onSelect={(id) => { setMapId(id); setParams({ map: id }) }} />}
      </div>
    )
  }

  const mapCoordLabel = (() => {
    if (!cursor || !loaded) return ''
    const m = toMap(cursor)
    if (!m) return ''
    if (map.map_kind === 'geojson') return `${Math.abs(m[1]).toFixed(3)}°${m[1] >= 0 ? 'N' : 'S'} ${Math.abs(m[0]).toFixed(3)}°${m[0] >= 0 ? 'E' : 'W'}`
    if (map.map_kind === 'raster') return `x ${m[0].toFixed(4)} · y ${m[1].toFixed(4)} (정규화)`
    return `x ${m[0].toFixed(1)} · y ${m[1].toFixed(1)}`
  })()

  return (
    <div ref={wrap} className="flex h-full min-h-0 flex-col bg-bg">
      {/* top toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-surface px-3 py-1.5">
        <MapIcon className="size-4 text-accent" />
        <Select className="h-7 w-56" value={map.id} onChange={(e) => { setMapId(e.target.value); setParams({ map: e.target.value }); setSelected(new Set()) }} aria-label="지도 선택">
          {(maps.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
        <Button size="sm" variant="ghost" onClick={() => setManagerOpen(true)}><Settings2 />지도 관리</Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <LayersPopover layers={layers} setLayers={setLayers} />
        <JumpPopover targets={jumpTargets} onEntity={jumpToEntity} onMarker={(id) => { const m = view.markers.find((x) => x.id === id); if (m) { canvas.current?.centerOn(m.x, m.y); setSelectedObject(id) } }} />
        <span className="mx-1 h-5 w-px bg-border" />
        <Tooltip content="실행 취소 (Ctrl+Z)"><Button size="icon-sm" variant="ghost" disabled={!undo.length || busy} onClick={doUndo} aria-label="실행 취소"><Undo2 /></Button></Tooltip>
        <Tooltip content="다시 실행 (Ctrl+Shift+Z)"><Button size="icon-sm" variant="ghost" disabled={!redo.length || busy} onClick={doRedo} aria-label="다시 실행"><Redo2 /></Button></Tooltip>
        {canEdit && loaded && loaded.features.length > 0 && <Button size="sm" variant="ghost" onClick={() => setBulkOpen(true)}><Wand2 />일괄 작업</Button>}
        <div className="flex-1" />
        {busy && <span className="animate-soft-pulse text-[11.5px] text-accent">저장 중…</span>}
        <Badge tone="accent">{formatDate(date)}</Badge>
        <Tooltip content="확대"><Button size="icon-sm" variant="ghost" onClick={() => canvas.current?.zoomBy(1.6)} aria-label="확대"><Plus /></Button></Tooltip>
        <Tooltip content="축소"><Button size="icon-sm" variant="ghost" onClick={() => canvas.current?.zoomBy(1 / 1.6)} aria-label="축소"><Minus /></Button></Tooltip>
        <Tooltip content="지도 원점으로"><Button size="icon-sm" variant="ghost" onClick={() => canvas.current?.reset()} aria-label="원점"><LocateFixed /></Button></Tooltip>
        <Tooltip content="전체 화면"><Button size="icon-sm" variant="ghost" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : wrap.current?.requestFullscreen())} aria-label="전체 화면"><Expand /></Button></Tooltip>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* tools */}
        <div className="flex w-11 shrink-0 flex-col items-center gap-0.5 border-r border-border bg-surface py-2" role="toolbar" aria-label="지도 도구">
          {TOOLS.filter((t) => !t.edit || canEdit).map((t) => (
            <Tooltip key={t.id} content={`${t.label} (${t.key.toUpperCase()})`} side="right">
              <button onClick={() => { setTool(t.id); setDrawing([]) }} aria-label={t.label} aria-pressed={tool === t.id} data-testid={`tool-${t.id}`}
                className={cn('flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg [&_svg]:size-4', tool === t.id && 'bg-accent text-accent-fg hover:bg-accent hover:text-accent-fg')}>{t.icon}</button>
            </Tooltip>
          ))}
        </div>

        {/* canvas */}
        <div className="relative min-w-0 flex-1">
          {source.isLoading || view.loading ? <Loading label="지도를 불러오는 중…" className="h-full" /> : source.error || !loaded ? (
            <div className="p-6"><Empty title="지도 파일을 불러오지 못했습니다" description={source.error ? friendlyError(source.error) : '지도 원본 파일이 삭제되었을 수 있습니다.'} /></div>
          ) : (
            <MapCanvas ref={canvas} map={loaded} tool={tool} styles={view.styles} userRegions={view.userRegions} markers={view.markers} lines={view.lines} texts={view.texts} labels={layers.labels ? view.labels : []}
              selected={selected} selectedObject={selectedObject} drawing={drawing} readOnly={!canEdit}
              onZoom={setZoomK} onPointerMoveWorld={setCursor}
              onFeatureDown={(key, e) => {
                if (tool === 'view') { setSelected(new Set([key])); setSelectedObject(null) }
                else if (tool === 'select' || tool === 'vertex') { setSelectedObject(null); setSelected((s) => { const n = new Set(e.shiftKey ? s : []); if (n.has(key) && e.shiftKey) n.delete(key); else n.add(key); return n }) }
                else if (tool === 'paint' || tool === 'erase' || tool === 'claim') { stroke.current = new Set([key]) }
              }}
              onFeatureEnter={(key) => { if (tool === 'paint' || tool === 'erase' || tool === 'claim') stroke.current.add(key) }}
              onStrokeEnd={() => {
                if (stroke.current.size && (tool === 'paint' || tool === 'erase' || tool === 'claim')) { const keys = [...stroke.current]; stroke.current = new Set(); applyToKeys(keys, tool) }
              }}
              onBackgroundClick={(w, e) => {
                if (tool === 'marker') setPending({ kind: 'marker', world: [w] })
                else if (tool === 'text') setPending({ kind: 'text', world: [w] })
                else if (tool === 'polygon' || tool === 'line') { if (e.detail <= 1) setDrawing((d) => [...d, w]) }
                else if (!e.shiftKey) { setSelected(new Set()); setSelectedObject(null) }
              }}
              onDoubleClick={() => { if ((tool === 'polygon' || tool === 'line') && drawing.length) finishDrawing() }}
              onMarkerClick={(id) => { setSelectedObject(id); setSelected(new Set()) }}
              onObjectClick={(id) => { setSelectedObject(id); setSelected(new Set()) }}
              onMarkerDrop={(id, w) => run(async () => {
                const row = view.markersQ.visible.find((m) => m.id === id); const mc = toMap(w)
                if (!row || !mc) return
                record(await applyPlan('atlas_markers', [{ kind: 'update', row, patch: { x: mc[0], y: mc[1] } }], branchId, {}), ['atlas_markers'])
              })}
              onTextDrop={(id, w) => run(async () => {
                const row = view.featuresQ.visible.find((m) => m.id === id); const mc = toMap(w)
                if (!row || !mc) return
                record(await applyPlan('atlas_map_features', [{ kind: 'update', row, patch: { geometry: { type: 'Point', coordinates: mc } } }], branchId, {}), ['atlas_map_features'])
              })}
              onVertexDrop={(regionId, index, w) => run(async () => {
                const r = view.regions.data?.find((x) => x.id === regionId); const mc = toMap(w)
                if (!r?.geometry || r.geometry.type !== 'Polygon' || !mc) return
                const ring = [...(r.geometry.coordinates as number[][][])[0]]
                ring[index] = mc
                if (index === 0) ring[ring.length - 1] = mc
                record(await runDbOps('atlas_map_regions', [{ kind: 'update', id: r.id, patch: { geometry: { type: 'Polygon', coordinates: [ring] } } }]), ['atlas_map_regions'])
              })}
            />
          )}
          {(tool === 'polygon' || tool === 'line') && (
            <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-surface/95 px-2.5 py-1.5 text-[11.5px] text-muted shadow">
              클릭으로 점 추가 · 더블클릭 또는 Enter로 완료 · Esc 취소 {drawing.length > 0 && <b className="text-fg">({drawing.length}점)</b>}
            </div>
          )}
          <div className="pointer-events-none absolute bottom-2 left-3 rounded bg-surface/90 px-2 py-0.5 text-[10.5px] tabular-nums text-muted shadow-sm">
            {mapCoordLabel && <>{mapCoordLabel} · </>}확대 {Math.round(zoomK * 100)}% {map.attribution && <>· © {map.attribution}</>}
          </div>
        </div>

        {/* side panel */}
        <aside className="w-72 shrink-0 overflow-y-auto border-l border-border bg-surface p-3 text-[12.5px]">
          {tool === 'paint' && (
            <Section title="영토 색칠">
              <p className="text-[11.5px] text-muted">{formatDate(date)}부터 클릭·드래그한 영역의 지배국이 바뀝니다. 이전 기록은 유지됩니다.</p>
              <Field label="칠할 국가"><EntityPicker value={paintWith} onChange={setPaintWith} kinds={['country', 'organization']} testId="paint-country" /></Field>
              <Field label="지배 상태"><Select value={paintStatus} onChange={(e) => setPaintStatus(e.target.value)}>{Object.entries(CONTROL_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              <label className="flex items-center justify-between">명목상 주권도 변경<Switch checked={paintSovereign} onCheckedChange={setPaintSovereign} /></label>
              <p className="text-[11px] text-subtle">점령지는 '주권도 변경'을 끄고 상태를 '점령'으로 칠하면 점선 국경으로 표시됩니다.</p>
            </Section>
          )}
          {tool === 'claim' && (
            <Section title="영유권 주장">
              <Field label="주장국"><EntityPicker value={claimant} onChange={setClaimant} kinds={['country', 'organization']} /></Field>
              <Field label="주장 유형"><Select value={claimType} onChange={(e) => setClaimType(e.target.value)}>{Object.entries(CLAIM_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              <p className="text-[11.5px] text-muted">클릭하면 주장이 생기고, 다시 클릭하면 {formatDate(date)}부로 주장이 끝납니다. 사선 패턴으로 표시됩니다.</p>
            </Section>
          )}
          {tool === 'erase' && <Section title="지배 해제"><p className="text-[11.5px] text-muted">클릭한 영역의 지배 기록을 {formatDate(date)}부로 종료합니다.</p></Section>}
          {tool === 'marker' && (
            <Section title="마커 생성">
              <Field label="기본 마커 종류"><Select value={markerType} onChange={(e) => setMarkerType(e.target.value)}>{Object.entries(MARKER_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
              <p className="text-[11.5px] text-muted">지도를 클릭한 위치(지도 좌표)에 마커를 만듭니다. 확대·이동해도 위치가 유지됩니다.</p>
            </Section>
          )}
          {tool === 'line' && (
            <Section title="선 그리기">
              <Field label="종류"><Select value={lineType} onChange={(e) => setLineType(e.target.value as MapFeature['feature_type'])}><option value="front_line">전선</option><option value="route">교통로</option><option value="railway">철도</option><option value="arrow">진격 화살표</option><option value="area">영역 (전선 지대)</option></Select></Field>
              <Field label="연결 항목 (예: 전쟁)"><EntityPicker value={lineEntity} onChange={setLineEntity} kinds={['war', 'battle', 'unit', 'event']} /></Field>
            </Section>
          )}
          {(tool === 'polygon' || tool === 'vertex' || tool === 'move' || tool === 'text') && (
            <Section title={TOOLS.find((t) => t.id === tool)!.label}>
              <p className="text-[11.5px] text-muted">
                {tool === 'polygon' && '이미지 지도나 빈 공간에 새 영역을 그립니다. 완성하면 지역 항목과 연결됩니다.'}
                {tool === 'vertex' && '직접 그린 영역을 클릭해 선택한 뒤 꼭짓점을 드래그하세요. 파일에서 온 경계는 아래 "편집 가능한 사본"으로 바꾼 뒤 편집합니다.'}
                {tool === 'move' && '마커와 텍스트 주석을 드래그해 옮깁니다. 위치는 지도 좌표로 저장됩니다.'}
                {tool === 'text' && '지도를 클릭해 텍스트 주석을 추가합니다.'}
              </p>
              {tool === 'vertex' && firstSel && loaded?.features.find((f) => f.key === firstSel)?.geometry && !view.regionByKey.get(firstSel)?.geometry && (
                <Button size="sm" variant="secondary" onClick={() => run(async () => {
                  const f = loaded!.features.find((x) => x.key === firstSel)!
                  const g = f.geometry!
                  const poly = g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? [...g.coordinates].sort((a, b) => b[0].length - a[0].length)[0] : null
                  if (!poly) return
                  await regionIdsFor([firstSel])
                  const { supabase } = await import('@/lib/supabase')
                  const { data: mr } = await supabase.from('atlas_map_regions').select('id').eq('map_id', map.id).eq('feature_key', firstSel).maybeSingle()
                  if (!mr) { toast.error('영역 연결을 찾지 못했습니다. 다시 시도하세요.'); return }
                  const simplified = poly[0].length > 400 ? poly[0].filter((_, i) => i % Math.ceil(poly[0].length / 400) === 0) : poly[0]
                  record(await runDbOps('atlas_map_regions', [{ kind: 'update', id: mr.id, patch: { geometry: { type: 'Polygon', coordinates: [simplified] } } }]), ['atlas_map_regions'])
                  toast.success('편집 가능한 경계 사본을 만들었습니다.')
                })}>편집 가능한 사본 만들기</Button>
              )}
            </Section>
          )}

          {selectedMarker && <MarkerPanel marker={selectedMarker} onChange={(muts) => record(muts, ['atlas_markers'])} onDeleted={() => setSelectedObject(null)} />}
          {selectedFeature && <FeaturePanel feature={selectedFeature} onChange={(muts) => record(muts, ['atlas_map_features'])} onDeleted={() => setSelectedObject(null)} />}

          {selected.size > 0 && (
            <Section title={selected.size > 1 ? `${selected.size}개 영역 선택됨` : featureName(firstSel)}>
              {selected.size === 1 && (
                <div className="flex flex-col gap-1.5">
                  <Row label="지역 항목"><EntityLink id={selRegionId} fallback="미연결" /></Row>
                  <Row label="실효지배"><EntityLink id={selControl?.controller_id} fallback="없음" /></Row>
                  <Row label="명목상 주권"><EntityLink id={selControl?.sovereign_id} fallback="—" /></Row>
                  <Row label="상태">{selControl ? CONTROL_STATUS[selControl.status] : '—'}</Row>
                  <Row label="주장국">{view.claims.visible.filter((c) => c.region_id === selRegionId && (!c.valid_from || c.valid_from <= date) && (!c.valid_to || date < c.valid_to)).map((c) => <EntityLink key={c.id} id={c.claimant_id} />)}</Row>
                  {canEdit && <Field label="다른 지역 항목에 연결"><EntityPicker value={selRegionId} kinds={['region']} onChange={(v) => run(async () => {
                    const mr = view.regionByKey.get(firstSel)
                    if (mr) await runDbOps('atlas_map_regions', [{ kind: 'update', id: mr.id, patch: { region_id: v } }])
                    else if (v) await runDbOps('atlas_map_regions', [{ kind: 'insert', values: { project_id: projectId, map_id: map.id, feature_key: firstSel, feature_name: featureName(firstSel), region_id: v } }])
                    invalidate('atlas_map_regions')
                  })} /></Field>}
                </div>
              )}
              {canEdit && (
                <div className="mt-2 flex flex-col gap-1.5 border-t border-border pt-2">
                  <p className="text-[11px] font-medium text-muted">{formatDate(date)}부터 일괄 변경</p>
                  <EntityPicker value={paintWith} onChange={setPaintWith} kinds={['country', 'organization']} placeholder="지배국 선택" />
                  <div className="flex gap-1">
                    <Button size="sm" className="flex-1" disabled={!paintWith || busy} onClick={() => applyToKeys([...selected], 'paint')} data-testid="assign-selected">지배국 지정</Button>
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => applyToKeys([...selected], 'erase')}>해제</Button>
                  </div>
                  {view.userRegions.some((r) => selected.has(r.key)) && (
                    <Button size="sm" variant="danger-ghost" onClick={async () => {
                      if (!(await confirm({ title: '직접 그린 영역을 지도에서 삭제할까요?', description: '지역 항목과 지배 기록은 유지됩니다.', danger: true }))) return
                      run(async () => { for (const r of view.userRegions.filter((x) => selected.has(x.key))) record(await runDbOps('atlas_map_regions', [{ kind: 'delete', id: r.id }]), ['atlas_map_regions']); setSelected(new Set()) })
                    }}><Trash2 />그린 영역 삭제</Button>
                  )}
                </div>
              )}
            </Section>
          )}

          {!selected.size && !selectedObject && tool === 'view' && (
            <Section title="지도 사용법">
              <ul className="list-disc space-y-1 pl-4 text-[11.5px] text-muted">
                <li>휠: 확대·축소 · 드래그: 이동 · 핀치: 확대</li>
                <li>편집 도구에서는 Space+드래그 또는 오른쪽 버튼 드래그로 이동</li>
                <li>조회 모드에서 클릭해도 데이터는 바뀌지 않습니다</li>
                <li>상단 날짜를 바꾸면 그 날의 영토가 표시됩니다</li>
                <li>Ctrl+Z / Ctrl+Shift+Z: 실행 취소 / 다시 실행</li>
              </ul>
              <p className="mt-2 text-[11px] text-subtle">세계선: {branch.name}</p>
            </Section>
          )}
        </aside>
      </div>

      {pending && loaded && (
        <CreateObjectDialog kind={pending.kind} points={pending.world.map((w) => toMap(w)!).filter(Boolean)} defaultMarkerType={markerType} lineType={lineType} lineEntity={lineEntity}
          paintWith={paintWith} mapId={map.id}
          onClose={() => setPending(null)}
          onCreated={(muts, tables) => { record(muts, tables); setPending(null) }} />
      )}
      {managerOpen && <MapManager onClose={() => setManagerOpen(false)} onSelect={(id) => { setMapId(id); setParams({ map: id }) }} />}
      {bulkOpen && loaded && <BulkDialog loaded={loaded} mapId={map.id} existing={view.regions.data ?? []} control={view.control.visible} onClose={() => setBulkOpen(false)} onDone={(muts) => record(muts, ['atlas_territory_control', 'atlas_entities', 'atlas_map_regions', 'atlas_regions'])} />}
    </div>
  )
}

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return <div className="mb-3 flex flex-col gap-2 rounded-md border border-border p-2.5"><p className="text-[12px] font-semibold">{title}</p>{children}</div>
}
function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex items-start gap-2"><span className="w-20 shrink-0 text-[11px] text-subtle">{label}</span><span className="flex min-w-0 flex-wrap gap-1">{children}</span></div>
}

function LayersPopover({ layers, setLayers }: { layers: Layers; setLayers: (fn: (l: Layers) => Layers) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild><Button size="sm" variant="ghost" data-testid="layers"><LayersIcon />레이어</Button></PopoverTrigger>
      <PopoverContent className="w-72">
        <div className="flex flex-col gap-2.5 text-[12.5px]">
          <Field label="영역 색상 기준"><Select value={layers.color} onChange={(e) => setLayers((l) => ({ ...l, color: e.target.value as ColorMode }))}>{Object.entries(COLOR_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          {(layers.color === 'relations' || layers.color === 'war') && (
            <Field label={layers.color === 'war' ? '전쟁' : '기준 국가'}><EntityPicker value={layers.focusId} onChange={(v) => setLayers((l) => ({ ...l, focusId: v }))} kinds={layers.color === 'war' ? ['war'] : ['country']} allowCreate={false} /></Field>
          )}
          {([['claims', '영유권 주장 (사선)'], ['labels', '국가명 라벨'], ['fronts', '전선'], ['routes', '교통로·철도·화살표'], ['annotations', '텍스트 주석']] as const).map(([k, label]) => (
            <label key={k} className="flex items-center justify-between">{label}<Switch checked={layers[k] as boolean} onCheckedChange={(v) => setLayers((l) => ({ ...l, [k]: v }))} /></label>
          ))}
          <div className="border-t border-border pt-2">
            <p className="mb-1 text-[11px] font-medium text-muted">마커</p>
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(MARKER_TYPES).map(([k, v]) => (
                <label key={k} className="flex items-center gap-1.5 text-[11.5px]"><input type="checkbox" checked={layers.markers[k]} onChange={(e) => setLayers((l) => ({ ...l, markers: { ...l.markers, [k]: e.target.checked } }))} />{v.glyph} {v.label}</label>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function JumpPopover({ targets, onEntity, onMarker }: { targets: { countries: { id: string; name: string; kind: string }[]; markers: { id: string; label: string }[] }; onEntity: (id: string) => void; onMarker: (id: string) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const s = q.trim().toLowerCase()
  const ents = targets.countries.filter((e) => !s || e.name.toLowerCase().includes(s)).slice(0, 12)
  const mks = targets.markers.filter((m) => m.label && (!s || m.label.toLowerCase().includes(s))).slice(0, 12)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button size="sm" variant="ghost" data-testid="jump"><Search />이동·마커 검색</Button></PopoverTrigger>
      <PopoverContent className="w-72 p-2">
        <Input autoFocus placeholder="국가·지역·도시·부대 마커" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="mt-2 max-h-72 overflow-y-auto text-[12.5px]">
          {ents.length > 0 && <p className="px-1 text-[10.5px] text-subtle">국가·지역</p>}
          {ents.map((e) => <button key={e.id} className="flex w-full items-center gap-2 rounded px-2 py-1 hover:bg-surface-2" onClick={() => { onEntity(e.id); setOpen(false) }}><Crosshair className="size-3.5 text-subtle" />{e.name}</button>)}
          {mks.length > 0 && <p className="mt-1 px-1 text-[10.5px] text-subtle">마커</p>}
          {mks.map((m) => <button key={m.id} className="flex w-full items-center gap-2 rounded px-2 py-1 hover:bg-surface-2" onClick={() => { onMarker(m.id); setOpen(false) }}><MapPin className="size-3.5 text-subtle" />{m.label}</button>)}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function CreateObjectDialog({ kind, points, defaultMarkerType, lineType, lineEntity, paintWith, mapId, onClose, onCreated }: {
  kind: 'marker' | 'polygon' | 'line' | 'text'; points: [number, number][]; defaultMarkerType: string; lineType: MapFeature['feature_type']; lineEntity: string | null
  paintWith: string | null; mapId: string; onClose: () => void; onCreated: (m: RecordedMutation[], tables: string[]) => void
}) {
  const { projectId, branchId, branch, date } = useWorld()
  const invalidate = useInvalidateTable()
  const [label, setLabel] = useState('')
  const [type, setType] = useState(kind === 'marker' ? defaultMarkerType : lineType)
  const [entity, setEntity] = useState<string | null>(kind === 'line' ? lineEntity : null)
  const [color, setColor] = useState<string | null>(null)
  const [from, setFrom] = useState(kind === 'polygon' ? '' : date)
  const [to, setTo] = useState('')
  const [assign, setAssign] = useState(!!paintWith)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    try {
      const temporal = { valid_from: from || null, valid_to: to || null }
      if (kind === 'marker') {
        if (!label.trim() && !entity) { toast.error('이름을 입력하거나 항목을 연결하세요.'); return }
        onCreated(await applyPlan('atlas_markers', [{ kind: 'insert', values: { map_id: mapId, marker_type: type, x: points[0][0], y: points[0][1], label: label.trim(), entity_id: entity, color, min_zoom: 0, ...temporal } as never }], branchId, { project_id: projectId }), ['atlas_markers'])
      } else if (kind === 'text') {
        if (!label.trim()) { toast.error('텍스트를 입력하세요.'); return }
        onCreated(await applyPlan('atlas_map_features', [{ kind: 'insert', values: { map_id: mapId, feature_type: 'annotation', geometry: { type: 'Point', coordinates: points[0] }, label: label.trim(), style: { color: color ?? '#111827', fontSize: 14 }, entity_id: entity, ...temporal } as never }], branchId, { project_id: projectId }), ['atlas_map_features'])
      } else if (kind === 'line') {
        const geometry = type === 'area' ? { type: 'Polygon', coordinates: [[...points, points[0]]] } : { type: 'LineString', coordinates: points }
        onCreated(await applyPlan('atlas_map_features', [{ kind: 'insert', values: { map_id: mapId, feature_type: type, geometry, label: label.trim(), style: color ? { color } : {}, entity_id: entity, ...temporal } as never }], branchId, { project_id: projectId }), ['atlas_map_features'])
      } else {
        const key = `user-${uuid().slice(0, 8)}`
        const ctx: Ctx = { projectId, branchId, originBranchId: branch.is_main ? null : branchId, date }
        let regionId = entity
        if (!regionId) {
          const ids = await ensureRegions(ctx, mapId, [{ key, name: label.trim() || '새 영역' }], [])
          regionId = ids.get(key)!
        }
        const muts: RecordedMutation[] = []
        if (entity) muts.push(...await runDbOps('atlas_map_regions', [{ kind: 'insert', values: { project_id: projectId, map_id: mapId, feature_key: key, feature_name: label.trim(), region_id: entity, geometry: { type: 'Polygon', coordinates: [[...points, points[0]]] } } }]))
        else {
          const { supabase } = await import('@/lib/supabase')
          const { error } = await supabase.from('atlas_map_regions').update({ geometry: { type: 'Polygon', coordinates: [[...points, points[0]]] } }).eq('map_id', mapId).eq('feature_key', key)
          if (error) throw error
        }
        if (assign && paintWith && regionId) muts.push(...await setControl(ctx, [regionId], [], { controller_id: paintWith, status: 'integrated' }))
        invalidate('atlas_entities', 'atlas_regions')
        onCreated(muts, ['atlas_map_regions', 'atlas_territory_control'])
      }
      toast.success('지도에 추가했습니다.')
    } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }
  const title = kind === 'marker' ? '마커 추가' : kind === 'text' ? '텍스트 주석' : kind === 'line' ? '선 추가' : '새 영역'
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={title} description={`지도 좌표 ${points[0]?.map((v) => v.toFixed(3)).join(', ')}${points.length > 1 ? ` 외 ${points.length - 1}점` : ''}`}
        footer={<><Button variant="secondary" onClick={onClose}>취소</Button><Button onClick={submit} disabled={busy} data-testid="map-object-save">추가</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          {kind === 'marker' && <Field label="마커 종류"><Select value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(MARKER_TYPES).map(([k, v]) => <option key={k} value={k}>{v.glyph} {v.label}</option>)}</Select></Field>}
          {kind === 'line' && <Field label="선 종류"><Select value={type} onChange={(e) => setType(e.target.value as never)}><option value="front_line">전선</option><option value="route">교통로</option><option value="railway">철도</option><option value="arrow">진격 화살표</option><option value="area">영역 (전선 지대)</option></Select></Field>}
          <Field label={kind === 'text' ? '텍스트' : kind === 'polygon' ? '지역 이름' : '라벨'} className={kind === 'marker' || kind === 'line' ? '' : 'col-span-2'}><Input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} data-testid="map-object-label" /></Field>
          <Field label={kind === 'polygon' ? '기존 지역 항목에 연결 (비우면 새로 생성)' : '연결 항목'} className="col-span-2">
            <EntityPicker value={entity} onChange={setEntity} kinds={kind === 'polygon' ? ['region'] : kind === 'marker' ? undefined : ['war', 'battle', 'unit', 'event', 'country']} testId="map-object-entity" />
          </Field>
          {kind !== 'polygon' && <Field label="색상"><ColorInput value={color} onChange={setColor} /></Field>}
          {kind !== 'polygon' && <><Field label="표시 시작일"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="표시 종료일"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field></>}
          {kind === 'polygon' && paintWith && <label className="col-span-2 flex items-center justify-between rounded-md border border-border px-3 py-2">현재 색칠 국가의 지배로 지정<Switch checked={assign} onCheckedChange={setAssign} /></label>}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function MarkerPanel({ marker, onChange, onDeleted }: { marker: Marker; onChange: (m: RecordedMutation[]) => void; onDeleted: () => void }) {
  const { branchId, canEdit, branch } = useWorld()
  const [label, setLabel] = useState(marker.label)
  const [entity, setEntity] = useState(marker.entity_id)
  const [type, setType] = useState(marker.marker_type)
  const [minZoom, setMinZoom] = useState(String(marker.min_zoom ?? 0))
  useEffect(() => { setLabel(marker.label); setEntity(marker.entity_id); setType(marker.marker_type) }, [marker])
  const save = async (patch: Partial<Marker>) => { try { onChange(await applyPlan('atlas_markers', [{ kind: 'update', row: marker, patch }], branchId, {})) } catch (e) { toast.error(friendlyError(e)) } }
  return (
    <Section title={<span className="flex items-center gap-1.5">{MARKER_TYPES[type]?.glyph} 마커</span>}>
      {marker.entity_id && <Row label="연결"><EntityLink id={marker.entity_id} /></Row>}
      <Row label="표시 기간">{marker.valid_from ? formatDate(marker.valid_from, 'short') : '처음'} ~ {marker.valid_to ? formatDate(marker.valid_to, 'short') : '현재'}</Row>
      {marker.branch_id !== branchId && <Badge tone="muted">상위 세계선에서 상속 · 수정 시 "{branch.name}"에 사본 생성</Badge>}
      {canEdit && <>
        <Field label="라벨"><Input value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => label !== marker.label && save({ label })} /></Field>
        <Field label="종류"><Select value={type} onChange={(e) => { setType(e.target.value); save({ marker_type: e.target.value }) }}>{Object.entries(MARKER_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <Field label="연결 항목"><EntityPicker value={entity} onChange={(v) => { setEntity(v); save({ entity_id: v }) }} /></Field>
        <Field label="표시 최소 확대 배율"><Input type="number" step="0.5" value={minZoom} onChange={(e) => setMinZoom(e.target.value)} onBlur={() => save({ min_zoom: Number(minZoom) || 0 })} /></Field>
        <Button size="sm" variant="danger-ghost" onClick={async () => { try { onChange(await applyPlan('atlas_markers', [{ kind: 'delete', row: marker }], branchId, {})); onDeleted() } catch (e) { toast.error(friendlyError(e)) } }}><Trash2 />마커 삭제</Button>
      </>}
    </Section>
  )
}

function FeaturePanel({ feature, onChange, onDeleted }: { feature: MapFeature; onChange: (m: RecordedMutation[]) => void; onDeleted: () => void }) {
  const { branchId, canEdit } = useWorld()
  const [label, setLabel] = useState(feature.label)
  useEffect(() => setLabel(feature.label), [feature])
  const save = async (patch: Partial<MapFeature>) => { try { onChange(await applyPlan('atlas_map_features', [{ kind: 'update', row: feature, patch }], branchId, {})) } catch (e) { toast.error(friendlyError(e)) } }
  const TYPE: Record<string, string> = { front_line: '전선', route: '교통로', railway: '철도', arrow: '진격 화살표', annotation: '텍스트 주석', area: '영역' }
  return (
    <Section title={TYPE[feature.feature_type]}>
      {feature.entity_id && <Row label="연결"><EntityLink id={feature.entity_id} /></Row>}
      <Row label="표시 기간">{feature.valid_from ? formatDate(feature.valid_from, 'short') : '처음'} ~ {feature.valid_to ? formatDate(feature.valid_to, 'short') : '현재'}</Row>
      {canEdit && <>
        <Field label="라벨"><Input value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => label !== feature.label && save({ label })} /></Field>
        <Field label="색상"><ColorInput value={feature.style?.color ?? null} onChange={(c) => save({ style: { ...feature.style, color: c ?? undefined } })} /></Field>
        <Field label="표시 종료일 (이 날부터 숨김)"><Input type="date" defaultValue={feature.valid_to ?? ''} onBlur={(e) => (e.target.value || null) !== feature.valid_to && save({ valid_to: e.target.value || null })} /></Field>
        <Button size="sm" variant="danger-ghost" onClick={async () => { try { onChange(await applyPlan('atlas_map_features', [{ kind: 'delete', row: feature }], branchId, {})); onDeleted() } catch (e) { toast.error(friendlyError(e)) } }}><Trash2 />삭제</Button>
      </>}
    </Section>
  )
}

/** Explicit bulk operations on imported maps: register features as regions, optionally set control from a property. */
function BulkDialog({ loaded, mapId, existing, control, onClose, onDone }: { loaded: import('./model').LoadedMap; mapId: string; existing: import('@/data/types').MapRegion[]; control: import('@/data/types').TerritoryControl[]; onClose: () => void; onDone: (m: RecordedMutation[]) => void }) {
  const { projectId, branchId, branch, date, entities } = useWorld()
  const invalidate = useInvalidateTable()
  const [prop, setProp] = useState('')
  const [createCountries, setCreateCountries] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const unlinked = loaded.features.filter((f) => !existing.find((r) => r.feature_key === f.key)?.region_id)
  const go = async () => {
    const ctx: Ctx = { projectId, branchId, originBranchId: branch.is_main ? null : branchId, date }
    try {
      setBusy('지역 항목 등록 중…')
      const ids = await ensureRegions(ctx, mapId, loaded.features.map((f) => ({ key: f.key, name: f.name })), existing)
      const muts: RecordedMutation[] = []
      if (prop) {
        const { createEntity } = await import('@/data/entities')
        const byName = new Map(entities.filter((e) => e.kind === 'country').map((e) => [e.name, e.id]))
        const groups = new Map<string, string[]>()
        for (const f of loaded.features) {
          const v = featureProp(f, prop)
          if (!v) continue
          if (!groups.has(v)) groups.set(v, [])
          groups.get(v)!.push(ids.get(f.key)!)
        }
        let i = 0
        for (const [name, regionIds] of groups) {
          i++
          setBusy(`지배 설정 ${i}/${groups.size}: ${name}`)
          let cid = byName.get(name)
          if (!cid && createCountries) { cid = (await createEntity({ projectId, kind: 'country', name, originBranchId: ctx.originBranchId, base: { status: 'tentative', tags: ['지도에서 가져옴'] } })).id; byName.set(name, cid) }
          if (cid) muts.push(...await setControl(ctx, regionIds, control, { controller_id: cid, sovereign_id: cid, status: 'integrated' }))
        }
      }
      invalidate('atlas_entities', 'atlas_regions', 'atlas_map_regions', 'atlas_territory_control', 'atlas_countries')
      onDone(muts)
      toast.success('일괄 작업을 마쳤습니다.')
      onClose()
    } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(null) }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="지도 일괄 작업" description="명시적으로 실행할 때만 데이터가 생성됩니다. 생성된 항목은 모두 '잠정' 상태이며 자유롭게 수정·삭제할 수 있습니다."
        footer={<>{busy && <span className="mr-auto text-[12px] text-muted">{busy}</span>}<Button variant="secondary" onClick={onClose}>취소</Button><Button onClick={go} disabled={!!busy} data-testid="bulk-run">실행</Button></>}>
        <div className="flex flex-col gap-3 text-[12.5px]">
          <p>지도 영역 {loaded.features.length}개 중 지역 항목과 연결되지 않은 영역 <b>{unlinked.length}개</b>를 지역 항목으로 등록합니다.</p>
          {loaded.propertyKeys.length > 0 && <>
            <Field label={`(선택) 속성 값으로 ${formatDate(date)} 지배국 지정`} hint="예: historical-basemaps의 SUBJECTO(주권국). 같은 이름의 기존 국가가 있으면 그 국가에 연결합니다.">
              <Select value={prop} onChange={(e) => setProp(e.target.value)}><option value="">하지 않음</option>{loaded.propertyKeys.map((p) => <option key={p}>{p}</option>)}</Select>
            </Field>
            {prop && <label className="flex items-center justify-between rounded-md border border-border px-3 py-2">이름이 일치하는 국가가 없으면 새 국가 항목 생성<Switch checked={createCountries} onCheckedChange={setCreateCountries} /></label>}
          </>}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function featureProp(f: import('./model').LoadedFeature, prop: string): string | null {
  const v = f.properties?.[prop]
  return v === null || v === undefined || v === '' ? null : String(v)
}
