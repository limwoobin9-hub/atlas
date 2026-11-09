import { useEffect, useMemo, useRef, useState } from 'react'

export interface GraphNode { id: string; label: string; color?: string; size?: number; highlight?: boolean }
export interface GraphEdge { source: string; target: string; label?: string; color?: string; dashed?: boolean; directed?: boolean }

/** Small dependency-free force layout rendered as SVG (good for up to a few hundred nodes). */
export function NetworkGraph({ nodes, edges, height = 460, onNodeClick }: { nodes: GraphNode[]; edges: GraphEdge[]; height?: number; onNodeClick?: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [drag, setDrag] = useState<{ id: string } | null>(null)
  const [pos, setPos] = useState<Map<string, { x: number; y: number }>>(new Map())
  const [hover, setHover] = useState<string | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const key = nodes.map((n) => n.id).join(',') + '|' + edges.map((e) => e.source + e.target).join(',')
  const layout = useMemo(() => {
    const n = nodes.length
    const p = new Map<string, { x: number; y: number; vx: number; vy: number }>()
    nodes.forEach((node, i) => {
      const a = (i / Math.max(1, n)) * Math.PI * 2
      const r = Math.min(width, height) * 0.35
      p.set(node.id, { x: width / 2 + Math.cos(a) * r, y: height / 2 + Math.sin(a) * r, vx: 0, vy: 0 })
    })
    const k = Math.sqrt((width * height) / Math.max(1, n)) * 0.6
    for (let it = 0; it < 220; it++) {
      const t = 1 - it / 220
      for (const a of nodes) {
        const pa = p.get(a.id)!
        for (const b of nodes) {
          if (a === b) continue
          const pb = p.get(b.id)!
          const dx = pa.x - pb.x
          const dy = pa.y - pb.y
          const d = Math.max(1, Math.hypot(dx, dy))
          const f = (k * k) / d / d
          pa.vx += dx * f * 0.05
          pa.vy += dy * f * 0.05
        }
      }
      for (const e of edges) {
        const s = p.get(e.source)
        const tg = p.get(e.target)
        if (!s || !tg) continue
        const dx = tg.x - s.x
        const dy = tg.y - s.y
        const d = Math.max(1, Math.hypot(dx, dy))
        const f = (d - k) / d * 0.08
        s.vx += dx * f; s.vy += dy * f; tg.vx -= dx * f; tg.vy -= dy * f
      }
      for (const node of nodes) {
        const q = p.get(node.id)!
        q.vx += (width / 2 - q.x) * 0.004
        q.vy += (height / 2 - q.y) * 0.004
        q.x = Math.max(40, Math.min(width - 40, q.x + q.vx * t))
        q.y = Math.max(24, Math.min(height - 24, q.y + q.vy * t))
        q.vx *= 0.5; q.vy *= 0.5
      }
    }
    return new Map([...p.entries()].map(([id, v]) => [id, { x: v.x, y: v.y }]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, width, height])

  useEffect(() => setPos(layout), [layout])

  const get = (id: string) => pos.get(id) ?? layout.get(id) ?? { x: 0, y: 0 }
  const connected = (id: string) => hover && (id === hover || edges.some((e) => (e.source === hover && e.target === id) || (e.target === hover && e.source === id)))

  return (
    <div ref={ref} className="w-full select-none">
      <svg width={width} height={height} className="block"
        onPointerMove={(e) => {
          if (!drag) return
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          setPos((m) => new Map(m).set(drag.id, { x: e.clientX - r.left, y: e.clientY - r.top }))
        }}
        onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)}>
        <defs>
          <marker id="ng-arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--subtle)" /></marker>
        </defs>
        {edges.map((e, i) => {
          const s = get(e.source)
          const t = get(e.target)
          const dim = hover && !(e.source === hover || e.target === hover)
          return (
            <g key={i} opacity={dim ? 0.15 : 1}>
              <line x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke={e.color ?? 'var(--border-strong)'} strokeWidth={1.6} strokeDasharray={e.dashed ? '5 4' : undefined} markerEnd={e.directed ? 'url(#ng-arrow)' : undefined} />
              {e.label && <text x={(s.x + t.x) / 2} y={(s.y + t.y) / 2 - 3} textAnchor="middle" fontSize={10} fill="var(--muted)" style={{ paintOrder: 'stroke', stroke: 'var(--surface)', strokeWidth: 3 }}>{e.label}</text>}
            </g>
          )
        })}
        {nodes.map((n) => {
          const p = get(n.id)
          const r = n.size ?? (n.highlight ? 11 : 8)
          return (
            <g key={n.id} transform={`translate(${p.x},${p.y})`} opacity={hover && !connected(n.id) ? 0.25 : 1} className="cursor-pointer"
              onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); setDrag({ id: n.id }) }}
              onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover(null)}
              onDoubleClick={() => onNodeClick?.(n.id)} onClick={(e) => { if (e.detail === 1 && !drag) onNodeClick?.(n.id) }}>
              <circle r={r} fill={n.color ?? 'var(--accent)'} stroke={n.highlight ? 'var(--fg)' : 'var(--surface)'} strokeWidth={2} />
              <text y={r + 12} textAnchor="middle" fontSize={11} fontWeight={n.highlight ? 600 : 400} fill="var(--fg)" style={{ paintOrder: 'stroke', stroke: 'var(--surface)', strokeWidth: 3 }}>{n.label}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
