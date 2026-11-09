import { useEffect, useRef } from 'react'
import type { EChartsOption } from 'echarts'
import { useSession } from '@/stores/session'

/** Lazy-loaded ECharts wrapper (keeps echarts out of the initial bundle). */
export function EChart({ option, height = 300, onClick }: { option: EChartsOption; height?: number; onClick?: (params: { name?: string; seriesName?: string; data?: unknown }) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const chart = useRef<import('echarts').ECharts | null>(null)
  const theme = useSession((s) => s.theme)

  useEffect(() => {
    let disposed = false
    let ro: ResizeObserver | null = null
    import('echarts').then((echarts) => {
      if (disposed || !ref.current) return
      chart.current = echarts.init(ref.current, document.documentElement.classList.contains('dark') ? 'dark' : undefined, { renderer: 'svg' })
      chart.current.setOption({ backgroundColor: 'transparent', ...option }, true)
      if (onClick) chart.current.on('click', (p) => onClick(p as never))
      ro = new ResizeObserver(() => chart.current?.resize())
      ro.observe(ref.current)
    })
    return () => { disposed = true; ro?.disconnect(); chart.current?.dispose(); chart.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])

  useEffect(() => { chart.current?.setOption({ backgroundColor: 'transparent', ...option }, true) }, [option])

  return <div ref={ref} style={{ height }} className="w-full" />
}
