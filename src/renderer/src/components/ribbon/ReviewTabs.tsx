import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import {
  ListTree,
  RefreshCw,
  Heading,
  Superscript,
  ArrowDownToLine,
  Quote,
  Library,
  BookOpen,
  Captions,
  ListOrdered,
  SpellCheck,
  Hash,
  Volume2,
  MessageSquarePlus,
  MessageSquareX,
  ChevronLeft,
  ChevronRight,
  MessagesSquare,
  FilePenLine,
  Check,
  X,
  PanelRight,
  GitCompare,
  Lock,
  BookOpenText,
  FileText,
  Globe,
  Focus,
  Ruler as RulerIcon,
  Grid3x3,
  PanelLeft,
  ZoomIn,
  Scan,
  MoveHorizontal,
  Moon,
  Sun,
  Pilcrow,
  Type,
  Target,
  Trash2,
  Rows3,
  Columns3,
  TableCellsMerge,
  TableCellsSplit,
  PaintBucket,
  ArrowUpToLine,
  AlignVerticalJustifyCenter,
  Table as TableIcon,
  Image as ImageIcon,
  RotateCw,
  RotateCcw,
  AlignLeft,
  AlignCenter,
  AlignRight,
  WrapText,
  Replace as ReplaceIcon,
  PanelTop,
  PanelBottom,
  CalendarDays,
  X as Close,
  History
} from 'lucide-react'
import { Group, Btn, DropBtn, SplitBtn, ColorBtn, Spin } from './controls'
import { MenuList, Checkbox } from '../ui'
import { useApp, activeDoc, markDirty } from '@/state/store'
import { gotoComment, newComment, readAloud, removeCommentMarks, setZoom, toggleFocusMode, toggleTrackChanges, scrollSelectionIntoView } from '@/state/commands'
import { collectChanges } from '@/editor/ext/track-changes'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import type { ImageLayout, ImageStyle } from '@/editor/ext/image'
import type { PageSettings } from '@/lib/types'
import { renderShapeSvg } from '@/lib/shapes'
import { svgToDataUrl } from '@/lib/images'

const open = (type: string, props?: Record<string, unknown>) => () => useApp.getState().openDialog(type, props)

// ------------------------------------------------------------------ References

export function ReferencesTab({ editor }: { editor: Editor }): ReactNode {
  const doc = activeDoc()
  const c = (): ReturnType<Editor['chain']> => editor.chain().focus()
  const hasToc = (): boolean => {
    let f = false
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'tableOfContents') f = true
      return !f
    })
    return f
  }
  const setStyle = (style: 'apa' | 'mla' | 'chicago' | 'harvard' | 'ieee'): void => {
    if (!doc) return
    useApp.getState().updateDoc(doc.id, (d) => ({ styles: { ...d.styles, citationStyle: style } }))
    markDirty(doc.id)
  }
  return (
    <>
      <Group label="Table of Contents">
        <SplitBtn big icon={<ListTree />} label="Table of Contents" title="Table of Contents" desc="An automatic table of contents built from your headings." onClick={() => c().insertTableOfContents().run()}>
          {(close) => (
            <MenuList
              close={close}
              items={[
                { label: 'Automatic Table (headings 1–3)', onClick: () => c().insertTableOfContents().run() },
                { label: 'Remove Table of Contents', onClick: () => removeNodes(editor, 'tableOfContents') }
              ]}
            />
          )}
        </SplitBtn>
        <div className="r-stack">
          <DropBtn icon={<Heading size={16} />} label="Add Text" showLabel title="Add the current paragraph to the table of contents">
            {(close) => (
              <MenuList
                close={close}
                items={[
                  { label: 'Do Not Show in Table of Contents', onClick: () => c().setParagraphStyle('normal').run() },
                  { label: 'Level 1', onClick: () => c().setHeading({ level: 1 }).run() },
                  { label: 'Level 2', onClick: () => c().setHeading({ level: 2 }).run() },
                  { label: 'Level 3', onClick: () => c().setHeading({ level: 3 }).run() }
                ]}
              />
            )}
          </DropBtn>
          <Btn icon={<RefreshCw size={16} />} label="Update Table" showLabel title="Update Table" desc="The table of contents updates automatically. This forces a refresh." disabled={!hasToc()} onClick={() => editor.commands.repaginate()} />
        </div>
      </Group>
      <Group label="Footnotes">
        <Btn big icon={<Superscript />} label="Insert Footnote" title="Insert Footnote" keys="Ctrl+Alt+F" onClick={() => c().insertFootnote().run()} />
        <div className="r-stack">
          <Btn icon={<ArrowDownToLine size={16} />} label="Next Footnote" showLabel title="Next Footnote" onClick={() => nextNode(editor, 'footnote')} />
        </div>
      </Group>
      <Group label="Citations & Bibliography">
        <Btn big icon={<Quote />} label="Insert Citation" title="Insert Citation" onClick={open('sources', { insert: true })} />
        <div className="r-stack">
          <Btn icon={<Library size={16} />} label="Manage Sources" showLabel title="Manage Sources" onClick={open('sources')} />
          <DropBtn icon={<Type size={16} />} label={`Style: ${(doc?.styles.citationStyle ?? 'apa').toUpperCase()}`} showLabel title="Citation Style">
            {(close) => (
              <MenuList
                close={close}
                items={(['apa', 'mla', 'chicago', 'harvard', 'ieee'] as const).map((s) => ({
                  label: { apa: 'APA (7th edition)', mla: 'MLA (9th edition)', chicago: 'Chicago (author-date)', harvard: 'Harvard', ieee: 'IEEE' }[s],
                  checked: doc?.styles.citationStyle === s,
                  onClick: () => setStyle(s)
                }))}
              />
            )}
          </DropBtn>
          <Btn icon={<BookOpen size={16} />} label="Bibliography" showLabel title="Insert Bibliography" onClick={() => c().insertBibliography().run()} />
        </div>
      </Group>
      <Group label="Captions">
        <Btn big icon={<Captions />} label="Insert Caption" title="Insert Caption" desc="Add a numbered caption like Figure 1 or Table 1." onClick={open('caption')} />
        <div className="r-stack">
          <DropBtn icon={<ListOrdered size={16} />} label="Table of Figures" showLabel title="Insert Table of Figures">
            {(close) => (
              <MenuList
                close={close}
                items={['Figure', 'Table', 'Equation'].map((l) => ({ label: `Table of ${l}s`, onClick: () => c().insertTableOfFigures(l).run() }))}
              />
            )}
          </DropBtn>
          <Btn icon={<Hash size={16} />} label="Bookmark" showLabel title="Bookmark" onClick={open('bookmark')} />
        </div>
      </Group>
    </>
  )
}

function removeNodes(editor: Editor, type: string): void {
  const tr = editor.state.tr
  const ranges: [number, number][] = []
  editor.state.doc.descendants((n, pos) => {
    if (n.type.name === type) ranges.push([pos, pos + n.nodeSize])
    return true
  })
  for (let i = ranges.length - 1; i >= 0; i--) tr.delete(ranges[i][0], ranges[i][1])
  editor.view.dispatch(tr)
}

function nextNode(editor: Editor, type: string): void {
  const from = editor.state.selection.to
  let target = -1
  let first = -1
  editor.state.doc.descendants((n, pos) => {
    if (n.type.name === type) {
      if (first < 0) first = pos
      if (pos > from && target < 0) target = pos
    }
    return target < 0
  })
  const pos = target >= 0 ? target : first
  if (pos >= 0) {
    editor.chain().focus().setNodeSelection(pos).run()
    scrollSelectionIntoView(editor)
  }
}

// ------------------------------------------------------------------ Review

export function ReviewTab({ editor }: { editor: Editor }): ReactNode {
  const doc = activeDoc()
  const right = useApp((s) => s.rightPane)
  const tracking = !!doc?.trackChanges
  const comments = doc?.comments ?? []
  const activeComment = useApp((s) => s.activeCommentId)
  const c = (): ReturnType<Editor['chain']> => editor.chain().focus()
  const setMarkup = (m: 'all' | 'simple' | 'none' | 'original'): void => {
    if (doc) useApp.getState().updateDoc(doc.id, { markup: m })
    setTimeout(() => editor.commands.repaginate(), 50)
  }
  const stepComment = (dir: 1 | -1): void => {
    if (!comments.length) return
    const ids = comments.map((x) => x.id)
    const idx = activeComment ? ids.indexOf(activeComment) : -1
    const next = ids[(idx + dir + ids.length) % ids.length]
    gotoComment(next)
  }
  const stepChange = (dir: 1 | -1): void => {
    const changes = collectChanges(editor.state.doc)
    if (!changes.length) {
      useApp.getState().toast('There are no tracked changes in this document.', 'info')
      return
    }
    const pos = editor.state.selection.from
    const target = dir > 0 ? (changes.find((x) => x.from > pos) ?? changes[0]) : ([...changes].reverse().find((x) => x.to < pos) ?? changes[changes.length - 1])
    editor.chain().focus().setTextSelection({ from: target.from, to: target.to }).run()
    scrollSelectionIntoView(editor)
  }
  const deleteComment = (): void => {
    if (!doc || !activeComment) return
    removeCommentMarks(editor, activeComment)
    useApp.getState().updateDoc(doc.id, (d) => ({ comments: d.comments.filter((x) => x.id !== activeComment) }))
    useApp.getState().set({ activeCommentId: null })
    markDirty(doc.id)
  }
  return (
    <>
      <Group label="Accessibility"><Btn big icon={<BookOpen />} label="Check Accessibility" onClick={open('accessibility')} /></Group>
      <Group label="Proofing">
        <Btn big icon={<SpellCheck />} label="Spelling" title="Spelling" keys="F7" desc="Find and fix spelling mistakes across the document." onClick={() => useApp.getState().set({ rightPane: 'spelling' })} />
        <div className="r-stack">
          <Btn icon={<Hash size={16} />} label="Word Count" showLabel title="Word Count" keys="Ctrl+Shift+G" onClick={open('wordCount')} />
          <Btn icon={<Target size={16} />} label="Writing Goal" showLabel title="Writing Goal" desc="Set a word target for this session." onClick={open('prompt', { kind: 'goal' })} />
        </div>
      </Group>
      <Group label="Speech">
        <Btn big icon={<Volume2 />} label="Read Aloud" title="Read Aloud" onClick={() => readAloud()} />
      </Group>
      <Group label="Comments">
        <Btn big icon={<MessageSquarePlus />} label="New Comment" title="New Comment" keys="Ctrl+Alt+M" onClick={() => newComment()} />
        <div className="r-stack">
          <Btn icon={<MessageSquareX size={16} />} label="Delete" showLabel title="Delete Comment" disabled={!activeComment} onClick={deleteComment} />
          <Btn icon={<ChevronLeft size={16} />} label="Previous" showLabel title="Previous Comment" disabled={!comments.length} onClick={() => stepComment(-1)} />
          <Btn icon={<ChevronRight size={16} />} label="Next" showLabel title="Next Comment" disabled={!comments.length} onClick={() => stepComment(1)} />
        </div>
        <Btn big icon={<MessagesSquare />} label="Show Comments" title="Show Comments" on={right === 'comments'} onClick={() => useApp.getState().set({ rightPane: right === 'comments' ? null : 'comments' })} />
      </Group>
      <Group label="Tracking">
        <Btn big icon={<FilePenLine />} label="Track Changes" title="Track Changes" keys="Ctrl+Shift+E" desc="Keep track of all changes made to this document." on={tracking} onClick={() => toggleTrackChanges()} />
        <div className="r-stack">
          <DropBtn icon={<FilePenLine size={16} />} label={{ all: 'All Markup', simple: 'Simple Markup', none: 'No Markup', original: 'Original' }[doc?.markup ?? 'all']} showLabel title="Display for Review">
            {(close) => (
              <MenuList
                close={close}
                items={[
                  { label: 'All Markup', checked: doc?.markup === 'all', onClick: () => setMarkup('all') },
                  { label: 'Simple Markup', checked: doc?.markup === 'simple', onClick: () => setMarkup('simple') },
                  { label: 'No Markup', checked: doc?.markup === 'none', onClick: () => setMarkup('none') },
                  { label: 'Original', checked: doc?.markup === 'original', onClick: () => setMarkup('original') }
                ]}
              />
            )}
          </DropBtn>
          <Btn icon={<PanelRight size={16} />} label="Reviewing Pane" showLabel title="Reviewing Pane" on={right === 'changes'} onClick={() => useApp.getState().set({ rightPane: right === 'changes' ? null : 'changes' })} />
        </div>
      </Group>
      <Group label="Changes">
        <SplitBtn big icon={<Check />} label="Accept" title="Accept and Move to Next" onClick={() => {
          if (!editor.commands.acceptChangeAt()) stepChange(1)
          else stepChange(1)
        }}>
          {(close) => (
            <MenuList
              close={close}
              items={[
                { label: 'Accept This Change', onClick: () => c().acceptChangeAt().run() },
                { label: 'Accept All Changes', onClick: () => c().acceptAllChanges().run() },
                { label: 'Accept All Changes and Stop Tracking', onClick: () => {
                  c().acceptAllChanges().run()
                  if (tracking) toggleTrackChanges()
                } }
              ]}
            />
          )}
        </SplitBtn>
        <SplitBtn big icon={<X />} label="Reject" title="Reject and Move to Next" onClick={() => {
          editor.commands.rejectChangeAt()
          stepChange(1)
        }}>
          {(close) => (
            <MenuList
              close={close}
              items={[
                { label: 'Reject This Change', onClick: () => c().rejectChangeAt().run() },
                { label: 'Reject All Changes', onClick: () => c().rejectAllChanges().run() }
              ]}
            />
          )}
        </SplitBtn>
        <div className="r-stack">
          <Btn icon={<ChevronLeft size={16} />} label="Previous" showLabel title="Previous Change" onClick={() => stepChange(-1)} />
          <Btn icon={<ChevronRight size={16} />} label="Next" showLabel title="Next Change" onClick={() => stepChange(1)} />
        </div>
      </Group>
      <Group label="Compare">
        <Btn big icon={<GitCompare />} label="Compare" title="Compare Documents" desc="Compare this document with another version and see the differences as tracked changes." onClick={open('compare')} />
      </Group>
      <Group label="Protect">
        <Btn big icon={<Lock />} label="Restrict Editing" title="Restrict Editing" desc="Make this document read-only." on={!!doc?.readOnly} onClick={() => doc && useApp.getState().updateDoc(doc.id, { readOnly: !doc.readOnly })} />
        <Btn big icon={<Lock />} label="Encrypt" title="Encrypt with Password" onClick={open('setPassword')} />
      </Group>
      <Group label="History">
        <Btn big icon={<History />} label="Versions" title="Version History" desc="See and restore earlier versions of this document." on={right === 'versions'} onClick={() => useApp.getState().set({ rightPane: right === 'versions' ? null : 'versions' })} />
      </Group>
    </>
  )
}

// ------------------------------------------------------------------ View

export function ViewTab(): ReactNode {
  const view = useApp((s) => s.view)
  const settings = useApp((s) => s.settings)
  const leftPane = useApp((s) => s.leftPane)
  const zoom = useApp((s) => s.zoom)
  const set = useApp.getState().set
  const setS = useApp.getState().setSettings
  return (
    <>
      <Group label="Views">
        <Btn big icon={<BookOpenText />} label="Read Mode" title="Read Mode" desc="Comfortable reading without editing tools." on={view === 'read'} onClick={() => set({ view: 'read' })} />
        <Btn big icon={<FileText />} label="Print Layout" title="Print Layout" desc="See how the document will look when printed." on={view === 'print'} onClick={() => set({ view: 'print' })} />
        <Btn big icon={<Globe />} label="Web Layout" title="Web Layout" desc="A continuous page without page breaks." on={view === 'web'} onClick={() => set({ view: 'web' })} />
      </Group>
      <Group label="Immersive">
        <Btn big icon={<Focus />} label="Focus" title="Focus Mode" keys="F11" desc="Hide everything but your writing." onClick={() => toggleFocusMode()} />
        <div className="r-stack">
          <Checkbox checked={settings.typewriterScrolling} onChange={(v) => setS({ typewriterScrolling: v })} label="Typewriter scrolling" />
        </div>
      </Group>
      <Group label="Show">
        <div className="r-stack" style={{ gap: 6, paddingTop: 6 }}>
          <Checkbox checked={settings.showRuler} onChange={(v) => setS({ showRuler: v })} label={<><RulerIcon size={14} /> Ruler</>} />
          <Checkbox checked={leftPane} onChange={(v) => set({ leftPane: v })} label={<><PanelLeft size={14} /> Navigation Pane</>} />
          <Checkbox checked={settings.showFormattingMarks} onChange={(v) => setS({ showFormattingMarks: v })} label={<><Pilcrow size={14} /> Formatting Marks</>} />
        </div>
      </Group>
      <Group label="Zoom">
        <Btn big icon={<ZoomIn />} label="Zoom" title="Zoom" onClick={open('zoom')} />
        <Btn big icon={<span style={{ fontWeight: 700, fontSize: 13 }}>100%</span>} label="100%" title="Zoom to 100%" onClick={() => setZoom(1)} />
        <div className="r-stack">
          <Btn icon={<Scan size={16} />} label="One Page" showLabel title="Fit one page" onClick={() => window.dispatchEvent(new CustomEvent('pe-fit', { detail: 'page' }))} />
          <Btn icon={<MoveHorizontal size={16} />} label="Page Width" showLabel title="Fit page width" onClick={() => window.dispatchEvent(new CustomEvent('pe-fit', { detail: 'width' }))} />
          <span className="spin" style={{ paddingLeft: 6 }}>{Math.round(zoom * 100)}%</span>
        </div>
      </Group>
      <Group label="Appearance">
        <Btn big icon={<Sun />} label="Light" title="Light theme" on={settings.theme === 'light'} onClick={() => setS({ theme: 'light' })} />
        <Btn big icon={<Moon />} label="Dark" title="Dark theme" on={settings.theme === 'dark'} onClick={() => setS({ theme: 'dark' })} />
        <div className="r-stack" style={{ paddingTop: 6, gap: 6 }}>
          <Checkbox checked={settings.theme === 'system'} onChange={(v) => setS({ theme: v ? 'system' : 'light' })} label="Match Windows" />
          <Checkbox checked={settings.darkPages} onChange={(v) => setS({ darkPages: v })} label="Dark pages" />
          <Checkbox checked={useApp.getState().showGrid} onChange={(v) => set({ showGrid: v })} label={<><Grid3x3 size={14} /> Gridlines</>} />
        </div>
      </Group>
    </>
  )
}

// ------------------------------------------------------------------ Table (contextual)

const TABLE_STYLES = [
  { id: 'grid', name: 'Grid' },
  { id: 'plain', name: 'Plain' },
  { id: 'minimal', name: 'Minimal' },
  { id: 'accent', name: 'Accent' },
  { id: 'soft', name: 'Soft' },
  { id: 'dark', name: 'Dark Header' }
]

export function TableTab({ editor }: { editor: Editor }): ReactNode {
  const c = (): ReturnType<Editor['chain']> => editor.chain().focus()
  const t = editor.getAttributes('table')
  return (
    <>
      <Group label="Table Style Options">
        <div className="r-stack" style={{ gap: 6, paddingTop: 6 }}>
          <Checkbox checked={t.headerRow !== false} onChange={(v) => c().updateAttributes('table', { headerRow: v }).run()} label="Header Row" />
          <Checkbox checked={!!t.bandedRows} onChange={(v) => c().updateAttributes('table', { bandedRows: v }).run()} label="Banded Rows" />
          <Btn icon={<Rows3 size={16} />} label="Toggle Header Row" showLabel onClick={() => c().toggleHeaderRow().run()} />
        </div>
      </Group>
      <Group label="Table Styles">
        <div style={{ display: 'flex', gap: 4 }}>
          {TABLE_STYLES.map((s) => (
            <button key={s.id} className={`style-chip ${t.tableStyle === s.id ? 'on' : ''}`} style={{ width: 70, height: 74, border: '1px solid var(--border)' }} onClick={() => c().updateAttributes('table', { tableStyle: s.id }).run()}>
              <TableThumb style={s.id} />
              <span className="style-chip-name">{s.name}</span>
            </button>
          ))}
        </div>
      </Group>
      <Group label="Shading">
        <ColorBtn big label="Shading" icon={<PaintBucket />} title="Cell Shading" color="#deebf6" noneLabel="No Color" onApply={(col) => c().setCellAttribute('backgroundColor', col).run()} />
      </Group>
      <Group label="Rows & Columns">
        <div className="r-stack">
          <Btn icon={<ArrowUpToLine size={16} />} label="Insert Above" showLabel onClick={() => c().addRowBefore().run()} />
          <Btn icon={<ArrowDownToLine size={16} />} label="Insert Below" showLabel onClick={() => c().addRowAfter().run()} />
          <DropBtn icon={<Trash2 size={16} />} label="Delete" showLabel title="Delete">
            {(close) => (
              <MenuList
                close={close}
                items={[
                  { label: 'Delete Cells / Row', onClick: () => c().deleteRow().run() },
                  { label: 'Delete Columns', onClick: () => c().deleteColumn().run() },
                  { label: 'Delete Table', danger: true, onClick: () => c().deleteTable().run() }
                ]}
              />
            )}
          </DropBtn>
        </div>
        <div className="r-stack">
          <Btn icon={<Columns3 size={16} />} label="Insert Left" showLabel onClick={() => c().addColumnBefore().run()} />
          <Btn icon={<Columns3 size={16} />} label="Insert Right" showLabel onClick={() => c().addColumnAfter().run()} />
          <Btn icon={<Rows3 size={16} />} label="Header Column" showLabel onClick={() => c().toggleHeaderColumn().run()} />
        </div>
      </Group>
      <Group label="Merge">
        <Btn big icon={<TableCellsMerge />} label="Merge Cells" title="Merge Cells" disabled={!editor.can().mergeCells()} onClick={() => c().mergeCells().run()} />
        <Btn big icon={<TableCellsSplit />} label="Split Cells" title="Split Cells" disabled={!editor.can().splitCell()} onClick={() => c().splitCell().run()} />
      </Group>
      <Group label="Alignment">
        <div className="r-stack">
          <Btn icon={<ArrowUpToLine size={16} />} label="Top" showLabel onClick={() => c().setCellAttribute('verticalAlign', 'top').run()} />
          <Btn icon={<AlignVerticalJustifyCenter size={16} />} label="Middle" showLabel onClick={() => c().setCellAttribute('verticalAlign', 'middle').run()} />
          <Btn icon={<ArrowDownToLine size={16} />} label="Bottom" showLabel onClick={() => c().setCellAttribute('verticalAlign', 'bottom').run()} />
        </div>
        <div className="r-stack">
          <Btn icon={<AlignLeft size={16} />} title="Align text left" onClick={() => c().setTextAlign('left').run()} />
          <Btn icon={<AlignCenter size={16} />} title="Center text" onClick={() => c().setTextAlign('center').run()} />
          <Btn icon={<AlignRight size={16} />} title="Align text right" onClick={() => c().setTextAlign('right').run()} />
        </div>
      </Group>
      <Group label="Data">
        <Btn big icon={<TableIcon />} label="Convert to Text" title="Convert Table to Text" onClick={() => tableToText(editor)} />
        <Btn big icon={<Close />} label="Delete Table" title="Delete Table" onClick={() => c().deleteTable().run()} />
      </Group>
    </>
  )
}

function TableThumb({ style }: { style: string }): ReactNode {
  const head = style === 'accent' ? 'var(--accent)' : style === 'dark' ? '#2b2f36' : style === 'soft' ? 'var(--accent-soft)' : style === 'grid' ? '#e9ecf1' : 'transparent'
  const border = style === 'plain' || style === 'minimal' ? 'transparent' : '#b7bdc8'
  return (
    <span style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', width: 52, height: 34, border: `1px solid ${border}` }}>
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} style={{ background: i < 3 ? head : 'transparent', borderRight: `1px solid ${border}`, borderBottom: i < 3 && style === 'minimal' ? '2px solid #333' : `1px solid ${border}` }} />
      ))}
    </span>
  )
}

function tableToText(editor: Editor): void {
  const { $from } = editor.state.selection
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d)
    if (n.type.name === 'table') {
      const start = $from.before(d)
      const paras: unknown[] = []
      n.forEach((row) => {
        const cells: string[] = []
        row.forEach((cell) => cells.push(cell.textContent))
        paras.push({ type: 'paragraph', content: cells.join('\t') ? [{ type: 'text', text: cells.join('\t') }] : [] })
      })
      editor.chain().focus().insertContentAt({ from: start, to: start + n.nodeSize }, paras as never).run()
      return
    }
  }
}

// ------------------------------------------------------------------ Picture (contextual)

const IMAGE_STYLES: { id: ImageStyle; name: string }[] = [
  { id: 'none', name: 'Simple' },
  { id: 'border', name: 'Border' },
  { id: 'shadow', name: 'Shadow' },
  { id: 'rounded', name: 'Rounded' },
  { id: 'circle', name: 'Circle' },
  { id: 'polaroid', name: 'Polaroid' },
  { id: 'frame', name: 'Frame' }
]

export function PictureTab({ editor }: { editor: Editor }): ReactNode {
  const sel = editor.state.selection
  const node = sel instanceof NodeSelection && sel.node.type.name === 'image' ? sel.node : null
  if (!node) return <Group label="Picture"><div className="hint" style={{ padding: 12 }}>Select a picture to format it.</div></Group>
  const a = node.attrs
  const up = (attrs: Record<string, unknown>): void => {
    editor.chain().focus().updateImage(attrs).setNodeSelection(sel.from).run()
  }
  const shape = a.shape ? (JSON.parse(a.shape) as { kind: string; fill: string; stroke: string; strokeWidth: number }) : null
  const setShape = (patch: Partial<NonNullable<typeof shape>>): void => {
    if (!shape) return
    const next = { ...shape, ...patch }
    up({ shape: JSON.stringify(next), src: svgToDataUrl(renderShapeSvg(next.kind, next.fill, next.stroke, next.strokeWidth)) })
  }
  return (
    <>
      <Group label="Adjust">
        <Btn big icon={<ReplaceIcon />} label="Change Picture" title="Change Picture" onClick={open('insertPicture', { replace: true })} />
        <Btn big icon={<ImageIcon />} label="Alt Text" title="Alt Text" desc="Describe the picture for screen readers." onClick={open('imageProps')} />
      </Group>
      {shape && (
        <Group label="Shape Styles">
          <ColorBtn big label="Fill" icon={<PaintBucket />} title="Shape Fill" color={shape.fill} noneLabel="No Fill" onApply={(col) => setShape({ fill: col ?? 'none' })} />
          <ColorBtn big label="Outline" icon={<WrapText />} title="Shape Outline" color={shape.stroke} noneLabel="No Outline" onApply={(col) => setShape({ stroke: col ?? 'none' })} />
          <div className="r-stack">
            <Spin label="Weight" value={shape.strokeWidth} unit="px" min={0} max={20} onChange={(v) => setShape({ strokeWidth: v })} />
          </div>
        </Group>
      )}
      <Group label="Picture Styles">
        <div style={{ display: 'flex', gap: 4 }}>
          {IMAGE_STYLES.map((s) => (
            <button key={s.id} className={`style-chip ${a.imgStyle === s.id ? 'on' : ''}`} style={{ width: 66, height: 74, border: '1px solid var(--border)', alignItems: 'center' }} onClick={() => up({ imgStyle: s.id })}>
              <span className={`pe-img-style-${s.id}`} style={{ display: 'block', lineHeight: 0 }}>
                <img src={a.src} style={{ width: 40, height: 32, objectFit: 'cover', display: 'block' }} />
              </span>
              <span className="style-chip-name">{s.name}</span>
            </button>
          ))}
        </div>
      </Group>
      <Group label="Arrange">
        <DropBtn big icon={<AlignCenter />} label="Position" title="Position">
          {(close) => (
            <MenuList
              close={close}
              items={([
                ['inline', 'In Line with Text'],
                ['left', 'Left (own line)'],
                ['center', 'Center (own line)'],
                ['right', 'Right (own line)']
              ] as [ImageLayout, string][]).map(([v, l]) => ({ label: l, checked: a.layout === v, onClick: () => up({ layout: v }) }))}
            />
          )}
        </DropBtn>
        <DropBtn big icon={<WrapText />} label="Wrap Text" title="Wrap Text">
          {(close) => (
            <MenuList
              close={close}
              items={([
                ['inline', 'In Line with Text'],
                ['float-left', 'Square — picture on the left'],
                ['float-right', 'Square — picture on the right'],
                ['center', 'Top and Bottom']
              ] as [ImageLayout, string][]).map(([v, l]) => ({ label: l, checked: a.layout === v, onClick: () => up({ layout: v }) }))}
            />
          )}
        </DropBtn>
        <div className="r-stack">
          <Btn icon={<RotateCw size={16} />} label="Rotate Right" showLabel onClick={() => up({ rotate: ((a.rotate || 0) + 90) % 360 })} />
          <Btn icon={<RotateCcw size={16} />} label="Rotate Left" showLabel onClick={() => up({ rotate: ((a.rotate || 0) + 270) % 360 })} />
          <Btn icon={<RotateCw size={16} />} label="Reset" showLabel onClick={() => up({ rotate: 0, width: null })} />
        </div>
      </Group>
      <Group label="Size">
        <div className="r-stack">
          <Spin label="Width" value={a.width || 0} unit="px" step={10} min={16} max={2000} onChange={(v) => up({ width: v })} />
          <div className="r-row">
            {[25, 50, 75, 100].map((p) => (
              <Btn
                key={p}
                label={`${p}%`}
                showLabel
                onClick={() => {
                  const max = (editor.view.dom as HTMLElement).clientWidth - 96
                  up({ width: Math.round((max * p) / 100) })
                }}
              />
            ))}
          </div>
        </div>
      </Group>
      <Group label="Caption">
        <Btn big icon={<Captions />} label="Add Caption" title="Insert Caption" onClick={open('caption')} />
        <Btn big icon={<Trash2 />} label="Delete" title="Delete Picture" onClick={() => editor.chain().focus().deleteSelection().run()} />
      </Group>
    </>
  )
}

// ------------------------------------------------------------------ Header & Footer (contextual)

export function HeaderFooterTab(): ReactNode {
  const doc = activeDoc()
  if (!doc) return null
  const p = doc.page
  const update = (patch: Partial<PageSettings>): void => {
    useApp.getState().updateDoc(doc.id, (d) => ({ page: { ...d.page, ...patch } }))
    markDirty(doc.id)
  }
  const insertField = (field: string): void => {
    const el = document.activeElement as HTMLInputElement | null
    if (el && el.tagName === 'INPUT' && el.closest('.pe-hf-editor')) {
      const start = el.selectionStart ?? el.value.length
      const v = el.value.slice(0, start) + field + el.value.slice(el.selectionEnd ?? start)
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.focus()
      el.setSelectionRange(start + field.length, start + field.length)
    } else {
      useApp.getState().toast('Click into the header or footer box first, then insert the field.', 'info')
    }
  }
  return (
    <>
      <Group label="Header & Footer">
        <Btn big icon={<PanelTop />} label="Header" title="Header" onClick={() => undefined} on />
        <Btn big icon={<PanelBottom />} label="Footer" title="Footer" onClick={() => undefined} on />
      </Group>
      <Group label="Insert">
        <Btn big icon={<Hash />} label="Page Number" title="Insert page number field" onClick={() => insertField('{page}')} />
        <Btn big icon={<Hash />} label="Page Count" title="Insert number of pages" onClick={() => insertField('{pages}')} />
        <Btn big icon={<CalendarDays />} label="Date" title="Insert date" onClick={() => insertField('{date}')} />
        <div className="r-stack">
          <Btn icon={<Type size={16} />} label="Document Title" showLabel onClick={() => insertField('{title}')} />
          <Btn icon={<Type size={16} />} label="Author" showLabel onClick={() => insertField('{author}')} />
        </div>
      </Group>
      <Group label="Options">
        <div className="r-stack" style={{ gap: 6, paddingTop: 6 }}>
          <Checkbox checked={p.differentFirstPage} onChange={(v) => update({ differentFirstPage: v })} label="Different First Page" />
          <Spin label="Start at" value={p.pageNumberStart} unit="" min={0} max={9999} onChange={(v) => update({ pageNumberStart: Math.round(v) })} />
        </div>
      </Group>
      <Group label="Position">
        <div className="r-stack">
          <Spin label="Header" value={p.headerDistanceMm / 10} unit="cm" step={0.1} max={10} onChange={(v) => update({ headerDistanceMm: v * 10 })} />
          <Spin label="Footer" value={p.footerDistanceMm / 10} unit="cm" step={0.1} max={10} onChange={(v) => update({ footerDistanceMm: v * 10 })} />
        </div>
      </Group>
      <Group label="Close">
        <Btn big icon={<Close />} label="Close Header and Footer" title="Close Header and Footer" onClick={() => useApp.getState().set({ editingHeaderFooter: false, ribbonTab: 'home' })} />
      </Group>
    </>
  )
}

export { TextSelection }
