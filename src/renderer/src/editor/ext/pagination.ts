/**
 * Pagination engine.
 *
 * The document stays a single ProseMirror flow so editing, selection and undo work
 * across pages. After each change we measure where blocks (and, for long paragraphs,
 * individual lines) fall, and insert "spacer" widget decorations that push content to
 * the top of the next page. Page sheets are drawn behind the editor by the canvas.
 *
 * Natural positions (as if no spacers existed) are recovered by subtracting the
 * heights of spacers above an element, so the layout converges in one pass.
 */
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'

export interface PaginationConfig {
  enabled: boolean
  pageHeight: number
  marginTop: number
  marginBottom: number
  gap: number
}

export interface FootnoteInfo {
  id: string
  number: number
  text: string
  height: number
}

export interface PaginationResult {
  pages: number
  pageStarts: number[]
  footnotes: FootnoteInfo[][]
  footnoteHeights: number[]
  headingPages: Record<number, number>
}

type BreakKind = 'block' | 'inline' | 'row'
interface Break {
  pos: number
  kind: BreakKind
  height: number
}

export const paginationKey = new PluginKey<{ breaks: Break[]; deco: DecorationSet }>('pePagination')

const FN_SEPARATOR = 14

export interface PaginationStorage {
  config: PaginationConfig
  result: PaginationResult
  listeners: Set<(r: PaginationResult) => void>
  measureFootnote: ((text: string) => number) | null
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pagination: {
      setPaginationConfig: (config: Partial<PaginationConfig>) => ReturnType
      repaginate: () => ReturnType
    }
  }
  interface Storage {
    pagination: PaginationStorage
  }
}

function spacerEl(tag: 'div' | 'span' | 'tr', height: number): HTMLElement {
  const el = document.createElement(tag)
  el.setAttribute('data-pe-spacer', tag)
  el.dataset.h = String(height)
  el.contentEditable = 'false'
  if (tag === 'tr') {
    el.className = 'pe-spacer pe-spacer-row'
    const td = document.createElement('td')
    td.colSpan = 99
    td.style.height = `${height}px`
    el.appendChild(td)
  } else {
    el.className = tag === 'span' ? 'pe-spacer pe-spacer-inline' : 'pe-spacer pe-spacer-block'
    el.style.height = `${height}px`
  }
  return el
}

function buildDecorations(doc: PMNode, breaks: Break[]): DecorationSet {
  const decos: Decoration[] = []
  for (const b of breaks) {
    if (b.pos < 0 || b.pos > doc.content.size) continue
    const h = Math.max(0, b.height)
    const tag = b.kind === 'row' ? 'tr' : b.kind === 'inline' ? 'span' : 'div'
    decos.push(
      Decoration.widget(b.pos, () => spacerEl(tag, h), {
        side: -1,
        key: `pg-${b.kind}-${b.pos}-${h.toFixed(1)}`,
        ignoreSelection: true,
        marks: []
      })
    )
  }
  return DecorationSet.create(doc, decos)
}

const EMPTY_RESULT: PaginationResult = { pages: 1, pageStarts: [0], footnotes: [[]], footnoteHeights: [0], headingPages: {} }

class PaginationView {
  private timer: number | null = null
  private frame: number | null = null
  private ro: ResizeObserver
  private destroyed = false
  private onFonts = (): void => this.schedule(30)
  private onLoad = (e: Event): void => {
    if ((e.target as HTMLElement)?.tagName === 'IMG') this.schedule(10)
  }

  constructor(
    private view: EditorView,
    private storage: PaginationStorage
  ) {
    this.ro = new ResizeObserver(() => this.schedule(20))
    this.ro.observe(view.dom)
    document.fonts?.addEventListener?.('loadingdone', this.onFonts)
    view.dom.addEventListener('load', this.onLoad, true)
    this.schedule(0)
  }

  update(view: EditorView, prev: { doc: PMNode }): void {
    this.view = view
    if (view.state.doc !== prev.doc) this.schedule(40)
  }

  schedule(delay: number): void {
    if (this.destroyed) return
    if (this.timer !== null) window.clearTimeout(this.timer)
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.timer = window.setTimeout(() => {
      this.timer = null
      this.frame = requestAnimationFrame(() => {
        this.frame = null
        try {
          this.measure()
        } catch (err) {
          console.warn('pagination failed', err)
        }
      })
    }, delay)
  }

  destroy(): void {
    this.destroyed = true
    this.ro.disconnect()
    document.fonts?.removeEventListener?.('loadingdone', this.onFonts)
    this.view.dom.removeEventListener('load', this.onLoad, true)
    if (this.timer !== null) window.clearTimeout(this.timer)
    if (this.frame !== null) cancelAnimationFrame(this.frame)
  }

  private publish(result: PaginationResult): void {
    const prev = this.storage.result
    const same =
      prev.pages === result.pages &&
      prev.pageStarts.join(',') === result.pageStarts.join(',') &&
      JSON.stringify(prev.footnotes) === JSON.stringify(result.footnotes) &&
      JSON.stringify(prev.headingPages) === JSON.stringify(result.headingPages)
    this.storage.result = result
    if (!same) this.storage.listeners.forEach((l) => l(result))
  }

  private apply(breaks: Break[]): void {
    const current = paginationKey.getState(this.view.state)?.breaks ?? []
    const same =
      current.length === breaks.length &&
      current.every((b, i) => b.pos === breaks[i].pos && b.kind === breaks[i].kind && Math.abs(b.height - breaks[i].height) < 0.6)
    if (same) return
    const tr = this.view.state.tr.setMeta(paginationKey, { breaks }).setMeta('addToHistory', false)
    tr.setMeta('pe-pagination', true)
    this.view.dispatch(tr)
  }

  measure(): void {
    const cfg = this.storage.config
    const view = this.view
    const dom = view.dom as HTMLElement
    if (!cfg.enabled) {
      this.apply([])
      this.publish({ ...EMPTY_RESULT, headingPages: {} })
      return
    }
    if (!dom.isConnected || dom.offsetParent === null || dom.offsetWidth === 0) return

    const domRect = dom.getBoundingClientRect()
    const scale = domRect.width / dom.offsetWidth || 1
    const local = (clientY: number): number => (clientY - domRect.top) / scale

    // Existing spacers, to convert measured positions into "natural" positions.
    const spacers = Array.from(dom.querySelectorAll<HTMLElement>('[data-pe-spacer]'))
      .map((el) => {
        const r = el.getBoundingClientRect()
        return { top: local(r.top), h: parseFloat(el.dataset.h || '0') || 0 }
      })
      .sort((a, b) => a.top - b.top)
    const nat = (y: number): number => {
      let s = 0
      for (const sp of spacers) {
        if (sp.top + sp.h <= y + 0.75) s += sp.h
        else break
      }
      return y - s
    }

    const { pageHeight, marginTop: mt, marginBottom: mb, gap } = cfg
    const contentH = pageHeight - mt - mb
    const stride = pageHeight + gap

    const breaks: Break[] = []
    const pageStarts = [0]
    const footnotes: FootnoteInfo[][] = [[]]
    const footnoteHeights: number[] = [0]
    const headingPages: Record<number, number> = {}
    let page = 0
    let pageTop = mt // natural y of the current page's content top
    let added = 0 // total height of new spacers inserted so far
    let fnH = 0
    let fnNumber = 0
    let forceNext = false

    const limit = (extra = 0): number => {
      const total = fnH + extra
      return contentH - (total > 0 ? total + FN_SEPARATOR : 0)
    }

    const newPage = (pos: number, top: number, kind: BreakKind): void => {
      page++
      const target = page * stride + mt
      const h = target - (top + added)
      breaks.push({ pos, kind, height: h })
      added += h
      pageTop = top
      pageStarts.push(pos)
      footnotes.push([])
      footnoteHeights.push(0)
      fnH = 0
    }

    const measureFn = this.storage.measureFootnote

    const footnotesIn = (node: PMNode): { id: string; text: string; h: number }[] => {
      const out: { id: string; text: string; h: number }[] = []
      if (!measureFn) return out
      node.descendants((n) => {
        if (n.type.name === 'footnote') {
          const text = String(n.attrs.text || '')
          out.push({ id: String(n.attrs.id), text, h: measureFn(`${fnNumber + out.length + 1}  ${text}`) })
        }
        return true
      })
      return out
    }

    const addFootnotes = (fns: { id: string; text: string; h: number }[]): void => {
      for (const f of fns) {
        fnNumber++
        footnotes[page].push({ id: f.id, number: fnNumber, text: f.text, height: f.h })
        fnH += f.h
        footnoteHeights[page] = fnH + FN_SEPARATOR
      }
    }

    const lineBoxes = (el: HTMLElement): { top: number; bottom: number; left: number; cTop: number; cBottom: number }[] => {
      const rects: DOMRect[] = []
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      const range = document.createRange()
      let t: Node | null
      while ((t = walker.nextNode())) {
        if (!t.nodeValue) continue
        range.selectNodeContents(t)
        for (const r of Array.from(range.getClientRects())) if (r.height > 0) rects.push(r)
      }
      el.querySelectorAll('img, .katex, .pe-inline-atom').forEach((n) => {
        const r = n.getBoundingClientRect()
        if (r.height > 0) rects.push(r)
      })
      rects.sort((a, b) => a.top - b.top)
      const lines: { cTop: number; cBottom: number; left: number }[] = []
      for (const r of rects) {
        const mid = (r.top + r.bottom) / 2
        const line = lines.find((l) => mid >= l.cTop && mid <= l.cBottom)
        if (line) {
          line.cTop = Math.min(line.cTop, r.top)
          line.cBottom = Math.max(line.cBottom, r.bottom)
          line.left = Math.min(line.left, r.left)
        } else lines.push({ cTop: r.top, cBottom: r.bottom, left: r.left })
      }
      lines.sort((a, b) => a.cTop - b.cTop)
      return lines.map((l) => ({ ...l, top: nat(local(l.cTop)), bottom: nat(local(l.cBottom)) }))
    }

    const splitLines = (node: PMNode, pos: number, el: HTMLElement): void => {
      const lines = lineBoxes(el)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i]
        if (line.bottom - pageTop <= limit() + 0.5) continue
        const hit = view.posAtCoords({ left: line.left + 1, top: (line.cTop + line.cBottom) / 2 })
        if (!hit) return
        let bpos = hit.pos
        const start = pos + 1
        const end = pos + node.nodeSize - 1
        if (bpos <= start || bpos > end) return
        // Snap to the very beginning of the line: step back while the previous position is on the same line.
        bpos = Math.max(start + 1, bpos)
        newPage(bpos, line.top, 'inline')
      }
    }

    const canDescend = (node: PMNode): boolean =>
      ['bulletList', 'orderedList', 'taskList', 'listItem', 'taskItem', 'blockquote', 'table'].includes(node.type.name)

    const place = (node: PMNode, pos: number): void => {
      if (node.type.name === 'pageBreak') {
        forceNext = true
        return
      }
      const el = view.nodeDOM(pos) as HTMLElement | null
      if (!el || el.nodeType !== 1) return
      const r = el.getBoundingClientRect()
      if (r.height === 0 && r.width === 0) return
      const top = nat(local(r.top))
      const bottom = top + r.height / scale
      const atTop = top <= pageTop + 1

      if (forceNext || node.attrs?.pageBreakBefore) {
        const wasForced = forceNext
        forceNext = false
        if (wasForced || !atTop) newPage(pos, top, 'block')
      }

      if (node.type.name === 'heading') headingPages[pos] = page

      if (node.type.name === 'table') {
        placeTable(node, pos, top)
        return
      }

      const fns = footnotesIn(node)
      const fnExtra = fns.reduce((s, f) => s + f.h, 0)
      const fits = bottom - pageTop <= limit(fnExtra) + 0.5

      if (fits) {
        // Keep headings (and paragraphs marked keep-with-next) with the following line.
        if ((node.type.name === 'heading' || node.attrs?.keepWithNext) && !atTop) {
          if (bottom + 22 - pageTop > limit(fnExtra)) {
            newPage(pos, top, 'block')
            if (node.type.name === 'heading') headingPages[pos] = page
          }
        }
        addFootnotes(fns)
        return
      }

      if (canDescend(node) && node.childCount > 0) {
        node.forEach((child, offset) => place(child, pos + 1 + offset))
        addFootnotesNotPlaced(node)
        return
      }

      if (node.isTextblock) {
        const lines = lineBoxes(el)
        const firstLineFits = lines.length > 0 && lines[0].bottom - pageTop <= limit() + 0.5
        if (lines.length > 1 && firstLineFits && !(node.type.name === 'heading')) {
          // Widow/orphan control: keep at least two lines together at the bottom of a page.
          const secondFits = lines[1].bottom - pageTop <= limit() + 0.5
          if (!secondFits && !atTop) {
            newPage(pos, top, 'block')
          }
          splitLines(node, pos, el)
          addFootnotes(fns)
          return
        }
        if (!atTop) newPage(pos, top, 'block')
        if (node.type.name === 'heading') headingPages[pos] = page
        if (bottom - pageTop > limit() + 0.5) splitLines(node, pos, el)
        addFootnotes(fns)
        return
      }

      if (!atTop) newPage(pos, top, 'block')
      addFootnotes(fns)
    }

    // Footnotes inside containers we descended into are added while placing their textblocks.
    const addFootnotesNotPlaced = (_node: PMNode): void => undefined

    const placeTable = (node: PMNode, pos: number, tableTop: number): void => {
      let first = true
      node.forEach((row, offset) => {
        const rowPos = pos + 1 + offset
        const el = view.nodeDOM(rowPos) as HTMLElement | null
        if (!el || el.nodeType !== 1) return
        const r = el.getBoundingClientRect()
        const top = nat(local(r.top))
        const bottom = top + r.height / scale
        const fns = footnotesIn(row)
        const fnExtra = fns.reduce((s, f) => s + f.h, 0)
        if (bottom - pageTop > limit(fnExtra) + 0.5) {
          const atTop = (first ? tableTop : top) <= pageTop + 1
          if (!atTop) {
            if (first) newPage(pos, tableTop, 'block')
            else newPage(rowPos, top, 'row')
          }
        }
        addFootnotes(fns)
        first = false
      })
    }

    view.state.doc.forEach((node, offset) => place(node, offset))

    this.apply(breaks)
    this.publish({ pages: page + 1, pageStarts, footnotes, footnoteHeights, headingPages })
  }
}

export const Pagination = Extension.create<Record<string, never>, PaginationStorage>({
  name: 'pagination',

  addStorage() {
    return {
      config: { enabled: true, pageHeight: 1122.52, marginTop: 96, marginBottom: 96, gap: 28 },
      result: { ...EMPTY_RESULT },
      listeners: new Set(),
      measureFootnote: null
    }
  },

  addCommands() {
    return {
      setPaginationConfig:
        (config) =>
        ({ tr, dispatch }) => {
          this.storage.config = { ...this.storage.config, ...config }
          if (dispatch) tr.setMeta('pe-repaginate', true).setMeta('addToHistory', false)
          return true
        },
      repaginate:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta('pe-repaginate', true).setMeta('addToHistory', false)
          return true
        }
    }
  },

  addProseMirrorPlugins() {
    const storage = this.storage
    let pv: PaginationView | null = null
    return [
      new Plugin({
        key: paginationKey,
        state: {
          init: () => ({ breaks: [] as Break[], deco: DecorationSet.empty }),
          apply(tr, value, _old, newState) {
            const meta = tr.getMeta(paginationKey) as { breaks: Break[] } | undefined
            if (meta) return { breaks: meta.breaks, deco: buildDecorations(newState.doc, meta.breaks) }
            if (tr.getMeta('pe-repaginate')) {
              window.setTimeout(() => pv?.schedule(0), 0)
            }
            if (tr.docChanged) {
              const breaks = value.breaks.map((b) => ({ ...b, pos: tr.mapping.map(b.pos, -1) }))
              return { breaks, deco: value.deco.map(tr.mapping, tr.doc) }
            }
            return value
          }
        },
        props: {
          decorations(state) {
            return paginationKey.getState(state)?.deco ?? DecorationSet.empty
          }
        },
        view(view) {
          pv = new PaginationView(view, storage)
          return pv
        }
      })
    ]
  }
})
