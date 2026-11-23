import type { JSONContent } from '@tiptap/core'
import type { FileKind, RecoveryEntry } from '@shared/types'
import { useApp, getEditor, type DocTab } from '@/state/store'
import { parsePed, serializePed, PasswordRequiredError } from './ped'
import { importDocx } from './docx-import'
import { exportDocx } from './docx-export'
import { htmlToMarkdown, markdownToHtml, standaloneHtml, textToHtml } from './convert'
import { buildPrintJob } from './print'
import { TEMPLATES } from './templates'
import { defaultMeta, defaultPage, defaultStyles } from './defaults'
import type { PedPayload } from './types'
import { collectHeadings } from '@/editor/ext/references'
import { basicStats, docText } from './textstats'
import { mmToPx } from './units'
import { uid } from './units'

export const OPEN_FILTERS = [
  { name: 'All documents', extensions: ['ped', 'docx', 'md', 'markdown', 'html', 'htm', 'txt'] },
  { name: 'Personal Editor document', extensions: ['ped'] },
  { name: 'Word document', extensions: ['docx'] },
  { name: 'Markdown', extensions: ['md', 'markdown'] },
  { name: 'Web page', extensions: ['html', 'htm'] },
  { name: 'Plain text', extensions: ['txt'] }
]

export const SAVE_FORMATS: { kind: FileKind; name: string; ext: string; editable: boolean }[] = [
  { kind: 'ped', name: 'Personal Editor document', ext: 'ped', editable: true },
  { kind: 'docx', name: 'Word document', ext: 'docx', editable: true },
  { kind: 'pdf', name: 'PDF', ext: 'pdf', editable: false },
  { kind: 'html', name: 'Web page', ext: 'html', editable: false },
  { kind: 'md', name: 'Markdown', ext: 'md', editable: false },
  { kind: 'txt', name: 'Plain text', ext: 'txt', editable: false }
]

export const basename = (p: string): string => p.split(/[\\/]/).pop() ?? p
export const stripExt = (n: string): string => n.replace(/\.[^.]+$/, '')
const extOf = (p: string): string => (p.split('.').pop() ?? '').toLowerCase()

function kindOf(path: string): FileKind {
  const e = extOf(path)
  if (e === 'ped') return 'ped'
  if (e === 'docx') return 'docx'
  if (e === 'md' || e === 'markdown') return 'md'
  if (e === 'html' || e === 'htm') return 'html'
  if (e === 'txt') return 'txt'
  if (e === 'pdf') return 'pdf'
  return 'unknown'
}

const st = (): ReturnType<typeof useApp.getState> => useApp.getState()

// ------------------------------------------------------------------ new

let untitledCounter = 1

export function newDocument(templateId = 'blank'): string {
  const t = TEMPLATES.find((x) => x.id === templateId) ?? TEMPLATES[0]
  const s = st().settings
  const styles = { ...defaultStyles(s.defaultFont, s.defaultFontSize), ...(t.styles ?? {}) }
  const page = { ...defaultPage(), ...(t.page ?? {}) }
  const title = templateId === 'blank' ? `Document ${untitledCounter++}` : t.name
  return st().addDoc({
    title,
    page,
    styles,
    meta: { ...defaultMeta(title), author: s.userName },
    initial: { html: t.html },
    dirty: false
  })
}

// ------------------------------------------------------------------ open

export async function openFileDialog(): Promise<void> {
  const info = await window.pe.app.info()
  const paths = await window.pe.dialog.open({ title: 'Open', filters: OPEN_FILTERS, multi: true, defaultPath: info.documents })
  for (const p of paths) await openPath(p)
}

export async function openPath(path: string, password?: string): Promise<string | null> {
  const existing = st().docs.find((d) => d.path === path)
  if (existing) {
    st().set({ activeId: existing.id, backstage: null })
    return existing.id
  }
  const kind = kindOf(path)
  const name = stripExt(basename(path))
  try {
    const bytes = await window.pe.fs.read(path)
    let id: string
    if (kind === 'ped') {
      let payload: PedPayload
      try {
        payload = await parsePed(bytes, password)
      } catch (err) {
        if (err instanceof PasswordRequiredError) {
          st().openDialog('password', { path, wrong: err.wrong })
          return null
        }
        throw err
      }
      const clash = st().docs.some((d) => d.id === payload.docId)
      id = st().addDoc({
        id: clash ? uid('d') : payload.docId,
        title: name,
        path,
        format: 'ped',
        page: payload.page,
        styles: payload.styles,
        meta: payload.meta,
        comments: payload.comments,
        sources: payload.sources,
        password: password ?? null,
        initial: { json: payload.content },
        lastSavedAt: Date.now()
      })
    } else if (kind === 'docx') {
      const r = await importDocx(bytes)
      const page = { ...defaultPage(), ...r.page }
      id = st().addDoc({
        title: name,
        path,
        format: 'docx',
        page,
        meta: { ...defaultMeta(r.meta.title || name), ...stripEmpty(r.meta) },
        initial: { html: r.html },
        notice: r.messages.length ? `Some Word features were simplified when opening this file (${r.messages.length} note${r.messages.length > 1 ? 's' : ''}).` : null
      })
    } else if (kind === 'md' || kind === 'html' || kind === 'txt') {
      const text = new TextDecoder().decode(bytes)
      let html = text
      if (kind === 'md') html = markdownToHtml(text)
      else if (kind === 'txt') html = textToHtml(text)
      else {
        const d = new DOMParser().parseFromString(text, 'text/html')
        html = d.body.innerHTML
      }
      id = st().addDoc({ title: name, path, format: kind, initial: { html } })
    } else {
      throw new Error('Personal Editor can open .ped, .docx, .md, .html and .txt files.')
    }
    void window.pe.recents.touch({ path, title: name, docId: id })
    return id
  } catch (err) {
    st().toast(`Couldn't open ${basename(path)}: ${(err as Error).message}`, 'error')
    return null
  }
}

const stripEmpty = <T extends object>(o: T): Partial<T> => Object.fromEntries(Object.entries(o).filter(([, v]) => v)) as Partial<T>

// ------------------------------------------------------------------ payloads

export function payloadOf(doc: DocTab): PedPayload {
  const editor = getEditor(doc.id)
  const content: JSONContent = editor ? editor.getJSON() : (doc.initial.json ?? { type: 'doc', content: [{ type: 'paragraph' }] })
  return {
    docId: doc.id,
    content,
    page: doc.page,
    styles: doc.styles,
    meta: { ...doc.meta, modified: Date.now(), title: doc.meta.title || doc.title },
    comments: doc.comments,
    sources: doc.sources
  }
}

function contentWidthPx(doc: DocTab): number {
  const land = doc.page.orientation === 'landscape'
  const w = land ? doc.page.heightMm : doc.page.widthMm
  return mmToPx(w - doc.page.margins.left - doc.page.margins.right)
}

// ------------------------------------------------------------------ save

async function writeAs(doc: DocTab, path: string, kind: FileKind): Promise<void> {
  const editor = getEditor(doc.id)
  if (!editor) throw new Error('The document is not ready yet.')
  switch (kind) {
    case 'ped': {
      const bytes = await serializePed(payloadOf(doc), doc.password)
      await window.pe.fs.write(path, bytes)
      break
    }
    case 'docx': {
      const bytes = await exportDocx({
        content: editor.getJSON(),
        page: doc.page,
        styles: doc.styles,
        meta: { ...doc.meta, title: doc.meta.title || doc.title },
        comments: doc.comments,
        sources: doc.sources,
        headingPages: editor.storage.pagination.result.headingPages,
        headings: collectHeadings(editor.state.doc),
        contentWidthPx: contentWidthPx(doc)
      })
      await window.pe.fs.write(path, bytes)
      break
    }
    case 'pdf': {
      const job = await ensurePrintable(doc)
      const bytes = await window.pe.print.pdf(job)
      await window.pe.fs.write(path, bytes)
      break
    }
    case 'html':
      await window.pe.fs.write(path, standaloneHtml(doc.meta.title || doc.title, editor.getHTML(), doc.styles))
      break
    case 'md':
      await window.pe.fs.write(path, htmlToMarkdown(editor.getHTML()))
      break
    case 'txt':
      await window.pe.fs.write(path, editor.getText({ blockSeparator: '\n\n' }))
      break
    default:
      throw new Error('Unsupported format')
  }
}

/** Print/PDF needs the paginated print layout on screen. */
export async function ensurePrintable(doc: DocTab): Promise<import('@shared/types').PrintJob> {
  const s = st()
  let switched = false
  if (s.view !== 'print' || s.activeId !== doc.id) {
    s.set({ view: 'print', activeId: doc.id })
    switched = true
  }
  if (s.editingHeaderFooter) s.set({ editingHeaderFooter: false })
  if (switched) await new Promise((r) => setTimeout(r, 450))
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  return buildPrintJob(st().docs.find((d) => d.id === doc.id) ?? doc)
}

export async function saveDoc(id: string, opts: { saveAs?: boolean } = {}): Promise<boolean> {
  const doc = st().docs.find((d) => d.id === id)
  if (!doc) return false
  if (opts.saveAs || !doc.path || (doc.format !== 'ped' && doc.format !== 'docx')) {
    return saveAsDialog(id)
  }
  return saveTo(doc, doc.path, doc.format)
}

export async function saveTo(doc: DocTab, path: string, kind: FileKind): Promise<boolean> {
  const format = SAVE_FORMATS.find((f) => f.kind === kind)
  st().updateDoc(doc.id, { saving: 'saving' })
  try {
    await writeAs(doc, path, kind)
  } catch (err) {
    st().updateDoc(doc.id, { saving: 'error' })
    st().toast(`Couldn't save: ${(err as Error).message}`, 'error')
    return false
  }
  if (format?.editable) {
    const title = stripExt(basename(path))
    const counterAtSave = doc.changeCounter
    st().updateDoc(doc.id, (d) => ({
      path,
      format: kind,
      title,
      dirty: d.changeCounter !== counterAtSave,
      saving: 'saved',
      lastSavedAt: Date.now()
    }))
    void afterSave(doc.id, path, title)
  } else {
    st().updateDoc(doc.id, { saving: 'idle' })
    st().toast(`Exported ${basename(path)}`, 'success', { label: 'Show in folder', run: () => void window.pe.shell.showItem(path) })
  }
  return true
}

async function afterSave(id: string, path: string, title: string): Promise<void> {
  const doc = st().docs.find((d) => d.id === id)
  const editor = getEditor(id)
  if (!doc || !editor) return
  const stats = basicStats(editor.state.doc)
  const text = docText(editor.state.doc)
  await window.pe.recents.touch({ path, title, docId: id, excerpt: text.slice(0, 280), words: stats.words })
  await window.pe.recovery.remove(id)
  await window.pe.library.index({ docId: id, path, title, text, words: stats.words, modified: Date.now() })
  await snapshot(id, 'save')
}

export async function saveAsDialog(id: string, preferred?: FileKind): Promise<boolean> {
  const doc = st().docs.find((d) => d.id === id)
  if (!doc) return false
  const info = await window.pe.app.info()
  const base = doc.path ? stripExt(doc.path) : `${info.documents}/${doc.title}`
  const order = preferred ? [SAVE_FORMATS.find((f) => f.kind === preferred)!, ...SAVE_FORMATS.filter((f) => f.kind !== preferred)] : SAVE_FORMATS
  const first = order[0]
  const path = await window.pe.dialog.save({
    title: preferred && !first.editable ? `Export as ${first.name}` : 'Save As',
    defaultPath: `${base}.${first.ext}`,
    filters: order.map((f) => ({ name: f.name, extensions: [f.ext] }))
  })
  if (!path) return false
  let kind = kindOf(path)
  let finalPath = path
  if (kind === 'unknown') {
    kind = first.kind
    finalPath = `${path}.${first.ext}`
  }
  return saveTo(doc, finalPath, kind)
}

export async function exportAs(id: string, kind: FileKind): Promise<boolean> {
  return saveAsDialog(id, kind)
}

// ------------------------------------------------------------------ versions & recovery

export async function snapshot(id: string, reason: 'auto' | 'save' | 'manual' | 'restore', label?: string): Promise<void> {
  const doc = st().docs.find((d) => d.id === id)
  const editor = getEditor(id)
  if (!doc || !editor) return
  const payload = payloadOf(doc)
  const words = basicStats(editor.state.doc).words
  await window.pe.versions.add(id, JSON.stringify(payload), { reason, label, title: doc.title, words })
}

export async function writeRecovery(id: string): Promise<void> {
  const doc = st().docs.find((d) => d.id === id)
  if (!doc || !getEditor(id)) return
  const entry: RecoveryEntry = {
    docId: id,
    title: doc.title,
    path: doc.path,
    updatedAt: Date.now(),
    data: JSON.stringify({ ...payloadOf(doc), format: doc.format })
  }
  await window.pe.recovery.write(entry)
}

export function openPayload(payload: PedPayload & { format?: FileKind }, opts: { title: string; path?: string | null; dirty?: boolean; asCopy?: boolean }): string {
  const clash = st().docs.some((d) => d.id === payload.docId)
  return st().addDoc({
    id: clash || opts.asCopy ? uid('d') : payload.docId,
    title: opts.title,
    path: opts.asCopy ? null : (opts.path ?? null),
    format: opts.asCopy ? 'ped' : (payload.format ?? 'ped'),
    page: payload.page,
    styles: payload.styles,
    meta: payload.meta,
    comments: payload.comments,
    sources: payload.sources,
    initial: { json: payload.content },
    dirty: opts.dirty ?? true
  })
}

export async function restoreRecovery(entry: RecoveryEntry): Promise<void> {
  try {
    const payload = JSON.parse(entry.data) as PedPayload & { format?: FileKind }
    openPayload(payload, { title: entry.title, path: entry.path, dirty: true })
    st().toast(`Recovered "${entry.title}". Save it to keep your changes.`, 'success')
  } catch {
    st().toast("Couldn't recover that document.", 'error')
  }
}

// ------------------------------------------------------------------ close

export async function closeDoc(id: string): Promise<boolean> {
  const doc = st().docs.find((d) => d.id === id)
  if (!doc) return true
  if (doc.dirty) {
    const choice = await window.pe.dialog.message({
      type: 'question',
      title: 'Personal Editor',
      message: `Do you want to save your changes to "${doc.title}"?`,
      detail: "If you don't save, your changes since the last save will be lost.",
      buttons: ['Save', "Don't Save", 'Cancel'],
      defaultId: 0,
      cancelId: 2
    })
    if (choice === 2) return false
    if (choice === 0) {
      const ok = await saveDoc(id)
      if (!ok) return false
    }
  }
  await window.pe.recovery.remove(id)
  st().removeDoc(id)
  return true
}

export async function closeAllAndQuit(): Promise<void> {
  for (const d of [...st().docs]) {
    const ok = await closeDoc(d.id)
    if (!ok) return
  }
  await window.pe.app.closeConfirmed()
}

// ------------------------------------------------------------------ print

export async function printDoc(id: string, opts: import('@shared/types').PrintOptions): Promise<void> {
  const doc = st().docs.find((d) => d.id === id)
  if (!doc) return
  try {
    const job = await ensurePrintable(doc)
    const res = await window.pe.print.print(job, opts)
    if (res.success) st().toast('Sent to the printer', 'success')
    else if (res.reason && res.reason !== 'cancelled') st().toast(`Printing failed: ${res.reason}`, 'error')
  } catch (err) {
    st().toast(`Printing failed: ${(err as Error).message}`, 'error')
  }
}

export async function saveAsTemplate(id: string, name: string): Promise<void> {
  const doc = st().docs.find((d) => d.id === id)
  if (!doc) return
  const bytes = await serializePed(payloadOf(doc))
  await window.pe.templates.save(name, bytes)
  st().toast(`Saved "${name}" to your templates`, 'success')
}

export async function newFromUserTemplate(templateId: string, name: string): Promise<void> {
  const bytes = await window.pe.templates.read(templateId)
  if (!bytes) return
  const payload = await parsePed(bytes)
  openPayload({ ...payload, docId: uid('d') }, { title: name, dirty: false, asCopy: true })
}
