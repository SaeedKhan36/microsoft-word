import { useRef, useState, type ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { useApp, markDirty, type DocTab } from '@/state/store'
import { mmToPx, pageSizePx, ptToPx, pxToMm, pxToPt } from '@/lib/units'

/** Horizontal ruler with margin handles and paragraph indent markers (draggable, like Word). */
export function Ruler({ doc, editor, zoom }: { doc: DocTab; editor: Editor; zoom: number }): ReactNode {
  const units = useApp((s) => s.settings.units)
  const size = pageSizePx(doc.page)
  const ml = mmToPx(doc.page.margins.left)
  const mr = mmToPx(doc.page.margins.right)
  const trackRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ kind: string; x: number } | null>(null)

  const $from = editor.state.selection.$from
  let para = $from.parent
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d)
    if (n.type.name === 'paragraph' || n.type.name === 'heading') {
      para = n
      break
    }
  }
  const indentLeft = ptToPx(Number(para.attrs.indentLeft) || 0)
  const indentRight = ptToPx(Number(para.attrs.indentRight) || 0)
  const firstLine = ptToPx(Number(para.attrs.firstLine) || 0)
  // Wrapped lines start at L, the first line at F.
  const L = ml + indentLeft + Math.max(0, -firstLine)
  const F = ml + indentLeft + Math.max(0, firstLine)
  const R = size.w - mr - indentRight

  const unit = units === 'in' ? 96 : mmToPx(10)
  const step = units === 'in' ? 96 / 8 : mmToPx(2.5)
  const ticks: ReactNode[] = []
  // Ticks are numbered from the left margin like Word.
  for (let x = ml % step; x <= size.w; x += step) {
    const rel = x - ml
    const isMajor = Math.abs(rel / unit - Math.round(rel / unit)) < 0.01
    const isHalf = !isMajor && Math.abs((rel * 2) / unit - Math.round((rel * 2) / unit)) < 0.01
    if (isMajor) {
      const n = Math.round(rel / unit)
      if (n !== 0)
        ticks.push(
          <span key={`n${x}`} className="ruler-num" style={{ left: x * zoom }}>
            {Math.abs(n)}
          </span>
        )
    } else ticks.push(<span key={`t${x}`} className="ruler-tick" style={{ left: x * zoom, height: isHalf ? 6 : 3 }} />)
  }

  const start = (kind: string) => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    const toX = (cx: number): number => Math.max(0, Math.min(size.w, (cx - rect.left) / zoom))
    setDrag({ kind, x: toX(e.clientX) })
    const move = (ev: PointerEvent): void => setDrag({ kind, x: toX(ev.clientX) })
    const up = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDrag(null)
      commit(kind, toX(ev.clientX))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const snap = (px: number): number => {
    const g = units === 'in' ? 96 / 16 : mmToPx(1)
    return Math.round(px / g) * g
  }

  const commit = (kind: string, xRaw: number): void => {
    const x = snap(xRaw)
    if (kind === 'marginLeft' || kind === 'marginRight') {
      const mm = kind === 'marginLeft' ? pxToMm(x) : pxToMm(size.w - x)
      const clamped = Math.max(0, Math.min(pxToMm(size.w) / 2 - 10, mm))
      useApp.getState().updateDoc(doc.id, (d) => ({
        page: { ...d.page, margins: { ...d.page.margins, [kind === 'marginLeft' ? 'left' : 'right']: Math.round(clamped * 10) / 10 } }
      }))
      markDirty(doc.id)
      return
    }
    let newL = L
    let newF = F
    let newR = R
    if (kind === 'first') newF = x
    else if (kind === 'hanging') newL = x
    else if (kind === 'left') {
      const d = x - L
      newL = x
      newF = F + d
    } else if (kind === 'right') newR = x
    newL = Math.max(0, Math.min(size.w - 40, newL))
    newF = Math.max(0, Math.min(size.w - 40, newF))
    const attrs: Record<string, number | null> = {}
    if (newF >= newL) {
      attrs.indentLeft = round(pxToPt(newL - ml))
      attrs.firstLine = round(pxToPt(newF - newL)) || null
    } else {
      attrs.indentLeft = round(pxToPt(newF - ml))
      attrs.firstLine = -round(pxToPt(newL - newF))
    }
    attrs.indentRight = round(pxToPt(size.w - mr - newR)) || null
    if (!attrs.indentLeft) attrs.indentLeft = null
    editor.chain().focus().setParagraphFormat(attrs).run()
  }

  const pos = (kind: string, value: number): number => (drag?.kind === kind ? snap(drag.x) : value)
  const leftMarker = drag?.kind === 'left' ? snap(drag.x) : L

  return (
    <div className="ruler" style={{ width: size.w * zoom }}>
      <div className="ruler-track" ref={trackRef} style={{ left: 0, width: size.w * zoom }}>
        <div className="ruler-margin" style={{ left: 0, width: pos('marginLeft', ml) * zoom }} />
        <div className="ruler-margin" style={{ right: 0, width: (size.w - pos('marginRight', size.w - mr)) * zoom }} />
        {ticks}
        <span className="ruler-margin-handle" style={{ left: pos('marginLeft', ml) * zoom }} onPointerDown={start('marginLeft')} data-tip="Left margin" />
        <span className="ruler-margin-handle" style={{ left: pos('marginRight', size.w - mr) * zoom }} onPointerDown={start('marginRight')} data-tip="Right margin" />
        <span className="ruler-marker first" style={{ left: pos('first', drag?.kind === 'left' ? F + (leftMarker - L) : F) * zoom }} onPointerDown={start('first')} data-tip="First Line Indent">
          <svg width="11" height="8" viewBox="0 0 11 8">
            <path d="M0.5 0.5h10L5.5 7.5z" />
          </svg>
        </span>
        <span className="ruler-marker hanging" style={{ left: pos('hanging', leftMarker) * zoom }} onPointerDown={start('hanging')} data-tip="Hanging Indent">
          <svg width="11" height="8" viewBox="0 0 11 8">
            <path d="M5.5 0.5l5 7h-10z" />
          </svg>
        </span>
        <span className="ruler-marker" style={{ left: leftMarker * zoom, bottom: -7, height: 6 }} onPointerDown={start('left')} data-tip="Left Indent">
          <svg width="11" height="6" viewBox="0 0 11 6">
            <rect x="0.5" y="0.5" width="10" height="5" />
          </svg>
        </span>
        <span className="ruler-marker right" style={{ left: pos('right', R) * zoom }} onPointerDown={start('right')} data-tip="Right Indent">
          <svg width="11" height="8" viewBox="0 0 11 8">
            <path d="M5.5 0.5l5 7h-10z" />
          </svg>
        </span>
      </div>
    </div>
  )
}

const round = (n: number): number => Math.round(n * 2) / 2
