import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { downloadBlob, signedUrl } from '@/data/db'
import { useIdeologies, useTable, useTemporal } from '@/data/hooks'
import type { Asset, AtlasMap, DiplomaticRelation, MapFeature, MapRegion, Marker, TerritoryClaim, TerritoryControl, WarParticipant, WarSide } from '@/data/types'
import { useWorld } from '@/data/world'
import { CONTROL_STATUS, MARKER_TYPES, RELATION_TYPES } from '@/domain/kinds'
import { rowsAt } from '@/domain/timeline'
import { useCountryStatesAt } from '@/features/wars/useCountryFlags'
import type { LabelView, LineView, MarkerView, RegionStyle, TextView, UserRegion } from './MapCanvas'
import { geometryPath, hashColor, lineToPath, loadGeoJson, loadRaster, loadSvg, type LoadedMap } from './model'

export type ColorMode = 'control' | 'sovereign' | 'ideology' | 'relations' | 'war' | 'none'

export interface Layers {
  color: ColorMode
  claims: boolean
  markers: Record<string, boolean>
  fronts: boolean
  routes: boolean
  annotations: boolean
  labels: boolean
  focusId: string | null
}

export const DEFAULT_LAYERS: Layers = {
  color: 'control', claims: true, markers: Object.fromEntries(Object.keys(MARKER_TYPES).map((k) => [k, true])), fronts: true, routes: true, annotations: true, labels: true, focusId: null,
}

export function useMaps() {
  return useTable<AtlasMap>('atlas_maps', undefined, 'sort_order')
}

export function useMapSource(map: AtlasMap | undefined) {
  const assets = useTable<Asset>('atlas_assets', undefined, 'created_at')
  const asset = assets.data?.find((a) => a.id === map?.asset_id)
  return useQuery({
    queryKey: ['map-source', map?.id, asset?.storage_path, map?.projection, map?.feature_id_property, map?.feature_name_property, map?.width, map?.height],
    enabled: !!map && !!asset,
    staleTime: Infinity,
    queryFn: async (): Promise<LoadedMap> => {
      if (map!.map_kind === 'raster') {
        const url = await signedUrl(asset!.storage_path)
        if (!url) throw new Error('지도 이미지를 불러올 수 없습니다.')
        return loadRaster(url, Number(map!.width ?? asset!.width ?? 1000), Number(map!.height ?? asset!.height ?? 1000))
      }
      const blob = await downloadBlob(asset!.storage_path)
      const text = await blob.text()
      if (map!.map_kind === 'svg') return loadSvg(text)
      return loadGeoJson(JSON.parse(text), map!)
    },
  })
}

/** All world-state needed to draw a map at the current date & world line. */
export function useMapView(map: AtlasMap | undefined, loaded: LoadedMap | undefined, layers: Layers) {
  const { date, entityMap } = useWorld()
  const regions = useTable<MapRegion>('atlas_map_regions', map ? { map_id: map.id } : undefined, 'feature_key')
  const control = useTemporal<TerritoryControl>('atlas_territory_control')
  const claims = useTemporal<TerritoryClaim>('atlas_territory_claims')
  const markers = useTemporal<Marker>('atlas_markers', map ? { map_id: map.id } : undefined)
  const features = useTemporal<MapFeature>('atlas_map_features', map ? { map_id: map.id } : undefined)
  const rels = useTemporal<DiplomaticRelation>('atlas_diplomatic_relations')
  const wp = useTemporal<WarParticipant>('atlas_war_participants')
  const sides = useTable<WarSide>('atlas_war_sides')
  const ideologies = useIdeologies()
  const states = useCountryStatesAt()

  const countryColor = useMemo(() => (id: string | null | undefined) => {
    if (!id) return null
    return states.get(id)?.color ?? entityMap.get(id)?.color ?? hashColor(id)
  }, [states, entityMap])

  const result = useMemo(() => {
    const styles = new Map<string, RegionStyle>()
    const userRegions: UserRegion[] = []
    const labels: LabelView[] = []
    if (!loaded || !map) return { styles, userRegions, markers: [] as MarkerView[], lines: [] as LineView[], texts: [] as TextView[], labels, regionByKey: new Map<string, MapRegion>(), controlByRegion: new Map<string, TerritoryControl>() }
    const regionByKey = new Map((regions.data ?? []).map((r) => [r.feature_key, r]))
    const ctrlNow = rowsAt(control.visible, date)
    const controlByRegion = new Map(ctrlNow.map((r) => [r.region_id, r]))
    const claimsNow = rowsAt(claims.visible, date)
    const claimsByRegion = new Map<string, TerritoryClaim[]>()
    for (const c of claimsNow) { if (!claimsByRegion.has(c.region_id)) claimsByRegion.set(c.region_id, []); claimsByRegion.get(c.region_id)!.push(c) }
    const relNow = rowsAt(rels.visible, date)
    const ideoColor = new Map((ideologies.data ?? []).map((i) => [i.id, i.color]))
    const sideOf = new Map<string, string>()
    if (layers.color === 'war' && layers.focusId) {
      for (const p of rowsAt(wp.visible, date)) if (p.war_id === layers.focusId) sideOf.set(p.participant_id, sides.data?.find((s) => s.id === p.side_id)?.color ?? '#999')
    }

    const colorFor = (ctl: TerritoryControl | undefined): string | null => {
      if (!ctl) return null
      const who = layers.color === 'sovereign' ? ctl.sovereign_id ?? ctl.controller_id : ctl.controller_id
      if (!who) return null
      switch (layers.color) {
        case 'none': return null
        case 'ideology': { const s = states.get(who); return s?.ideology_id ? ideoColor.get(s.ideology_id) ?? '#cbd5e1' : '#cbd5e1' }
        case 'relations': {
          if (!layers.focusId) return countryColor(who)
          if (who === layers.focusId) return '#111827'
          const r = relNow.find((x) => (x.a_id === layers.focusId && x.b_id === who) || (x.b_id === layers.focusId && x.a_id === who))
          return r ? RELATION_TYPES[r.relation_type]?.color ?? '#94a3b8' : '#e5e7eb'
        }
        case 'war': return sideOf.get(who) ?? '#e5e7eb'
        default: return countryColor(who)
      }
    }

    const styleFor = (key: string, name: string): RegionStyle | null => {
      const mr = regionByKey.get(key)
      if (!mr?.region_id) return null
      const ctl = controlByRegion.get(mr.region_id)
      const fill = colorFor(ctl)
      const regionName = entityMap.get(mr.region_id)?.name ?? name
      const cl = (claimsByRegion.get(mr.region_id) ?? []).filter((c) => c.claimant_id !== ctl?.controller_id)
      const disputed = !!ctl && (ctl.status === 'disputed' || ctl.status === 'occupied' || (!!ctl.sovereign_id && ctl.sovereign_id !== ctl.controller_id))
      const title = [regionName, ctl?.controller_id ? `지배: ${entityMap.get(ctl.controller_id)?.name ?? '?'}` : '지배 미지정',
        ctl?.sovereign_id && ctl.sovereign_id !== ctl.controller_id ? `주권: ${entityMap.get(ctl.sovereign_id)?.name ?? '?'}` : '',
        ctl ? CONTROL_STATUS[ctl.status] : '', cl.length ? `주장: ${cl.map((c) => entityMap.get(c.claimant_id)?.name ?? '?').join(', ')}` : ''].filter(Boolean).join('\n')
      return {
        fill: fill ?? 'var(--map-land)', title, dashed: disputed, stroke: disputed ? countryColor(ctl?.sovereign_id) ?? '#000' : undefined,
        claims: layers.claims ? cl.map((c) => countryColor(c.claimant_id) ?? '#000') : [],
        opacity: ctl?.status === 'occupied' ? 0.7 : 1,
      }
    }

    const labelArea = new Map<string, { area: number; x: number; y: number; w: number }>()
    for (const f of loaded.features) {
      const st = styleFor(f.key, f.name)
      if (st) styles.set(f.key, st)
      if (layers.labels && map.map_kind === 'geojson') {
        const mr = regionByKey.get(f.key)
        const who = mr?.region_id ? controlByRegion.get(mr.region_id)?.controller_id : null
        if (who) {
          const w = f.bbox[2] - f.bbox[0]
          const area = w * (f.bbox[3] - f.bbox[1])
          const prev = labelArea.get(who)
          if (!prev || area > prev.area) labelArea.set(who, { area, x: f.centroid[0], y: f.centroid[1], w })
        }
      }
    }
    for (const r of regions.data ?? []) {
      if (!r.geometry) continue
      const d = geometryPath(r.geometry, loaded.project)
      const st = styleFor(r.feature_key, r.feature_name)
      if (st) styles.set(r.feature_key, st)
      const ring = r.geometry.type === 'Polygon' ? (r.geometry.coordinates as number[][][])[0] : []
      userRegions.push({ id: r.id, key: r.feature_key, d, vertices: ring.slice(0, -1).map((p) => loaded.project([p[0], p[1]])!).filter(Boolean) })
    }
    for (const [who, a] of labelArea) {
      const nm = states.get(who)?.name || entityMap.get(who)?.name
      if (nm) labels.push({ key: who, x: a.x, y: a.y, text: nm, size: Math.max(4, Math.min(40, a.w / Math.max(4, nm.length) * 1.1)) })
    }

    const mk: MarkerView[] = []
    for (const m of rowsAt(markers.visible, date)) {
      if (!layers.markers[m.marker_type]) continue
      if (m.entity_id && !entityMap.has(m.entity_id)) continue
      const p = loaded.project([m.x, m.y])
      if (!p) continue
      const t = MARKER_TYPES[m.marker_type] ?? MARKER_TYPES.custom
      mk.push({ id: m.id, x: p[0], y: p[1], color: m.color ?? t.color, glyph: t.glyph, label: m.label || (m.entity_id ? entityMap.get(m.entity_id)?.name ?? '' : ''), minZoom: Number(m.min_zoom ?? 0), highlight: !!layers.focusId && m.entity_id === layers.focusId })
    }

    const lines: LineView[] = []
    const texts: TextView[] = []
    for (const f of rowsAt(features.visible, date)) {
      if (f.entity_id && !entityMap.has(f.entity_id)) continue
      const style = f.style ?? {}
      if (f.feature_type === 'annotation') {
        if (!layers.annotations) continue
        const c = f.geometry.coordinates as number[]
        const p = loaded.project([c[0], c[1]])
        if (p) texts.push({ id: f.id, x: p[0], y: p[1], text: f.label, size: style.fontSize ?? 14, color: style.color ?? '#111827' })
        continue
      }
      if (f.feature_type === 'front_line' && !layers.fronts) continue
      if ((f.feature_type === 'route' || f.feature_type === 'railway' || f.feature_type === 'arrow') && !layers.routes) continue
      const coords = (f.geometry.type === 'Polygon' ? (f.geometry.coordinates as number[][][])[0] : f.geometry.coordinates) as number[][]
      const d = lineToPath(coords, loaded.project) + (f.geometry.type === 'Polygon' ? 'Z' : '')
      const mid = coords[Math.floor(coords.length / 2)]
      const color = style.color ?? (f.feature_type === 'front_line' ? '#dc2626' : f.feature_type === 'railway' ? '#374151' : '#2563eb')
      lines.push({ id: f.id, d, color, width: style.width ?? (f.feature_type === 'front_line' ? 3 : 2), dash: f.feature_type === 'railway' ? '6 3' : style.dash ? '6 4' : undefined, arrow: f.feature_type === 'arrow', label: f.label, labelAt: mid ? loaded.project([mid[0], mid[1]]) ?? undefined : undefined, type: f.feature_type })
    }
    return { styles, userRegions, markers: mk, lines, texts, labels, regionByKey, controlByRegion }
  }, [loaded, map, regions.data, control.visible, claims.visible, markers.visible, features.visible, rels.visible, wp.visible, sides.data, ideologies.data, states, date, layers, entityMap, countryColor])

  return {
    ...result, regions, control, claims, markersQ: markers, featuresQ: features, countryColor,
    loading: regions.isLoading || control.isLoading || claims.isLoading || markers.isLoading || features.isLoading,
  }
}
