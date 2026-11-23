import { create } from 'zustand'
import type { Editor, JSONContent } from '@tiptap/core'
import { DEFAULT_SETTINGS, type AppSettings, type FileKind, type ContextMenuParams } from '@shared/types'
import type { CommentThread, DocMeta, DocStats, DocStyles, PageSettings, Source } from '@/lib/types'
import type { PaginationResult } from '@/editor/ext/pagination'
import { defaultMeta, defaultPage, defaultStyles } from '@/lib/defaults'
import { uid } from '@/lib/units'

export type BackstagePage = 'home' | 'new' | 'open' | 'info' | 'saveas' | 'print' | 'export' | 'options' | 'about'
export type RightPane = 'comments' | 'changes' | 'versions' | 'styles' | 'spelling' | 'handwriting'
export type DrawTool = 'select' | 'pen' | 'pencil' | 'highlighter' | 'eraser'

export interface DocTab {
  id: string
  title: string
  path: string | null
  format: FileKind
  dirty: boolean
  page: PageSettings
  styles: DocStyles
  meta: DocMeta
  comments: CommentThread[]
  sources: Source[]
  password: string | null
  initial: { json?: JSONContent; html?: string }
  readOnly: boolean
  trackChanges: boolean
  markup: 'all' | 'simple' | 'none' | 'original'
  pagination: PaginationResult
  stats: DocStats
  lastSavedAt: number | null
  saving: 'idle' | 'saving' | 'saved' | 'error'
  notice?: string | null
  changeCounter: number
}

export interface Toast {
  id: string
  text: string
  kind: 'info' | 'success' | 'error'
  action?: { label: string; run: () => void }
}

export interface DialogState {
  type: string
  props?: Record<string, unknown>
}

export interface Pen {
  tool: 'pen' | 'pencil' | 'highlighter'
  color: string
  size: number
}

export interface AppState {
  docs: DocTab[]
  activeId: string | null
  settings: AppSettings
  fonts: string[]
  systemDark: boolean
  platform: string
  backstage: BackstagePage | null
  ribbonTab: string
  ribbonCollapsed: boolean
  leftPane: boolean
  navTab: 'headings' | 'results' | 'pages'
  rightPane: RightPane | null
  view: 'print' | 'web' | 'read'
  focusMode: boolean
  zoom: number
  showGrid: boolean
  find: { open: boolean; replace: boolean }
  dialog: DialogState | null
  draw: { tool: DrawTool; pens: Pen[]; activePen: number }
  formatPainter: { marks: JSONContent['marks']; paragraph: Record<string, unknown> | null; sticky: boolean } | null
  toasts: Toast[]
  editingHeaderFooter: boolean
  contextMenu: (ContextMenuParams & { clientX: number; clientY: number }) | null
  activeCommentId: string | null
  isFullscreen: boolean
  palette: boolean
  sessionStart: number
  sessionStartWords: Record<string, number>

  addDoc: (doc: Partial<DocTab> & { initial: DocTab['initial'] }) => string
  updateDoc: (id: string, patch: Partial<DocTab> | ((d: DocTab) => Partial<DocTab>)) => void
  removeDoc: (id: string) => void
  setActive: (id: string | null) => void
  setSettings: (patch: Partial<AppSettings>) => void
  set: (patch: Partial<AppState>) => void
  openDialog: (type: string, props?: Record<string, unknown>) => void
  closeDialog: () => void
  toast: (text: string, kind?: Toast['kind'], action?: Toast['action']) => void
  dismissToast: (id: string) => void
}

const emptyStats: DocStats = { words: 0, chars: 0, charsNoSpaces: 0, paragraphs: 0, pages: 1, currentPage: 1, selectionWords: 0 }

export const useApp = create<AppState>((set, get) => ({
  docs: [],
  activeId: null,
  settings: DEFAULT_SETTINGS,
  fonts: [],
  systemDark: false,
  platform: 'win32',
  backstage: null,
  ribbonTab: 'home',
  ribbonCollapsed: false,
  leftPane: false,
  navTab: 'headings',
  rightPane: null,
  view: 'print',
  focusMode: false,
  zoom: 1,
  showGrid: false,
  find: { open: false, replace: false },
  dialog: null,
  draw: {
    tool: 'select',
    pens: [
      { tool: 'pen', color: '#1a1a1a', size: 3 },
      { tool: 'pen', color: '#d32f2f', size: 3 },
      { tool: 'pen', color: '#1e5bd8', size: 3 },
      { tool: 'pencil', color: '#455a64', size: 2 },
      { tool: 'highlighter', color: '#ffeb3b', size: 14 },
      { tool: 'highlighter', color: '#7ee787', size: 14 }
    ],
    activePen: 0
  },
  formatPainter: null,
  toasts: [],
  editingHeaderFooter: false,
  contextMenu: null,
  activeCommentId: null,
  isFullscreen: false,
  palette: false,
  sessionStart: Date.now(),
  sessionStartWords: {},

  addDoc: (doc) => {
    const s = get().settings
    const id = doc.id ?? uid('d')
    const tab: DocTab = {
      id,
      title: doc.title ?? 'Document',
      path: doc.path ?? null,
      format: doc.format ?? 'ped',
      dirty: doc.dirty ?? false,
      page: doc.page ?? defaultPage(),
      styles: doc.styles ?? defaultStyles(s.defaultFont, s.defaultFontSize),
      meta: doc.meta ?? { ...defaultMeta(doc.title ?? 'Document'), author: s.userName },
      comments: doc.comments ?? [],
      sources: doc.sources ?? [],
      password: doc.password ?? null,
      initial: doc.initial,
      readOnly: doc.readOnly ?? false,
      trackChanges: doc.trackChanges ?? false,
      markup: 'all',
      pagination: { pages: 1, pageStarts: [0], footnotes: [[]], footnoteHeights: [0], headingPages: {} },
      stats: { ...emptyStats },
      lastSavedAt: doc.lastSavedAt ?? null,
      saving: 'idle',
      notice: doc.notice ?? null,
      changeCounter: 0
    }
    set((st) => ({ docs: [...st.docs, tab], activeId: id, backstage: null }))
    return id
  },
  updateDoc: (id, patch) =>
    set((st) => ({
      docs: st.docs.map((d) => (d.id === id ? { ...d, ...(typeof patch === 'function' ? patch(d) : patch) } : d))
    })),
  removeDoc: (id) =>
    set((st) => {
      const idx = st.docs.findIndex((d) => d.id === id)
      const docs = st.docs.filter((d) => d.id !== id)
      let activeId = st.activeId
      if (activeId === id) activeId = docs[Math.min(idx, docs.length - 1)]?.id ?? null
      return { docs, activeId, backstage: docs.length ? st.backstage : 'home' }
    }),
  setActive: (id) => set({ activeId: id }),
  setSettings: (patch) => {
    set((st) => ({ settings: { ...st.settings, ...patch } }))
    void window.pe?.settings.set(patch)
  },
  set: (patch) => set(patch),
  openDialog: (type, props) => set({ dialog: { type, props } }),
  closeDialog: () => set({ dialog: null }),
  toast: (text, kind = 'info', action) => {
    const id = uid('t')
    set((st) => ({ toasts: [...st.toasts.slice(-3), { id, text, kind, action }] }))
    setTimeout(() => get().dismissToast(id), action ? 7000 : 3800)
  },
  dismissToast: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) }))
}))

// ---------------------------------------------------------------- editor registry

const editors = new Map<string, Editor>()

export function registerEditor(id: string, editor: Editor): void {
  editors.set(id, editor)
}
export function unregisterEditor(id: string): void {
  editors.delete(id)
}
export function getEditor(id: string | null | undefined): Editor | null {
  return id ? (editors.get(id) ?? null) : null
}
export function activeEditor(): Editor | null {
  return getEditor(useApp.getState().activeId)
}
export function activeDoc(): DocTab | null {
  const st = useApp.getState()
  return st.docs.find((d) => d.id === st.activeId) ?? null
}
export function useActiveDoc(): DocTab | null {
  return useApp((st) => st.docs.find((d) => d.id === st.activeId) ?? null)
}

export function markDirty(id: string): void {
  const d = useApp.getState().docs.find((x) => x.id === id)
  if (!d) return
  useApp.getState().updateDoc(id, (doc) => ({ dirty: true, changeCounter: doc.changeCounter + 1, saving: doc.saving === 'saved' ? 'idle' : doc.saving }))
}
