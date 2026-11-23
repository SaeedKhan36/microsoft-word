import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import {
  FileText,
  FilePlus2,
  FileDown,
  Table,
  Image,
  Shapes,
  Smile,
  BarChart3,
  Link2,
  Bookmark,
  MessageSquarePlus,
  PanelTop,
  PanelBottom,
  Hash,
  Type,
  CalendarDays,
  Sigma,
  Omega,
  Code2,
  MessageSquareQuote,
  Columns2,
  Minus,
  ListChecks,
  PenLine,
  ScanText,
  Pen,
  Pencil,
  Highlighter,
  Eraser,
  MousePointer2,
  Shapes as ShapesIcon,
  Wand2,
  Trash2,
  Play,
  Grid3x3,
  Rows3,
  Square,
  Palette,
  Droplets,
  Stamp,
  Frame,
  Paintbrush,
  RectangleHorizontal,
  RectangleVertical,
  Scaling,
  Columns3,
  SeparatorHorizontal,
  ListOrdered,
  WrapText,
  IndentIncrease
} from 'lucide-react'
import { Group, Btn, DropBtn, SplitBtn, TableGridPicker, Spin } from './controls'
import { MenuList, tip } from '../ui'
import { useApp, activeDoc, markDirty } from '@/state/store'
import { newComment } from '@/state/commands'
import { DOC_THEMES, MARGIN_PRESETS, PAPER_SIZES, defaultPage } from '@/lib/defaults'
import { beautifySelectedInk } from '@/editor/ext/ink'
import { NodeSelection } from '@tiptap/pm/state'
import type { PageSettings } from '@/lib/types'
import { fontStack } from '../DocumentView'
import { recognizeSelectedInk } from '@/lib/handwriting'

const open = (type: string, props?: Record<string, unknown>) => () => useApp.getState().openDialog(type, props)

function updatePage(patch: Partial<PageSettings> | ((p: PageSettings) => Partial<PageSettings>)): void {
  const doc = activeDoc()
  if (!doc) return
  useApp.getState().updateDoc(doc.id, (d) => ({ page: { ...d.page, ...(typeof patch === 'function' ? patch(d.page) : patch) } }))
  markDirty(doc.id)
}

function updateStyles(patch: Partial<import('@/lib/types').DocStyles>): void {
  const doc = activeDoc()
  if (!doc) return
  useApp.getState().updateDoc(doc.id, (d) => ({ styles: { ...d.styles, ...patch } }))
  markDirty(doc.id)
}

// ------------------------------------------------------------------ Insert

export function InsertTab({ editor }: { editor: Editor }): ReactNode {
  const c = (): ReturnType<Editor['chain']> => editor.chain().focus()
  return (
    <>
      <Group label="Pages">
        <div className="r-stack">
          <Btn icon={<FileText size={16} />} label="Cover Page" showLabel title="Cover Page" desc="Add a title page at the start of the document." onClick={() => insertCoverPage(editor)} />
          <Btn icon={<FilePlus2 size={16} />} label="Blank Page" showLabel title="Blank Page" onClick={() => c().setPageBreak().setPageBreak().run()} />
          <Btn icon={<FileDown size={16} />} label="Page Break" showLabel title="Page Break" keys="Ctrl+Enter" onClick={() => c().setPageBreak().run()} />
        </div>
      </Group>
      <Group label="Tables">
        <DropBtn big icon={<Table />} label="Table" title="Table" desc="Add a table to organise information.">
          {(close) => (
            <>
              <TableGridPicker close={close} onPick={(r, col) => c().insertTable({ rows: r, cols: col, withHeaderRow: true }).run()} />
              <div className="menu-sep" />
              <MenuList close={close} items={[{ label: 'Insert Table…', icon: <Table size={16} />, onClick: open('table') }]} />
            </>
          )}
        </DropBtn>
      </Group>
      <Group label="Illustrations">
        <Btn big icon={<Image />} label="Pictures" title="Pictures" desc="Insert pictures from your PC." onClick={open('insertPicture')} />
        <Btn big icon={<Shapes />} label="Shapes" title="Shapes" desc="Insert ready-made shapes like circles, arrows and stars." onClick={open('shapes')} />
        <Btn big icon={<Smile />} label="Icons" title="Icons" desc="Insert an icon." onClick={open('icons')} />
        <Btn big icon={<BarChart3 />} label="Chart" title="Chart" desc="Insert a column, line or pie chart." onClick={open('chart')} />
        <Btn big icon={<ScanText />} label="Handwriting" title="Handwriting from Image" desc="Import a photo of handwritten notes as a picture, ink or text." onClick={open('handwriting')} />
      </Group>
      <Group label="Links">
        <Btn big icon={<Link2 />} label="Link" title="Link" keys="Ctrl+K" onClick={open('link')} />
        <div className="r-stack">
          <Btn icon={<Bookmark size={16} />} label="Bookmark" showLabel title="Bookmark" onClick={open('bookmark')} />
        </div>
      </Group>
      <Group label="Comments">
        <Btn big icon={<MessageSquarePlus />} label="Comment" title="New Comment" keys="Ctrl+Alt+M" onClick={() => newComment()} />
      </Group>
      <Group label="Header & Footer">
        <div className="r-stack">
          <DropBtn icon={<PanelTop size={16} />} label="Header" showLabel title="Header">
            {(close) => <MenuList close={close} items={hfPresets('header')} />}
          </DropBtn>
          <DropBtn icon={<PanelBottom size={16} />} label="Footer" showLabel title="Footer">
            {(close) => <MenuList close={close} items={hfPresets('footer')} />}
          </DropBtn>
          <DropBtn icon={<Hash size={16} />} label="Page Number" showLabel title="Page Number">
            {(close) => (
              <MenuList
                close={close}
                items={[
                  { heading: 'Bottom of page' },
                  { label: 'Plain number, center', onClick: () => updatePage((p) => ({ footer: { ...p.footer, center: '{page}' } })) },
                  { label: 'Plain number, right', onClick: () => updatePage((p) => ({ footer: { ...p.footer, right: '{page}' } })) },
                  { label: 'Page X of Y', onClick: () => updatePage((p) => ({ footer: { ...p.footer, center: 'Page {page} of {pages}' } })) },
                  { heading: 'Top of page' },
                  { label: 'Plain number, right', onClick: () => updatePage((p) => ({ header: { ...p.header, right: '{page}' } })) },
                  { sep: true },
                  { label: 'Remove Page Numbers', onClick: () => updatePage((p) => ({ header: strip(p.header), footer: strip(p.footer) })) }
                ]}
              />
            )}
          </DropBtn>
        </div>
      </Group>
      <Group label="Text">
        <div className="r-stack">
          <Btn icon={<Type size={16} />} label="Text Box" showLabel title="Text Box" onClick={() => c().insertBox({ variant: 'textbox' }).run()} />
          <DropBtn icon={<MessageSquareQuote size={16} />} label="Callout" showLabel title="Callout box">
            {(close) => (
              <MenuList
                close={close}
                items={[
                  { label: 'Info', onClick: () => c().insertBox({ variant: 'info' }).run() },
                  { label: 'Tip / Success', onClick: () => c().insertBox({ variant: 'success' }).run() },
                  { label: 'Warning', onClick: () => c().insertBox({ variant: 'warning' }).run() },
                  { label: 'Note', onClick: () => c().insertBox({ variant: 'note' }).run() }
                ]}
              />
            )}
          </DropBtn>
          <Btn icon={<CalendarDays size={16} />} label="Date & Time" showLabel title="Date & Time" onClick={open('datetime')} />
        </div>
        <div className="r-stack">
          <Btn icon={<Columns2 size={16} />} label="Columns" showLabel title="Two columns" onClick={() => c().insertColumns(2).run()} />
          <Btn icon={<Minus size={16} />} label="Line" showLabel title="Horizontal Line" onClick={() => c().setHorizontalRule().run()} />
          <Btn icon={<Code2 size={16} />} label="Code" showLabel title="Code Block" on={editor.isActive('codeBlock')} onClick={() => c().toggleCodeBlock().run()} />
        </div>
        <div className="r-stack">
          <Btn icon={<ListChecks size={16} />} label="Checklist" showLabel title="Checklist" on={editor.isActive('taskList')} onClick={() => c().toggleTaskList().run()} />
          <Btn icon={<PenLine size={16} />} label="Drawing" showLabel title="Drawing Canvas" onClick={() => {
            c().insertInk().run()
            useApp.getState().set({ draw: { ...useApp.getState().draw, tool: 'pen' }, ribbonTab: 'draw' })
          }} />
          <Btn icon={<Type size={16} />} label="Drop Cap" showLabel title="Drop Cap" desc="Make the first letter of the paragraph large." on={!!editor.getAttributes('paragraph').dropCap} onClick={() => c().setParagraphFormat({ dropCap: !editor.getAttributes('paragraph').dropCap }).run()} />
        </div>
      </Group>
      <Group label="Symbols">
        <SplitBtn big icon={<Sigma />} label="Equation" title="Equation" desc="Insert a math equation using LaTeX or the equation builder." onClick={open('equation', { mode: 'block' })}>
          {(close) => (
            <MenuList
              close={close}
              items={[
                { label: 'Display equation (own line)', onClick: open('equation', { mode: 'block' }) },
                { label: 'Inline equation', onClick: open('equation', { mode: 'inline' }) },
                { sep: true },
                { heading: 'Built-in' },
                { label: 'Quadratic formula', onClick: () => c().insertBlockMath({ latex: 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}' }).run() },
                { label: 'Pythagorean theorem', onClick: () => c().insertBlockMath({ latex: 'a^2 + b^2 = c^2' }).run() },
                { label: 'Area of a circle', onClick: () => c().insertBlockMath({ latex: 'A = \\pi r^2' }).run() },
                { label: 'Binomial theorem', onClick: () => c().insertBlockMath({ latex: '(x+a)^n = \\sum_{k=0}^{n} \\binom{n}{k} x^k a^{n-k}' }).run() },
                { label: 'Fourier series', onClick: () => c().insertBlockMath({ latex: 'f(x) = a_0 + \\sum_{n=1}^{\\infty} \\left( a_n \\cos \\frac{n\\pi x}{L} + b_n \\sin \\frac{n\\pi x}{L} \\right)' }).run() }
              ]}
            />
          )}
        </SplitBtn>
        <Btn big icon={<Omega />} label="Symbol" title="Symbol" desc="Insert symbols and special characters." onClick={open('symbol')} />
      </Group>
    </>
  )
}

function strip(hf: PageSettings['header']): PageSettings['header'] {
  const f = (s: string): string => s.replace(/Page \{page\} of \{pages\}/g, '').replace(/\{page\}/g, '').replace(/\{pages\}/g, '').trim()
  return { left: f(hf.left), center: f(hf.center), right: f(hf.right) }
}

function hfPresets(kind: 'header' | 'footer'): import('../ui').MenuItemDef[] {
  const set = (v: PageSettings['header']) => () => {
    updatePage({ [kind]: v } as Partial<PageSettings>)
    useApp.getState().set({ view: 'print' })
  }
  return [
    { heading: 'Built-in' },
    { label: 'Blank', onClick: set({ left: '', center: '', right: '' }) },
    { label: 'Title on the left, date on the right', onClick: set({ left: '{title}', center: '', right: '{date}' }) },
    { label: 'Centered title', onClick: set({ left: '', center: '{title}', right: '' }) },
    { label: 'Author · Title · Page', onClick: set({ left: '{author}', center: '{title}', right: '{page}' }) },
    { label: 'Page X of Y', onClick: set({ left: '', center: '', right: 'Page {page} of {pages}' }) },
    { sep: true },
    { label: `Edit ${kind === 'header' ? 'Header' : 'Footer'}`, onClick: () => useApp.getState().set({ editingHeaderFooter: true, view: 'print', ribbonTab: 'headerFooter' }) },
    { label: `Remove ${kind === 'header' ? 'Header' : 'Footer'}`, onClick: () => updatePage({ [kind]: { left: '', center: '', right: '' } } as Partial<PageSettings>) }
  ]
}

function insertCoverPage(editor: Editor): void {
  const doc = activeDoc()
  const title = doc?.meta.title || doc?.title || 'Document Title'
  editor
    .chain()
    .focus()
    .insertContentAt(0, [
      { type: 'paragraph' },
      { type: 'paragraph' },
      { type: 'paragraph' },
      { type: 'paragraph', attrs: { styleId: 'title' }, content: [{ type: 'text', text: title }] },
      { type: 'paragraph', attrs: { styleId: 'subtitle' }, content: [{ type: 'text', text: 'Document subtitle' }] },
      { type: 'horizontalRule' },
      { type: 'paragraph', content: [{ type: 'text', text: doc?.meta.author || useApp.getState().settings.userName }] },
      { type: 'paragraph', content: [{ type: 'text', text: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) }] },
      { type: 'pageBreak' }
    ])
    .run()
}

// ------------------------------------------------------------------ Draw

export function DrawTab({ editor }: { editor: Editor }): ReactNode {
  const draw = useApp((s) => s.draw)
  const set = (patch: Partial<typeof draw>): void => useApp.getState().set({ draw: { ...draw, ...patch } })
  const inkSelected = editor.state.selection instanceof NodeSelection && editor.state.selection.node.type.name === 'ink'
  const setBg = (bg: string): void => {
    if (inkSelected) editor.chain().focus().updateAttributes('ink', { background: bg }).run()
  }
  const penIcon = (t: string): ReactNode => (t === 'pencil' ? <Pencil /> : t === 'highlighter' ? <Highlighter /> : <Pen />)
  return (
    <>
      <Group label="Tools">
        <Btn big icon={<MousePointer2 />} label="Select" title="Select" desc="Stop drawing and edit text." on={draw.tool === 'select'} onClick={() => set({ tool: 'select' })} />
        <Btn big icon={<Eraser />} label="Eraser" title="Eraser" desc="Erase whole strokes." on={draw.tool === 'eraser'} onClick={() => set({ tool: 'eraser' })} />
      </Group>
      <Group label="Pens">
        {draw.pens.map((p, i) => (
          <DropBtn
            key={i}
            big
            icon={<span style={{ color: p.color, display: 'grid' }}>{penIcon(p.tool)}</span>}
            label={p.tool === 'highlighter' ? 'Highlight' : p.tool === 'pencil' ? 'Pencil' : 'Pen'}
            title={`${p.tool[0].toUpperCase() + p.tool.slice(1)} (${p.size}px)`}
            on={draw.tool === p.tool && draw.activePen === i}
          >
            {(close) => (
              <PenEditor
                pen={p}
                onSelect={() => {
                  set({ tool: p.tool, activePen: i })
                  close()
                }}
                onChange={(np) => {
                  const pens = draw.pens.slice()
                  pens[i] = np
                  useApp.getState().set({ draw: { ...useApp.getState().draw, pens, tool: np.tool, activePen: i } })
                }}
              />
            )}
          </DropBtn>
        ))}
      </Group>
      <Group label="Canvas">
        <Btn big icon={<PenLine />} label="Drawing Canvas" title="Insert Drawing Canvas" desc="Add an area to draw or handwrite in." onClick={() => {
          editor.chain().focus().insertInk().run()
          if (draw.tool === 'select') set({ tool: 'pen' })
        }} />
        <DropBtn big icon={<Grid3x3 />} label="Background" title="Canvas Background" disabled={!inkSelected} desc="Select a drawing first.">
          {(close) => (
            <MenuList
              close={close}
              items={[
                { label: 'Plain', onClick: () => setBg('none') },
                { label: 'Ruled lines', icon: <Rows3 size={16} />, onClick: () => setBg('lines') },
                { label: 'Grid', icon: <Grid3x3 size={16} />, onClick: () => setBg('grid') },
                { label: 'Dots', onClick: () => setBg('dots') }
              ]}
            />
          )}
        </DropBtn>
      </Group>
      <Group label="Convert">
        <Btn big icon={<Wand2 />} label="Ink to Text" title="Ink to Text" desc="Convert the selected handwriting into typed text." disabled={!inkSelected} onClick={() => void recognizeSelectedInk(editor)} />
        <Btn
          big
          icon={<ShapesIcon />}
          label="Ink to Shape"
          title="Ink to Shape"
          desc="Turn hand-drawn circles, rectangles, triangles and lines into clean shapes."
          disabled={!inkSelected}
          onClick={() => {
            const n = beautifySelectedInk(editor.view)
            useApp.getState().toast(n > 0 ? `Converted ${n} stroke${n > 1 ? 's' : ''} into shapes.` : 'No shapes recognised. Draw closed shapes in a single stroke.', n > 0 ? 'success' : 'info')
          }}
        />
        <Btn big icon={<Play />} label="Replay" title="Ink Replay" desc="Watch the drawing being drawn again." disabled={!inkSelected} onClick={() => replayInk(editor)} />
        <Btn big icon={<ScanText />} label="From Image" title="Handwriting from Image" onClick={open('handwriting')} />
      </Group>
      <Group label="Edit">
        <Btn big icon={<Trash2 />} label="Clear Canvas" title="Clear all strokes" disabled={!inkSelected} onClick={() => editor.chain().focus().updateAttributes('ink', { strokes: [] }).run()} />
      </Group>
    </>
  )
}

function PenEditor({ pen, onChange, onSelect }: { pen: import('@/state/store').Pen; onChange: (p: import('@/state/store').Pen) => void; onSelect: () => void }): ReactNode {
  const colors = pen.tool === 'highlighter' ? ['#ffeb3b', '#7ee787', '#7dd3fc', '#f9a8d4', '#fdba74', '#c4b5fd'] : ['#1a1a1a', '#5f6368', '#d32f2f', '#e65100', '#f9a825', '#2e7d32', '#1e5bd8', '#6a1b9a', '#ad1457', '#ffffff']
  return (
    <div style={{ width: 240, padding: 6, display: 'grid', gap: 10 }}>
      <div className="seg">
        {(['pen', 'pencil', 'highlighter'] as const).map((t) => (
          <button key={t} className={pen.tool === t ? 'on' : ''} onClick={() => onChange({ ...pen, tool: t, size: t === 'highlighter' ? 14 : Math.min(pen.size, 8) })}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div className="swatches" style={{ gridTemplateColumns: 'repeat(5, 36px)', gap: 6, padding: 0 }}>
        {colors.map((col) => (
          <button key={col} className="swatch" style={{ background: col, width: 36, height: 28, outline: col === pen.color ? '2px solid var(--accent)' : undefined }} onClick={() => onChange({ ...pen, color: col })} />
        ))}
      </div>
      <label className="field">
        <span className="field-label">Thickness: {pen.size}px</span>
        <input type="range" min={1} max={pen.tool === 'highlighter' ? 30 : 12} value={pen.size} onChange={(e) => onChange({ ...pen, size: Number(e.target.value) })} style={{ accentColor: 'var(--accent)' }} />
      </label>
      <button className="btn primary" onClick={onSelect}>
        Use this {pen.tool}
      </button>
    </div>
  )
}

function replayInk(editor: Editor): void {
  const sel = editor.state.selection
  if (!(sel instanceof NodeSelection)) return
  const dom = editor.view.nodeDOM(sel.from) as HTMLElement | null
  const paths = dom?.querySelectorAll<SVGPathElement>('svg path')
  if (!paths?.length) return
  paths.forEach((p) => (p.style.opacity = '0'))
  paths.forEach((p, i) => setTimeout(() => (p.style.opacity = ''), 120 + i * 90))
}

// ------------------------------------------------------------------ Design

export function DesignTab(): ReactNode {
  const doc = activeDoc()
  if (!doc) return null
  const s = doc.styles
  const spacingPresets = [
    { name: 'Compact', line: 1, after: 4 },
    { name: 'Tight', line: 1.08, after: 6 },
    { name: 'Default', line: 1.15, after: 8 },
    { name: 'Open', line: 1.3, after: 10 },
    { name: 'Relaxed', line: 1.5, after: 12 },
    { name: 'Double', line: 2, after: 8 }
  ]
  return (
    <>
      <Group label="Document Formatting">
        <div style={{ display: 'flex', gap: 4, alignItems: 'stretch' }}>
          {DOC_THEMES.map((t) => (
            <button
              key={t.id}
              className={`style-chip ${s.theme === t.id ? 'on' : ''}`}
              style={{ width: 82, height: 74, border: '1px solid var(--border)', background: 'var(--surface)' }}
              onClick={() => updateStyles({ theme: t.id, bodyFont: t.bodyFont, headingFont: t.headingFont, headingColor: t.headingColor, accent: t.accent, textColor: t.textColor })}
              {...tip(t.name, undefined, `${t.headingFont} / ${t.bodyFont}`)}
            >
              <span style={{ fontFamily: fontStack(t.headingFont), color: t.headingColor, fontSize: 15, fontWeight: 600 }}>Title</span>
              <span style={{ fontFamily: fontStack(t.bodyFont), fontSize: 10.5, color: '#555', lineHeight: 1.2 }}>Body text sample</span>
              <span style={{ height: 3, background: t.accent, borderRadius: 2, width: '60%' }} />
              <span className="style-chip-name">{t.name}</span>
            </button>
          ))}
        </div>
      </Group>
      <Group label="Formatting">
        <div className="r-stack">
          <DropBtn icon={<Palette size={16} />} label="Colors" showLabel title="Theme Colors">
            {(close) => (
              <MenuList
                close={close}
                items={[
                  ['Blue', '#1f3b73', '#2f5bea'],
                  ['Ink', '#111827', '#374151'],
                  ['Teal', '#0f5257', '#0a7c86'],
                  ['Green', '#1d5c2e', '#2e7d32'],
                  ['Red', '#7f1d1d', '#c62828'],
                  ['Violet', '#5b2a86', '#7c3aed'],
                  ['Orange', '#7c2d12', '#ea580c']
                ].map(([n, h, a]) => ({
                  label: n,
                  icon: (
                    <span style={{ display: 'flex', gap: 2 }}>
                      <i style={{ width: 12, height: 12, background: h, borderRadius: 2 }} />
                      <i style={{ width: 12, height: 12, background: a, borderRadius: 2 }} />
                    </span>
                  ),
                  onClick: () => updateStyles({ headingColor: h, accent: a })
                }))}
              />
            )}
          </DropBtn>
          <DropBtn icon={<Type size={16} />} label="Fonts" showLabel title="Theme Fonts">
            {(close) => (
              <MenuList
                close={close}
                items={[
                  ['Calibri', 'Calibri'],
                  ['Cambria', 'Calibri'],
                  ['Inter', 'Inter'],
                  ['Lora', 'Source Serif 4'],
                  ['Georgia', 'Georgia'],
                  ['Arial', 'Arial'],
                  ['Times New Roman', 'Times New Roman'],
                  ['Merriweather', 'Merriweather'],
                  ['Caveat', 'Caveat']
                ].map(([h, b]) => ({
                  label: `${h} / ${b}`,
                  onClick: () => updateStyles({ headingFont: h, bodyFont: b })
                }))}
              />
            )}
          </DropBtn>
          <DropBtn icon={<WrapText size={16} />} label="Paragraph Spacing" showLabel title="Paragraph Spacing">
            {(close) => (
              <MenuList
                close={close}
                items={spacingPresets.map((p) => ({
                  label: `${p.name} · ${p.line} line, ${p.after}pt after`,
                  checked: s.lineHeight === p.line && s.spaceAfter === p.after,
                  onClick: () => updateStyles({ lineHeight: p.line, spaceAfter: p.after })
                }))}
              />
            )}
          </DropBtn>
        </div>
        <div className="r-stack">
          <Spin label="Size" value={s.fontSize} unit="pt" step={0.5} min={6} max={72} onChange={(v) => updateStyles({ fontSize: v })} />
        </div>
      </Group>
      <Group label="Page Background">
        <DropBtn big icon={<Stamp />} label="Watermark" title="Watermark" desc="Add faded text like DRAFT or CONFIDENTIAL behind the page.">
          {(close) => (
            <MenuList
              close={close}
              items={[
                ...['CONFIDENTIAL', 'DRAFT', 'DO NOT COPY', 'SAMPLE', 'URGENT', 'ASAP'].map((t) => ({
                  label: t,
                  onClick: () => updatePage({ watermark: { text: t, color: '#9e9e9e', opacity: 0.22, diagonal: true, fontSize: 110 } })
                })),
                { sep: true },
                { label: 'Custom Watermark…', onClick: open('watermark') },
                { label: 'Remove Watermark', onClick: () => updatePage({ watermark: null }) }
              ]}
            />
          )}
        </DropBtn>
        <DropBtn big icon={<Droplets />} label="Page Color" title="Page Color">
          {(close) => (
            <div style={{ width: 230 }}>
              <div className="swatches" style={{ gridTemplateColumns: 'repeat(6, 30px)', gap: 6 }}>
                {['#ffffff', '#fdf6e3', '#f4ecd8', '#eef6ff', '#eefaf0', '#fff0f3', '#f3f0ff', '#f5f5f5', '#fffbea', '#e8f4f8', '#fdf2e9', '#ebebeb'].map((col) => (
                  <button
                    key={col}
                    className="swatch"
                    style={{ background: col, width: 30, height: 30 }}
                    onClick={() => {
                      close()
                      updatePage({ pageColor: col === '#ffffff' ? null : col })
                    }}
                  />
                ))}
              </div>
              <div className="menu-sep" />
              <MenuList close={close} items={[{ label: 'No Color', onClick: () => updatePage({ pageColor: null }) }]} />
            </div>
          )}
        </DropBtn>
        <Btn big icon={<Frame />} label="Page Borders" title="Page Borders" onClick={open('pageBorder')} />
      </Group>
      <Group label="Reset">
        <Btn big icon={<Paintbrush />} label="Reset Design" title="Reset to default design" onClick={() => {
          const t = DOC_THEMES[0]
          updateStyles({ theme: t.id, bodyFont: t.bodyFont, headingFont: t.headingFont, headingColor: t.headingColor, accent: t.accent, textColor: t.textColor, lineHeight: 1.15, spaceAfter: 8 })
        }} />
      </Group>
    </>
  )
}

// ------------------------------------------------------------------ Layout

export function LayoutTab({ editor }: { editor: Editor }): ReactNode {
  const doc = activeDoc()
  if (!doc) return null
  const p = doc.page
  const para = editor.isActive('heading') ? editor.getAttributes('heading') : editor.getAttributes('paragraph')
  const c = (): ReturnType<Editor['chain']> => editor.chain().focus()
  const cm = (mm: number): string => `${(mm / 10).toFixed(2)} cm`
  return (
    <>
      <Group label="Page Setup" launcher={open('pageSetup')} launcherTip="Page Setup">
        <DropBtn big icon={<Scaling />} label="Margins" title="Margins">
          {(close) => (
            <MenuList
              close={close}
              items={[
                ...MARGIN_PRESETS.map((mp) => ({
                  label: `${mp.name} — Top ${cm(mp.m.top)}, Left ${cm(mp.m.left)}`,
                  checked: JSON.stringify(mp.m) === JSON.stringify(p.margins),
                  onClick: () => updatePage({ margins: mp.m })
                })),
                { sep: true },
                { label: 'Custom Margins…', onClick: open('pageSetup') }
              ]}
            />
          )}
        </DropBtn>
        <DropBtn big icon={p.orientation === 'portrait' ? <RectangleVertical /> : <RectangleHorizontal />} label="Orientation" title="Orientation">
          {(close) => (
            <MenuList
              close={close}
              items={[
                { label: 'Portrait', icon: <RectangleVertical size={16} />, checked: p.orientation === 'portrait', onClick: () => updatePage({ orientation: 'portrait' }) },
                { label: 'Landscape', icon: <RectangleHorizontal size={16} />, checked: p.orientation === 'landscape', onClick: () => updatePage({ orientation: 'landscape' }) }
              ]}
            />
          )}
        </DropBtn>
        <DropBtn big icon={<FileText />} label="Size" title="Size">
          {(close) => (
            <MenuList
              close={close}
              items={[
                ...PAPER_SIZES.map((s) => ({
                  label: `${s.label} — ${(s.w / 10).toFixed(1)} × ${(s.h / 10).toFixed(1)} cm`,
                  checked: p.sizeName === s.name,
                  onClick: () => updatePage({ sizeName: s.name, widthMm: s.w, heightMm: s.h })
                })),
                { sep: true },
                { label: 'More Paper Sizes…', onClick: open('pageSetup') }
              ]}
            />
          )}
        </DropBtn>
        <DropBtn big icon={<Columns3 />} label="Columns" title="Columns" desc="Insert a multi-column section.">
          {(close) => (
            <MenuList
              close={close}
              items={[
                { label: 'Two', onClick: () => c().insertColumns(2).run() },
                { label: 'Three', onClick: () => c().insertColumns(3).run() },
                { label: 'Left (narrow + wide)', onClick: () => c().insertColumns(2, 'left').run() },
                { label: 'Right (wide + narrow)', onClick: () => c().insertColumns(2, 'right').run() }
              ]}
            />
          )}
        </DropBtn>
        <div className="r-stack">
          <DropBtn icon={<SeparatorHorizontal size={16} />} label="Breaks" showLabel title="Breaks">
            {(close) => (
              <MenuList
                close={close}
                items={[
                  { label: 'Page', shortcut: 'Ctrl+Enter', onClick: () => c().setPageBreak().run() },
                  { label: 'Text Wrapping (line break)', shortcut: 'Shift+Enter', onClick: () => c().setHardBreak().run() },
                  { label: 'Next paragraph starts on a new page', checked: !!para.pageBreakBefore, onClick: () => c().setParagraphFormat({ pageBreakBefore: !para.pageBreakBefore }).run() },
                  { label: 'Keep with next', checked: !!para.keepWithNext, onClick: () => c().setParagraphFormat({ keepWithNext: !para.keepWithNext }).run() }
                ]}
              />
            )}
          </DropBtn>
          <DropBtn icon={<ListOrdered size={16} />} label="Line Numbers" showLabel title="Line Numbers">
            {(close) => (
              <MenuList
                close={close}
                items={[
                  { label: 'None', checked: p.lineNumbers === 'none', onClick: () => updatePage({ lineNumbers: 'none' }) },
                  { label: 'Continuous', checked: p.lineNumbers === 'continuous', onClick: () => updatePage({ lineNumbers: 'continuous' }) },
                  { label: 'Restart Each Page', checked: p.lineNumbers === 'page', onClick: () => updatePage({ lineNumbers: 'page' }) }
                ]}
              />
            )}
          </DropBtn>
          <DropBtn icon={<WrapText size={16} />} label="Hyphenation" showLabel title="Hyphenation">
            {(close) => (
              <MenuList
                close={close}
                items={[
                  { label: 'None', checked: !p.hyphenation, onClick: () => updatePage({ hyphenation: false }) },
                  { label: 'Automatic', checked: p.hyphenation, onClick: () => updatePage({ hyphenation: true }) }
                ]}
              />
            )}
          </DropBtn>
        </div>
      </Group>
      <Group label="Paragraph" launcher={open('paragraph')}>
        <div className="r-col" style={{ gap: 4 }}>
          <div className="section-label" style={{ margin: 0 }}>
            <IndentIncrease size={12} style={{ verticalAlign: -2 }} /> Indent
          </div>
          <Spin label="Left" value={Number(para.indentLeft || 0)} unit="pt" step={6} max={400} onChange={(v) => c().setParagraphFormat({ indentLeft: v || null }).run()} />
          <Spin label="Right" value={Number(para.indentRight || 0)} unit="pt" step={6} max={400} onChange={(v) => c().setParagraphFormat({ indentRight: v || null }).run()} />
        </div>
        <div className="r-col" style={{ gap: 4, marginLeft: 12 }}>
          <div className="section-label" style={{ margin: 0 }}>Spacing</div>
          <Spin label="Before" value={Number(para.spaceBefore ?? 0)} unit="pt" step={6} max={200} onChange={(v) => c().setParagraphFormat({ spaceBefore: v }).run()} />
          <Spin label="After" value={Number(para.spaceAfter ?? doc.styles.spaceAfter)} unit="pt" step={6} max={200} onChange={(v) => c().setParagraphFormat({ spaceAfter: v }).run()} />
        </div>
      </Group>
      <Group label="Arrange">
        <Btn big icon={<Square />} label="Picture Position" title="Picture position" desc="Select a picture first." disabled={!isImageSelected(editor)} onClick={() => useApp.getState().set({ ribbonTab: 'picture' })} />
        <Btn big icon={<FileText />} label="Reset Page" title="Reset page setup" onClick={() => updatePage({ ...defaultPage(), header: p.header, footer: p.footer })} />
      </Group>
    </>
  )
}

export function isImageSelected(editor: Editor): boolean {
  const s = editor.state.selection
  return s instanceof NodeSelection && s.node.type.name === 'image'
}
