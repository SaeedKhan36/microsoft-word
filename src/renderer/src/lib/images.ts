/** Read an image file as a data URL, downscaling very large photos to keep documents small. */
export async function fileToDataUrl(file: Blob, maxDim = 2400): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return raw
  return downscaleDataUrl(raw, maxDim, file.type)
}

export async function downscaleDataUrl(dataUrl: string, maxDim: number, type = 'image/png'): Promise<string> {
  const img = await loadImage(dataUrl)
  const { naturalWidth: w, naturalHeight: h } = img
  if (Math.max(w, h) <= maxDim) return dataUrl
  const s = maxDim / Math.max(w, h)
  const c = document.createElement('canvas')
  c.width = Math.round(w * s)
  c.height = Math.round(h * s)
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, c.width, c.height)
  return type === 'image/png' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.9)
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = src
  })
}

/** Rasterise any image (including SVG) to PNG bytes at a given width. */
export async function rasterize(src: string, width: number, height?: number, background?: string): Promise<{ data: Uint8Array; w: number; h: number }> {
  const img = await loadImage(src)
  const ratio = img.naturalHeight / (img.naturalWidth || 1)
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height ?? width * ratio))
  const scale = 2
  const c = document.createElement('canvas')
  c.width = w * scale
  c.height = h * scale
  const ctx = c.getContext('2d')!
  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, c.width, c.height)
  }
  ctx.drawImage(img, 0, 0, c.width, c.height)
  const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/png'))
  return { data: new Uint8Array(await blob.arrayBuffer()), w, h }
}

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
}

export function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const m = dataUrl.match(/^data:([^;,]+)(;base64)?,(.*)$/s)
  if (!m) return { bytes: new Uint8Array(), mime: 'application/octet-stream' }
  const mime = m[1]
  if (m[2]) {
    const bin = atob(m[3])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return { bytes, mime }
  }
  return { bytes: new TextEncoder().encode(decodeURIComponent(m[3])), mime }
}

export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return `data:${mime};base64,${btoa(bin)}`
}
