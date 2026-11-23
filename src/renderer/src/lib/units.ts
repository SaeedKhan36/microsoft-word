export const PX_PER_MM = 96 / 25.4
export const PX_PER_PT = 96 / 72

export const mmToPx = (mm: number): number => mm * PX_PER_MM
export const pxToMm = (px: number): number => px / PX_PER_MM
export const ptToPx = (pt: number): number => pt * PX_PER_PT
export const pxToPt = (px: number): number => px / PX_PER_PT
export const mmToPt = (mm: number): number => (mm / 25.4) * 72
export const ptToMm = (pt: number): number => (pt / 72) * 25.4
export const mmToTwip = (mm: number): number => Math.round((mm / 25.4) * 1440)
export const ptToTwip = (pt: number): number => Math.round(pt * 20)
export const twipToMm = (tw: number): number => (tw / 1440) * 25.4

export function formatLength(mm: number, units: 'cm' | 'in'): string {
  if (units === 'in') return `${(mm / 25.4).toFixed(2).replace(/\.?0+$/, '')}"`
  return `${(mm / 10).toFixed(2).replace(/\.?0+$/, '')} cm`
}

export function parseLength(text: string, units: 'cm' | 'in'): number | null {
  const t = text.trim().toLowerCase()
  const m = t.match(/^(-?\d+(?:[.,]\d+)?)\s*(cm|mm|in|"|pt)?$/)
  if (!m) return null
  const v = parseFloat(m[1].replace(',', '.'))
  const unit = m[2] || units
  switch (unit) {
    case 'mm':
      return v
    case 'cm':
      return v * 10
    case 'in':
    case '"':
      return v * 25.4
    case 'pt':
      return ptToMm(v)
    default:
      return v * 10
  }
}

export function uid(prefix = ''): string {
  const r = crypto.getRandomValues(new Uint32Array(2))
  return prefix + r[0].toString(36) + r[1].toString(36)
}

export function pageSizePx(page: { widthMm: number; heightMm: number; orientation: 'portrait' | 'landscape' }): {
  w: number
  h: number
  wMm: number
  hMm: number
} {
  const land = page.orientation === 'landscape'
  const wMm = land ? page.heightMm : page.widthMm
  const hMm = land ? page.widthMm : page.heightMm
  return { w: mmToPx(wMm), h: mmToPx(hMm), wMm, hMm }
}
