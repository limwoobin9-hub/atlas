/** Party / ideology colour logic, kept pure for testing. */
export interface PartyColorInput { id: string; color: string | null; color_mode: 'ideology' | 'custom' | string; ideology_id: string | null }
export interface IdeologyColorInput { id: string; color: string }

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h /= 6
  return [h, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/** Shift lightness of a colour by `step` (positive = lighter). */
export function shade(hex: string, step: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex
  const [h, s, l] = hexToHsl(hex)
  return hslToHex(h, s, Math.max(0.12, Math.min(0.85, l + step)))
}

/**
 * Resolve the display colour of each party. Parties using their ideology colour that share an
 * ideology get distinct shades so they remain distinguishable in seat charts.
 */
export function resolvePartyColors(parties: PartyColorInput[], ideologies: IdeologyColorInput[]): Map<string, string> {
  const ideo = new Map(ideologies.map((i) => [i.id, i.color]))
  const out = new Map<string, string>()
  const seen = new Map<string, number>()
  for (const p of parties) {
    if (p.color_mode === 'custom' && p.color) { out.set(p.id, p.color); continue }
    const base = (p.ideology_id && ideo.get(p.ideology_id)) || p.color || '#9ca3af'
    const key = p.ideology_id ?? base
    const n = seen.get(key) ?? 0
    seen.set(key, n + 1)
    out.set(p.id, n === 0 ? base : shade(base, (n % 2 === 1 ? 1 : -1) * 0.12 * Math.ceil(n / 2)))
  }
  return out
}
