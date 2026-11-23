export interface ShapeDef {
  kind: string
  name: string
  group: 'Basic' | 'Arrows' | 'Stars & Banners' | 'Callouts' | 'Lines'
  w: number
  h: number
  path: (w: number, h: number) => string
}

const star = (w: number, h: number, points: number, inner = 0.45): string => {
  const cx = w / 2
  const cy = h / 2
  const R = Math.min(w, h) / 2
  let d = ''
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? R : R * inner
    const a = (Math.PI / points) * i - Math.PI / 2
    d += `${i ? 'L' : 'M'}${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`
  }
  return d + 'Z'
}

const poly = (pts: [number, number][]): string => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('') + 'Z'

export const SHAPES: ShapeDef[] = [
  { kind: 'rect', name: 'Rectangle', group: 'Basic', w: 200, h: 120, path: (w, h) => `M0,0H${w}V${h}H0Z` },
  { kind: 'rounded', name: 'Rounded Rectangle', group: 'Basic', w: 200, h: 120, path: (w, h) => `M20,0H${w - 20}Q${w},0 ${w},20V${h - 20}Q${w},${h} ${w - 20},${h}H20Q0,${h} 0,${h - 20}V20Q0,0 20,0Z` },
  { kind: 'ellipse', name: 'Oval', group: 'Basic', w: 180, h: 120, path: (w, h) => `M0,${h / 2}A${w / 2},${h / 2} 0 1 0 ${w},${h / 2}A${w / 2},${h / 2} 0 1 0 0,${h / 2}Z` },
  { kind: 'circle', name: 'Circle', group: 'Basic', w: 140, h: 140, path: (w, h) => `M0,${h / 2}A${w / 2},${h / 2} 0 1 0 ${w},${h / 2}A${w / 2},${h / 2} 0 1 0 0,${h / 2}Z` },
  { kind: 'triangle', name: 'Triangle', group: 'Basic', w: 160, h: 140, path: (w, h) => poly([[w / 2, 0], [w, h], [0, h]]) },
  { kind: 'rtriangle', name: 'Right Triangle', group: 'Basic', w: 160, h: 140, path: (w, h) => poly([[0, 0], [w, h], [0, h]]) },
  { kind: 'diamond', name: 'Diamond', group: 'Basic', w: 150, h: 150, path: (w, h) => poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]) },
  { kind: 'pentagon', name: 'Pentagon', group: 'Basic', w: 150, h: 145, path: (w, h) => poly([[w / 2, 0], [w, h * 0.38], [w * 0.81, h], [w * 0.19, h], [0, h * 0.38]]) },
  { kind: 'hexagon', name: 'Hexagon', group: 'Basic', w: 170, h: 146, path: (w, h) => poly([[w * 0.25, 0], [w * 0.75, 0], [w, h / 2], [w * 0.75, h], [w * 0.25, h], [0, h / 2]]) },
  { kind: 'parallelogram', name: 'Parallelogram', group: 'Basic', w: 200, h: 110, path: (w, h) => poly([[w * 0.22, 0], [w, 0], [w * 0.78, h], [0, h]]) },
  { kind: 'heart', name: 'Heart', group: 'Basic', w: 160, h: 145, path: (w, h) => `M${w / 2},${h}C${w * -0.2},${h * 0.55} ${w * 0.1},${h * -0.15} ${w / 2},${h * 0.25}C${w * 0.9},${h * -0.15} ${w * 1.2},${h * 0.55} ${w / 2},${h}Z` },
  { kind: 'cloud', name: 'Cloud', group: 'Basic', w: 200, h: 130, path: (w, h) => `M${w * 0.25},${h * 0.9}C${w * 0.02},${h * 0.9} ${w * 0.02},${h * 0.5} ${w * 0.22},${h * 0.48}C${w * 0.18},${h * 0.15} ${w * 0.5},${h * 0.05} ${w * 0.6},${h * 0.3}C${w * 0.75},${h * 0.1} ${w * 1},${h * 0.3} ${w * 0.88},${h * 0.52}C${w * 1.02},${h * 0.6} ${w},${h * 0.92} ${w * 0.78},${h * 0.9}Z` },
  { kind: 'arrow-right', name: 'Right Arrow', group: 'Arrows', w: 200, h: 110, path: (w, h) => poly([[0, h * 0.3], [w * 0.62, h * 0.3], [w * 0.62, 0], [w, h / 2], [w * 0.62, h], [w * 0.62, h * 0.7], [0, h * 0.7]]) },
  { kind: 'arrow-left', name: 'Left Arrow', group: 'Arrows', w: 200, h: 110, path: (w, h) => poly([[w, h * 0.3], [w * 0.38, h * 0.3], [w * 0.38, 0], [0, h / 2], [w * 0.38, h], [w * 0.38, h * 0.7], [w, h * 0.7]]) },
  { kind: 'arrow-up', name: 'Up Arrow', group: 'Arrows', w: 110, h: 180, path: (w, h) => poly([[w * 0.3, h], [w * 0.3, h * 0.38], [0, h * 0.38], [w / 2, 0], [w, h * 0.38], [w * 0.7, h * 0.38], [w * 0.7, h]]) },
  { kind: 'arrow-down', name: 'Down Arrow', group: 'Arrows', w: 110, h: 180, path: (w, h) => poly([[w * 0.3, 0], [w * 0.3, h * 0.62], [0, h * 0.62], [w / 2, h], [w, h * 0.62], [w * 0.7, h * 0.62], [w * 0.7, 0]]) },
  { kind: 'arrow-both', name: 'Left-Right Arrow', group: 'Arrows', w: 220, h: 100, path: (w, h) => poly([[0, h / 2], [w * 0.25, 0], [w * 0.25, h * 0.3], [w * 0.75, h * 0.3], [w * 0.75, 0], [w, h / 2], [w * 0.75, h], [w * 0.75, h * 0.7], [w * 0.25, h * 0.7], [w * 0.25, h]]) },
  { kind: 'chevron', name: 'Chevron', group: 'Arrows', w: 180, h: 110, path: (w, h) => poly([[0, 0], [w * 0.7, 0], [w, h / 2], [w * 0.7, h], [0, h], [w * 0.3, h / 2]]) },
  { kind: 'pentagon-arrow', name: 'Arrow Pentagon', group: 'Arrows', w: 200, h: 100, path: (w, h) => poly([[0, 0], [w * 0.78, 0], [w, h / 2], [w * 0.78, h], [0, h]]) },
  { kind: 'star5', name: '5-Point Star', group: 'Stars & Banners', w: 160, h: 160, path: (w, h) => star(w, h, 5, 0.42) },
  { kind: 'star6', name: '6-Point Star', group: 'Stars & Banners', w: 160, h: 160, path: (w, h) => star(w, h, 6, 0.55) },
  { kind: 'star8', name: '8-Point Star', group: 'Stars & Banners', w: 160, h: 160, path: (w, h) => star(w, h, 8, 0.62) },
  { kind: 'burst', name: 'Explosion', group: 'Stars & Banners', w: 180, h: 170, path: (w, h) => star(w, h, 12, 0.7) },
  { kind: 'ribbon', name: 'Ribbon', group: 'Stars & Banners', w: 240, h: 90, path: (w, h) => poly([[0, h * 0.25], [w * 0.12, h * 0.25], [w * 0.12, 0], [w * 0.88, 0], [w * 0.88, h * 0.25], [w, h * 0.25], [w * 0.93, h * 0.6], [w, h * 0.95], [w * 0.88, h * 0.95], [w * 0.88, h * 0.75], [w * 0.12, h * 0.75], [w * 0.12, h * 0.95], [0, h * 0.95], [w * 0.07, h * 0.6]]) },
  { kind: 'callout-rect', name: 'Speech Bubble', group: 'Callouts', w: 200, h: 140, path: (w, h) => `M0,0H${w}V${h * 0.72}H${w * 0.45}L${w * 0.25},${h}L${w * 0.28},${h * 0.72}H0Z` },
  { kind: 'callout-round', name: 'Rounded Bubble', group: 'Callouts', w: 200, h: 140, path: (w, h) => `M24,0H${w - 24}Q${w},0 ${w},24V${h * 0.72 - 24}Q${w},${h * 0.72} ${w - 24},${h * 0.72}H${w * 0.45}L${w * 0.25},${h}L${w * 0.28},${h * 0.72}H24Q0,${h * 0.72} 0,${h * 0.72 - 24}V24Q0,0 24,0Z` },
  { kind: 'thought', name: 'Thought Bubble', group: 'Callouts', w: 200, h: 150, path: (w, h) => `M${w * 0.2},${h * 0.72}C${w * 0.02},${h * 0.72} ${w * 0.02},${h * 0.32} ${w * 0.2},${h * 0.3}C${w * 0.22},${h * 0.02} ${w * 0.6},${h * 0.0} ${w * 0.66},${h * 0.18}C${w * 0.95},${h * 0.1} ${w * 1.02},${h * 0.5} ${w * 0.86},${h * 0.6}C${w * 0.9},${h * 0.8} ${w * 0.5},${h * 0.85} ${w * 0.45},${h * 0.72}Z M${w * 0.18},${h * 0.85}a10,10 0 1,0 1,0Z M${w * 0.1},${h * 0.96}a6,6 0 1,0 1,0Z` },
  { kind: 'line', name: 'Line', group: 'Lines', w: 220, h: 12, path: (w, h) => `M0,${h / 2}L${w},${h / 2}` },
  { kind: 'line-arrow', name: 'Arrow Line', group: 'Lines', w: 220, h: 24, path: (w, h) => `M0,${h / 2}L${w - 14},${h / 2}M${w - 18},${h / 2 - 8}L${w},${h / 2}L${w - 18},${h / 2 + 8}` },
  { kind: 'line-double', name: 'Double Arrow Line', group: 'Lines', w: 220, h: 24, path: (w, h) => `M14,${h / 2}L${w - 14},${h / 2}M18,${h / 2 - 8}L0,${h / 2}L18,${h / 2 + 8}M${w - 18},${h / 2 - 8}L${w},${h / 2}L${w - 18},${h / 2 + 8}` },
  { kind: 'curve', name: 'Curve', group: 'Lines', w: 220, h: 80, path: (w, h) => `M0,${h - 6}C${w * 0.3},${-h * 0.2} ${w * 0.7},${h * 1.2} ${w},6` }
]

export function renderShapeSvg(kind: string, fill: string, stroke: string, strokeWidth: number): string {
  const s = SHAPES.find((x) => x.kind === kind) ?? SHAPES[0]
  const isLine = s.group === 'Lines'
  const pad = Math.max(2, strokeWidth)
  const W = s.w + pad * 2
  const H = s.h + pad * 2
  const sw = isLine ? Math.max(2, strokeWidth || 3) : strokeWidth
  const strokeColor = isLine && (stroke === 'none' || !stroke) ? '#1f3b73' : stroke
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><path transform="translate(${pad},${pad})" d="${s.path(s.w, s.h)}" fill="${isLine ? 'none' : fill}" stroke="${strokeColor}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/></svg>`
}
