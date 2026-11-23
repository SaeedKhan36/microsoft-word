import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import { buildExtensions } from '@/editor/extensions'
import { useApp, registerEditor, unregisterEditor, markDirty, type DocTab } from '@/state/store'
import { applyFormat, gotoComment, setZoom } from '@/state/commands'
import { basicStats, countWords } from '@/lib/textstats'
import { mmToPx, pageSizePx, ptToPx } from '@/lib/units'
import { PAGE_GAP } from '@/lib/print'
import type { HeaderFooterContent, PageSettings } from '@/lib/types'
import { Ruler } from './Ruler'
import { BubbleToolbar } from './BubbleToolbar'

const FONT_FALLBACK: Record<string, string> = {
  Calibri: "Carlito, 'Segoe UI', sans-serif",
  Aptos: "Carlito, 'Segoe UI', sans-serif",
  Cambria: "'Source Serif 4', Georgia, serif",
  'Times New Roman': "'Source Serif 4', Georgia, serif",
  Georgia: "'Source Serif 4', serif",
  Arial: "Inter, 'Segoe UI', sans-serif",
  Consolas: "'JetBrains Mono', monospace"
}

export function fontStack(font: string): string {
  return `"${font}", ${FONT_FALLBACK[font] ?? "Carlito, 'Segoe UI', sans-serif"}`
}

export function docCssVars(doc: DocTab): CSSProperties {
  const s = doc.styles
  return {
    '--doc-font': fontStack(s.bodyFont),
    '--doc-heading-font': fontStack(s.headingFont),
    '--doc-size': `${s.fontSize}pt`,
    '--doc-line': String(s.lineHeight),
    '--doc-space-after': `${s.spaceAfter}pt`,
    '--doc-heading-color': s.headingColor,
    '--doc-accent': s.accent,
    '--doc-text': s.textColor
  } as CSSProperties
}

function fillFields(text: string, page: number, pages: number, doc: DocTab): string {
  return text
    .replace(/\{page\}/g, String(page))
    .replace(/\{pages\}/g, String(pages))
    .replace(/\{date\}/g, new Date().toLocaleDateString())
    .replace(/\{title\}/g, doc.meta.title || doc.title)
    .replace(/\{author\}/g, doc.meta.author || '')
}

export function DocumentView({ doc, active }: { doc: DocTab; active: boolean }): ReactNode {
  const settings = useApp((s) => s.settings)
  const view = useApp((s) => s.view)
  const zoom = useApp((s) => s.zoom)
  const editingHF = useApp((s) => s.editingHeaderFooter)
  const drawTool = useApp((s) => s.draw.tool)
  const docRef = useRef(doc)
  docRef.current = doc
  const scrollRef = useRef<HTMLDivElement>(null)
  const stackRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)

  const editor = useEditor(
    {
      extensions: buildExtensions({ baseFontSize: () => docRef.current.styles.fontSize }),
      content: doc.initial.json ?? doc.initial.html ?? '<p></p>',
      editorProps: {
        attributes: { class: 'pe-doc', spellcheck: String(settings.spellcheck) },
        handleDOMEvents: {
          mouseup: () => {
            if (useApp.getState().formatPainter) setTimeout(applyFormat, 0)
            return false
          }
        }
      },
      editable: !doc.readOnly,
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      onCreate: ({ editor: e }) => {
        registerEditor(doc.id, e)
        e.storage.trackChanges.author = useApp.getState().settings.userName
        e.storage.trackChanges.enabled = doc.trackChanges
      },
      onUpdate: () => markDirty(doc.id)
    },
    [doc.id]
  )

  useEffect(() => () => unregisterEditor(doc.id), [doc.id])

  // ---------------------------------------------------------------- stats & selection
  useEffect(() => {
    if (!editor) return
    let timer: number | null = null
    const computeStats = (): void => {
      const st = useApp.getState()
      const d = st.docs.find((x) => x.id === doc.id)
      if (!d) return
      const b = basicStats(editor.state.doc)
      const { from, to, empty } = editor.state.selection
      const selectionWords = empty ? 0 : countWords(editor.state.doc.textBetween(from, to, ' ', ' '))
      const starts = editor.storage.pagination.result.pageStarts
      let currentPage = 1
      for (let i = 0; i < starts.length; i++) if (starts[i] <= from) currentPage = i + 1
      st.updateDoc(doc.id, { stats: { ...b, pages: editor.storage.pagination.result.pages, currentPage, selectionWords } })
    }
    const schedule = (): void => {
      if (timer) clearTimeout(timer)
      timer = window.setTimeout(computeStats, 250)
    }
    const onSelection = (): void => {
      schedule()
      // Highlight the comment under the cursor.
      const marks = editor.state.selection.$from.marks()
      const c = marks.find((m) => m.type.name === 'comment')
      const st = useApp.getState()
      if (c && st.activeCommentId !== c.attrs.id) st.set({ activeCommentId: c.attrs.id })
      if (st.settings.typewriterScrolling && editor.isFocused) {
        const coords = editor.view.coordsAtPos(editor.state.selection.head)
        const sc = scrollRef.current
        if (sc) {
          const r = sc.getBoundingClientRect()
          sc.scrollBy({ top: coords.top - (r.top + r.height * 0.45), behavior: 'smooth' })
        }
      }
    }
    const listener = (r: import('@/editor/ext/pagination').PaginationResult): void => {
      useApp.getState().updateDoc(doc.id, { pagination: r })
      schedule()
    }
    editor.on('update', schedule)
    editor.on('selectionUpdate', onSelection)
    editor.storage.pagination.listeners.add(listener)
    computeStats()
    const sessionWords = useApp.getState().sessionStartWords
    if (sessionWords[doc.id] === undefined) {
      useApp.getState().set({ sessionStartWords: { ...sessionWords, [doc.id]: basicStats(editor.state.doc).words } })
    }
    return () => {
      editor.off('update', schedule)
      editor.off('selectionUpdate', onSelection)
      editor.storage.pagination.listeners.delete(listener)
      if (timer) clearTimeout(timer)
    }
  }, [editor, doc.id])

  // ---------------------------------------------------------------- settings → editor
  useEffect(() => {
    if (!editor) return
    editor.setEditable(!doc.readOnly && view !== 'read')
  }, [editor, doc.readOnly, view])

  useEffect(() => {
    if (!editor) return
    editor.view.dom.setAttribute('spellcheck', String(settings.spellcheck))
    editor.storage.trackChanges.author = settings.userName
  }, [editor, settings.spellcheck, settings.userName])

  const size = pageSizePx(doc.page)
  const m = doc.page.margins
  const mt = mmToPx(m.top)
  const mb = mmToPx(m.bottom)
  const ml = mmToPx(m.left)
  const mr = mmToPx(m.right)
  const paginate = view === 'print'

  // Footnote measurement uses a hidden element with the content width.
  useEffect(() => {
    if (!editor) return
    const cache = new Map<string, number>()
    editor.storage.pagination.measureFootnote = (text: string): number => {
      const el = measureRef.current
      if (!el) return 16
      const key = `${el.style.width}|${text}`
      const hit = cache.get(key)
      if (hit !== undefined) return hit
      el.textContent = text
      const h = el.offsetHeight + 3
      cache.set(key, h)
      return h
    }
  }, [editor])

  useEffect(() => {
    if (!editor) return
    editor.commands.setPaginationConfig({ enabled: paginate, pageHeight: size.h, marginTop: mt, marginBottom: mb, gap: PAGE_GAP })
  }, [editor, paginate, size.h, mt, mb])

  useEffect(() => {
    if (!editor || !active) return
    const t = setTimeout(() => editor.commands.repaginate(), 30)
    return () => clearTimeout(t)
  }, [editor, active, size.w, ml, mr, doc.styles, zoom])

  // Ctrl + wheel zoom.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const wheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setZoom(useApp.getState().zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])

  // Fit-to-width / one-page requests from the View tab.
  useEffect(() => {
    if (!active) return
    const handler = (e: Event): void => {
      const kind = (e as CustomEvent<string>).detail
      const sc = scrollRef.current
      if (!sc) return
      if (kind === 'width') setZoom((sc.clientWidth - 80) / size.w)
      if (kind === 'page') setZoom(Math.min((sc.clientHeight - 60) / size.h, (sc.clientWidth - 80) / size.w))
    }
    window.addEventListener('pe-fit', handler)
    return () => window.removeEventListener('pe-fit', handler)
  }, [active, size.w, size.h])

  const pages = Math.max(1, doc.pagination.pages)
  const stride = size.h + PAGE_GAP
  const totalH = paginate ? pages * stride - PAGE_GAP : 0

  const onDoubleClick = (e: React.MouseEvent): void => {
    if (!paginate || !stackRef.current) return
    const r = stackRef.current.getBoundingClientRect()
    const y = (e.clientY - r.top) / zoom
    const page = Math.floor(y / stride)
    const yIn = y - page * stride
    if (yIn < mt * 0.92 || yIn > size.h - mb * 0.92) {
      useApp.getState().set({ editingHeaderFooter: true, ribbonTab: 'headerFooter' })
    }
  }

  const onClickStack = (e: React.MouseEvent): void => {
    const t = e.target as HTMLElement
    const c = t.closest?.('.pe-comment') as HTMLElement | null
    if (c?.dataset.comment) {
      const st = useApp.getState()
      if (st.rightPane !== 'comments') st.set({ rightPane: 'comments' })
      st.set({ activeCommentId: c.dataset.comment })
    }
  }

  const stackClass = [
    'pe-stack',
    settings.darkPages ? 'pe-dark-pages' : '',
    settings.showFormattingMarks ? 'pe-show-marks' : '',
    doc.page.hyphenation ? 'pe-hyphenate' : '',
    `pe-markup-${doc.markup}`,
    editingHF ? 'pe-hf-editing' : '',
    drawTool !== 'select' ? 'pe-drawing' : '',
    view === 'web' ? 'pe-web' : '',
    view === 'read' ? 'pe-read' : ''
  ].join(' ')

  const activeCommentId = useApp((s) => s.activeCommentId)
  useEffect(() => {
    const root = stackRef.current
    if (!root) return
    root.querySelectorAll('.pe-comment-active').forEach((el) => el.classList.remove('pe-comment-active'))
    if (activeCommentId) root.querySelectorAll(`[data-comment="${activeCommentId}"]`).forEach((el) => el.classList.add('pe-comment-active'))
  }, [activeCommentId, doc.changeCounter])

  const vars: CSSProperties = {
    ...docCssVars(doc),
    ...(paginate
      ? {
          width: size.w,
          height: totalH,
          transform: zoom !== 1 ? `scale(${zoom})` : undefined
        }
      : { width: '100%' })
  }
  const contentWidth = size.w - ml - mr

  return (
    <div className={`canvas ${view} ${settings.showRuler && paginate ? 'with-ruler' : ''} ${active ? '' : 'hidden-doc'}`} ref={scrollRef}>
      <div className="canvas-inner">
        {paginate && settings.showRuler && editor && <Ruler doc={doc} editor={editor} zoom={zoom} />}
        <div className={paginate ? 'page-outer' : 'web-sheet'} style={paginate ? { width: size.w * zoom, height: totalH * zoom } : undefined}>
          <div ref={stackRef} className={stackClass} data-page-stack={doc.id} style={vars} onDoubleClick={onDoubleClick} onClick={onClickStack}>
            {paginate && <Sheets doc={doc} pages={pages} size={size} margins={{ mt, mb, ml, mr }} />}
            <EditorContent
              editor={editor}
              className="pe-editor-host"
              style={
                paginate
                  ? ({ '--pad': `${mt}px ${mr}px ${mb}px ${ml}px`, '--min-h': `${totalH}px` } as CSSProperties)
                  : undefined
              }
            />
            {paginate && <Overlays doc={doc} editor={editor} pages={pages} size={size} margins={{ mt, mb, ml, mr }} editingHF={editingHF} />}
            <div ref={measureRef} className="pe-fn-measure" style={{ width: contentWidth }} />
          </div>
        </div>
      </div>
      {editor && active && <BubbleToolbar editor={editor} />}
    </div>
  )
}

// ------------------------------------------------------------------ sheets (behind the text)

interface Geo {
  mt: number
  mb: number
  ml: number
  mr: number
}

function borderCss(p: PageSettings): string {
  const b = p.border
  switch (b.style) {
    case 'double':
      return `3px double ${b.color}`
    case 'thick':
      return `3px solid ${b.color}`
    case 'dashed':
      return `1.5px dashed ${b.color}`
    case 'dotted':
      return `2px dotted ${b.color}`
    default:
      return `1px solid ${b.color}`
  }
}

function Sheets({ doc, pages, size, margins }: { doc: DocTab; pages: number; size: { w: number; h: number }; margins: Geo }): ReactNode {
  const p = doc.page
  const stride = size.h + PAGE_GAP
  const items: ReactNode[] = []
  const wm = p.watermark
  for (let i = 0; i < pages; i++) {
    const first = i === 0 && p.differentFirstPage
    const header: HeaderFooterContent = first ? p.firstHeader : p.header
    const footer: HeaderFooterContent = first ? p.firstFooter : p.footer
    const num = i + p.pageNumberStart
    const total = pages + p.pageNumberStart - 1
    items.push(
      <div key={i} className="pe-sheet" style={{ top: i * stride, width: size.w, height: size.h, background: p.pageColor ?? undefined }}>
        {wm && wm.text && (
          <div className="pe-watermark" style={{ color: wm.color, opacity: wm.opacity, fontSize: wm.fontSize }}>
            <span style={{ transform: wm.diagonal ? `rotate(${-Math.atan2(size.h, size.w) * (180 / Math.PI)}deg)` : undefined }}>{wm.text}</span>
          </div>
        )}
        {p.border.style !== 'none' && (
          <div className="pe-sheet-border" style={{ inset: mmToPx(p.border.offsetMm), border: borderCss(p) }} />
        )}
        <div className="pe-sheet-header" style={{ left: margins.ml, right: margins.mr, top: mmToPx(p.headerDistanceMm) }}>
          <span>{fillFields(header.left, num, total, doc)}</span>
          <span>{fillFields(header.center, num, total, doc)}</span>
          <span>{fillFields(header.right, num, total, doc)}</span>
        </div>
        <div className="pe-sheet-footer" style={{ left: margins.ml, right: margins.mr, bottom: mmToPx(p.footerDistanceMm) }}>
          <span>{fillFields(footer.left, num, total, doc)}</span>
          <span>{fillFields(footer.center, num, total, doc)}</span>
          <span>{fillFields(footer.right, num, total, doc)}</span>
        </div>
        {p.lineNumbers !== 'none' && <span className="pe-sheet-label" style={{ display: 'none' }} />}
      </div>
    )
  }
  return <div className="pe-sheets">{items}</div>
}

// ------------------------------------------------------------------ overlays (above the text)

function Overlays({
  doc,
  editor,
  pages,
  size,
  margins,
  editingHF
}: {
  doc: DocTab
  editor: Editor | null
  pages: number
  size: { w: number; h: number }
  margins: Geo
  editingHF: boolean
}): ReactNode {
  const p = doc.page
  const stride = size.h + PAGE_GAP
  const contentH = size.h - margins.mt - margins.mb
  const fn = doc.pagination.footnotes
  const fnH = doc.pagination.footnoteHeights
  const setHF = (key: 'header' | 'footer' | 'firstHeader' | 'firstFooter', part: keyof HeaderFooterContent, value: string): void => {
    useApp.getState().updateDoc(doc.id, (d) => ({ page: { ...d.page, [key]: { ...d.page[key], [part]: value } } }))
    markDirty(doc.id)
  }
  const out: ReactNode[] = []
  const limit = Math.min(pages, 60)
  for (let i = 0; i < pages; i++) {
    const notes = fn[i] ?? []
    if (notes.length) {
      out.push(
        <div
          key={`fn${i}`}
          className="pe-footnotes"
          style={{ left: margins.ml, width: size.w - margins.ml - margins.mr, top: i * stride + margins.mt + contentH - (fnH[i] ?? 0) + 4 }}
        >
          {notes.map((n) => (
            <div key={n.id} className="pe-footnote-item" onClick={() => useApp.getState().openDialog('footnote', { id: n.id })}>
              <sup>{n.number}</sup>
              <span>{n.text || <i style={{ opacity: 0.6 }}>Empty footnote</i>}</span>
            </div>
          ))}
        </div>
      )
    }
    if (editingHF && i < limit) {
      const first = i === 0 && p.differentFirstPage
      const hk = first ? 'firstHeader' : 'header'
      const fk = first ? 'firstFooter' : 'footer'
      const hdr = p[hk]
      const ftr = p[fk]
      out.push(
        <div key={`hz${i}`}>
          <div className="pe-hf-zone" style={{ top: i * stride, height: margins.mt }} />
          <span className="pe-sheet-label" style={{ top: i * stride + margins.mt - 18, zIndex: 4 }}>
            {first ? 'First Page Header' : 'Header'}
          </span>
          <div className="pe-hf-editor" style={{ left: margins.ml, right: margins.mr, top: i * stride + Math.max(6, mmToPx(p.headerDistanceMm) - 4) }}>
            {(['left', 'center', 'right'] as const).map((part) => (
              <input key={part} value={hdr[part]} placeholder={part === 'left' ? 'Left' : part === 'center' ? 'Center' : 'Right'} onChange={(e) => setHF(hk, part, e.target.value)} />
            ))}
          </div>
          <div className="pe-hf-zone" style={{ top: i * stride + size.h - margins.mb, height: margins.mb }} />
          <span className="pe-sheet-label" style={{ top: i * stride + size.h - margins.mb + 4, zIndex: 4 }}>
            {first ? 'First Page Footer' : 'Footer'}
          </span>
          <div className="pe-hf-editor" style={{ left: margins.ml, right: margins.mr, top: i * stride + size.h - mmToPx(p.footerDistanceMm) - 22 }}>
            {(['left', 'center', 'right'] as const).map((part) => (
              <input key={part} value={ftr[part]} placeholder={part === 'left' ? 'Left' : part === 'center' ? 'Center' : 'Right'} onChange={(e) => setHF(fk, part, e.target.value)} />
            ))}
          </div>
        </div>
      )
    }
  }
  if (p.lineNumbers !== 'none' && editor) out.push(<LineNumbers key="ln" editor={editor} doc={doc} size={size} margins={margins} pages={pages} />)
  return <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>{out.map((o, i) => <div key={i} style={{ pointerEvents: 'auto' }}>{o}</div>)}</div>
}

/** Line numbers in the left margin, measured from the rendered lines. */
function LineNumbers({ editor, doc, size, margins, pages }: { editor: Editor; doc: DocTab; size: { w: number; h: number }; margins: Geo; pages: number }): ReactNode {
  const [lines, setLines] = useState<{ y: number; n: number }[]>([])
  const stride = size.h + PAGE_GAP
  useEffect(() => {
    let frame = 0
    const measure = (): void => {
      const dom = editor.view.dom as HTMLElement
      const rect = dom.getBoundingClientRect()
      const scale = rect.width / (dom.offsetWidth || 1) || 1
      const out: { y: number; n: number }[] = []
      const tops = new Set<number>()
      const walker = document.createTreeWalker(dom, NodeFilter.SHOW_TEXT)
      const range = document.createRange()
      let t: Node | null
      while ((t = walker.nextNode())) {
        const parent = (t as Text).parentElement
        if (!parent || parent.closest('.pe-toc, .pe-bibliography, table, pre')) continue
        range.selectNodeContents(t)
        for (const r of Array.from(range.getClientRects())) {
          const y = Math.round((r.top - rect.top) / scale)
          if (![...tops].some((v) => Math.abs(v - y) < 4)) tops.add(y)
        }
      }
      const sorted = [...tops].sort((a, b) => a - b)
      let n = 0
      let lastPage = -1
      for (const y of sorted) {
        const page = Math.floor(y / stride)
        if (doc.page.lineNumbers === 'page' && page !== lastPage) n = 0
        lastPage = page
        out.push({ y, n: ++n })
      }
      setLines(out)
    }
    const schedule = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setTimeout(measure, 60))
    }
    schedule()
    editor.on('update', schedule)
    editor.storage.pagination.listeners.add(schedule)
    return () => {
      editor.off('update', schedule)
      editor.storage.pagination.listeners.delete(schedule)
      cancelAnimationFrame(frame)
    }
  }, [editor, doc.page.lineNumbers, stride, pages])
  return (
    <div className="pe-line-numbers" style={{ left: 0, width: margins.ml - 14, top: 0, height: pages * stride }}>
      {lines.map((l, i) => (
        <span key={i} style={{ top: l.y }}>
          {l.n}
        </span>
      ))}
    </div>
  )
}

export function useStackVars(doc: DocTab | null): CSSProperties {
  return useMemo(() => (doc ? docCssVars(doc) : {}), [doc])
}

export { ptToPx }
