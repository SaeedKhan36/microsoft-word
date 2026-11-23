import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  nativeTheme,
  screen,
  session,
  shell,
  Menu,
  type OpenDialogOptions,
  type SaveDialogOptions,
  type MessageBoxOptions,
  type WebContents
} from 'electron'
import { join, extname, resolve } from 'path'
import { promises as fs, existsSync, statSync, readFileSync, mkdirSync, writeFileSync } from 'fs'
import type { PrintJob, PrintOptions, ContextMenuParams, AppSettings } from '@shared/types'
import * as store from './store'
import { transcribeImage } from './ai'

const isDev = !app.isPackaged && !!process.env['ELECTRON_RENDERER_URL']
if (process.env['PE_AUTOTEST']) app.setPath('userData', join(app.getPath('temp'), 'personal-editor-autotest'))
const OPENABLE = new Set(['.ped', '.docx', '.html', '.htm', '.md', '.markdown', '.txt'])

let mainWindow: BrowserWindow | null = null
let allowClose = false
const pendingFiles: string[] = []

// ------------------------------------------------------------------ single instance

function collectFiles(argv: string[], cwd = process.cwd()): string[] {
  const out: string[] = []
  for (const arg of argv.slice(1)) {
    if (!arg || arg.startsWith('-')) continue
    const full = resolve(cwd, arg)
    if (OPENABLE.has(extname(full).toLowerCase()) && existsSync(full)) {
      try {
        if (statSync(full).isFile()) out.push(full)
      } catch {
        /* ignore */
      }
    }
  }
  return out
}

// ------------------------------------------------------------------ graphics safe mode
// Some PCs (old or missing graphics drivers, remote desktops, locked-down or sandboxed accounts)
// can't start Chromium's separate GPU process. If that happens once, we remember it and from then on
// render in software inside the main process, which works everywhere.

const safeModeFlag = (): string => join(app.getPath('userData'), 'graphics-safe-mode')
const safeMode = process.argv.includes('--safe-graphics') || process.env['PE_SAFE_GRAPHICS'] === '1' || existsSync(safeModeFlag())
if (safeMode) {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-gpu-compositing')
  app.commandLine.appendSwitch('in-process-gpu')
  app.commandLine.appendSwitch('disable-gpu-sandbox')
}
let relaunchingForGraphics = false
app.on('child-process-gone', (_e, details) => {
  if (details.type !== 'GPU' || safeMode || relaunchingForGraphics) return
  if (details.reason === 'clean-exit' || details.reason === 'killed') return
  relaunchingForGraphics = true
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(safeModeFlag(), `GPU process ${details.reason} (exit code ${details.exitCode}) at ${new Date().toISOString()}\n`)
  } catch {
    /* still relaunch with the switch */
  }
  app.relaunch({ args: [...process.argv.slice(1), '--safe-graphics'] })
  app.exit(0)
})

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv, cwd) => {
    const files = collectFiles(argv, cwd)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      for (const f of files) mainWindow.webContents.send('app:open-file', f)
    }
  })
  pendingFiles.push(...collectFiles(process.argv))
}

// ------------------------------------------------------------------ window

function rendererUrl(win: BrowserWindow, hash = ''): void {
  if (isDev) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'] + (hash ? `#${hash}` : ''))
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
  }
}

function themeColors(dark: boolean): { bg: string; symbol: string } {
  return dark ? { bg: '#1c1e24', symbol: '#e6e8ee' } : { bg: '#eef0f4', symbol: '#1f2430' }
}

function isDarkTheme(): boolean {
  const s = store.getSettings()
  return s.theme === 'dark' || (s.theme === 'system' && nativeTheme.shouldUseDarkColors)
}

function createWindow(): void {
  const state = store.getWindowState()
  const dark = isDarkTheme()
  const colors = themeColors(dark)
  // Make sure the saved position is still on a connected display.
  let { x, y } = state
  if (x !== undefined && y !== undefined) {
    const visible = screen.getAllDisplays().some((d) => {
      const b = d.workArea
      return x! >= b.x - 50 && y! >= b.y - 50 && x! < b.x + b.width - 100 && y! < b.y + b.height - 100
    })
    if (!visible) {
      x = undefined
      y = undefined
    }
  }
  const iconPath = app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(__dirname, '../../build/icon.png')
  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x,
    y,
    minWidth: 860,
    minHeight: 560,
    show: false,
    title: 'Personal Editor',
    backgroundColor: colors.bg,
    icon: existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay:
      process.platform === 'darwin' ? undefined : { color: colors.bg, symbolColor: colors.symbol, height: 40 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
      offscreen: !!process.env['PE_AUTOTEST'],
      backgroundThrottling: !process.env['PE_AUTOTEST']
    },
    paintWhenInitiallyHidden: true
  })

  if (state.maximized) mainWindow.maximize()

  mainWindow.once('ready-to-show', () => {
    if (!process.env['PE_AUTOTEST']) mainWindow?.show()
  })

  const saveState = (): void => {
    if (!mainWindow) return
    const b = mainWindow.getNormalBounds()
    void store.saveWindowState({ width: b.width, height: b.height, x: b.x, y: b.y, maximized: mainWindow.isMaximized() })
  }
  mainWindow.on('resized', saveState)
  mainWindow.on('moved', saveState)
  mainWindow.on('maximize', saveState)
  mainWindow.on('unmaximize', saveState)

  mainWindow.on('close', (e) => {
    if (allowClose || process.env['PE_AUTOTEST']) return
    e.preventDefault()
    mainWindow?.webContents.send('app:before-close')
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.on('enter-full-screen', () => mainWindow?.webContents.send('app:fullscreen', true))
  mainWindow.on('leave-full-screen', () => mainWindow?.webContents.send('app:fullscreen', false))

  wireWebContents(mainWindow.webContents)
  rendererUrl(mainWindow)

  if (process.env['PE_AUTOTEST']) runAutotest(mainWindow)
}

function wireWebContents(wc: WebContents): void {
  wc.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  wc.on('will-navigate', (e, url) => {
    const current = wc.getURL()
    if (url.split('#')[0] !== current.split('#')[0]) {
      e.preventDefault()
      if (/^(https?|mailto):/i.test(url)) void shell.openExternal(url)
    }
  })
  wc.on('context-menu', (_e, params) => {
    const payload: ContextMenuParams = {
      x: params.x,
      y: params.y,
      misspelledWord: params.misspelledWord,
      dictionarySuggestions: params.dictionarySuggestions,
      isEditable: params.isEditable,
      selectionText: params.selectionText,
      linkURL: params.linkURL
    }
    wc.send('app:context-menu', payload)
  })
  wc.on('before-input-event', (_e, input) => {
    if (isDev && input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 'i') {
      wc.toggleDevTools()
    }
  })
}

// ------------------------------------------------------------------ autotest (development only)

function runAutotest(win: BrowserWindow): void {
  const script = process.env['PE_AUTOTEST']!
  const outDir = process.env['PE_SHOT_DIR'] || join(process.cwd(), '.tmp-shots')
  win.webContents.on('console-message', (event) => {
    const e = event as unknown as { level: string | number; message: string }
    console.log(`[renderer:${e.level}] ${e.message}`)
  })
  win.webContents.once('did-finish-load', async () => {
    try {
      await new Promise((r) => setTimeout(r, 1200))
      const code = readFileSync(script, 'utf8')
      const result = await win.webContents.executeJavaScript(`(async () => { ${code} })()`, true)
      console.log('[autotest:result]', JSON.stringify(result))
      if (process.env['PE_AUTOTEST_OUT']) writeFileSync(process.env['PE_AUTOTEST_OUT'], JSON.stringify({ ok: true, result, safeMode }))
    } catch (err) {
      console.log('[autotest:error]', (err as Error).message)
      if (process.env['PE_AUTOTEST_OUT']) writeFileSync(process.env['PE_AUTOTEST_OUT'], JSON.stringify({ ok: false, error: (err as Error).message }))
    }
    setTimeout(() => app.exit(0), 300)
  })
  ipcMain.handle('dev:shot', async (_e, name: string) => {
    await fs.mkdir(outDir, { recursive: true })
    const img = await win.webContents.capturePage()
    const file = join(outDir, `${name}.png`)
    await fs.writeFile(file, img.toPNG())
    return file
  })
}

// ------------------------------------------------------------------ printing

const printJobs = new Map<number, PrintJob>()
const printReady = new Map<number, () => void>()

async function renderPrintJob(job: PrintJob): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    show: false,
    width: 1000,
    height: 1300,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      spellcheck: false
    },
    paintWhenInitiallyHidden: true
  })
  const id = win.webContents.id
  printJobs.set(id, job)
  const ready = new Promise<void>((resolveReady, reject) => {
    printReady.set(id, resolveReady)
    setTimeout(() => reject(new Error('The print preview took too long to render.')), 30000)
  })
  rendererUrl(win, 'print')
  try {
    await ready
  } finally {
    printJobs.delete(id)
    printReady.delete(id)
  }
  return win
}

ipcMain.handle('print:getJob', (e) => printJobs.get(e.sender.id) ?? null)
ipcMain.handle('print:ready', (e) => {
  printReady.get(e.sender.id)?.()
})

ipcMain.handle('print:pdf', async (_e, job: PrintJob, opts?: { pageRanges?: string }) => {
  const win = await renderPrintJob(job)
  try {
    const data = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: { marginType: 'none' },
      pageRanges: opts?.pageRanges || undefined,
      generateDocumentOutline: true,
      generateTaggedPDF: true
    })
    return new Uint8Array(data)
  } finally {
    win.destroy()
  }
})

function parseRanges(ranges?: string): { from: number; to: number }[] | undefined {
  if (!ranges || !ranges.trim()) return undefined
  const out: { from: number; to: number }[] = []
  for (const part of ranges.split(',')) {
    const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/)
    if (!m) continue
    const a = parseInt(m[1], 10)
    const b = m[2] ? parseInt(m[2], 10) : a
    out.push({ from: Math.max(0, Math.min(a, b) - 1), to: Math.max(0, Math.max(a, b) - 1) })
  }
  return out.length ? out : undefined
}

ipcMain.handle('print:print', async (_e, job: PrintJob, opts: PrintOptions) => {
  const win = await renderPrintJob(job)
  return new Promise<{ success: boolean; reason?: string }>((resolveDone) => {
    win.webContents.print(
      {
        silent: opts.silent ?? true,
        deviceName: opts.deviceName || undefined,
        copies: Math.max(1, opts.copies ?? 1),
        collate: opts.collate ?? true,
        color: opts.color ?? true,
        duplexMode: opts.duplex ?? 'simplex',
        pageRanges: parseRanges(opts.pageRanges),
        printBackground: true,
        margins: { marginType: 'none' },
        pageSize: { width: Math.round(job.pageWidthMm * 1000), height: Math.round(job.pageHeightMm * 1000) }
      },
      (success, reason) => {
        win.destroy()
        resolveDone({ success, reason })
      }
    )
  })
})

ipcMain.handle('print:printers', async () => {
  const wc = mainWindow?.webContents
  if (!wc) return []
  const printers = await wc.getPrintersAsync()
  return printers.map((p) => ({
    name: p.name,
    displayName: p.displayName || p.name,
    description: p.description,
    isDefault: (p as unknown as { isDefault?: boolean }).isDefault ?? false
  }))
})

// ------------------------------------------------------------------ files & dialogs

ipcMain.handle('fs:read', async (_e, path: string) => new Uint8Array(await fs.readFile(path)))
ipcMain.handle('fs:write', async (_e, path: string, data: Uint8Array | string) => {
  await store.atomicWrite(path, typeof data === 'string' ? data : Buffer.from(data))
})
ipcMain.handle('fs:exists', (_e, path: string) => existsSync(path))
ipcMain.handle('fs:stat', async (_e, path: string) => {
  try {
    const s = await fs.stat(path)
    return { size: s.size, mtime: s.mtimeMs, isFile: s.isFile() }
  } catch {
    return null
  }
})

ipcMain.handle('dialog:open', async (_e, opts: OpenDialogOptions) => {
  const res = await dialog.showOpenDialog(mainWindow!, opts)
  return res.canceled ? [] : res.filePaths
})
ipcMain.handle('dialog:save', async (_e, opts: SaveDialogOptions) => {
  const res = await dialog.showSaveDialog(mainWindow!, opts)
  return res.canceled ? null : res.filePath
})
ipcMain.handle('dialog:message', async (_e, opts: MessageBoxOptions) => {
  const res = await dialog.showMessageBox(mainWindow!, opts)
  return res.response
})

ipcMain.handle('shell:openExternal', async (_e, url: string) => {
  if (/^(https?|mailto):/i.test(url)) await shell.openExternal(url)
})
ipcMain.handle('shell:showItem', (_e, path: string) => shell.showItemInFolder(path))

// ------------------------------------------------------------------ clipboard

ipcMain.handle('clipboard:readText', () => clipboard.readText())
ipcMain.handle('clipboard:writeText', (_e, text: string) => clipboard.writeText(text))
ipcMain.handle('clipboard:readImage', () => {
  const img = clipboard.readImage()
  return img.isEmpty() ? null : img.toDataURL()
})
ipcMain.handle('app:paste', (e) => e.sender.paste())
ipcMain.handle('app:pastePlain', (e) => e.sender.pasteAndMatchStyle())

// ------------------------------------------------------------------ app

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  documents: app.getPath('documents'),
  userData: app.getPath('userData'),
  isDev
}))
ipcMain.handle('app:pendingFiles', () => pendingFiles.splice(0))
ipcMain.handle('app:closeConfirmed', () => {
  allowClose = true
  mainWindow?.close()
})
ipcMain.handle('app:setTitle', (_e, title: string) => mainWindow?.setTitle(title))
ipcMain.handle('app:toggleFullscreen', () => {
  if (!mainWindow) return false
  mainWindow.setFullScreen(!mainWindow.isFullScreen())
  return mainWindow.isFullScreen()
})
ipcMain.handle('app:setFullscreen', (_e, on: boolean) => mainWindow?.setFullScreen(on))
ipcMain.handle('app:titleBarOverlay', (_e, colors: { color: string; symbolColor: string }) => {
  if (process.platform === 'darwin' || !mainWindow) return
  try {
    mainWindow.setTitleBarOverlay({ ...colors, height: 40 })
  } catch {
    /* not supported on this platform */
  }
})
ipcMain.handle('app:systemDark', () => nativeTheme.shouldUseDarkColors)
nativeTheme.on('updated', () => mainWindow?.webContents.send('app:system-theme', nativeTheme.shouldUseDarkColors))

// ------------------------------------------------------------------ spelling

ipcMain.handle('spell:replace', (e, word: string) => e.sender.replaceMisspelling(word))
ipcMain.handle('spell:add', (_e, word: string) => session.defaultSession.addWordToSpellCheckerDictionary(word))
ipcMain.handle('spell:languages', () => session.defaultSession.availableSpellCheckerLanguages)
ipcMain.handle('spell:setLanguages', (_e, langs: string[]) => {
  if (process.platform === 'darwin') return
  const available = new Set(session.defaultSession.availableSpellCheckerLanguages)
  const valid = langs.filter((l: string) => available.has(l))
  if (valid.length) session.defaultSession.setSpellCheckerLanguages(valid)
})

// ------------------------------------------------------------------ fonts

let fontCache: string[] | null = null
ipcMain.handle('fonts:list', async () => {
  if (fontCache) return fontCache
  try {
    const { getFonts } = await import('font-list')
    const fonts = await getFonts({ disableQuoting: true })
    fontCache = Array.from(new Set(fonts.map((f) => f.trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    )
  } catch {
    fontCache = []
  }
  return fontCache
})

// ------------------------------------------------------------------ settings, recents, versions, recovery, library

ipcMain.handle('settings:get', () => store.getSettings())
ipcMain.handle('settings:set', async (_e, patch: Partial<AppSettings>) => {
  const s = await store.setSettings(patch)
  if (patch.theme && mainWindow) {
    const c = themeColors(isDarkTheme())
    mainWindow.setBackgroundColor(c.bg)
  }
  return s
})

ipcMain.handle('recents:list', () => store.listRecents())
ipcMain.handle('recents:touch', (_e, entry) => store.touchRecent(entry))
ipcMain.handle('recents:update', (_e, path: string, patch) => store.updateRecent(path, patch))
ipcMain.handle('recents:remove', (_e, path: string) => store.removeRecent(path))

ipcMain.handle('versions:list', (_e, docId: string) => store.listVersions(docId))
ipcMain.handle('versions:add', (_e, docId: string, data: string, meta) => store.addVersion(docId, data, meta))
ipcMain.handle('versions:get', (_e, docId: string, id: string) => store.getVersion(docId, id))
ipcMain.handle('versions:delete', (_e, docId: string, id: string) => store.deleteVersion(docId, id))
ipcMain.handle('versions:rename', (_e, docId: string, id: string, label: string) =>
  store.renameVersion(docId, id, label)
)

ipcMain.handle('recovery:write', (_e, entry) => store.writeRecovery(entry))
ipcMain.handle('recovery:remove', (_e, docId: string) => store.removeRecovery(docId))
ipcMain.handle('recovery:list', () => store.listRecovery())

ipcMain.handle('library:index', (_e, entry) => store.indexLibrary(entry))
ipcMain.handle('library:search', (_e, q: string) => store.searchLibrary(q))

ipcMain.handle('templates:list', () => store.listTemplates())
ipcMain.handle('templates:save', (_e, name: string, data: Uint8Array) => store.saveTemplate(name, data))
ipcMain.handle('templates:read', (_e, id: string) => store.readTemplate(id))
ipcMain.handle('templates:delete', (_e, id: string) => store.deleteTemplate(id))

ipcMain.handle('ai:transcribe', (_e, dataUrl: string) => transcribeImage(dataUrl))

// ------------------------------------------------------------------ lifecycle

app.whenReady().then(() => {
  app.setAppUserModelId('com.personaleditor.app')
  Menu.setApplicationMenu(null)

  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(['clipboard-sanitized-write', 'clipboard-read', 'local-fonts', 'fullscreen', 'speaker-selection'].includes(permission))
  })

  const s = store.getSettings()
  if (process.platform !== 'darwin') {
    try {
      const available = new Set(session.defaultSession.availableSpellCheckerLanguages)
      const langs = s.spellLanguages.filter((l: string) => available.has(l))
      if (langs.length) session.defaultSession.setSpellCheckerLanguages(langs)
    } catch {
      /* spellchecker unavailable */
    }
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('open-file', (e, path) => {
  // macOS: files opened from Finder.
  e.preventDefault()
  if (mainWindow) mainWindow.webContents.send('app:open-file', path)
  else pendingFiles.push(path)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
