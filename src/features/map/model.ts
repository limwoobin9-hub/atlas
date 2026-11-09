/**
 * Map sources and coordinate systems.
 *  - geojson: features in lon/lat, projected with d3-geo into a fixed world box. Stored coordinates = [lon, lat].
 *  - svg: the uploaded SVG is embedded at its viewBox size. Stored coordinates = SVG user units.
 *  - raster: the image is placed at its pixel size. Stored coordinates = normalised [0..1] of width/height,
 *    so positions survive re-uploading the same image at another resolution and are independent of zoom.
 * Markers and shapes are always stored in these map coordinates, never in screen pixels.
 */
import { geoArea, geoEqualEarth, geoEquirectangular, geoMercator, geoNaturalEarth1, geoOrthographic, geoPath, type GeoProjection } from 'd3-geo'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { feature as topoFeature } from 'topojson-client'
import type { Topology } from 'topojson-specification'
import type { AtlasMap } from '@/data/types'

export const WORLD_W = 2000

export interface LoadedFeature { key: string; name: string; d: string; bbox: [number, number, number, number]; centroid: [number, number]; geometry?: Geometry; properties?: Record<string, unknown> }

export interface LoadedMap {
  kind: AtlasMap['map_kind']
  width: number
  height: number
  features: LoadedFeature[]
  /** map coords -> world (screen-at-zoom-1) coords */
  project: (p: [number, number]) => [number, number] | null
  /** world -> map coords */
  invert: (p: [number, number]) => [number, number] | null
  svgMarkup?: string
  imageUrl?: string
  propertyKeys: string[]
}

function makeProjection(name: AtlasMap['projection']): GeoProjection {
  switch (name) {
    case 'mercator': return geoMercator()
    case 'naturalEarth': return geoNaturalEarth1()
    case 'equalEarth': return geoEqualEarth()
    case 'orthographic': return geoOrthographic()
    default: return geoEquirectangular()
  }
}

/** d3-geo expects clockwise rings; RFC 7946 data is counter-clockwise. Reverse rings that would cover the globe. */
export function rewind(f: Feature): Feature {
  const g = f.geometry
  if (!g) return f
  const fix = (rings: number[][][]) => {
    const poly = { type: 'Polygon' as const, coordinates: rings }
    return geoArea(poly) > 2 * Math.PI ? rings.map((r) => [...r].reverse()) : rings
  }
  if (g.type === 'Polygon') return { ...f, geometry: { ...g, coordinates: fix(g.coordinates) } }
  if (g.type === 'MultiPolygon') return { ...f, geometry: { ...g, coordinates: g.coordinates.map(fix) } }
  return f
}

export function toFeatureCollection(json: unknown): FeatureCollection {
  const j = json as { type?: string; objects?: Record<string, unknown>; features?: Feature[] }
  if (j?.type === 'Topology' && j.objects) {
    const features: Feature[] = []
    for (const key of Object.keys(j.objects)) {
      const fc = topoFeature(j as unknown as Topology, j.objects[key] as never) as unknown as FeatureCollection | Feature
      if ((fc as FeatureCollection).features) features.push(...(fc as FeatureCollection).features)
      else features.push(fc as Feature)
    }
    return { type: 'FeatureCollection', features }
  }
  if (j?.type === 'FeatureCollection' && Array.isArray(j.features)) return j as FeatureCollection
  if (j?.type === 'Feature') return { type: 'FeatureCollection', features: [j as unknown as Feature] }
  throw new Error('GeoJSON/TopoJSON 형식이 아닙니다.')
}

/** Stable feature keys: id property, else feature.id, else name (+ #n for duplicates), else index. */
export function featureKeys(fc: FeatureCollection, idProp: string, nameProp: string): { key: string; name: string }[] {
  const seen = new Map<string, number>()
  return fc.features.map((f, i) => {
    const p = (f.properties ?? {}) as Record<string, unknown>
    const name = String(p[nameProp] ?? p.NAME ?? p.name ?? p.NAME_EN ?? p.ADMIN ?? f.id ?? `영역 ${i + 1}`)
    let key = idProp && p[idProp] !== undefined ? String(p[idProp]) : f.id !== undefined ? String(f.id) : name || `f${i}`
    const n = seen.get(key) ?? 0
    seen.set(key, n + 1)
    if (n > 0) key = `${key}#${n}`
    return { key, name }
  })
}

export function loadGeoJson(json: unknown, map: Pick<AtlasMap, 'projection' | 'feature_id_property' | 'feature_name_property'>): LoadedMap {
  const fc = toFeatureCollection(json)
  fc.features = fc.features.filter((f) => f.geometry).map(rewind)
  const projection = makeProjection(map.projection)
  const height = map.projection === 'mercator' ? WORLD_W : map.projection === 'orthographic' ? WORLD_W : WORLD_W / 2
  const extent: [[number, number], [number, number]] = [[10, 10], [WORLD_W - 10, height - 10]]
  if (map.projection === 'mercator') {
    projection.fitExtent(extent, fc)
    projection.clipExtent([[0, 0], [WORLD_W, height]])
  } else {
    projection.fitExtent(extent, { type: 'Sphere' } as never)
  }
  const path = geoPath(projection)
  const keys = featureKeys(fc, map.feature_id_property, map.feature_name_property)
  const features: LoadedFeature[] = fc.features.map((f, i) => {
    const b = path.bounds(f)
    const c = path.centroid(f)
    return { key: keys[i].key, name: keys[i].name, d: path(f) ?? '', bbox: [b[0][0], b[0][1], b[1][0], b[1][1]], centroid: [c[0], c[1]], geometry: f.geometry, properties: (f.properties ?? {}) as Record<string, unknown> }
  })
  const props = new Set<string>()
  for (const f of fc.features.slice(0, 50)) for (const k of Object.keys(f.properties ?? {})) props.add(k)
  return {
    kind: 'geojson', width: WORLD_W, height, features, propertyKeys: [...props],
    project: (p) => projection(p) as [number, number] | null,
    invert: (p) => (projection.invert?.(p) as [number, number] | null) ?? null,
  }
}

/** Remove scripts, event handlers, foreign objects and external references from user SVG. */
export function sanitizeSvg(text: string): { markup: string; width: number; height: number; ids: { key: string; name: string }[] } {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const svg = doc.querySelector('svg')
  if (!svg || doc.querySelector('parsererror')) throw new Error('올바른 SVG 파일이 아닙니다.')
  doc.querySelectorAll('script, foreignObject, iframe, object, embed').forEach((n) => n.remove())
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      const n = attr.name.toLowerCase()
      const v = attr.value.trim().toLowerCase()
      if (n.startsWith('on')) el.removeAttribute(attr.name)
      if ((n === 'href' || n === 'xlink:href') && (v.startsWith('javascript:') || v.startsWith('http'))) el.removeAttribute(attr.name)
    }
  })
  const vb = svg.getAttribute('viewBox')?.split(/[\s,]+/).map(Number)
  const width = vb && vb.length === 4 ? vb[2] : parseFloat(svg.getAttribute('width') ?? '1000') || 1000
  const height = vb && vb.length === 4 ? vb[3] : parseFloat(svg.getAttribute('height') ?? '1000') || 1000
  if (!vb) svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  svg.setAttribute('preserveAspectRatio', 'xMinYMin meet')
  const ids: { key: string; name: string }[] = []
  svg.querySelectorAll('path[id], polygon[id], rect[id], circle[id], ellipse[id], g[id]').forEach((el) => {
    if (el.tagName === 'g' && !el.querySelector('path,polygon')) return
    ids.push({ key: el.id, name: el.getAttribute('data-name') ?? el.getAttribute('title') ?? el.querySelector('title')?.textContent ?? el.id })
  })
  return { markup: new XMLSerializer().serializeToString(svg), width, height, ids }
}

export function loadSvg(text: string): LoadedMap {
  const s = sanitizeSvg(text)
  const minX = 0
  return {
    kind: 'svg', width: s.width, height: s.height, svgMarkup: s.markup, propertyKeys: [],
    features: s.ids.map((i) => ({ key: i.key, name: i.name, d: '', bbox: [minX, 0, 0, 0], centroid: [0, 0] })),
    project: (p) => p, invert: (p) => p,
  }
}

export function loadRaster(url: string, width: number, height: number): LoadedMap {
  return {
    kind: 'raster', width, height, imageUrl: url, features: [], propertyKeys: [],
    project: (p) => [p[0] * width, p[1] * height], invert: (p) => [p[0] / width, p[1] / height],
  }
}

/** Project a stored polygon geometry (map coords) to an SVG path in world coords. */
export function geometryPath(g: { type: string; coordinates: unknown } | null, project: LoadedMap['project']): string {
  if (!g) return ''
  const ring = (r: number[][]) => r.map((pt, i) => { const p = project([pt[0], pt[1]]); return p ? `${i ? 'L' : 'M'}${p[0]},${p[1]}` : '' }).join('') + 'Z'
  if (g.type === 'Polygon') return (g.coordinates as number[][][]).map(ring).join('')
  if (g.type === 'MultiPolygon') return (g.coordinates as number[][][][]).map((poly) => poly.map(ring).join('')).join('')
  return ''
}

export function lineToPath(coords: number[][], project: LoadedMap['project']): string {
  return coords.map((pt, i) => { const p = project([pt[0], pt[1]]); return p ? `${i ? 'L' : 'M'}${p[0]},${p[1]}` : '' }).join('')
}

/** Stable pseudo-random colour for entities without one. */
export function hashColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  const hue = Math.abs(h) % 360
  return `hsl(${hue} 45% 62%)`
}

export const MAP_PRESETS = [
  {
    id: 'hb1938', name: '1938년 세계 정치 지도 (historical-basemaps)',
    url: 'https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson/world_1938.geojson',
    license: 'GPL-3.0 (aourednik/historical-basemaps)', source: 'https://github.com/aourednik/historical-basemaps',
    nameProp: 'NAME', idProp: '', projection: 'naturalEarth' as const, note: '1936년 세계관 제작용 역사 국경. 속성: NAME(영역), SUBJECTO(주권국).',
  },
  {
    id: 'hb1945', name: '1945년 세계 정치 지도 (historical-basemaps)',
    url: 'https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson/world_1945.geojson',
    license: 'GPL-3.0 (aourednik/historical-basemaps)', source: 'https://github.com/aourednik/historical-basemaps',
    nameProp: 'NAME', idProp: '', projection: 'naturalEarth' as const, note: '전후 국경 비교용.',
  },
  {
    id: 'ne110', name: '현대 국가 경계 1:110m (Natural Earth, world-atlas TopoJSON)',
    url: 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
    license: 'Public domain (Natural Earth) / ISC (world-atlas)', source: 'https://github.com/topojson/world-atlas',
    nameProp: 'name', idProp: '', projection: 'equirectangular' as const, note: '가볍고 단순한 현대 국경. 직접 편집용 바탕으로 적합.',
  },
]
