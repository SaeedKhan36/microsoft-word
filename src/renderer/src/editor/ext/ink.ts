import { Node } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorView, NodeView } from '@tiptap/pm/view'
import { NodeSelection } from '@tiptap/pm/state'
import { useApp } from '@/state/store'
import { beautifyStroke, inkBounds, outline, pathFromOutline, strokePath, strokeStyle, type InkStroke } from '@/lib/ink'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    ink: {
      insertInk: (attrs?: { height?: number; background?: string; strokes?: InkStroke[] }) => ReturnType
    }
  }
}

const SVGNS = 'http://www.w3.org/2000/svg'
let lastPenTime = 0

class InkView implements NodeView {
  dom: HTMLElement
  private svg: SVGSVGElement
  private canvas: HTMLCanvasElement
  private hint: HTMLElement
  private node: PMNode
  private unsub: () => void
  private drawing: { stroke: InkStroke; id: number } | null = null
  private erased = new Set<number>()

  constructor(
    node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined
  ) {
    this.node = node
    this.dom = document.createElement('div')
    this.dom.contentEditable = 'false'
    this.svg = document.createElementNS(SVGNS, 'svg')
    this.svg.classList.add('pe-ink-svg')
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'pe-ink-live'
    this.hint = document.createElement('div')
    this.hint.className = 'pe-ink-hint'
    this.hint.textContent = 'Draw or write here with a pen, finger or mouse'
    const resize = document.createElement('div')
    resize.className = 'pe-ink-resize'
    resize.title = 'Drag to resize the drawing area'
    resize.addEventListener('pointerdown', (e) => this.startResize(e))
    this.dom.append(this.svg, this.canvas, this.hint, resize)

    this.dom.addEventListener('pointerdown', (e) => this.onDown(e))
    this.dom.addEventListener('dblclick', () => {
      const s = useApp.getState()
      if (s.draw.tool === 'select') s.set({ draw: { ...s.draw, tool: 'pen' }, ribbonTab: 'draw' })
    })
    this.unsub = useApp.subscribe((s, prev) => {
      if (s.draw.tool !== prev.draw.tool) this.syncMode()
    })
    this.render()
    this.syncMode()
  }

  private get tool(): ReturnType<typeof useApp.getState>['draw'] {
    return useApp.getState().draw
  }

  private syncMode(): void {
    const t = this.tool.tool
    this.dom.classList.toggle('pe-ink-active', t !== 'select')
    this.dom.dataset.tool = t
  }

  private render(): void {
    const a = this.node.attrs
    this.dom.className = `pe-ink pe-ink-bg-${a.background || 'none'}`
    this.syncMode()
    this.dom.style.height = `${a.height}px`
    const strokes = (a.strokes || []) as InkStroke[]
    this.hint.style.display = strokes.length ? 'none' : ''
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild)
    strokes.forEach((s, i) => {
      const p = document.createElementNS(SVGNS, 'path')
      const st = strokeStyle(s)
      p.setAttribute('d', strokePath(s))
      p.setAttribute('fill', st.fill)
      p.setAttribute('fill-opacity', String(st.opacity))
      if (st.blend !== 'normal') p.style.mixBlendMode = st.blend
      p.dataset.index = String(i)
      this.svg.appendChild(p)
    })
  }

  private local(e: PointerEvent): [number, number, number] {
    const r = this.dom.getBoundingClientRect()
    const scale = r.width / (this.dom.offsetWidth || r.width) || 1
    return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale, e.pressure || 0.5]
  }

  private onDown(e: PointerEvent): void {
    const st = this.tool
    if (st.tool === 'select') return
    if ((e.target as HTMLElement).classList.contains('pe-ink-resize')) return
    if (e.pointerType === 'pen') lastPenTime = Date.now()
    if (e.pointerType === 'touch' && Date.now() - lastPenTime < 1500) return // palm rejection
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.preventDefault()
    e.stopPropagation()
    try {
      this.dom.setPointerCapture(e.pointerId)
    } catch {
      /* pointer already released */
    }
    const r = this.dom.getBoundingClientRect()
    const scale = r.width / (this.dom.offsetWidth || r.width) || 1
    this.canvas.width = this.dom.offsetWidth * 2
    this.canvas.height = this.dom.offsetHeight * 2
    const ctx = this.canvas.getContext('2d')!
    ctx.setTransform(2, 0, 0, 2, 0, 0)

    if (st.tool === 'eraser') {
      this.erased.clear()
      const erase = (ev: PointerEvent): void => {
        const [x, y] = this.local(ev)
        const strokes = (this.node.attrs.strokes || []) as InkStroke[]
        strokes.forEach((s, i) => {
          if (this.erased.has(i)) return
          const rad = Math.max(8, s.s / 2 + 6)
          for (let k = 0; k < s.p.length; k += 3) {
            if (Math.hypot(s.p[k] - x, s.p[k + 1] - y) < rad) {
              this.erased.add(i)
              const el = this.svg.querySelector(`[data-index="${i}"]`) as SVGElement | null
              if (el) el.style.opacity = '0.15'
              break
            }
          }
        })
      }
      erase(e)
      const move = (ev: PointerEvent): void => erase(ev)
      const up = (): void => {
        this.dom.removeEventListener('pointermove', move)
        this.dom.removeEventListener('pointerup', up)
        this.dom.removeEventListener('pointercancel', up)
        if (this.erased.size) {
          const strokes = ((this.node.attrs.strokes || []) as InkStroke[]).filter((_, i) => !this.erased.has(i))
          this.commit(strokes)
        }
      }
      this.dom.addEventListener('pointermove', move)
      this.dom.addEventListener('pointerup', up)
      this.dom.addEventListener('pointercancel', up)
      return
    }

    const pen = st.pens[st.activePen] ?? st.pens[0]
    const tool = st.tool === 'pen' || st.tool === 'pencil' || st.tool === 'highlighter' ? st.tool : pen.tool
    const [x, y, p] = this.local(e)
    const stroke: InkStroke = {
      t: tool,
      c: pen.color,
      s: tool === 'highlighter' ? Math.max(pen.size, 10) : pen.size * 1.6,
      p: [round(x), round(y), round(p)],
      sim: e.pointerType !== 'pen'
    }
    void scale
    this.drawing = { stroke, id: e.pointerId }
    const drawLive = (): void => {
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
      const path = new Path2D(pathFromOutline(outline(stroke, false)))
      const sty = strokeStyle(stroke)
      ctx.globalAlpha = sty.opacity
      ctx.fillStyle = sty.fill
      ctx.fill(path)
    }
    const move = (ev: PointerEvent): void => {
      if (!this.drawing || ev.pointerId !== this.drawing.id) return
      const events = typeof ev.getCoalescedEvents === 'function' ? ev.getCoalescedEvents() : [ev]
      for (const ce of events.length ? events : [ev]) {
        const [cx, cy, cp] = this.local(ce)
        stroke.p.push(round(cx), round(cy), round(cp))
      }
      drawLive()
    }
    const up = (): void => {
      this.dom.removeEventListener('pointermove', move)
      this.dom.removeEventListener('pointerup', up)
      this.dom.removeEventListener('pointercancel', up)
      this.drawing = null
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
      if (stroke.p.length >= 3) {
        const strokes = [...((this.node.attrs.strokes || []) as InkStroke[]), stroke]
        this.commit(strokes)
      }
    }
    this.dom.addEventListener('pointermove', move)
    this.dom.addEventListener('pointerup', up)
    this.dom.addEventListener('pointercancel', up)
    drawLive()
  }

  private commit(strokes: InkStroke[]): void {
    const pos = this.getPos()
    if (pos === undefined) return
    let height = this.node.attrs.height as number
    const b = inkBounds(strokes)
    if (b && b.y + b.h + 24 > height) height = Math.ceil(b.y + b.h + 40)
    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, strokes, height }))
  }

  private startResize(e: PointerEvent): void {
    e.preventDefault()
    e.stopPropagation()
    const startY = e.clientY
    const r = this.dom.getBoundingClientRect()
    const scale = r.height / (this.dom.offsetHeight || r.height) || 1
    const startH = this.node.attrs.height as number
    let h = startH
    const move = (ev: PointerEvent): void => {
      h = Math.max(60, Math.min(1400, startH + (ev.clientY - startY) / scale))
      this.dom.style.height = `${h}px`
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const pos = this.getPos()
      if (pos === undefined) return
      this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, height: Math.round(h) }))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false
    const changed = node.attrs !== this.node.attrs
    this.node = node
    if (changed) this.render()
    return true
  }

  selectNode(): void {
    this.dom.classList.add('ProseMirror-selectednode')
  }
  deselectNode(): void {
    this.dom.classList.remove('ProseMirror-selectednode')
  }
  stopEvent(e: Event): boolean {
    if (e.type.startsWith('pointer') || e.type.startsWith('mouse') || e.type.startsWith('touch')) {
      if (this.tool.tool !== 'select') return true
      if ((e.target as HTMLElement).classList?.contains('pe-ink-resize')) return true
    }
    return false
  }
  ignoreMutation(): boolean {
    return true
  }
  destroy(): void {
    this.unsub()
  }
}

const round = (n: number): number => Math.round(n * 10) / 10

export const Ink = Node.create({
  name: 'ink',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      strokes: {
        default: [],
        parseHTML: (el) => {
          try {
            return JSON.parse((el as HTMLElement).getAttribute('data-strokes') || '[]')
          } catch {
            return []
          }
        },
        renderHTML: (a) => ({ 'data-strokes': JSON.stringify(a.strokes || []) })
      },
      height: { default: 240, parseHTML: (el) => Number((el as HTMLElement).getAttribute('data-height')) || 240 },
      background: { default: 'none', parseHTML: (el) => (el as HTMLElement).getAttribute('data-bg') || 'none' }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="ink"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const strokes = (node.attrs.strokes || []) as InkStroke[]
    const paths: unknown[] = strokes.map((s) => {
      const st = strokeStyle(s)
      return ['path', { d: strokePath(s), fill: st.fill, 'fill-opacity': String(st.opacity) }]
    })
    return [
      'div',
      {
        ...HTMLAttributes,
        'data-type': 'ink',
        'data-height': node.attrs.height,
        'data-bg': node.attrs.background,
        class: `pe-ink pe-ink-bg-${node.attrs.background}`,
        style: `height: ${node.attrs.height}px`
      },
      ['svg', { xmlns: SVGNS, class: 'pe-ink-svg' }, ...paths]
    ] as unknown as import('@tiptap/pm/model').DOMOutputSpec
  },

  addNodeView() {
    return ({ node, view, getPos }) => new InkView(node, view, getPos as () => number | undefined)
  },

  addCommands() {
    return {
      insertInk:
        (attrs = {}) =>
        ({ chain }) =>
          chain()
            .insertContent([{ type: 'ink', attrs: { strokes: [], height: 240, background: 'none', ...attrs } }, { type: 'paragraph' }])
            .run()
    }
  }
})

/** Replace every stroke in the selected drawing that looks like a shape with a clean version. */
export function beautifySelectedInk(view: EditorView): number {
  const sel = view.state.selection
  if (!(sel instanceof NodeSelection) || sel.node.type.name !== 'ink') return -1
  let count = 0
  const strokes = ((sel.node.attrs.strokes || []) as InkStroke[]).map((s) => {
    const b = beautifyStroke(s)
    if (b) count++
    return b ?? s
  })
  view.dispatch(view.state.tr.setNodeMarkup(sel.from, undefined, { ...sel.node.attrs, strokes }))
  return count
}
