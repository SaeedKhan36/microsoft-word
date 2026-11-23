import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'
import type {
  AppSettings,
  ContextMenuParams,
  LibraryEntry,
  LibraryHit,
  PrinterInfo,
  PrintJob,
  PrintOptions,
  RecentFile,
  RecoveryEntry,
  VersionEntry
} from '../shared/types'

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args) as Promise<T>

function on<T extends unknown[]>(channel: string, cb: (...args: T) => void): () => void {
  const handler = (_e: Electron.IpcRendererEvent, ...args: unknown[]): void => cb(...(args as T))
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

interface DialogFilter {
  name: string
  extensions: string[]
}

const api = {
  platform: process.platform,
  fs: {
    read: (path: string) => invoke<Uint8Array>('fs:read', path),
    write: (path: string, data: Uint8Array | string) => invoke<void>('fs:write', path, data),
    exists: (path: string) => invoke<boolean>('fs:exists', path),
    stat: (path: string) => invoke<{ size: number; mtime: number; isFile: boolean } | null>('fs:stat', path),
    pathForFile: (file: File) => {
      try {
        return webUtils.getPathForFile(file)
      } catch {
        return ''
      }
    }
  },
  dialog: {
    open: (opts: { title?: string; filters?: DialogFilter[]; multi?: boolean; defaultPath?: string }) =>
      invoke<string[]>('dialog:open', {
        title: opts.title,
        defaultPath: opts.defaultPath,
        filters: opts.filters,
        properties: opts.multi ? ['openFile', 'multiSelections'] : ['openFile']
      }),
    save: (opts: { title?: string; defaultPath?: string; filters?: DialogFilter[] }) =>
      invoke<string | null>('dialog:save', opts),
    message: (opts: {
      type?: 'none' | 'info' | 'error' | 'question' | 'warning'
      title?: string
      message: string
      detail?: string
      buttons?: string[]
      defaultId?: number
      cancelId?: number
    }) => invoke<number>('dialog:message', opts)
  },
  shell: {
    openExternal: (url: string) => invoke<void>('shell:openExternal', url),
    showItem: (path: string) => invoke<void>('shell:showItem', path)
  },
  clipboard: {
    readText: () => invoke<string>('clipboard:readText'),
    writeText: (text: string) => invoke<void>('clipboard:writeText', text),
    readImage: () => invoke<string | null>('clipboard:readImage'),
    paste: () => invoke<void>('app:paste'),
    pastePlain: () => invoke<void>('app:pastePlain')
  },
  app: {
    info: () =>
      invoke<{ version: string; platform: string; documents: string; userData: string; isDev: boolean }>('app:info'),
    pendingFiles: () => invoke<string[]>('app:pendingFiles'),
    closeConfirmed: () => invoke<void>('app:closeConfirmed'),
    setTitle: (t: string) => invoke<void>('app:setTitle', t),
    toggleFullscreen: () => invoke<boolean>('app:toggleFullscreen'),
    setFullscreen: (on: boolean) => invoke<void>('app:setFullscreen', on),
    titleBarOverlay: (colors: { color: string; symbolColor: string }) => invoke<void>('app:titleBarOverlay', colors),
    systemDark: () => invoke<boolean>('app:systemDark'),
    onOpenFile: (cb: (path: string) => void) => on<[string]>('app:open-file', cb),
    onBeforeClose: (cb: () => void) => on<[]>('app:before-close', cb),
    onContextMenu: (cb: (p: ContextMenuParams) => void) => on<[ContextMenuParams]>('app:context-menu', cb),
    onSystemTheme: (cb: (dark: boolean) => void) => on<[boolean]>('app:system-theme', cb),
    onFullscreen: (cb: (on: boolean) => void) => on<[boolean]>('app:fullscreen', cb)
  },
  spell: {
    replace: (word: string) => invoke<void>('spell:replace', word),
    add: (word: string) => invoke<void>('spell:add', word),
    languages: () => invoke<string[]>('spell:languages'),
    setLanguages: (langs: string[]) => invoke<void>('spell:setLanguages', langs),
    isMisspelled: (word: string): boolean => {
      try {
        return webFrame.isWordMisspelled(word)
      } catch {
        return false
      }
    },
    suggestions: (word: string): string[] => {
      try {
        return webFrame.getWordSuggestions(word)
      } catch {
        return []
      }
    }
  },
  fonts: { list: () => invoke<string[]>('fonts:list') },
  print: {
    printers: () => invoke<PrinterInfo[]>('print:printers'),
    pdf: (job: PrintJob, opts?: { pageRanges?: string }) => invoke<Uint8Array>('print:pdf', job, opts),
    print: (job: PrintJob, opts: PrintOptions) => invoke<{ success: boolean; reason?: string }>('print:print', job, opts),
    getJob: () => invoke<PrintJob | null>('print:getJob'),
    ready: () => invoke<void>('print:ready')
  },
  settings: {
    get: () => invoke<AppSettings>('settings:get'),
    set: (patch: Partial<AppSettings>) => invoke<AppSettings>('settings:set', patch)
  },
  recents: {
    list: () => invoke<RecentFile[]>('recents:list'),
    touch: (entry: Omit<RecentFile, 'openedAt'>) => invoke<RecentFile[]>('recents:touch', entry),
    update: (path: string, patch: Partial<RecentFile>) => invoke<RecentFile[]>('recents:update', path, patch),
    remove: (path: string) => invoke<RecentFile[]>('recents:remove', path)
  },
  versions: {
    list: (docId: string) => invoke<VersionEntry[]>('versions:list', docId),
    add: (docId: string, data: string, meta: { reason: VersionEntry['reason']; label?: string; title: string; words: number }) =>
      invoke<VersionEntry>('versions:add', docId, data, meta),
    get: (docId: string, id: string) => invoke<string | null>('versions:get', docId, id),
    remove: (docId: string, id: string) => invoke<void>('versions:delete', docId, id),
    rename: (docId: string, id: string, label: string) => invoke<void>('versions:rename', docId, id, label)
  },
  recovery: {
    write: (entry: RecoveryEntry) => invoke<void>('recovery:write', entry),
    remove: (docId: string) => invoke<void>('recovery:remove', docId),
    list: () => invoke<RecoveryEntry[]>('recovery:list')
  },
  library: {
    index: (entry: LibraryEntry) => invoke<void>('library:index', entry),
    search: (q: string) => invoke<LibraryHit[]>('library:search', q)
  },
  templates: {
    list: () => invoke<{ id: string; name: string; createdAt: number }[]>('templates:list'),
    save: (name: string, data: Uint8Array) => invoke<{ id: string; name: string }>('templates:save', name, data),
    read: (id: string) => invoke<Uint8Array | null>('templates:read', id),
    remove: (id: string) => invoke<void>('templates:delete', id)
  },
  dev: {
    shot: (name: string) => invoke<string>('dev:shot', name)
  }
}

export type PersonalEditorApi = typeof api

contextBridge.exposeInMainWorld('pe', api)
