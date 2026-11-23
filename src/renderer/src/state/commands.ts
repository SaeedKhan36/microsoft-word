import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { useApp, activeEditor, activeDoc, markDirty } from './store'
import * as io from '@/lib/io'
import { uid } from '@/lib/units'
import { stepFontSize } from '@/editor/ext/keymap'
import type { CommentThread } from '@/lib/types'

const st = (): ReturnType<typeof useApp.getState> => useApp.getState()
const ed = (): Editor | null => activeEditor()

export interface Command {
  id: string
  label: string
  group: string
  keys?: string
  keywords?: string
  run: () => void
}

// ------------------------------------------------------------------ helpers used across the UI

export function chain(): ReturnType<Editor['chain']> | null {
  const e = ed()
  return e ? e.chain().focus() : null
}

export function setZoom(z: number): void {
  st().set({ zoom: Math.max(0.1, Math.min(5, Math.round(z * 100) / 100)) })
}

export function toggleBackstage(page: import('./store').BackstagePage | null = 'home'): void {
  st().set({ backstage: st().backstage ? null : page })
}

export function newComment(): void {
  const e = ed()
  const doc = activeDoc()
  if (!e || !doc) return
  let { from, to } = e.state.selection
  if (from === to) {
    // Select the word under the cursor, like Word does.
    const $p = e.state.doc.resolve(from)
    const text = $p.parent.textContent
    const off = $p.parentOffset
    let a = off
    let b = off
    while (a > 0 && /[\p{L}\p{N}_'-]/u.test(text[a - 1])) a--
    while (b < text.length && /[\p{L}\p{N}_'-]/u.test(text[b])) b++
    if (a === b) {
      st().toast('Select some text to comment on.', 'info')
      return
    }
    from = $p.start() + a
    to = $p.start() + b
  }
  const s = st().settings
  const id = uid('c')
  const thread: CommentThread = {
    id,
    author: s.userName,
    initials: s.userInitials,
    date: Date.now(),
    text: '',
    resolved: false,
    replies: [],
    quote: e.state.doc.textBetween(from, to, ' ').slice(0, 200)
  }
  e.chain().setTextSelection({ from, to }).setMark('comment', { id }).setTextSelection(to).run()
  st().updateDoc(doc.id, (d) => ({ comments: [...d.comments, thread] }))
  markDirty(doc.id)
  st().set({ rightPane: 'comments', activeCommentId: id })
}

export function removeCommentMarks(e: Editor, id: string): void {
  const tr = e.state.tr
  e.state.doc.descendants((node, pos) => {
    if (!node.isText) return true
    const m = node.marks.find((mk) => mk.type.name === 'comment' && mk.attrs.id === id)
    if (m) tr.removeMark(pos, pos + node.nodeSize, m)
    return false
  })
  tr.setMeta('pe-no-track', true)
  e.view.dispatch(tr)
}

export function gotoComment(id: string): void {
  const e = ed()
  if (!e) return
  let found: { from: number; to: number } | null = null
  e.state.doc.descendants((node, pos) => {
    if (found && found.to !== pos) return false
    if (node.isText && node.marks.some((m) => m.type.name === 'comment' && m.attrs.id === id)) {
      found = found ? { from: found.from, to: pos + node.nodeSize } : { from: pos, to: pos + node.nodeSize }
    }
    return true
  })
  if (!found) return
  const f = found as { from: number; to: number }
  e.chain().focus().setTextSelection(f).run()
  scrollSelectionIntoView(e)
  st().set({ activeCommentId: id })
}

export function scrollSelectionIntoView(e: Editor): void {
  requestAnimationFrame(() => {
    try {
      const { node } = e.view.domAtPos(e.state.selection.from)
      const el = (node.nodeType === 1 ? node : node.parentElement) as HTMLElement | null
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    } catch {
      /* ignore */
    }
  })
}

export function scrollToPos(e: Editor, pos: number): void {
  e.chain().focus().setTextSelection(pos + 1).run()
  const dom = e.view.nodeDOM(pos) as HTMLElement | null
  if (dom?.scrollIntoView) dom.scrollIntoView({ block: 'start', behavior: 'smooth' })
  else scrollSelectionIntoView(e)
}

export function copyFormat(sticky = false): void {
  const e = ed()
  if (!e) return
  const $from = e.state.selection.$from
  const marks = (e.state.storedMarks ?? $from.marks()).map((m) => m.toJSON())
  const parent = $from.parent
  const paragraph = parent.type.name === 'paragraph' || parent.type.name === 'heading' ? { ...parent.attrs, __type: parent.type.name } : null
  st().set({ formatPainter: { marks, paragraph, sticky } })
  st().toast(sticky ? 'Format painter is on. Select text to apply, press Esc to stop.' : 'Select text to apply the formatting.', 'info')
}

export function applyFormat(): void {
  const e = ed()
  const fp = st().formatPainter
  if (!e || !fp) return
  const { from, to } = e.state.selection
  const c = e.chain().focus().unsetAllMarks()
  for (const m of fp.marks ?? []) c.setMark(m.type, m.attrs)
  if (fp.paragraph) {
    const { __type, ...attrs } = fp.paragraph as Record<string, unknown> & { __type: string }
    if (__type === 'heading') c.setNode('heading', attrs)
    else c.setNode('paragraph').setParagraphFormat(attrs)
  }
  c.setTextSelection({ from, to }).run()
  if (!fp.sticky) st().set({ formatPainter: null })
}

export function changeCase(mode: 'sentence' | 'lower' | 'upper' | 'title' | 'toggle'): void {
  const e = ed()
  if (!e) return
  const { from, to, empty } = e.state.selection
  if (empty) return
  const tr = e.state.tr
  const ranges: { from: number; to: number; text: string; marks: readonly import('@tiptap/pm/model').Mark[] }[] = []
  e.state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return true
    const a = Math.max(from, pos)
    const b = Math.min(to, pos + node.nodeSize)
    ranges.push({ from: a, to: b, text: node.text!.slice(a - pos, b - pos), marks: node.marks })
    return false
  })
  let sentenceStart = true
  const conv = (t: string): string => {
    switch (mode) {
      case 'lower':
        return t.toLowerCase()
      case 'upper':
        return t.toUpperCase()
      case 'title':
        return t.toLowerCase().replace(/(^|[\s\-("'“])(\p{L})/gu, (_m, p, c) => p + c.toUpperCase())
      case 'toggle':
        return Array.from(t)
          .map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
          .join('')
      default: {
        let out = ''
        for (const ch of t.toLowerCase()) {
          if (sentenceStart && /\p{L}/u.test(ch)) {
            out += ch.toUpperCase()
            sentenceStart = false
          } else out += ch
          if (/[.!?]/.test(ch)) sentenceStart = true
        }
        return out
      }
    }
  }
  // Convert in document order (sentence case depends on what came before), then replace back to front.
  const converted = ranges.map((r) => conv(r.text))
  for (let i = ranges.length - 1; i >= 0; i--) {
    const r = ranges[i]
    if (converted[i]) tr.replaceWith(r.from, r.to, e.state.schema.text(converted[i], r.marks))
  }
  tr.setSelection(TextSelection.create(tr.doc, from, to))
  e.view.dispatch(tr)
}

export function insertDateTime(format: Intl.DateTimeFormatOptions | 'iso'): void {
  const d = new Date()
  const text = format === 'iso' ? d.toISOString().slice(0, 10) : d.toLocaleString(undefined, format)
  chain()?.insertContent(text).run()
}

export async function pasteText(): Promise<void> {
  const text = await window.pe.clipboard.readText()
  const e = ed()
  if (!e || !text) return
  const paras = text.replace(/\r\n?/g, '\n').split('\n')
  if (paras.length === 1) e.chain().focus().insertContent(text).run()
  else e.chain().focus().insertContent(paras.map((p) => ({ type: 'paragraph', content: p ? [{ type: 'text', text: p }] : [] }))).run()
}

export function clipboardAction(kind: 'cut' | 'copy' | 'paste'): void {
  ed()?.commands.focus()
  if (kind === 'paste') void window.pe.clipboard.paste()
  else document.execCommand(kind)
}

export function toggleTrackChanges(): void {
  const e = ed()
  const doc = activeDoc()
  if (!e || !doc) return
  const on = !e.storage.trackChanges.enabled
  e.commands.setTrackChanges(on)
  st().updateDoc(doc.id, { trackChanges: on })
  st().toast(on ? 'Track Changes is on. Your edits will be marked.' : 'Track Changes is off.', 'info')
}

export function openFind(replace = false): void {
  const e = ed()
  const sel = e ? e.state.doc.textBetween(e.state.selection.from, e.state.selection.to, ' ') : ''
  st().set({ find: { open: true, replace }, backstage: null })
  if (sel && sel.length < 80 && e) e.commands.setSearch(sel)
}

export function readAloud(): void {
  const synth = window.speechSynthesis
  if (synth.speaking) {
    synth.cancel()
    return
  }
  const e = ed()
  if (!e) return
  const { from, to, empty } = e.state.selection
  const text = empty ? e.state.doc.textBetween(from, e.state.doc.content.size, '\n', ' ') : e.state.doc.textBetween(from, to, '\n', ' ')
  if (!text.trim()) return
  const u = new SpeechSynthesisUtterance(text.slice(0, 32000))
  u.rate = 1
  synth.speak(u)
  st().toast('Reading aloud. Choose Read Aloud again to stop.', 'info')
}

export function toggleFocusMode(): void {
  const on = !st().focusMode
  st().set({ focusMode: on })
  void window.pe.app.setFullscreen(on)
}

// ------------------------------------------------------------------ command registry (palette + shortcuts)

const C = (id: string, label: string, group: string, run: () => void, keys?: string, keywords?: string): Command => ({ id, label, group, run, keys, keywords })

export function allCommands(): Command[] {
  const doc = activeDoc()
  const id = doc?.id
  const has = !!id
  const list: Command[] = [
    C('file.new', 'New blank document', 'File', () => io.newDocument(), 'Ctrl+N', 'create'),
    C('file.newFrom', 'New from template…', 'File', () => st().set({ backstage: 'new' }), undefined, 'template resume letter report'),
    C('file.open', 'Open…', 'File', () => void io.openFileDialog(), 'Ctrl+O', 'load'),
    C('file.recent', 'Open recent…', 'File', () => st().set({ backstage: 'open' })),
    C('file.home', 'Home / Start screen', 'File', () => st().set({ backstage: 'home' }))
  ]
  if (has) {
    list.push(
      C('file.save', 'Save', 'File', () => void io.saveDoc(id!), 'Ctrl+S'),
      C('file.saveAs', 'Save As…', 'File', () => void io.saveDoc(id!, { saveAs: true }), 'F12'),
      C('file.pdf', 'Save as PDF / Export PDF', 'File', () => void io.exportAs(id!, 'pdf'), undefined, 'pdf export'),
      C('file.docx', 'Export as Word (.docx)', 'File', () => void io.exportAs(id!, 'docx'), undefined, 'word docx'),
      C('file.html', 'Export as web page (.html)', 'File', () => void io.exportAs(id!, 'html')),
      C('file.md', 'Export as Markdown (.md)', 'File', () => void io.exportAs(id!, 'md')),
      C('file.txt', 'Export as plain text (.txt)', 'File', () => void io.exportAs(id!, 'txt')),
      C('file.print', 'Print…', 'File', () => st().set({ backstage: 'print' }), 'Ctrl+P'),
      C('file.info', 'Document info & properties', 'File', () => st().set({ backstage: 'info' })),
      C('file.versions', 'Version history', 'File', () => st().set({ rightPane: 'versions' }), undefined, 'restore history backup'),
      C('file.protect', 'Protect with password…', 'File', () => st().openDialog('setPassword'), undefined, 'encrypt lock'),
      C('file.close', 'Close document', 'File', () => void io.closeDoc(id!), 'Ctrl+W'),
      C('file.template', 'Save as template…', 'File', () => st().openDialog('prompt', { kind: 'template' })),

      C('edit.undo', 'Undo', 'Edit', () => chain()?.undo().run(), 'Ctrl+Z'),
      C('edit.redo', 'Redo', 'Edit', () => chain()?.redo().run(), 'Ctrl+Y'),
      C('edit.find', 'Find', 'Edit', () => openFind(false), 'Ctrl+F', 'search'),
      C('edit.replace', 'Replace', 'Edit', () => openFind(true), 'Ctrl+H'),
      C('edit.selectAll', 'Select all', 'Edit', () => chain()?.selectAll().run(), 'Ctrl+A'),
      C('edit.pasteText', 'Paste as plain text', 'Edit', () => void pasteText(), 'Ctrl+Shift+V'),
      C('edit.formatPainter', 'Format painter', 'Edit', () => copyFormat(false), 'Ctrl+Shift+C'),

      C('fmt.bold', 'Bold', 'Format', () => chain()?.toggleBold().run(), 'Ctrl+B'),
      C('fmt.italic', 'Italic', 'Format', () => chain()?.toggleItalic().run(), 'Ctrl+I'),
      C('fmt.underline', 'Underline', 'Format', () => chain()?.toggleUnderline().run(), 'Ctrl+U'),
      C('fmt.strike', 'Strikethrough', 'Format', () => chain()?.toggleStrike().run()),
      C('fmt.sub', 'Subscript', 'Format', () => chain()?.toggleSubscript().run(), 'Ctrl+='),
      C('fmt.sup', 'Superscript', 'Format', () => chain()?.toggleSuperscript().run(), 'Ctrl+Shift+='),
      C('fmt.clear', 'Clear formatting', 'Format', () => chain()?.unsetAllMarks().setParagraphStyle('normal').run(), 'Ctrl+Space'),
      C('fmt.grow', 'Increase font size', 'Format', () => ed() && stepFontSize(ed()!, 1, doc!.styles.fontSize), 'Ctrl+Shift+>'),
      C('fmt.shrink', 'Decrease font size', 'Format', () => ed() && stepFontSize(ed()!, -1, doc!.styles.fontSize), 'Ctrl+Shift+<'),
      C('fmt.font', 'Font…', 'Format', () => st().openDialog('font'), 'Ctrl+D'),
      C('fmt.paragraph', 'Paragraph…', 'Format', () => st().openDialog('paragraph'), undefined, 'spacing indent line'),
      C('fmt.upper', 'Change case: UPPERCASE', 'Format', () => changeCase('upper')),
      C('fmt.lower', 'Change case: lowercase', 'Format', () => changeCase('lower')),
      C('fmt.title', 'Change case: Capitalize Each Word', 'Format', () => changeCase('title')),
      C('fmt.sentence', 'Change case: Sentence case', 'Format', () => changeCase('sentence')),
      C('para.left', 'Align left', 'Paragraph', () => chain()?.setTextAlign('left').run(), 'Ctrl+L'),
      C('para.center', 'Center', 'Paragraph', () => chain()?.setTextAlign('center').run(), 'Ctrl+E'),
      C('para.right', 'Align right', 'Paragraph', () => chain()?.setTextAlign('right').run(), 'Ctrl+R'),
      C('para.justify', 'Justify', 'Paragraph', () => chain()?.setTextAlign('justify').run(), 'Ctrl+J'),
      C('para.bullets', 'Bulleted list', 'Paragraph', () => chain()?.toggleBulletList().run(), 'Ctrl+Shift+L'),
      C('para.numbers', 'Numbered list', 'Paragraph', () => chain()?.toggleOrderedList().run()),
      C('para.tasks', 'Checklist', 'Paragraph', () => chain()?.toggleTaskList().run(), undefined, 'todo'),
      C('para.indent', 'Increase indent', 'Paragraph', () => chain()?.indent().run(), 'Ctrl+M'),
      C('para.outdent', 'Decrease indent', 'Paragraph', () => chain()?.outdent().run(), 'Ctrl+Shift+M'),
      C('para.h1', 'Heading 1', 'Styles', () => chain()?.toggleHeading({ level: 1 }).run(), 'Ctrl+Alt+1'),
      C('para.h2', 'Heading 2', 'Styles', () => chain()?.toggleHeading({ level: 2 }).run(), 'Ctrl+Alt+2'),
      C('para.h3', 'Heading 3', 'Styles', () => chain()?.toggleHeading({ level: 3 }).run(), 'Ctrl+Alt+3'),
      C('para.normal', 'Normal text', 'Styles', () => chain()?.setParagraphStyle('normal').run(), 'Ctrl+Shift+N'),
      C('para.title', 'Title style', 'Styles', () => chain()?.setParagraphStyle('title').run()),
      C('para.quote', 'Quote', 'Styles', () => chain()?.toggleBlockquote().run()),
      C('para.marks', 'Show/hide formatting marks ¶', 'View', () => st().setSettings({ showFormattingMarks: !st().settings.showFormattingMarks }), 'Ctrl+Shift+8'),

      C('ins.table', 'Insert table…', 'Insert', () => st().openDialog('table'), undefined, 'grid'),
      C('ins.picture', 'Insert picture…', 'Insert', () => st().openDialog('insertPicture'), undefined, 'image photo'),
      C('ins.link', 'Insert link…', 'Insert', () => st().openDialog('link'), 'Ctrl+K', 'hyperlink url'),
      C('ins.pagebreak', 'Page break', 'Insert', () => chain()?.setPageBreak().run(), 'Ctrl+Enter'),
      C('ins.equation', 'Insert equation…', 'Insert', () => st().openDialog('equation', { mode: 'block' }), undefined, 'math latex formula'),
      C('ins.symbol', 'Insert symbol…', 'Insert', () => st().openDialog('symbol'), undefined, 'character emoji'),
      C('ins.chart', 'Insert chart…', 'Insert', () => st().openDialog('chart'), undefined, 'graph'),
      C('ins.shape', 'Insert shape…', 'Insert', () => st().openDialog('shapes'), undefined, 'rectangle arrow circle'),
      C('ins.ink', 'Insert drawing canvas', 'Insert', () => {
        chain()?.insertInk().run()
        st().set({ draw: { ...st().draw, tool: 'pen' }, ribbonTab: 'draw' })
      }, undefined, 'draw ink pen handwriting'),
      C('ins.handwriting', 'Import handwriting from an image…', 'Insert', () => st().openDialog('handwriting'), undefined, 'photo scan ocr notes'),
      C('ins.toc', 'Insert table of contents', 'Insert', () => chain()?.insertTableOfContents().run(), undefined, 'toc'),
      C('ins.footnote', 'Insert footnote', 'References', () => chain()?.insertFootnote().run(), 'Ctrl+Alt+F'),
      C('ins.date', 'Insert date & time…', 'Insert', () => st().openDialog('datetime')),
      C('ins.comment', 'New comment', 'Review', () => newComment(), 'Ctrl+Alt+M'),
      C('ins.textbox', 'Insert text box', 'Insert', () => chain()?.insertBox({ variant: 'textbox' }).run()),
      C('ins.callout', 'Insert callout', 'Insert', () => chain()?.insertBox({ variant: 'info' }).run()),
      C('ins.columns', 'Insert two columns', 'Insert', () => chain()?.insertColumns(2).run()),
      C('ins.code', 'Code block', 'Insert', () => chain()?.toggleCodeBlock().run()),
      C('ins.hr', 'Horizontal line', 'Insert', () => chain()?.setHorizontalRule().run(), undefined, 'divider'),
      C('ins.bookmark', 'Bookmark…', 'Insert', () => st().openDialog('bookmark')),
      C('ins.citation', 'Insert citation…', 'References', () => st().openDialog('sources', { insert: true })),
      C('ins.bibliography', 'Insert bibliography', 'References', () => chain()?.insertBibliography().run()),
      C('ins.caption', 'Insert caption…', 'References', () => st().openDialog('caption')),

      C('layout.pageSetup', 'Page setup…', 'Layout', () => st().openDialog('pageSetup'), undefined, 'margins size orientation paper'),
      C('layout.landscape', 'Orientation: Landscape', 'Layout', () => st().updateDoc(id!, (d) => ({ page: { ...d.page, orientation: 'landscape' } }))),
      C('layout.portrait', 'Orientation: Portrait', 'Layout', () => st().updateDoc(id!, (d) => ({ page: { ...d.page, orientation: 'portrait' } }))),
      C('layout.headerFooter', 'Edit header & footer', 'Insert', () => st().set({ editingHeaderFooter: true, view: 'print' })),
      C('design.watermark', 'Watermark…', 'Design', () => st().openDialog('watermark')),
      C('design.borders', 'Page borders…', 'Design', () => st().openDialog('pageBorder')),

      C('review.track', 'Track changes on/off', 'Review', () => toggleTrackChanges(), 'Ctrl+Shift+E'),
      C('review.acceptAll', 'Accept all changes', 'Review', () => chain()?.acceptAllChanges().run()),
      C('review.rejectAll', 'Reject all changes', 'Review', () => chain()?.rejectAllChanges().run()),
      C('review.wordCount', 'Word count', 'Review', () => st().openDialog('wordCount'), 'Ctrl+Shift+G', 'statistics readability'),
      C('review.spelling', 'Spelling', 'Review', () => st().set({ rightPane: 'spelling' }), 'F7', 'spellcheck proofing'),
      C('review.readAloud', 'Read aloud', 'Review', () => readAloud(), undefined, 'speak tts'),
      C('review.compare', 'Compare with another document…', 'Review', () => st().openDialog('compare'), undefined, 'diff'),
      C('review.comments', 'Show comments', 'Review', () => st().set({ rightPane: 'comments' })),

      C('view.print', 'Print layout', 'View', () => st().set({ view: 'print' })),
      C('view.web', 'Web layout', 'View', () => st().set({ view: 'web' })),
      C('view.read', 'Read mode', 'View', () => st().set({ view: 'read' })),
      C('view.focus', 'Focus mode', 'View', () => toggleFocusMode(), 'F11', 'distraction zen'),
      C('view.nav', 'Navigation pane', 'View', () => st().set({ leftPane: !st().leftPane })),
      C('view.ruler', 'Show/hide ruler', 'View', () => st().setSettings({ showRuler: !st().settings.showRuler })),
      C('view.zoomIn', 'Zoom in', 'View', () => setZoom(st().zoom + 0.1)),
      C('view.zoomOut', 'Zoom out', 'View', () => setZoom(st().zoom - 0.1)),
      C('view.zoom100', 'Zoom 100%', 'View', () => setZoom(1)),
      C('view.dark', 'Dark theme', 'View', () => st().setSettings({ theme: 'dark' })),
      C('view.light', 'Light theme', 'View', () => st().setSettings({ theme: 'light' })),
      C('view.darkPages', 'Dark pages on/off', 'View', () => st().setSettings({ darkPages: !st().settings.darkPages })),
      C('draw.pen', 'Draw with pen', 'Draw', () => st().set({ draw: { ...st().draw, tool: 'pen' }, ribbonTab: 'draw' })),
      C('draw.stop', 'Stop drawing (select)', 'Draw', () => st().set({ draw: { ...st().draw, tool: 'select' } }))
    )
  }
  list.push(
    C('app.options', 'Options / Settings', 'App', () => st().set({ backstage: 'options' }), undefined, 'preferences settings theme'),
    C('app.about', 'About Personal Editor', 'App', () => st().set({ backstage: 'about' }))
  )
  return list
}

export function runCommand(id: string): void {
  allCommands()
    .find((c) => c.id === id)
    ?.run()
}
