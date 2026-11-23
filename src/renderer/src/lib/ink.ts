import { getStroke } from 'perfect-freehand'

export interface InkStroke {
  t: 'pen' | 'pencil' | 'highlighter'
  c: string
  s: number
  p: number[] // flat [x, y, pressure, x, y, pressure, ...]
  sim?: boolean // simulate pressure (mouse / touch)
}

export function strokePoints(st: InkStroke): number[][] {
  const pts: number[][] = []
  for (let i = 0; i + 2 < st.p.length + 1; i += 3) pts.push([st.p[i], st.p[i + 1], st.p[i + 2] ?? 0.5])
  return pts
}

export function outline(st: InkStroke, last = true): number[][] {
  const opts =
    st.t === 'highlighter'
      ? { size: st.s, thinning: 0, smoothing: 0.6, streamline: 0.5, simulatePressure: false, last, start: { cap: false }, end: { cap: false } }
      : st.t === 'pencil'
        ? { size: st.s, thinning: 0.25, smoothing: 0.4, streamline: 0.45, simulatePressure: !!st.sim, last }
        : { size: st.s, thinning: 0.6, smoothing: 0.55, streamline: 0.5, simulatePressure: !!st.sim, last }
  return getStroke(strokePoints(st), opts)
}

const avg = (a: number, b: number): number => (a + b) / 2

export function pathFromOutline(points: number[][], closed = true): string {
  const len = points.length
  if (len < 4) {
    if (len === 0) return ''
    const [x, y] = points[0]
    return `M ${x.toFixed(1)} ${y.toFixed(1)} m -1 0 a 1 1 0 1 0 2 0 a 1 1 0 1 0 -2 0`
  }
  let a = points[0]
  let b = points[1]
  const c = points[2]
  let d = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(2)},${b[1].toFixed(2)} ${avg(b[0], c[0]).toFixed(2)},${avg(b[1], c[1]).toFixed(2)} T`
  for (let i = 2, max = len - 1; i < max; i++) {
    a = points[i]
    b = points[i + 1]
    d += `${avg(a[0], b[0]).toFixed(2)},${avg(a[1], b[1]).toFixed(2)} `
  }
  if (closed) d += 'Z'
  return d
}

export function strokePath(st: InkStroke): string {
  return pathFromOutline(outline(st))
}

export function strokeStyle(st: InkStroke): { fill: string; opacity: number; blend: string } {
  if (st.t === 'highlighter') return { fill: st.c, opacity: 0.38, blend: 'multiply' }
  if (st.t === 'pencil') return { fill: st.c, opacity: 0.82, blend: 'normal' }
  return { fill: st.c, opacity: 1, blend: 'normal' }
}

export function inkBounds(strokes: InkStroke[]): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const s of strokes) {
    for (let i = 0; i < s.p.length; i += 3) {
      minX = Math.min(minX, s.p[i])
      maxX = Math.max(maxX, s.p[i])
      minY = Math.min(minY, s.p[i + 1])
      maxY = Math.max(maxY, s.p[i + 1])
    }
  }
  if (!Number.isFinite(minX)) return null
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function inkToSvg(strokes: InkStroke[], width: number, height: number, background = 'none'): string {
  const paths = strokes
    .map((s) => {
      const st = strokeStyle(s)
      return `<path d="${strokePath(s)}" fill="${st.fill}" fill-opacity="${st.opacity}"${st.blend === 'multiply' ? ' style="mix-blend-mode:multiply"' : ''}/>`
    })
    .join('')
  const bg = background === 'none' ? '' : `<rect width="100%" height="100%" fill="${background}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="${Math.round(height)}" viewBox="0 0 ${Math.round(width)} ${Math.round(height)}">${bg}${paths}</svg>`
}

/** Group strokes into text lines by vertical overlap (used for handwriting recognition). */
export function groupLines(strokes: InkStroke[]): InkStroke[][] {
  const items = strokes
    .filter((s) => s.t !== 'highlighter')
    .map((s) => {
      const b = inkBounds([s])!
      return { s, top: b.y, bottom: b.y + b.h, mid: b.y + b.h / 2 }
    })
    .sort((a, b) => a.mid - b.mid)
  const lines: { top: number; bottom: number; strokes: InkStroke[] }[] = []
  for (const it of items) {
    const line = lines.find((l) => {
      const overlap = Math.min(l.bottom, it.bottom) - Math.max(l.top, it.top)
      const h = Math.min(l.bottom - l.top, it.bottom - it.top) || 1
      return overlap > h * 0.35 || (it.mid > l.top && it.mid < l.bottom)
    })
    if (line) {
      line.top = Math.min(line.top, it.top)
      line.bottom = Math.max(line.bottom, it.bottom)
      line.strokes.push(it.s)
    } else lines.push({ top: it.top, bottom: it.bottom, strokes: [it.s] })
  }
  return lines.sort((a, b) => a.top - b.top).map((l) => l.strokes)
}

/** Recognise a single stroke as a clean shape (line, rectangle, ellipse, triangle, arrow). */
export function beautifyStroke(st: InkStroke): InkStroke | null {
  const pts = strokePoints(st)
  if (pts.length < 6) return null
  const b = inkBounds([st])!
  const first = pts[0]
  const last = pts[pts.length - 1]
  const diag = Math.hypot(b.w, b.h) || 1
  const closed = Math.hypot(first[0] - last[0], first[1] - last[1]) < diag * 0.22
  const mk = (coords: number[][]): InkStroke => {
    const flat: number[] = []
    for (const [x, y] of coords) flat.push(x, y, 0.5)
    return { ...st, p: flat, sim: false }
  }
  const densify = (poly: number[][]): number[][] => {
    const out: number[][] = []
    for (let i = 0; i < poly.length - 1; i++) {
      const [x1, y1] = poly[i]
      const [x2, y2] = poly[i + 1]
      const n = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / 4))
      for (let k = 0; k < n; k++) out.push([x1 + ((x2 - x1) * k) / n, y1 + ((y2 - y1) * k) / n])
    }
    out.push(poly[poly.length - 1])
    return out
  }
  if (!closed) {
    // Straight line if the path length is close to the endpoint distance.
    let length = 0
    for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    const direct = Math.hypot(last[0] - first[0], last[1] - first[1])
    if (direct > 0 && length / direct < 1.12) return mk(densify([[first[0], first[1]], [last[0], last[1]]]))
    return null
  }
  // Closed shape: compare area against bounding box to choose ellipse / rectangle / triangle.
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    area += x1 * y2 - x2 * y1
  }
  area = Math.abs(area / 2)
  const fill = area / (b.w * b.h || 1)
  if (fill > 0.86) {
    return mk(densify([[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h], [b.x, b.y]]))
  }
  if (fill > 0.62) {
    const cx = b.x + b.w / 2
    const cy = b.y + b.h / 2
    const ring: number[][] = []
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2
      ring.push([cx + (Math.cos(a) * b.w) / 2, cy + (Math.sin(a) * b.h) / 2])
    }
    return mk(ring)
  }
  if (fill > 0.35) {
    return mk(densify([[b.x + b.w / 2, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h], [b.x + b.w / 2, b.y]]))
  }
  return null
}
