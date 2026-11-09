import { Map as MapIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Empty, Loading } from '@/components/ui/misc'
import { useWorld } from '@/data/world'
import { MapCanvas } from './MapCanvas'
import { DEFAULT_LAYERS, useMapSource, useMapView, useMaps } from './useMapView'

const EMPTY = new Set<string>()

/** Read-only preview of the default map at the current date (dashboard). */
export function MapPreview() {
  const { project, projectId } = useWorld()
  const maps = useMaps()
  const map = maps.data?.find((m) => m.id === project.default_map_id) ?? maps.data?.[0]
  const source = useMapSource(map)
  const [layers] = useState(DEFAULT_LAYERS)
  const view = useMapView(map, source.data, layers)
  if (maps.isLoading) return <Loading />
  if (!map) return <div className="p-4"><Empty icon={<MapIcon />} title="지도가 없습니다" action={<Button size="sm" asChild><Link to={`/p/${projectId}/map`}>지도 추가하기</Link></Button>} /></div>
  if (!source.data || view.loading) return <Loading label="지도 불러오는 중…" />
  return (
    <div className="h-72">
      <MapCanvas map={source.data} tool="view" styles={view.styles} userRegions={view.userRegions} markers={view.markers} lines={view.lines} texts={view.texts} labels={[]} selected={EMPTY} drawing={[]} readOnly />
    </div>
  )
}
