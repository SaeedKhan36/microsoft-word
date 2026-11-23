import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useApp, activeDoc, getEditor } from './state/store'
import { TitleBar } from './components/TitleBar'
import { Ribbon } from './components/Ribbon'
import { StatusBar } from './components/StatusBar'
import { DocumentView } from './components/DocumentView'
import { CommandPalette, ContextMenu, DropOverlay, FindBar, SlashMenu, Toasts } from './components/Overlays'
import { TooltipLayer } from './components/ui'
import { Backstage } from './components/Backstage'
import { NavPane, RightPane } from './components/Panes'
import { Dialogs } from './components/dialogs/Dialogs'
import * as io from './lib/io'
import { runCommand, toggleFocusMode, openFind, copyFormat, applyFormat } from './state/commands'
import type { PrintJob } from '@shared/types'
import * as commands from './state/commands'
import { activeEditor } from './state/store'

// Test hook used by the automated UI checks (harmless in normal use).
;(window as unknown as Record<string, unknown>).__pe = { useApp, getEditor, activeEditor, io, commands, hw: () => import('./lib/handwriting') }

export function App(): ReactNode {
  if (location.hash === '#print') return <PrintHost />
  return <Shell />
}

// ------------------------------------------------------------------ hidden print window

function PrintHost(): ReactNode {
  const [job, setJob] = useState<PrintJob | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    document.documentElement.dataset.theme = 'light'
    void window.pe.print.getJob().then(setJob)
  }, [])
  useEffect(() => {
    if (!job || !ref.current) return
    const style = document.createElement('style')
    style.textContent = `@page { size: ${job.pageWidthMm}mm ${job.pageHeightMm}mm; margin: 0 }
      html, body, #root { height: auto !important; overflow: visible !important; background: #fff !important; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }`
    document.head.appendChild(style)
    document.title = job.docTitle
    ref.current.innerHTML = job.html
    const imgs = Array.from(ref.current.querySelectorAll('img'))
    void Promise.all([
      document.fonts.ready,
      ...imgs.map((img) => (img.complete ? Promise.resolve() : new Promise((r) => ((img.onload = r), (img.onerror = r)))))
    ]).then(() => setTimeout(() => void window.pe.print.ready(), 120))
  }, [job])
  return <div ref={ref} className="print-host" />
}

// ------------------------------------------------------------------ main window

function resolveTheme(theme: 'system' | 'light' | 'dark', systemDark: boolean): 'light' | 'dark' {
  return theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
}

function Shell(): ReactNode {
  const docs = useApp((s) => s.docs)
  const activeId = useApp((s) => s.activeId)
  const backstage = useApp((s) => s.backstage)
  const focusMode = useApp((s) => s.focusMode)
  const leftPane = useApp((s) => s.leftPane)
  const rightPane = useApp((s) => s.rightPane)
  const theme = useApp((s) => s.settings.theme)
  const systemDark = useApp((s) => s.systemDark)
  const doc = docs.find((d) => d.id === activeId) ?? null
  const [ready, setReady] = useState(false)

  // ---------------------------------------------------------------- boot
  useEffect(() => {
    const st = useApp.getState()
    void (async () => {
      const [settings, dark, info] = await Promise.all([window.pe.settings.get(), window.pe.app.systemDark(), window.pe.app.info()])
      st.set({ settings, systemDark: dark, platform: info.platform })
      const pending = await window.pe.app.pendingFiles()
      for (const f of pending) await io.openPath(f)
      if (!useApp.getState().docs.length) {
        if (settings.startup === 'blank') io.newDocument()
        else useApp.getState().set({ backstage: 'home' })
      }
      setReady(true)
      void window.pe.fonts.list().then((fonts) => useApp.getState().set({ fonts }))
    })()
    const offs = [
      window.pe.app.onOpenFile((p) => void io.openPath(p)),
      window.pe.app.onBeforeClose(() => void io.closeAllAndQuit()),
      window.pe.app.onSystemTheme((d) => useApp.getState().set({ systemDark: d })),
      window.pe.app.onFullscreen((on) => {
        useApp.getState().set({ isFullscreen: on })
        if (!on && useApp.getState().focusMode) useApp.getState().set({ focusMode: false })
      }),
      window.pe.app.onContextMenu((p) => useApp.getState().set({ contextMenu: { ...p, clientX: p.x, clientY: p.y } }))
    ]
    return () => offs.forEach((o) => o())
  }, [])

  // ---------------------------------------------------------------- theme
  useEffect(() => {
    const t = resolveTheme(theme, systemDark)
    document.documentElement.dataset.theme = t
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--chrome').trim() || (t === 'dark' ? '#1c1e24' : '#eef0f4')
    void window.pe.app.titleBarOverlay({ color: bg, symbolColor: t === 'dark' ? '#e6e8ee' : '#1f2430' })
  }, [theme, systemDark])

  // ---------------------------------------------------------------- window title
  useEffect(() => {
    const title = doc ? `${doc.title}${doc.dirty ? ' •' : ''} - Personal Editor` : 'Personal Editor'
    document.title = title
    void window.pe.app.setTitle(title)
  }, [doc?.title, doc?.dirty, doc])

  // ---------------------------------------------------------------- recovery, versions, autosave
  useEffect(() => {
    const recovered = new Map<string, number>()
    const versioned = new Map<string, { counter: number; at: number }>()
    const autosaveSeen = new Map<string, { counter: number; at: number }>()
    const timer = setInterval(() => {
      const st = useApp.getState()
      const now = Date.now()
      for (const d of st.docs) {
        if (!getEditor(d.id)) continue
        // Crash recovery buffer.
        if (d.dirty && recovered.get(d.id) !== d.changeCounter) {
          recovered.set(d.id, d.changeCounter)
          void io.writeRecovery(d.id)
        }
        // Automatic version snapshots.
        const v = versioned.get(d.id)
        if (!v) versioned.set(d.id, { counter: d.changeCounter, at: now })
        else if (v.counter !== d.changeCounter && now - v.at > st.settings.versionIntervalMin * 60_000) {
          versioned.set(d.id, { counter: d.changeCounter, at: now })
          void io.snapshot(d.id, 'auto')
        }
        // AutoSave for .ped documents that already live in a file. Word files are only written when
        // you press Save, so an opened .docx is never overwritten behind your back.
        if (st.settings.autoSave && d.path && d.dirty && d.format === 'ped' && d.saving !== 'saving') {
          const a = autosaveSeen.get(d.id)
          if (!a || a.counter !== d.changeCounter) autosaveSeen.set(d.id, { counter: d.changeCounter, at: now })
          else if (now - a.at > 3000) {
            autosaveSeen.set(d.id, { counter: -1, at: now })
            void io.saveDoc(d.id)
          }
        }
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // ---------------------------------------------------------------- keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const st = useApp.getState()
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      const d = activeDoc()
      const handled = (): void => {
        e.preventDefault()
        e.stopPropagation()
      }
      if (e.key === 'Escape') {
        if (st.dialog || st.palette || document.querySelector('.popover')) return
        if (st.formatPainter) return void (handled(), st.set({ formatPainter: null }))
        if (st.backstage && st.docs.length) return void (handled(), st.set({ backstage: null }))
        if (st.focusMode) return void (handled(), toggleFocusMode())
        if (st.editingHeaderFooter) return void (handled(), st.set({ editingHeaderFooter: false }))
        if (st.draw.tool !== 'select') return void (handled(), st.set({ draw: { ...st.draw, tool: 'select' } }))
        return
      }
      if ((e.altKey && k === 'q') || (mod && e.shiftKey && k === 'p')) return void (handled(), st.set({ palette: true }))
      if (e.key === 'F11') return void (handled(), toggleFocusMode())
      if (e.key === 'F12') return void (handled(), d && io.saveDoc(d.id, { saveAs: true }))
      if (e.key === 'F7') return void (handled(), st.set({ rightPane: 'spelling' }))
      if (!mod) return
      if (k === 'n' && !e.shiftKey) return void (handled(), io.newDocument())
      if (k === 'o') return void (handled(), io.openFileDialog())
      if (k === 's') return void (handled(), d && io.saveDoc(d.id, { saveAs: e.shiftKey }))
      if (k === 'p' && !e.shiftKey) return void (handled(), d && st.set({ backstage: 'print' }))
      if (k === 'w') return void (handled(), d && io.closeDoc(d.id))
      if (k === 'tab' && st.docs.length > 1) {
        handled()
        const idx = st.docs.findIndex((x) => x.id === st.activeId)
        const next = st.docs[(idx + (e.shiftKey ? -1 : 1) + st.docs.length) % st.docs.length]
        st.set({ activeId: next.id, backstage: null })
        return
      }
      if (!d || st.backstage) return
      if (k === 'f' && !e.shiftKey && !e.altKey) return void (handled(), openFind(false))
      if (k === 'h') return void (handled(), openFind(true))
      if (k === 'k') return void (handled(), st.openDialog('link'))
      if (k === 'd' && !e.shiftKey && !e.altKey) return void (handled(), st.openDialog('font'))
      if (k === 'f' && e.shiftKey) return void (handled(), st.openDialog('font'))
      if (k === 'g' && e.shiftKey) return void (handled(), st.openDialog('wordCount'))
      if (k === 'e' && e.shiftKey) return void (handled(), runCommand('review.track'))
      if (k === 'm' && e.altKey) return void (handled(), runCommand('ins.comment'))
      if (k === 'f' && e.altKey) return void (handled(), runCommand('ins.footnote'))
      if ((k === '*' || k === '8') && e.shiftKey) return void (handled(), runCommand('para.marks'))
      if (k === 'c' && e.shiftKey) return void (handled(), copyFormat(false))
      if (k === 'v' && e.shiftKey && st.formatPainter) return void (handled(), applyFormat())
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // ---------------------------------------------------------------- drag & drop files onto the window
  useEffect(() => {
    const over = (e: DragEvent): void => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }
    const drop = (e: DragEvent): void => {
      if ((e.target as HTMLElement).closest?.('.pe-doc')) return
      const files = Array.from(e.dataTransfer?.files ?? [])
      if (!files.length) return
      e.preventDefault()
      for (const f of files) {
        const p = window.pe.fs.pathForFile(f)
        if (p && /\.(ped|docx|md|markdown|html?|txt)$/i.test(p)) void io.openPath(p)
      }
    }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [])

  return (
    <div className={`app ${focusMode ? 'focus' : ''}`}>
      {!focusMode && <TitleBar />}
      {!focusMode && <Ribbon />}
      {doc?.notice && !focusMode && (
        <div className="notice">
          <span className="grow">{doc.notice}</span>
          <button className="btn sm" onClick={() => useApp.getState().updateDoc(doc.id, { notice: null })}>
            Dismiss
          </button>
        </div>
      )}
      <div className="workspace">
        {leftPane && !focusMode && doc && <NavPane />}
        {docs.map((d) => (
          <DocumentView key={d.id} doc={d} active={d.id === activeId} />
        ))}
        {!docs.length && <div className="empty-workspace">{ready ? '' : <span className="spinner" />}</div>}
        {!backstage && <FindBar />}
        {rightPane && !focusMode && doc && <RightPane />}
        {backstage && <Backstage />}
      </div>
      {!focusMode && <StatusBar />}
      {focusMode && (
        <button className="btn focus-exit" onClick={() => toggleFocusMode()}>
          <X size={14} /> Exit Focus
        </button>
      )}
      <Dialogs />
      <ContextMenu />
      <CommandPalette />
      <SlashMenu />
      <Toasts />
      <TooltipLayer />
      <DropOverlay />
    </div>
  )
}
