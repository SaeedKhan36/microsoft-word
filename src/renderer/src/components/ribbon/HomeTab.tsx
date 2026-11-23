import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import {
  ClipboardPaste,
  Scissors,
  Copy,
  Paintbrush,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Subscript,
  Superscript,
  Highlighter,
  Baseline,
  RemoveFormatting,
  AArrowUp,
  AArrowDown,
  CaseSensitive,
  List,
  ListOrdered,
  ListChecks,
  IndentDecrease,
  IndentIncrease,
  Pilcrow,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  ArrowUpDown,
  PaintBucket,
  Square,
  Search,
  Replace,
  MousePointerClick,
  ChevronDown,
  Sparkles,
  ClipboardType,
  SpellCheck,
  Volume2,
  ArrowDownAZ
} from 'lucide-react'
import { Group, Btn, DropBtn, SplitBtn, ColorBtn, FontCombo, SizeCombo } from './controls'
import { MenuList, Dropdown } from '../ui'
import { useApp, activeDoc } from '@/state/store'
import { changeCase, clipboardAction, copyFormat, openFind, pasteText, readAloud } from '@/state/commands'
import { currentFontSize, stepFontSize } from '@/editor/ext/keymap'
import { fontStack } from '../DocumentView'

export const STYLE_PRESETS: { id: string; name: string; apply: (e: Editor) => void; isActive: (e: Editor) => boolean; sample: React.CSSProperties }[] = [
  { id: 'normal', name: 'Normal', apply: (e) => e.chain().focus().setParagraphStyle('normal').run(), isActive: (e) => e.isActive('paragraph') && !e.getAttributes('paragraph').styleId, sample: {} },
  { id: 'no-spacing', name: 'No Spacing', apply: (e) => e.chain().focus().setParagraphStyle('no-spacing').run(), isActive: (e) => e.getAttributes('paragraph').styleId === 'no-spacing', sample: {} },
  { id: 'h1', name: 'Heading 1', apply: (e) => e.chain().focus().setHeading({ level: 1 }).run(), isActive: (e) => e.isActive('heading', { level: 1 }), sample: { fontSize: 15, color: 'var(--h-color)', fontFamily: 'var(--h-font)' } },
  { id: 'h2', name: 'Heading 2', apply: (e) => e.chain().focus().setHeading({ level: 2 }).run(), isActive: (e) => e.isActive('heading', { level: 2 }), sample: { fontSize: 13.5, color: 'var(--h-color)', fontFamily: 'var(--h-font)' } },
  { id: 'h3', name: 'Heading 3', apply: (e) => e.chain().focus().setHeading({ level: 3 }).run(), isActive: (e) => e.isActive('heading', { level: 3 }), sample: { fontSize: 12.5, color: 'var(--h-color)', fontFamily: 'var(--h-font)' } },
  { id: 'title', name: 'Title', apply: (e) => e.chain().focus().setParagraphStyle('title').run(), isActive: (e) => e.getAttributes('paragraph').styleId === 'title', sample: { fontSize: 19, fontFamily: 'var(--h-font)' } },
  { id: 'subtitle', name: 'Subtitle', apply: (e) => e.chain().focus().setParagraphStyle('subtitle').run(), isActive: (e) => e.getAttributes('paragraph').styleId === 'subtitle', sample: { color: '#6b7280', fontSize: 13 } },
  { id: 'quote', name: 'Quote', apply: (e) => e.chain().focus().setParagraphStyle('quote').run(), isActive: (e) => e.getAttributes('paragraph').styleId === 'quote', sample: { fontStyle: 'italic' } },
  { id: 'intense-quote', name: 'Intense Quote', apply: (e) => e.chain().focus().setParagraphStyle('intense-quote').run(), isActive: (e) => e.getAttributes('paragraph').styleId === 'intense-quote', sample: { fontStyle: 'italic', color: 'var(--h-accent)' } },
  { id: 'h4', name: 'Heading 4', apply: (e) => e.chain().focus().setHeading({ level: 4 }).run(), isActive: (e) => e.isActive('heading', { level: 4 }), sample: { fontStyle: 'italic', color: 'var(--h-color)' } },
  { id: 'caption', name: 'Caption', apply: (e) => e.chain().focus().setParagraphStyle('caption').run(), isActive: (e) => e.getAttributes('paragraph').styleId === 'caption', sample: { fontStyle: 'italic', fontSize: 11, color: 'var(--h-color)' } },
  { id: 'code', name: 'Code', apply: (e) => e.chain().focus().toggleCodeBlock().run(), isActive: (e) => e.isActive('codeBlock'), sample: { fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5 } },
  { id: 'blockquote', name: 'Block Quote', apply: (e) => e.chain().focus().toggleBlockquote().run(), isActive: (e) => e.isActive('blockquote'), sample: { borderLeft: '3px solid #bbb', paddingLeft: 6 } },
  { id: 'h5', name: 'Heading 5', apply: (e) => e.chain().focus().setHeading({ level: 5 }).run(), isActive: (e) => e.isActive('heading', { level: 5 }), sample: { color: 'var(--h-color)' } },
  { id: 'h6', name: 'Heading 6', apply: (e) => e.chain().focus().setHeading({ level: 6 }).run(), isActive: (e) => e.isActive('heading', { level: 6 }), sample: { fontStyle: 'italic', color: 'var(--h-color)' } }
]

const LINE_SPACINGS = [1, 1.15, 1.5, 2, 2.5, 3]

export function HomeTab({ editor }: { editor: Editor }): ReactNode {
  const doc = activeDoc()
  const fp = useApp((s) => s.formatPainter)
  const showMarks = useApp((s) => s.settings.showFormattingMarks)
  const ts = editor.getAttributes('textStyle')
  const fontFamily = (ts.fontFamily as string | undefined)?.replace(/["']/g, '').split(',')[0] || doc?.styles.bodyFont || 'Calibri'
  const fontSize = currentFontSize(editor) || doc?.styles.fontSize || 11
  const para = editor.isActive('heading') ? editor.getAttributes('heading') : editor.getAttributes('paragraph')
  const c = (): ReturnType<Editor['chain']> => editor.chain().focus()
  const galleryVars = { '--h-color': doc?.styles.headingColor, '--h-font': fontStack(doc?.styles.headingFont ?? 'Calibri'), '--h-accent': doc?.styles.accent } as React.CSSProperties

  return (
    <>
      <Group label="Clipboard">
        <SplitBtn big icon={<ClipboardPaste />} label="Paste" title="Paste" keys="Ctrl+V" desc="Add content from the clipboard." onClick={() => clipboardAction('paste')}>
          {(close) => (
            <MenuList
              close={close}
              items={[
                { label: 'Keep source formatting', icon: <ClipboardPaste size={16} />, shortcut: 'Ctrl+V', onClick: () => clipboardAction('paste') },
                { label: 'Keep text only', icon: <ClipboardType size={16} />, shortcut: 'Ctrl+Shift+V', onClick: () => void pasteText() }
              ]}
            />
          )}
        </SplitBtn>
        <div className="r-stack">
          <Btn icon={<Scissors size={16} />} label="Cut" showLabel title="Cut" keys="Ctrl+X" onClick={() => clipboardAction('cut')} />
          <Btn icon={<Copy size={16} />} label="Copy" showLabel title="Copy" keys="Ctrl+C" onClick={() => clipboardAction('copy')} />
          <Btn
            icon={<Paintbrush size={16} />}
            label="Format Painter"
            showLabel
            on={!!fp}
            title="Format Painter"
            keys="Ctrl+Shift+C"
            desc="Copy formatting from one place and apply it to another. Double-click to apply it to several places."
            onClick={() => (fp ? useApp.getState().set({ formatPainter: null }) : copyFormat(false))}
            className="fp-btn"
          />
        </div>
      </Group>

      <Group label="Font" launcher={() => useApp.getState().openDialog('font')} launcherTip="Font settings (Ctrl+D)">
        <div className="r-col">
          <div className="r-row">
            <FontCombo value={fontFamily} onChange={(f) => c().setFontFamily(f).run()} />
            <SizeCombo value={fontSize} onChange={(n) => c().setFontSize(`${n}pt`).run()} />
            <Btn icon={<AArrowUp size={17} />} title="Increase Font Size" keys="Ctrl+Shift+>" onClick={() => stepFontSize(editor, 1, doc?.styles.fontSize ?? 11)} />
            <Btn icon={<AArrowDown size={17} />} title="Decrease Font Size" keys="Ctrl+Shift+<" onClick={() => stepFontSize(editor, -1, doc?.styles.fontSize ?? 11)} />
            <DropBtn icon={<CaseSensitive size={18} />} title="Change Case">
              {(close) => (
                <MenuList
                  close={close}
                  items={[
                    { label: 'Sentence case.', onClick: () => changeCase('sentence') },
                    { label: 'lowercase', onClick: () => changeCase('lower') },
                    { label: 'UPPERCASE', onClick: () => changeCase('upper') },
                    { label: 'Capitalize Each Word', onClick: () => changeCase('title') },
                    { label: 'tOGGLE cASE', onClick: () => changeCase('toggle') }
                  ]}
                />
              )}
            </DropBtn>
            <Btn icon={<RemoveFormatting size={16} />} title="Clear All Formatting" keys="Ctrl+Space" onClick={() => c().unsetAllMarks().setParagraphStyle('normal').run()} />
          </div>
          <div className="r-row">
            <Btn icon={<Bold size={16} />} title="Bold" keys="Ctrl+B" on={editor.isActive('bold')} onClick={() => c().toggleBold().run()} />
            <Btn icon={<Italic size={16} />} title="Italic" keys="Ctrl+I" on={editor.isActive('italic')} onClick={() => c().toggleItalic().run()} />
            <SplitBtn icon={<Underline size={16} />} title="Underline" keys="Ctrl+U" on={editor.isActive('underline')} onClick={() => c().toggleUnderline().run()}>
              {(close) => (
                <MenuList
                  close={close}
                  items={(['solid', 'double', 'dotted', 'dashed', 'wavy'] as const).map((s) => ({
                    label: s[0].toUpperCase() + s.slice(1),
                    icon: <span style={{ width: 40, borderBottom: s === 'double' ? '3px double currentColor' : s === 'wavy' ? '2px dotted currentColor' : `2px ${s} currentColor`, height: 8 }} />,
                    onClick: () => c().setUnderline().updateAttributes('underline', { underlineStyle: s === 'solid' ? null : s }).run()
                  }))}
                />
              )}
            </SplitBtn>
            <Btn icon={<Strikethrough size={16} />} title="Strikethrough" on={editor.isActive('strike')} onClick={() => c().toggleStrike().run()} />
            <Btn icon={<Subscript size={16} />} title="Subscript" keys="Ctrl+=" on={editor.isActive('subscript')} onClick={() => c().toggleSubscript().run()} />
            <Btn icon={<Superscript size={16} />} title="Superscript" keys="Ctrl+Shift+=" on={editor.isActive('superscript')} onClick={() => c().toggleSuperscript().run()} />
            <DropBtn icon={<Sparkles size={16} />} title="Text Effects" desc="Small caps, all caps, letter spacing and shadow.">
              {(close) => (
                <MenuList
                  close={close}
                  items={[
                    { label: 'Small Caps', checked: ts.textCase === 'small-caps', onClick: () => c().setMark('textStyle', { textCase: ts.textCase === 'small-caps' ? null : 'small-caps' }).run() },
                    { label: 'All Caps', checked: ts.textCase === 'all-caps', onClick: () => c().setMark('textStyle', { textCase: ts.textCase === 'all-caps' ? null : 'all-caps' }).run() },
                    { sep: true },
                    { heading: 'Spacing' },
                    { label: 'Condensed', checked: ts.letterSpacing === '-0.03em', onClick: () => c().setMark('textStyle', { letterSpacing: '-0.03em' }).run() },
                    { label: 'Normal', checked: !ts.letterSpacing, onClick: () => c().setMark('textStyle', { letterSpacing: null }).run() },
                    { label: 'Expanded', checked: ts.letterSpacing === '0.08em', onClick: () => c().setMark('textStyle', { letterSpacing: '0.08em' }).run() },
                    { label: 'Very wide', checked: ts.letterSpacing === '0.2em', onClick: () => c().setMark('textStyle', { letterSpacing: '0.2em' }).run() },
                    { sep: true },
                    { label: 'Shadow', checked: !!ts.textShadow, onClick: () => c().setMark('textStyle', { textShadow: ts.textShadow ? null : '1px 1px 2px rgba(0,0,0,.35)' }).run() },
                    { label: 'Glow', onClick: () => c().setMark('textStyle', { textShadow: '0 0 6px rgba(47,91,234,.7)' }).run() },
                    { label: 'Outline', onClick: () => c().setMark('textStyle', { textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000' }).run() }
                  ]}
                />
              )}
            </DropBtn>
            <ColorBtn icon={<Highlighter size={16} />} title="Text Highlight Color" color="#fff176" highlight onApply={(col) => (col ? c().setHighlight({ color: col }).run() : c().unsetHighlight().run())} />
            <ColorBtn icon={<Baseline size={16} />} title="Font Color" color="#c00000" noneLabel="Automatic" onApply={(col) => (col ? c().setColor(col).run() : c().unsetColor().run())} />
          </div>
        </div>
      </Group>

      <Group label="Paragraph" launcher={() => useApp.getState().openDialog('paragraph')} launcherTip="Paragraph settings">
        <div className="r-col">
          <div className="r-row">
            <SplitBtn icon={<List size={16} />} title="Bullets" keys="Ctrl+Shift+L" on={editor.isActive('bulletList')} onClick={() => c().toggleBulletList().run()}>
              {(close) => (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 44px)', gap: 4, padding: 4 }}>
                  {[
                    ['disc', '●'],
                    ['circle', '○'],
                    ['square', '■'],
                    ['dash', '–'],
                    ['arrow', '➤'],
                    ['check', '✓'],
                    ['star', '★'],
                    ['diamond', '◆']
                  ].map(([k, g]) => (
                    <button
                      key={k}
                      className="symbol-cell"
                      onClick={() => {
                        close()
                        if (!editor.isActive('bulletList')) c().toggleBulletList().run()
                        c().updateAttributes('bulletList', { bulletStyle: k }).run()
                      }}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              )}
            </SplitBtn>
            <SplitBtn icon={<ListOrdered size={16} />} title="Numbering" on={editor.isActive('orderedList')} onClick={() => c().toggleOrderedList().run()}>
              {(close) => (
                <MenuList
                  close={close}
                  items={[
                    ['1', '1. 2. 3.'],
                    ['a', 'a. b. c.'],
                    ['A', 'A. B. C.'],
                    ['i', 'i. ii. iii.'],
                    ['I', 'I. II. III.']
                  ].map(([t, label]) => ({
                    label,
                    onClick: () => {
                      if (!editor.isActive('orderedList')) c().toggleOrderedList().run()
                      c().updateAttributes('orderedList', { type: t }).run()
                    }
                  }))}
                />
              )}
            </SplitBtn>
            <Btn icon={<ListChecks size={16} />} title="Checklist" desc="Turn lines into a to-do list with checkboxes." on={editor.isActive('taskList')} onClick={() => c().toggleTaskList().run()} />
            <Btn icon={<IndentDecrease size={16} />} title="Decrease Indent" keys="Ctrl+Shift+M" onClick={() => c().outdent().run()} />
            <Btn icon={<IndentIncrease size={16} />} title="Increase Indent" keys="Ctrl+M" onClick={() => c().indent().run()} />
            <Btn icon={<ArrowDownAZ size={16} />} title="Sort" desc="Sort the selected paragraphs alphabetically." onClick={() => sortParagraphs(editor)} />
            <Btn icon={<Pilcrow size={16} />} title="Show/Hide ¶" keys="Ctrl+Shift+8" on={showMarks} onClick={() => useApp.getState().setSettings({ showFormattingMarks: !showMarks })} />
          </div>
          <div className="r-row">
            <Btn icon={<AlignLeft size={16} />} title="Align Left" keys="Ctrl+L" on={editor.isActive({ textAlign: 'left' })} onClick={() => c().setTextAlign('left').run()} />
            <Btn icon={<AlignCenter size={16} />} title="Center" keys="Ctrl+E" on={editor.isActive({ textAlign: 'center' })} onClick={() => c().setTextAlign('center').run()} />
            <Btn icon={<AlignRight size={16} />} title="Align Right" keys="Ctrl+R" on={editor.isActive({ textAlign: 'right' })} onClick={() => c().setTextAlign('right').run()} />
            <Btn icon={<AlignJustify size={16} />} title="Justify" keys="Ctrl+J" on={editor.isActive({ textAlign: 'justify' })} onClick={() => c().setTextAlign('justify').run()} />
            <DropBtn icon={<ArrowUpDown size={16} />} title="Line and Paragraph Spacing">
              {(close) => (
                <MenuList
                  close={close}
                  items={[
                    ...LINE_SPACINGS.map((v) => ({
                      label: v.toFixed(v === 1.15 ? 2 : 1),
                      checked: (para.lineHeight ?? doc?.styles.lineHeight) === v,
                      onClick: () => c().setLineSpacing(v).run()
                    })),
                    { sep: true },
                    { label: 'Line Spacing Options…', onClick: () => useApp.getState().openDialog('paragraph') },
                    { sep: true },
                    { label: para.spaceBefore ? 'Remove Space Before Paragraph' : 'Add Space Before Paragraph', onClick: () => c().setParagraphFormat({ spaceBefore: para.spaceBefore ? null : 12 }).run() },
                    { label: para.spaceAfter === 0 ? 'Add Space After Paragraph' : 'Remove Space After Paragraph', onClick: () => c().setParagraphFormat({ spaceAfter: para.spaceAfter === 0 ? null : 0 }).run() }
                  ]}
                />
              )}
            </DropBtn>
            <ColorBtn icon={<PaintBucket size={16} />} title="Shading" color="#deebf6" noneLabel="No Color" onApply={(col) => c().setParagraphFormat({ shading: col }).run()} />
            <DropBtn icon={<Square size={16} />} title="Borders">
              {(close) => (
                <MenuList
                  close={close}
                  items={[
                    { label: 'No Border', onClick: () => c().setParagraphFormat({ borderStyle: null }).run() },
                    { label: 'Box Border', onClick: () => c().setParagraphFormat({ borderStyle: 'box' }).run() },
                    { label: 'Top Border', onClick: () => c().setParagraphFormat({ borderStyle: 'top' }).run() },
                    { label: 'Bottom Border', onClick: () => c().setParagraphFormat({ borderStyle: 'bottom' }).run() },
                    { label: 'Left Bar', onClick: () => c().setParagraphFormat({ borderStyle: 'left' }).run() },
                    { sep: true },
                    { label: 'Horizontal Line', onClick: () => c().setHorizontalRule().run() }
                  ]}
                />
              )}
            </DropBtn>
          </div>
        </div>
      </Group>

      <Group label="Styles" launcher={() => useApp.getState().set({ rightPane: 'styles' })} launcherTip="Styles pane">
        <div className="style-gallery" style={galleryVars}>
          <div className="style-gallery-items">
            {STYLE_PRESETS.slice(0, 7).map((s) => (
              <button key={s.id} className={`style-chip ${s.isActive(editor) ? 'on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => s.apply(editor)} data-tip={s.name}>
                <span className="style-chip-sample" style={s.sample}>
                  AaBbCc
                </span>
                <span className="style-chip-name">{s.name}</span>
              </button>
            ))}
          </div>
          <Dropdown
            trigger={({ toggle, ref }) => (
              <button ref={ref as never} className="style-gallery-more" onMouseDown={(e) => e.preventDefault()} onClick={toggle} aria-label="More styles">
                <ChevronDown size={13} />
              </button>
            )}
            placement="bottom-end"
          >
            {(close) => (
              <div style={{ width: 300 }} >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, ...galleryVars }}>
                  {STYLE_PRESETS.map((s) => (
                    <button
                      key={s.id}
                      className={`style-chip ${s.isActive(editor) ? 'on' : ''}`}
                      style={{ width: 'auto', height: 56 }}
                      onClick={() => {
                        close()
                        s.apply(editor)
                      }}
                    >
                      <span className="style-chip-sample" style={s.sample}>
                        AaBbCc
                      </span>
                      <span className="style-chip-name">{s.name}</span>
                    </button>
                  ))}
                </div>
                <div className="menu-sep" />
                <MenuList
                  close={close}
                  items={[
                    { label: 'Clear Formatting', icon: <RemoveFormatting size={16} />, onClick: () => c().unsetAllMarks().setParagraphStyle('normal').run() },
                    { label: 'Apply Styles…', onClick: () => useApp.getState().set({ rightPane: 'styles' }) }
                  ]}
                />
              </div>
            )}
          </Dropdown>
        </div>
      </Group>

      <Group label="Editing">
        <div className="r-stack">
          <Btn icon={<Search size={16} />} label="Find" showLabel title="Find" keys="Ctrl+F" onClick={() => openFind(false)} />
          <Btn icon={<Replace size={16} />} label="Replace" showLabel title="Replace" keys="Ctrl+H" onClick={() => openFind(true)} />
          <DropBtn icon={<MousePointerClick size={16} />} label="Select" showLabel title="Select">
            {(close) => (
              <MenuList
                close={close}
                items={[
                  { label: 'Select All', shortcut: 'Ctrl+A', onClick: () => c().selectAll().run() },
                  { label: 'Select Current Paragraph', onClick: () => selectParagraph(editor) }
                ]}
              />
            )}
          </DropBtn>
        </div>
      </Group>

      <Group label="Proofing">
        <Btn big icon={<SpellCheck />} label="Editor" title="Editor" desc="Check spelling across the whole document." onClick={() => useApp.getState().set({ rightPane: 'spelling' })} />
        <Btn big icon={<Volume2 />} label="Read Aloud" title="Read Aloud" desc="Listen to your document. Choose again to stop." onClick={() => readAloud()} />
      </Group>
    </>
  )
}

function selectParagraph(editor: Editor): void {
  const $f = editor.state.selection.$from
  editor.chain().focus().setTextSelection({ from: $f.start(), to: $f.end() }).run()
}

function sortParagraphs(editor: Editor): void {
  const { state } = editor
  const { from, to } = state.selection
  const $from = state.doc.resolve(from)
  const $to = state.doc.resolve(to)
  const depth = Math.min($from.depth, $to.depth) - 1
  if (depth < 0) return
  const parent = $from.node(depth)
  const start = $from.index(depth)
  const end = $to.index(depth)
  if (end <= start) return
  const children = [] as import('@tiptap/pm/model').Node[]
  for (let i = start; i <= end; i++) children.push(parent.child(i))
  const sorted = [...children].sort((a, b) => a.textContent.localeCompare(b.textContent, undefined, { numeric: true, sensitivity: 'base' }))
  const posStart = $from.before(depth + 1)
  const posEnd = $to.after(depth + 1)
  editor.view.dispatch(state.tr.replaceWith(posStart, posEnd, sorted))
}
