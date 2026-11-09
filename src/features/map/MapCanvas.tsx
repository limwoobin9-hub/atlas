import { select } from 'd3-selection'
import 'd3-transition'
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom'
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { LoadedMap } from './model'

export type Tool = 'view' | 'select' | 'paint' | 'erase' | 'claim' | 'marker' | 'move' | 'polygon' | 'vertex' | 'line' | 'text'

export interface RegionStyle { fill: string; stroke?: string; claims?: string[]; title: string; dashed?: boolean; opacity?: number }
export interface UserRegion { id: string; key: string; d: string; vertices?: [number, number][] }
export interface MarkerView { id: string; x: number; y: number; color: string; glyph: string; label: string; minZoom: number; highlight?: boolean }
export interface LineView { id: string; d: string; color: string; width: number; dash?: string; arrow?: boolean; label: string; labelAt?: [number, number]; type: string }
export interface TextView { id: string; x: number; y: number; text: string; size: number; color: string }
export interface LabelView { key: string; x: number; y: number; text: string; size: number }

export interface MapCanvasHandle {
  fitBounds: (b: [number, number, number, number], maxScale?: number) => void
  reset: () => void
  zoomBy: (f: number) => void
  centerOn: (x: number, y: number, k?: number) => void
  getTransform: () => ZoomTransform
}

interface Props {
  map: LoadedMap
  tool: Tool
  styles: Map<string, RegionStyle>
  userRegions: UserRegion[]
  markers: MarkerView[]
  lines: LineView[]
  texts: TextView[]
  labels: LabelView[]
  selected: Set<string>
  selectedObject?: string | null
  drawing: [number, number][]
  className?: string
  readOnly?: boolean
  onFeatureDown?: (key: string, e: React.PointerEvent) => void
  onFeatureEnter?: (key: string, e: React.PointerEvent) => void
  onFeatureHover?: (key: string | null) => void
  onBackgroundClick?: (world: [number, number], e: React.MouseEvent) => void
  onDoubleClick?: (world: [number, number]) => void
  onMarkerClick?: (id: string) => void
  onObjectClick?: (id: string) => void
  onMarkerDrop?: (id: string, world: [number, number]) => void
  onTextDrop?: (id: string, world: [number, number]) => void
  onVertexDrop?: (regionId: string, index: number, world: [number, number]) => void
  onPointerMoveWorld?: (world: [number, number] | null) => void
  onStrokeEnd?: () => void
  onZoom?: (k: number) => void
}

const HATCH = (c: string) => `hatch-${c.replace(/[^a-z0-9]/gi, '')}`

export const MapCanvas = memo(forwardRef<MapCanvasHandle, Props>(function MapCanvas(props, ref) {
  const { map, tool, styles, userRegions, markers, lines, texts, labels, selected, selectedObject, drawing, className, readOnly } = props
  const svgRef = useRef<SVGSVGElement>(null)
  const gRef = useRef<SVGGElement>(null)
  const baseRef = useRef<SVGGElement>(null)
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const tRef = useRef<ZoomTransform>(zoomIdentity)
  const [k, setK] = useState(1)
  const [size, setSize] = useState({ w: 800, h: 500 })
  const [dragging, setDragging] = useState<{ kind: 'marker' | 'text' | 'vertex'; id: string; index?: number; world: [number, number] } | null>(null)
  const toolRef = useRef(tool)
  toolRef.current = tool
  const space = useRef(false)
  const propsRef = useRef(props)
  propsRef.current = props

  const toWorld = useCallback((clientX: number, clientY: number): [number, number] => {
    const r = svgRef.current!.getBoundingClientRect()
    return tRef.current.invert([clientX - r.left, clientY - r.top]) as [number, number]
  }, [])

  const fitInitial = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return
    const { width, height } = svgRef.current.getBoundingClientRect()
    const s = Math.min(width / map.width, height / map.height) * 0.96
    const t = zoomIdentity.translate((width - map.width * s) / 2, (height - map.height * s) / 2).scale(s)
    select(svgRef.current).call(zoomRef.current.transform, t)
  }, [map.width, map.height])

  useLayoutEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const ro = new ResizeObserver(() => { const r = svg.getBoundingClientRect(); setSize({ w: r.width, h: r.height }) })
    ro.observe(svg)
    let raf = 0
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 2000])
      .clickDistance(4)
      .filter((event: Event) => {
        const ev = event as MouseEvent & TouchEvent & WheelEvent
        if (ev.type === 'wheel') return true
        if (ev.type.startsWith('touch')) return true
        if (ev.type === 'dblclick') return toolRef.current === 'view' || toolRef.current === 'select'
        if ((ev.target as Element)?.closest?.('[data-drag]')) return false
        if (ev.button === 1 || ev.button === 2) return true
        if (space.current) return true
        const t = toolRef.current
        return ev.button === 0 && !ev.ctrlKey && (t === 'view' || t === 'select' || t === 'marker' || t === 'text' || t === 'polygon' || t === 'line' || t === 'move' || t === 'vertex')
      })
      .on('zoom', (e) => {
        tRef.current = e.transform
        gRef.current?.setAttribute('transform', e.transform.toString())
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(() => { setK(e.transform.k); propsRef.current.onZoom?.(e.transform.k) })
      })
    zoomRef.current = z
    select(svg).call(z).on('dblclick.zoom', null)
    fitInitial()
    const kd = (e: KeyboardEvent) => { if (e.code === 'Space' && !(e.target as HTMLElement)?.closest('input,textarea')) space.current = true }
    const ku = (e: KeyboardEvent) => { if (e.code === 'Space') space.current = false }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => { ro.disconnect(); select(svg).on('.zoom', null); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); cancelAnimationFrame(raf) }
  }, [fitInitial])

  useImperativeHandle(ref, () => ({
    fitBounds: ([x0, y0, x1, y1], maxScale = 60) => {
      if (!svgRef.current || !zoomRef.current) return
      const { width, height } = svgRef.current.getBoundingClientRect()
      const s = Math.min(maxScale, 0.85 / Math.max((x1 - x0) / width, (y1 - y0) / height, 1e-6))
      const t = zoomIdentity.translate(width / 2 - ((x0 + x1) / 2) * s, height / 2 - ((y0 + y1) / 2) * s).scale(s)
      select(svgRef.current).transition().duration(450).call(zoomRef.current.transform, t)
    },
    reset: fitInitial,
    zoomBy: (f) => { if (svgRef.current && zoomRef.current) select(svgRef.current).transition().duration(200).call(zoomRef.current.scaleBy, f) },
    centerOn: (x, y, kk) => {
      if (!svgRef.current || !zoomRef.current) return
      const { width, height } = svgRef.current.getBoundingClientRect()
      const s = kk ?? Math.max(tRef.current.k, 4)
      select(svgRef.current).transition().duration(450).call(zoomRef.current.transform, zoomIdentity.translate(width / 2 - x * s, height / 2 - y * s).scale(s))
    },
    getTransform: () => tRef.current,
  }), [fitInitial])

  // colour SVG-based maps by element id
  useEffect(() => {
    if (map.kind !== 'svg' || !baseRef.current) return
    const root = baseRef.current
    root.querySelectorAll<SVGElement>('[data-atlas-styled]').forEach((el) => { el.style.fill = ''; el.style.strokeDasharray = ''; el.style.stroke = ''; el.removeAttribute('data-atlas-styled') })
    for (const [key, st] of styles) {
      const el = root.querySelector<SVGElement>(`[id="${CSS.escape(key)}"]`)
      if (!el) continue
      el.setAttribute('data-atlas-styled', '1')
      el.style.fill = st.fill
      if (st.dashed) { el.style.strokeDasharray = '4 3'; el.style.stroke = st.stroke ?? '#000' }
    }
    root.querySelectorAll<SVGElement>('[data-atlas-selected]').forEach((el) => { el.style.filter = ''; el.removeAttribute('data-atlas-selected') })
    for (const key of selected) {
      const el = root.querySelector<SVGElement>(`[id="${CSS.escape(key)}"]`)
      if (el) { el.setAttribute('data-atlas-selected', '1'); el.style.filter = 'brightness(1.25) drop-shadow(0 0 2px #000)' }
    }
  }, [styles, selected, map.kind, map.svgMarkup])

  const hatchColors = useMemo(() => {
    const s = new Set<string>()
    for (const st of styles.values()) for (const c of st.claims ?? []) s.add(c)
    return [...s]
  }, [styles])

  const featureKeyFromEvent = (e: React.PointerEvent | React.MouseEvent): string | null => {
    const t = e.target as Element
    const el = t.closest('[data-key]') as Element | null
    if (el) return el.getAttribute('data-key')
    if (map.kind === 'svg') { const idEl = t.closest('[id]'); if (idEl && baseRef.current?.contains(idEl) && idEl.id) return idEl.id }
    return null
  }

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (readOnly || e.button !== 0) return
    const key = featureKeyFromEvent(e)
    if (key) props.onFeatureDown?.(key, e)
  }
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const w = toWorld(e.clientX, e.clientY)
    props.onPointerMoveWorld?.(w)
    if (dragging) { setDragging({ ...dragging, world: w }); return }
    if (e.buttons === 1 && (tool === 'paint' || tool === 'erase' || tool === 'claim') && !readOnly) {
      const key = featureKeyFromEvent(e)
      if (key) props.onFeatureEnter?.(key, e)
    }
  }
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragging) {
      const w = toWorld(e.clientX, e.clientY)
      if (dragging.kind === 'marker') props.onMarkerDrop?.(dragging.id, w)
      else if (dragging.kind === 'text') props.onTextDrop?.(dragging.id, w)
      else props.onVertexDrop?.(dragging.id, dragging.index!, w)
      setDragging(null)
      return
    }
    props.onStrokeEnd?.()
  }
  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if ((e.target as Element).closest('[data-object]')) return
    const key = featureKeyFromEvent(e)
    if (!key || tool === 'marker' || tool === 'polygon' || tool === 'line' || tool === 'text') props.onBackgroundClick?.(toWorld(e.clientX, e.clientY), e)
  }
  const inv = 1 / k

  return (
    <svg ref={svgRef} className={cn('atlas-map h-full w-full touch-none select-none bg-map-sea', `tool-${tool}`, (tool === 'view' || tool === 'select') && 'cursor-grab active:cursor-grabbing', (tool === 'marker' || tool === 'polygon' || tool === 'line' || tool === 'text') && 'cursor-crosshair', className)}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={() => props.onPointerMoveWorld?.(null)}
      onClick={onClick} onDoubleClick={(e) => props.onDoubleClick?.(toWorld(e.clientX, e.clientY))} onContextMenu={(e) => e.preventDefault()}
      data-testid="map-canvas" data-zoom={k.toFixed(3)} width={size.w} height={size.h}>
      <defs>
        {hatchColors.map((c) => (
          <pattern key={c} id={HATCH(c)} patternUnits="userSpaceOnUse" width={8 * inv} height={8 * inv} patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={8 * inv} stroke={c} strokeWidth={3 * inv} opacity={0.75} />
          </pattern>
        ))}
        <marker id="atlas-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke" /></marker>
      </defs>
      <g ref={gRef}>
        <BaseLayer map={map} styles={styles} selected={selected} baseRef={baseRef} hatch={HATCH} />
        <g>
          {userRegions.map((r) => {
            const st = styles.get(r.key)
            return (
              <g key={r.id}>
                <path data-key={r.key} d={r.d} className="region" fill={st?.fill ?? 'var(--map-land)'} fillOpacity={st?.opacity ?? 0.85} stroke={selected.has(r.key) ? 'var(--fg)' : '#00000055'} strokeWidth={selected.has(r.key) ? 2 : 0.8} vectorEffect="non-scaling-stroke"><title>{st?.title}</title></path>
                {st?.claims?.map((c) => <path key={c} d={r.d} fill={`url(#${HATCH(c)})`} pointerEvents="none" />)}
              </g>
            )
          })}
        </g>
        <g>
          {lines.map((l) => (
            <g key={l.id} data-object={l.id} onClick={(e) => { e.stopPropagation(); props.onObjectClick?.(l.id) }} className="cursor-pointer">
              <path d={l.d} fill="none" stroke="transparent" strokeWidth={12} vectorEffect="non-scaling-stroke" />
              <path d={l.d} fill="none" stroke={l.color} strokeWidth={selectedObject === l.id ? l.width + 2 : l.width} strokeDasharray={l.dash} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" markerEnd={l.arrow ? 'url(#atlas-arrow)' : undefined} />
              {l.type === 'front_line' && <path d={l.d} fill="none" stroke={l.color} strokeWidth={l.width + 6} strokeDasharray="1 10" vectorEffect="non-scaling-stroke" opacity={0.5} />}
              {l.label && l.labelAt && <text x={l.labelAt[0]} y={l.labelAt[1]} fontSize={11 * inv} fill={l.color} fontWeight={600} style={{ paintOrder: 'stroke', stroke: 'var(--surface)', strokeWidth: 3 * inv }}>{l.label}</text>}
            </g>
          ))}
        </g>
        {drawing.length > 0 && (
          <g pointerEvents="none">
            <path d={drawing.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join('')} fill={tool === 'polygon' ? 'var(--accent)' : 'none'} fillOpacity={0.15} stroke="var(--accent)" strokeWidth={2} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
            {drawing.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={4 * inv} fill="var(--surface)" stroke="var(--accent)" strokeWidth={1.5 * inv} />)}
          </g>
        )}
        {labels.length > 0 && (
          <g pointerEvents="none">
            {labels.filter((l) => l.size * k > 9).map((l) => (
              <text key={l.key} x={l.x} y={l.y} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(l.size, 22 * inv)} fill="#1f2937" fontWeight={600} opacity={0.8} style={{ paintOrder: 'stroke', stroke: '#ffffffaa', strokeWidth: 2.5 * inv }}>{l.text}</text>
            ))}
          </g>
        )}
        <g>
          {texts.map((t) => {
            const d = dragging?.kind === 'text' && dragging.id === t.id ? dragging.world : [t.x, t.y]
            return (
              <text key={t.id} x={d[0]} y={d[1]} fontSize={t.size * inv} fill={t.color} fontWeight={600} textAnchor="middle" data-object={t.id} data-drag={tool === 'move' ? '' : undefined}
                style={{ paintOrder: 'stroke', stroke: 'var(--surface)', strokeWidth: 3 * inv, cursor: tool === 'move' ? 'move' : 'pointer', outline: selectedObject === t.id ? '1px dashed var(--accent)' : undefined }}
                onPointerDown={(e) => { if (tool === 'move' && !readOnly) { e.stopPropagation(); setDragging({ kind: 'text', id: t.id, world: toWorld(e.clientX, e.clientY) }) } }}
                onClick={(e) => { e.stopPropagation(); props.onObjectClick?.(t.id) }}>{t.text}</text>
            )
          })}
        </g>
        {tool === 'vertex' && userRegions.filter((r) => selected.has(r.key) && r.vertices).map((r) => r.vertices!.map((v, i) => {
          const p = dragging?.kind === 'vertex' && dragging.id === r.id && dragging.index === i ? dragging.world : v
          return <circle key={`${r.id}-${i}`} cx={p[0]} cy={p[1]} r={5 * inv} fill="var(--surface)" stroke="var(--accent)" strokeWidth={2 * inv} data-drag="" className="cursor-move"
            onPointerDown={(e) => { e.stopPropagation(); setDragging({ kind: 'vertex', id: r.id, index: i, world: toWorld(e.clientX, e.clientY) }) }} />
        }))}
        <g>
          {markers.filter((m) => m.minZoom <= k || m.highlight).map((m) => {
            const d = dragging?.kind === 'marker' && dragging.id === m.id ? dragging.world : [m.x, m.y]
            return (
              <g key={m.id} transform={`translate(${d[0]},${d[1]}) scale(${inv})`} data-object={m.id} data-marker={m.label} data-drag={tool === 'move' ? '' : undefined}
                className={tool === 'move' ? 'cursor-move' : 'cursor-pointer'}
                onPointerDown={(e) => { if (tool === 'move' && !readOnly) { e.stopPropagation(); setDragging({ kind: 'marker', id: m.id, world: toWorld(e.clientX, e.clientY) }) } }}
                onClick={(e) => { e.stopPropagation(); props.onMarkerClick?.(m.id) }}>
                <circle r={m.highlight || selectedObject === m.id ? 10 : 8} fill={m.color} stroke="#fff" strokeWidth={2} />
                <text y={4} textAnchor="middle" fontSize={10} fill="#fff" fontWeight={700} pointerEvents="none">{m.glyph}</text>
                {m.label && k > 0.5 && <text x={12} y={4} fontSize={11.5} fontWeight={600} fill="#111827" style={{ paintOrder: 'stroke', stroke: '#ffffffd0', strokeWidth: 3 }} pointerEvents="none">{m.label}</text>}
              </g>
            )
          })}
        </g>
      </g>
    </svg>
  )
}))

const BaseLayer = memo(function BaseLayer({ map, styles, selected, baseRef, hatch }: { map: LoadedMap; styles: Map<string, RegionStyle>; selected: Set<string>; baseRef: React.RefObject<SVGGElement | null>; hatch: (c: string) => string }) {
  if (map.kind === 'raster') return <g ref={baseRef}><image href={map.imageUrl} x={0} y={0} width={map.width} height={map.height} preserveAspectRatio="none" style={{ imageRendering: 'auto' }} /></g>
  if (map.kind === 'svg') return <g ref={baseRef} dangerouslySetInnerHTML={{ __html: map.svgMarkup ?? '' }} />
  return (
    <g ref={baseRef}>
      <rect x={0} y={0} width={map.width} height={map.height} fill="transparent" />
      {map.features.map((f) => {
        const st = styles.get(f.key)
        const sel = selected.has(f.key)
        return (
          <g key={f.key}>
            <path data-key={f.key} d={f.d} className="region" fill={st?.fill ?? 'var(--map-land)'} fillOpacity={st?.opacity ?? 1}
              stroke={sel ? 'var(--fg)' : st?.stroke ?? '#00000040'} strokeWidth={sel ? 2.2 : st?.dashed ? 1.4 : 0.6} strokeDasharray={st?.dashed ? '4 3' : undefined} vectorEffect="non-scaling-stroke">
              <title>{st?.title ?? f.name}</title>
            </path>
            {st?.claims?.map((c) => <path key={c} d={f.d} fill={`url(#${hatch(c)})`} pointerEvents="none" />)}
          </g>
        )
      })}
    </g>
  )
})
