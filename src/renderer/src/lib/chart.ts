export type ChartType = 'column' | 'bar' | 'line' | 'area' | 'pie' | 'doughnut'

export interface ChartSeries {
  name: string
  values: number[]
  color: string
}

export interface ChartData {
  type: ChartType
  title: string
  labels: string[]
  series: ChartSeries[]
  width: number
  height: number
}

export const CHART_COLORS = ['#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47', '#264478', '#9e480e']

export function sampleChart(type: ChartType = 'column'): ChartData {
  return {
    type,
    title: 'Chart Title',
    labels: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [
      { name: 'Series 1', values: [4.3, 2.5, 3.5, 4.5], color: CHART_COLORS[0] },
      { name: 'Series 2', values: [2.4, 4.4, 1.8, 2.8], color: CHART_COLORS[1] },
      { name: 'Series 3', values: [2, 2, 3, 5], color: CHART_COLORS[2] }
    ],
    width: 560,
    height: 320
  }
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function niceMax(v: number): { max: number; step: number } {
  if (v <= 0) return { max: 1, step: 0.2 }
  const exp = Math.pow(10, Math.floor(Math.log10(v)))
  const f = v / exp
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  const max = nf * exp
  return { max, step: max / 5 }
}

const fmt = (n: number): string => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}k` : Number(n.toFixed(2)).toString())

export function renderChartSvg(d: ChartData): string {
  const W = d.width
  const H = d.height
  const font = `font-family="Segoe UI, Carlito, Calibri, Arial, sans-serif"`
  const parts: string[] = []
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`)
  const titleH = d.title ? 34 : 10
  if (d.title) parts.push(`<text x="${W / 2}" y="24" text-anchor="middle" font-size="15" fill="#404040" ${font}>${esc(d.title)}</text>`)
  const legendH = 28
  const series = d.series.filter((s) => s.values.length)

  // Legend
  const legendItems = d.type === 'pie' || d.type === 'doughnut' ? d.labels.map((l, i) => ({ name: l, color: CHART_COLORS[i % CHART_COLORS.length] })) : series
  const itemW = Math.min(130, (W - 20) / Math.max(1, legendItems.length))
  const lx0 = W / 2 - (itemW * legendItems.length) / 2
  legendItems.forEach((s, i) => {
    const x = lx0 + i * itemW
    parts.push(`<rect x="${x}" y="${H - 18}" width="10" height="10" fill="${s.color}"/>`)
    parts.push(`<text x="${x + 15}" y="${H - 9}" font-size="11" fill="#595959" ${font}>${esc(s.name).slice(0, 18)}</text>`)
  })

  if (d.type === 'pie' || d.type === 'doughnut') {
    const vals = (series[0]?.values ?? []).map((v) => Math.max(0, v))
    const total = vals.reduce((a, b) => a + b, 0) || 1
    const cx = W / 2
    const cy = titleH + (H - titleH - legendH) / 2
    const r = Math.min(W, H - titleH - legendH) / 2 - 8
    let a0 = -Math.PI / 2
    vals.forEach((v, i) => {
      const a1 = a0 + (v / total) * Math.PI * 2
      const large = a1 - a0 > Math.PI ? 1 : 0
      const x0 = cx + r * Math.cos(a0)
      const y0 = cy + r * Math.sin(a0)
      const x1 = cx + r * Math.cos(a1)
      const y1 = cy + r * Math.sin(a1)
      const color = CHART_COLORS[i % CHART_COLORS.length]
      if (vals.length === 1) parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`)
      else parts.push(`<path d="M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z" fill="${color}" stroke="#fff" stroke-width="1.5"/>`)
      const am = (a0 + a1) / 2
      const pct = Math.round((v / total) * 100)
      if (pct >= 4) {
        const lr = d.type === 'doughnut' ? r * 0.78 : r * 0.62
        parts.push(`<text x="${cx + lr * Math.cos(am)}" y="${cy + lr * Math.sin(am) + 4}" text-anchor="middle" font-size="11" fill="#fff" font-weight="600" ${font}>${pct}%</text>`)
      }
      a0 = a1
    })
    if (d.type === 'doughnut') parts.push(`<circle cx="${cx}" cy="${cy}" r="${r * 0.55}" fill="#fff"/>`)
    return wrap(W, H, parts)
  }

  const all = series.flatMap((s) => s.values)
  const minV = Math.min(0, ...all)
  const { max, step } = niceMax(Math.max(...all, 0))
  const horizontal = d.type === 'bar'
  const left = horizontal ? 70 : 44
  const right = 14
  const top = titleH + 4
  const bottom = legendH + 22
  const pw = W - left - right
  const ph = H - top - bottom
  const n = d.labels.length || 1
  const val = (v: number): number => (horizontal ? left + ((v - minV) / (max - minV)) * pw : top + ph - ((v - minV) / (max - minV)) * ph)

  // Grid + axis labels
  for (let g = minV; g <= max + 1e-9; g += step) {
    if (horizontal) {
      const x = val(g)
      parts.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${top + ph}" stroke="#e5e5e5"/>`)
      parts.push(`<text x="${x}" y="${top + ph + 14}" text-anchor="middle" font-size="10" fill="#7f7f7f" ${font}>${fmt(g)}</text>`)
    } else {
      const y = val(g)
      parts.push(`<line x1="${left}" y1="${y}" x2="${left + pw}" y2="${y}" stroke="#e5e5e5"/>`)
      parts.push(`<text x="${left - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="#7f7f7f" ${font}>${fmt(g)}</text>`)
    }
  }
  d.labels.forEach((l, i) => {
    if (horizontal) {
      const y = top + (ph / n) * (i + 0.5)
      parts.push(`<text x="${left - 6}" y="${y + 3}" text-anchor="end" font-size="10.5" fill="#595959" ${font}>${esc(l).slice(0, 12)}</text>`)
    } else {
      const x = left + (pw / n) * (i + 0.5)
      parts.push(`<text x="${x}" y="${top + ph + 15}" text-anchor="middle" font-size="10.5" fill="#595959" ${font}>${esc(l).slice(0, 14)}</text>`)
    }
  })

  if (d.type === 'column' || d.type === 'bar') {
    const groupW = (horizontal ? ph : pw) / n
    const bw = (groupW * 0.72) / Math.max(1, series.length)
    series.forEach((s, si) => {
      s.values.forEach((v, i) => {
        if (i >= n) return
        const g0 = (horizontal ? top : left) + groupW * i + groupW * 0.14 + bw * si
        if (horizontal) {
          const x0 = val(Math.min(0, v))
          const x1 = val(Math.max(0, v))
          parts.push(`<rect x="${x0}" y="${g0}" width="${Math.max(0.5, x1 - x0)}" height="${bw - 1}" fill="${s.color}"/>`)
        } else {
          const y0 = val(Math.max(0, v))
          const y1 = val(Math.min(0, v))
          parts.push(`<rect x="${g0}" y="${y0}" width="${bw - 1}" height="${Math.max(0.5, y1 - y0)}" fill="${s.color}"/>`)
        }
      })
    })
  } else {
    series.forEach((s) => {
      const pts = s.values.slice(0, n).map((v, i) => [left + (pw / n) * (i + 0.5), val(v)])
      if (!pts.length) return
      const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
      if (d.type === 'area') {
        parts.push(`<path d="${line} L${pts[pts.length - 1][0]},${val(0)} L${pts[0][0]},${val(0)} Z" fill="${s.color}" fill-opacity="0.35"/>`)
      }
      parts.push(`<path d="${line}" fill="none" stroke="${s.color}" stroke-width="2.25" stroke-linejoin="round"/>`)
      pts.forEach((p) => parts.push(`<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${s.color}"/>`))
    })
  }
  parts.push(
    horizontal
      ? `<line x1="${val(0)}" y1="${top}" x2="${val(0)}" y2="${top + ph}" stroke="#bfbfbf"/>`
      : `<line x1="${left}" y1="${val(0)}" x2="${left + pw}" y2="${val(0)}" stroke="#bfbfbf"/>`
  )
  return wrap(W, H, parts)
}

function wrap(W: number, H: number, parts: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`
}
