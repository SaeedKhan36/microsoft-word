import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { groupLines, inkBounds, strokePath, type InkStroke } from './ink'
import { loadImage } from './images'
import { useApp } from '@/state/store'

export type HandwritingEngine = 'local' | 'local-hq' | 'ai'

const MODELS: Record<string, string> = {
  local: 'Xenova/trocr-small-handwritten',
  'local-hq': 'Xenova/trocr-base-handwritten'
}

export interface Progress {
  stage: string
  pct?: number
}

type Pipe = (input: string) => Promise<{ generated_text: string }[]>
const pipes = new Map<string, Promise<Pipe>>()

/** Local, offline handwriting recognition (TrOCR). The model is downloaded once and cached. */
async function localPipeline(model: string, onProgress?: (p: Progress) => void): Promise<Pipe> {
  let pipePromise = pipes.get(model)
  if (!pipePromise) {
    pipePromise = (async () => {
      const tf = await import('@huggingface/transformers')
      tf.env.allowLocalModels = false
      tf.env.useBrowserCache = true
      const p = await tf.pipeline('image-to-text', model, {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: (e: { status?: string; progress?: number; file?: string }) => {
          if (e.status === 'progress' && typeof e.progress === 'number') onProgress?.({ stage: `Downloading handwriting model (first time only)… ${e.file ?? ''}`, pct: e.progress })
          else if (e.status === 'ready') onProgress?.({ stage: 'Model ready' })
        }
      } as never)
      return p as unknown as Pipe
    })()
    pipes.set(model, pipePromise)
    pipePromise.catch(() => pipes.delete(model))
  }
  return pipePromise
}

export async function recognizeImages(images: string[], engine: HandwritingEngine, onProgress?: (p: Progress) => void): Promise<string[]> {
  if (engine === 'ai') {
    const key = useApp.getState().settings.aiApiKey
    if (!key) throw new Error('Add your Claude API key in File → Options → AI to use AI recognition.')
    const out: string[] = []
    for (let i = 0; i < images.length; i++) {
      onProgress?.({ stage: `Reading page ${i + 1} of ${images.length} with AI…`, pct: (i / images.length) * 100 })
      out.push(await window.pe.ai.transcribe(images[i]))
    }
    return out
  }
  onProgress?.({ stage: 'Loading handwriting model…' })
  const pipe = await localPipeline(MODELS[engine] ?? MODELS.local, onProgress)
  const out: string[] = []
  for (let i = 0; i < images.length; i++) {
    onProgress?.({ stage: `Recognising line ${i + 1} of ${images.length}…`, pct: (i / images.length) * 100 })
    const res = await pipe(images[i])
    out.push((res[0]?.generated_text ?? '').trim())
  }
  return out
}

/** Render a group of strokes (one written line) to a clean black-on-white image. */
export function renderStrokes(strokes: InkStroke[], height = 96): string {
  const b = inkBounds(strokes)!
  const pad = 16
  const scale = Math.min(3, (height - pad * 2) / Math.max(12, b.h))
  const w = Math.max(32, Math.ceil(b.w * scale + pad * 2))
  const h = Math.ceil(b.h * scale + pad * 2)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.translate(pad - b.x * scale, pad - b.y * scale)
  ctx.scale(scale, scale)
  ctx.fillStyle = '#000'
  for (const s of strokes) ctx.fill(new Path2D(strokePath({ ...s, s: Math.max(2, Math.min(s.s, 5)) })))
  return c.toDataURL('image/png')
}

export function inkLineImages(strokes: InkStroke[]): string[] {
  return groupLines(strokes).map((line) => renderStrokes(line))
}

/** Split a photo/scan of handwriting into line images using a horizontal ink-density profile. */
export async function segmentImageLines(src: string): Promise<{ lines: string[]; cleaned: string }> {
  const img = await loadImage(src)
  const maxW = 1600
  const s = Math.min(1, maxW / img.naturalWidth)
  const w = Math.round(img.naturalWidth * s)
  const h = Math.round(img.naturalHeight * s)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h)
  const px = data.data
  // Grayscale + Otsu threshold.
  const gray = new Uint8Array(w * h)
  const hist = new Array(256).fill(0)
  for (let i = 0; i < w * h; i++) {
    const g = Math.round(0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2])
    gray[i] = g
    hist[g]++
  }
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0
  let wB = 0
  let best = 0
  let threshold = 128
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (!wB) continue
    const wF = w * h - wB
    if (!wF) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > best) {
      best = between
      threshold = t
    }
  }
  // Cleaned black/white version (useful as "keep as image" too).
  for (let i = 0; i < w * h; i++) {
    const v = gray[i] < threshold ? 0 : 255
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v
    px[i * 4 + 3] = 255
  }
  ctx.putImageData(data, 0, 0)
  const cleaned = c.toDataURL('image/png')
  // Row profile.
  const rows = new Array(h).fill(0)
  for (let y = 0; y < h; y++) {
    let n = 0
    for (let x = 0; x < w; x++) if (gray[y * w + x] < threshold) n++
    rows[y] = n / w
  }
  const minInk = 0.004
  const bands: { a: number; b: number }[] = []
  let start = -1
  for (let y = 0; y < h; y++) {
    if (rows[y] > minInk && start < 0) start = y
    if ((rows[y] <= minInk || y === h - 1) && start >= 0) {
      if (y - start > 6) bands.push({ a: start, b: y })
      start = -1
    }
  }
  // Merge bands separated by tiny gaps (ascenders/descenders).
  const merged: { a: number; b: number }[] = []
  for (const band of bands) {
    const last = merged[merged.length - 1]
    if (last && band.a - last.b < Math.max(6, (last.b - last.a) * 0.25)) last.b = band.b
    else merged.push({ ...band })
  }
  const lines: string[] = []
  for (const band of merged.filter((x) => x.b - x.a > 10)) {
    const pad = Math.round((band.b - band.a) * 0.25)
    const y0 = Math.max(0, band.a - pad)
    const y1 = Math.min(h, band.b + pad)
    const lc = document.createElement('canvas')
    lc.width = w
    lc.height = y1 - y0
    lc.getContext('2d')!.drawImage(c, 0, y0, w, y1 - y0, 0, 0, w, y1 - y0)
    lines.push(lc.toDataURL('image/png'))
  }
  return { lines, cleaned }
}

/** Convert an image of handwriting into ink strokes (traced dark pixels) for editing. */
export async function imageToInk(src: string, targetWidth: number): Promise<{ strokes: InkStroke[]; height: number }> {
  const img = await loadImage(src)
  const s = targetWidth / img.naturalWidth
  const w = Math.round(targetWidth)
  const h = Math.round(img.naturalHeight * s)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, w, h)
  const d = ctx.getImageData(0, 0, w, h).data
  const dark = (x: number, y: number): boolean => {
    const i = (y * w + x) * 4
    return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < 110
  }
  // Horizontal run-length "scanline" strokes: compact and faithful for handwriting.
  const strokes: InkStroke[] = []
  const step = 2
  for (let y = 0; y < h; y += step) {
    let x = 0
    while (x < w) {
      if (dark(x, y)) {
        const x0 = x
        while (x < w && dark(x, y)) x++
        strokes.push({ t: 'pen', c: '#1a1a1a', s: 2.4, p: [x0, y, 0.5, Math.max(x0 + 0.5, x - 1), y, 0.5] })
      }
      x++
    }
  }
  return { strokes, height: h + 12 }
}

export async function recognizeSelectedInk(editor: Editor): Promise<void> {
  const sel = editor.state.selection
  if (!(sel instanceof NodeSelection) || sel.node.type.name !== 'ink') return
  useApp.getState().openDialog('handwriting', { source: 'ink', pos: sel.from })
}
