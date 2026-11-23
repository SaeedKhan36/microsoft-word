import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  Home,
  FilePlus2,
  FolderOpen,
  Info,
  Save,
  SaveAll,
  Printer,
  Share,
  X,
  Settings,
  HelpCircle,
  Search,
  Pin,
  PinOff,
  FolderSearch,
  Trash2,
  FileText,
  FileType2,
  FileCode2,
  FileDown,
  FileType,
  Lock,
  History,
  LifeBuoy,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  LayoutTemplate,
  Keyboard
} from 'lucide-react'
import { useApp, activeDoc, markDirty, getEditor, type BackstagePage } from '@/state/store'
import * as io from '@/lib/io'
import { TEMPLATES, type Template } from '@/lib/templates'
import { Logo, Checkbox, Seg } from './ui'
import type { LibraryHit, PrinterInfo, RecentFile, RecoveryEntry } from '@shared/types'
import { buildPrintJob } from '@/lib/print'
import { pageSizePx } from '@/lib/units'
import { PAPER_SIZES, MARGIN_PRESETS } from '@/lib/defaults'
import { fontStack } from './DocumentView'
import { timeAgo } from './Panes'

const NAV: { id: BackstagePage | 'save' | 'close'; label: string; icon: ReactNode; needsDoc?: boolean; sep?: boolean }[] = [
  { id: 'home', label: 'Home', icon: <Home size={18} /> },
  { id: 'new', label: 'New', icon: <FilePlus2 size={18} /> },
  { id: 'open', label: 'Open', icon: <FolderOpen size={18} /> },
  { id: 'info', label: 'Info', icon: <Info size={18} />, needsDoc: true, sep: true },
  { id: 'save', label: 'Save', icon: <Save size={18} />, needsDoc: true },
  { id: 'saveas', label: 'Save As', icon: <SaveAll size={18} />, needsDoc: true },
  { id: 'print', label: 'Print', icon: <Printer size={18} />, needsDoc: true },
  { id: 'export', label: 'Export', icon: <Share size={18} />, needsDoc: true },
  { id: 'close', label: 'Close', icon: <X size={18} />, needsDoc: true }
]

export function Backstage(): ReactNode {
  const page = useApp((s) => s.backstage)
  const docs = useApp((s) => s.docs)
  const doc = activeDoc()
  const set = useApp.getState().set
  const go = (id: string): void => {
    if (id === 'save') {
      if (doc) void io.saveDoc(doc.id).then((ok) => ok && set({ backstage: null }))
      return
    }
    if (id === 'close') {
      if (doc) void io.closeDoc(doc.id)
      return
    }
    set({ backstage: id as BackstagePage })
  }
  return (
    <div className="backstage">
      <nav className="bs-nav">
        <button className="bs-back" disabled={!docs.length} onClick={() => set({ backstage: null })} aria-label="Back to document" data-tip="Back" data-tip-keys="Esc">
          <ArrowLeft size={18} />
        </button>
        {NAV.map((n) => (
          <div key={n.id}>
            {n.sep && <div className="bs-sep" />}
            <button className={`bs-item ${page === n.id ? 'on' : ''}`} disabled={n.needsDoc && !doc} onClick={() => go(n.id)}>
              {n.icon}
              {n.label}
            </button>
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <button className={`bs-item ${page === 'about' ? 'on' : ''}`} onClick={() => go('about')}>
          <HelpCircle size={18} /> About
        </button>
        <button className={`bs-item ${page === 'options' ? 'on' : ''}`} onClick={() => go('options')}>
          <Settings size={18} /> Options
        </button>
      </nav>
      <main className="bs-main">
        {page === 'home' && <HomePage />}
        {page === 'new' && <NewPage />}
        {page === 'open' && <OpenPage />}
        {page === 'info' && doc && <InfoPage />}
        {page === 'saveas' && doc && <SaveAsPage />}
        {page === 'print' && doc && <PrintPage />}
        {page === 'export' && doc && <ExportPage />}
        {page === 'options' && <OptionsPage />}
        {page === 'about' && <AboutPage />}
      </main>
    </div>
  )
}

// ------------------------------------------------------------------ shared bits

function TemplateThumb({ t }: { t: Template }): ReactNode {
  return (
    <div className="template-thumb" style={{ fontFamily: fontStack(t.styles?.bodyFont ?? 'Calibri') }}>
      {t.preview.map((line, i) =>
        line.startsWith('h:') ? (
          <div key={i} style={{ fontSize: 9, fontWeight: 700, color: t.accent, whiteSpace: 'nowrap', overflow: 'hidden', fontFamily: fontStack(t.styles?.headingFont ?? 'Calibri') }}>
            {line.slice(2)}
          </div>
        ) : line === '~' ? (
          <div key={i} className="tline" style={{ width: `${70 + ((i * 37) % 30)}%` }} />
        ) : line === '' ? (
          <div key={i} className="tline empty" />
        ) : (
          <div key={i} style={{ fontSize: 7, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden' }}>
            {line}
          </div>
        )
      )}
    </div>
  )
}

function TemplateGrid({ limit }: { limit?: number }): ReactNode {
  const [user, setUser] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    void window.pe.templates.list().then(setUser)
  }, [])
  const list = limit ? TEMPLATES.slice(0, limit) : TEMPLATES
  return (
    <div className="template-row">
      {list.map((t) => (
        <button key={t.id} className="template" onClick={() => io.newDocument(t.id)}>
          <TemplateThumb t={t} />
          <span className="template-name">{t.name}</span>
          <span className="template-desc">{t.description}</span>
        </button>
      ))}
      {!limit &&
        user.map((t) => (
          <button key={t.id} className="template" onClick={() => void io.newFromUserTemplate(t.id, t.name)}>
            <div className="template-thumb" style={{ alignItems: 'center', justifyContent: 'center' }}>
              <LayoutTemplate size={28} color="#9aa1ae" />
            </div>
            <span className="template-name">{t.name}</span>
            <span className="template-desc">
              Your template ·{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  void window.pe.templates.remove(t.id).then(() => window.pe.templates.list().then(setUser))
                }}
              >
                remove
              </a>
            </span>
          </button>
        ))}
    </div>
  )
}

function fileColor(path: string): { bg: string; label: string } {
  const e = path.split('.').pop()?.toLowerCase()
  if (e === 'docx') return { bg: '#2b579a', label: 'DOCX' }
  if (e === 'md' || e === 'markdown') return { bg: '#3f4652', label: 'MD' }
  if (e === 'html' || e === 'htm') return { bg: '#c2410c', label: 'HTML' }
  if (e === 'txt') return { bg: '#6b7280', label: 'TXT' }
  return { bg: '#2f5bea', label: 'PED' }
}

function RecentList({ filter }: { filter?: string }): ReactNode {
  const [list, setList] = useState<RecentFile[] | null>(null)
  useEffect(() => {
    void window.pe.recents.list().then(setList)
  }, [])
  if (!list) return null
  const q = (filter ?? '').toLowerCase()
  const items = list.filter((r) => !q || r.title.toLowerCase().includes(q) || r.path.toLowerCase().includes(q)).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.openedAt - a.openedAt)
  if (!items.length) return <div className="pane-empty" style={{ textAlign: 'left', padding: '12px 0' }}>{q ? 'No recent documents match.' : 'Documents you open or save will show up here.'}</div>
  return (
    <div className="file-list">
      {items.map((r) => {
        const c = fileColor(r.path)
        return (
          <div key={r.path} className="file-row" role="button" onClick={() => void io.openPath(r.path)}>
            <span className="file-icon" style={{ background: c.bg }}>
              {c.label}
            </span>
            <span style={{ minWidth: 0 }}>
              <div className="fname">
                {r.pinned && <Pin size={12} style={{ marginRight: 6, verticalAlign: -1, color: 'var(--accent)' }} />}
                {r.title}
              </div>
              <div className="fpath">{r.path}</div>
            </span>
            <span className="fdate">
              {timeAgo(r.openedAt)}
              {r.words ? ` · ${r.words.toLocaleString()} words` : ''}
            </span>
            <button
              className="icon-btn sm"
              data-tip={r.pinned ? 'Unpin' : 'Pin to top'}
              onClick={(e) => {
                e.stopPropagation()
                void window.pe.recents.update(r.path, { pinned: !r.pinned }).then(setList)
              }}
            >
              {r.pinned ? <PinOff size={14} /> : <Pin size={14} />}
            </button>
            <button
              className="icon-btn sm"
              data-tip="Remove from list"
              onClick={(e) => {
                e.stopPropagation()
                void window.pe.recents.remove(r.path).then(setList)
              }}
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

function LibrarySearch(): ReactNode {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<LibraryHit[]>([])
  useEffect(() => {
    if (!q.trim()) {
      setHits([])
      return
    }
    const t = setTimeout(() => void window.pe.library.search(q).then(setHits), 160)
    return () => clearTimeout(t)
  }, [q])
  return (
    <>
      <div className="bs-search">
        <Search size={16} color="var(--text-3)" />
        <input placeholder="Search inside all your documents…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {q.trim() && (
        <div style={{ marginTop: 12 }}>
          {!hits.length ? (
            <div className="hint">No documents contain “{q}”. Only documents you have opened or saved in Personal Editor are searched.</div>
          ) : (
            <div className="file-list">
              {hits.map((h) => (
                <div key={h.path} className="file-row" role="button" onClick={() => void io.openPath(h.path)} style={{ gridTemplateColumns: '34px minmax(0,1fr) 150px' }}>
                  <span className="file-icon" style={{ background: fileColor(h.path).bg }}>
                    {fileColor(h.path).label}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <div className="fname">{h.title}</div>
                    <div className="search-hit">{h.snippet}</div>
                  </span>
                  <span className="fdate">{timeAgo(h.modified)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

// ------------------------------------------------------------------ pages

function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function HomePage(): ReactNode {
  const [recovery, setRecovery] = useState<RecoveryEntry[]>([])
  const docs = useApp((s) => s.docs)
  const name = useApp((s) => s.settings.userName)
  useEffect(() => {
    void window.pe.recovery.list().then((list) => setRecovery(list.filter((r) => !docs.some((d) => d.id === r.docId))))
  }, [docs])
  return (
    <>
      <div className="hero">
        <Logo size={52} className="hero-logo" />
        <div>
          <h1>
            {greeting()}
            {name && name !== 'Me' ? `, ${name}` : ''}
          </h1>
          <p>Personal Editor — write, draw, and print. Everything stays on this PC.</p>
        </div>
      </div>
      <div className="bs-sub">
        New
        <span className="spacer" />
        <button className="btn sm ghost" onClick={() => useApp.getState().set({ backstage: 'new' })}>
          More templates →
        </button>
      </div>
      <TemplateGrid limit={6} />
      {recovery.length > 0 && (
        <>
          <div className="bs-sub">
            <LifeBuoy size={18} color="var(--warning)" /> Recovered documents
          </div>
          <div className="hint" style={{ marginBottom: 10 }}>Personal Editor closed before these were saved. Restore them to keep your work.</div>
          <div className="file-list">
            {recovery.map((r) => (
              <div key={r.docId} className="file-row" style={{ gridTemplateColumns: '34px minmax(0,1fr) 150px auto auto' }}>
                <span className="file-icon" style={{ background: 'var(--warning)' }}>
                  !
                </span>
                <span style={{ minWidth: 0 }}>
                  <div className="fname">{r.title}</div>
                  <div className="fpath">{r.path || 'Never saved'}</div>
                </span>
                <span className="fdate">{timeAgo(r.updatedAt)}</span>
                <button className="btn sm primary" onClick={() => void io.restoreRecovery(r).then(() => window.pe.recovery.remove(r.docId))}>
                  Restore
                </button>
                <button
                  className="btn sm ghost"
                  onClick={() => void window.pe.recovery.remove(r.docId).then(() => setRecovery((x) => x.filter((y) => y.docId !== r.docId)))}
                >
                  Discard
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="bs-sub">
        Recent
        <span className="spacer" />
        <button className="btn sm" onClick={() => void io.openFileDialog()}>
          <FolderOpen size={14} /> Browse…
        </button>
      </div>
      <div style={{ marginBottom: 14 }}>
        <LibrarySearch />
      </div>
      <RecentList />
    </>
  )
}

function NewPage(): ReactNode {
  return (
    <>
      <h1 className="bs-title">New</h1>
      <TemplateGrid />
      <p className="hint" style={{ marginTop: 24 }}>
        Tip: make any document a template with File → Export → Save as Template.
      </p>
    </>
  )
}

function OpenPage(): ReactNode {
  const [q, setQ] = useState('')
  return (
    <>
      <h1 className="bs-title">Open</h1>
      <div className="bs-cards" style={{ marginBottom: 24 }}>
        <button className="bs-card" onClick={() => void io.openFileDialog()}>
          <span className="ic">
            <FolderSearch size={20} />
          </span>
          <span>
            <b>Browse this PC</b>
            <span>Open .ped, Word (.docx), Markdown, HTML and text files.</span>
          </span>
        </button>
      </div>
      <div className="bs-sub">Search everything</div>
      <LibrarySearch />
      <div className="bs-sub">
        Recent documents
        <span className="spacer" />
        <div className="bs-search" style={{ height: 32, width: 260 }}>
          <Search size={14} color="var(--text-3)" />
          <input placeholder="Filter by name" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <RecentList filter={q} />
    </>
  )
}

function InfoPage(): ReactNode {
  const doc = activeDoc()!
  const update = (patch: Partial<typeof doc.meta>): void => {
    useApp.getState().updateDoc(doc.id, (d) => ({ meta: { ...d.meta, ...patch } }))
    markDirty(doc.id)
  }
  const editor = getEditor(doc.id)
  let images = 0
  let tables = 0
  let footnotes = 0
  editor?.state.doc.descendants((n) => {
    if (n.type.name === 'image') images++
    if (n.type.name === 'table') tables++
    if (n.type.name === 'footnote') footnotes++
    return true
  })
  return (
    <>
      <h1 className="bs-title">Info</h1>
      <div className="info-grid">
        <div>
          <div className="bs-sub" style={{ marginTop: 0 }}>{doc.title}</div>
          <div className="hint" style={{ marginBottom: 18 }}>
            {doc.path ?? 'This document has not been saved yet.'}{' '}
            {doc.path && (
              <a href="#" onClick={(e) => (e.preventDefault(), void window.pe.shell.showItem(doc.path!))}>
                Show in folder
              </a>
            )}
          </div>
          <div className="bs-cards">
            <button className="bs-card" onClick={() => useApp.getState().openDialog('setPassword')}>
              <span className="ic">
                <Lock size={20} />
              </span>
              <span>
                <b>Protect Document</b>
                <span>{doc.password ? 'This document is encrypted with a password.' : 'Encrypt with a password so only you can open it.'}</span>
              </span>
            </button>
            <button className="bs-card" onClick={() => useApp.getState().set({ backstage: null, rightPane: 'versions' })}>
              <span className="ic">
                <History size={20} />
              </span>
              <span>
                <b>Version History</b>
                <span>See and restore earlier versions. Versions are kept automatically.</span>
              </span>
            </button>
            <button className="bs-card" onClick={() => useApp.getState().set({ backstage: null, rightPane: 'comments' })}>
              <span className="ic">
                <Sparkles size={20} />
              </span>
              <span>
                <b>Inspect Document</b>
                <span>
                  {doc.comments.length} comments · {images} pictures · {tables} tables · {footnotes} footnotes
                </span>
              </span>
            </button>
          </div>
        </div>
        <div>
          <div className="bs-sub" style={{ marginTop: 0 }}>Properties</div>
          <div className="prop-list">
            <span>Pages</span>
            <b>{doc.pagination.pages}</b>
            <span>Words</span>
            <b>{doc.stats.words.toLocaleString()}</b>
            <span>Title</span>
            <input className="input" value={doc.meta.title} placeholder="Add a title" onChange={(e) => update({ title: e.target.value })} />
            <span>Author</span>
            <input className="input" value={doc.meta.author} onChange={(e) => update({ author: e.target.value })} />
            <span>Subject</span>
            <input className="input" value={doc.meta.subject} onChange={(e) => update({ subject: e.target.value })} />
            <span>Tags</span>
            <input className="input" value={doc.meta.keywords} placeholder="Add tags" onChange={(e) => update({ keywords: e.target.value })} />
            <span>Comments</span>
            <textarea className="textarea" rows={2} value={doc.meta.description} onChange={(e) => update({ description: e.target.value })} />
            <span>Created</span>
            <span>{new Date(doc.meta.created).toLocaleString()}</span>
            <span>Last saved</span>
            <span>{doc.lastSavedAt ? new Date(doc.lastSavedAt).toLocaleString() : 'Never'}</span>
          </div>
        </div>
      </div>
    </>
  )
}

const FORMATS = [
  { kind: 'ped' as const, name: 'Personal Editor Document (.ped)', desc: 'Keeps everything: comments, versions, drawings and layout. Best for your own files.', icon: <FileText size={20} /> },
  { kind: 'docx' as const, name: 'Word Document (.docx)', desc: 'Open it in Microsoft Word or share with people who use Word.', icon: <FileType2 size={20} /> },
  { kind: 'pdf' as const, name: 'PDF (.pdf)', desc: 'A fixed layout that looks the same everywhere. Great for sharing and printing.', icon: <FileDown size={20} /> },
  { kind: 'html' as const, name: 'Web Page (.html)', desc: 'View in any browser or publish online.', icon: <FileCode2 size={20} /> },
  { kind: 'md' as const, name: 'Markdown (.md)', desc: 'Plain text with simple formatting marks.', icon: <FileType size={20} /> },
  { kind: 'txt' as const, name: 'Plain Text (.txt)', desc: 'Just the words, no formatting.', icon: <FileText size={20} /> }
]

function SaveAsPage(): ReactNode {
  const doc = activeDoc()!
  return (
    <>
      <h1 className="bs-title">Save As</h1>
      <div className="bs-cards">
        {FORMATS.map((f) => (
          <button key={f.kind} className="bs-card" onClick={() => void io.saveAsDialog(doc.id, f.kind)}>
            <span className="ic">{f.icon}</span>
            <span>
              <b>{f.name}</b>
              <span>{f.desc}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  )
}

function ExportPage(): ReactNode {
  const doc = activeDoc()!
  return (
    <>
      <h1 className="bs-title">Export</h1>
      <div className="bs-cards">
        {FORMATS.filter((f) => f.kind !== 'ped').map((f) => (
          <button key={f.kind} className="bs-card" onClick={() => void io.exportAs(doc.id, f.kind)}>
            <span className="ic">{f.icon}</span>
            <span>
              <b>Create {f.name.replace(/ \(.*\)/, '')}</b>
              <span>{f.desc}</span>
            </span>
          </button>
        ))}
        <button className="bs-card" onClick={() => useApp.getState().openDialog('prompt', { kind: 'template' })}>
          <span className="ic">
            <LayoutTemplate size={20} />
          </span>
          <span>
            <b>Save as Template</b>
            <span>Reuse this document's layout and styles for new documents.</span>
          </span>
        </button>
      </div>
    </>
  )
}

function PrintPage(): ReactNode {
  const doc = activeDoc()!
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [printer, setPrinter] = useState('')
  const [copies, setCopies] = useState(1)
  const [range, setRange] = useState<'all' | 'current' | 'custom'>('all')
  const [custom, setCustom] = useState('')
  const [color, setColor] = useState(true)
  const [duplex, setDuplex] = useState<'simplex' | 'longEdge' | 'shortEdge'>('simplex')
  const [preview, setPreview] = useState<{ html: string; pages: number } | null>(null)
  const [pageIdx, setPageIdx] = useState(0)
  const [busy, setBusy] = useState(false)
  const view = useApp((s) => s.view)

  useEffect(() => {
    void window.pe.print.printers().then((p) => {
      setPrinters(p)
      setPrinter(p.find((x) => x.isDefault)?.name ?? p[0]?.name ?? '')
    })
  }, [])

  useEffect(() => {
    if (view !== 'print') useApp.getState().set({ view: 'print' })
    const t = setTimeout(() => {
      try {
        const job = buildPrintJob(doc)
        const pages = (job.html.match(/class="pe-sheet"/g) || []).length || 1
        setPreview({ html: job.html, pages })
      } catch {
        setPreview(null)
      }
    }, view === 'print' ? 80 : 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, doc.page, doc.pagination.pages, doc.changeCounter, view])

  const size = pageSizePx(doc.page)
  const scale = Math.min(1, 560 / size.w, 720 / size.h)
  const pageRanges = range === 'all' ? '' : range === 'current' ? String(doc.stats.currentPage) : custom
  const total = preview?.pages ?? doc.pagination.pages
  const updatePage = (patch: Partial<typeof doc.page>): void => {
    useApp.getState().updateDoc(doc.id, (d) => ({ page: { ...d.page, ...patch } }))
    markDirty(doc.id)
  }

  return (
    <>
      <h1 className="bs-title">Print</h1>
      <div className="print-layout">
        <div className="print-settings">
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn primary big-action"
              style={{ flex: 1 }}
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                await io.printDoc(doc.id, { deviceName: printer, copies, pageRanges, color, duplex, silent: true })
                setBusy(false)
              }}
            >
              {busy ? <span className="spinner" /> : <Printer size={18} />} Print
            </button>
            <div className="field" style={{ width: 90 }}>
              <span className="field-label">Copies</span>
              <input className="input" type="number" min={1} max={999} value={copies} onChange={(e) => setCopies(Math.max(1, Number(e.target.value) || 1))} />
            </div>
          </div>
          <div className="field">
            <span className="field-label">Printer</span>
            <select className="select" value={printer} onChange={(e) => setPrinter(e.target.value)}>
              {printers.length === 0 && <option value="">No printers found</option>}
              {printers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.displayName}
                  {p.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <span className="field-label">Pages</span>
            <select className="select" value={range} onChange={(e) => setRange(e.target.value as typeof range)}>
              <option value="all">Print all pages ({total})</option>
              <option value="current">Print current page ({doc.stats.currentPage})</option>
              <option value="custom">Custom range…</option>
            </select>
            {range === 'custom' && <input className="input" placeholder="e.g. 1-3, 5, 8" value={custom} onChange={(e) => setCustom(e.target.value)} />}
          </div>
          <div className="form-grid">
            <div className="field">
              <span className="field-label">Sides</span>
              <select className="select" value={duplex} onChange={(e) => setDuplex(e.target.value as typeof duplex)}>
                <option value="simplex">One-sided</option>
                <option value="longEdge">Both sides (long edge)</option>
                <option value="shortEdge">Both sides (short edge)</option>
              </select>
            </div>
            <div className="field">
              <span className="field-label">Color</span>
              <select className="select" value={color ? 'color' : 'bw'} onChange={(e) => setColor(e.target.value === 'color')}>
                <option value="color">Color</option>
                <option value="bw">Black & white</option>
              </select>
            </div>
            <div className="field">
              <span className="field-label">Orientation</span>
              <select className="select" value={doc.page.orientation} onChange={(e) => updatePage({ orientation: e.target.value as 'portrait' | 'landscape' })}>
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </div>
            <div className="field">
              <span className="field-label">Paper size</span>
              <select className="select" value={doc.page.sizeName} onChange={(e) => {
                const p = PAPER_SIZES.find((x) => x.name === e.target.value)
                if (p) updatePage({ sizeName: p.name, widthMm: p.w, heightMm: p.h })
              }}>
                {PAPER_SIZES.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.label}
                  </option>
                ))}
                {doc.page.sizeName === 'Custom' && <option value="Custom">Custom</option>}
              </select>
            </div>
          </div>
          <div className="field">
            <span className="field-label">Margins</span>
            <select
              className="select"
              value={MARGIN_PRESETS.find((m) => JSON.stringify(m.m) === JSON.stringify(doc.page.margins))?.name ?? 'custom'}
              onChange={(e) => {
                const m = MARGIN_PRESETS.find((x) => x.name === e.target.value)
                if (m) updatePage({ margins: m.m })
                else useApp.getState().openDialog('pageSetup')
              }}
            >
              {MARGIN_PRESETS.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                </option>
              ))}
              <option value="custom">Custom…</option>
            </select>
          </div>
          <div className="menu-sep" />
          <button className="btn" onClick={() => void io.exportAs(doc.id, 'pdf')}>
            <FileDown size={16} /> Save as PDF instead
          </button>
          <button className="btn ghost" onClick={() => void io.printDoc(doc.id, { silent: false, copies })}>
            Use the Windows print dialog…
          </button>
        </div>
        <div className="print-preview">
          {preview ? (
            <>
              <div className="print-preview-page" style={{ width: size.w * scale, height: size.h * scale }}>
                <div
                  style={{ transform: `scale(${scale}) translateY(${-pageIdx * size.h}px)`, transformOrigin: '0 0', width: size.w, pointerEvents: 'none' }}
                  dangerouslySetInnerHTML={{ __html: preview.html }}
                />
              </div>
              <div className="print-preview-nav">
                <button className="icon-btn sm" disabled={pageIdx === 0} onClick={() => setPageIdx((i) => Math.max(0, i - 1))}>
                  <ChevronLeft size={16} />
                </button>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  Page {pageIdx + 1} of {total}
                </span>
                <button className="icon-btn sm" disabled={pageIdx >= total - 1} onClick={() => setPageIdx((i) => Math.min(total - 1, i + 1))}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </>
          ) : (
            <div className="pane-empty">
              <span className="spinner" />
              Preparing preview…
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function OptionsPage(): ReactNode {
  const s = useApp((st) => st.settings)
  const setS = useApp.getState().setSettings
  const [langs, setLangs] = useState<string[]>([])
  useEffect(() => {
    void window.pe.spell.languages().then(setLangs)
  }, [])
  const langOptions = useMemo(() => (langs.length ? langs : ['en-US', 'en-GB']), [langs])
  return (
    <>
      <h1 className="bs-title">Options</h1>
      <div style={{ maxWidth: 720, display: 'grid', gap: 8 }}>
        <div className="bs-sub" style={{ marginTop: 0 }}>Personalize</div>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Your name (used for comments and tracked changes)</span>
            <input className="input" value={s.userName} onChange={(e) => setS({ userName: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">Initials</span>
            <input className="input" value={s.userInitials} maxLength={3} onChange={(e) => setS({ userInitials: e.target.value.toUpperCase() })} />
          </label>
        </div>
        <div className="field">
          <span className="field-label">Theme</span>
          <Seg value={s.theme} onChange={(v) => setS({ theme: v })} options={[{ value: 'system', label: 'Match Windows' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
        </div>
        <Checkbox checked={s.darkPages} onChange={(v) => setS({ darkPages: v })} label="Use dark pages in dark theme (printing always uses white paper)" />
        <div className="field">
          <span className="field-label">When Personal Editor starts</span>
          <Seg value={s.startup} onChange={(v) => setS({ startup: v })} options={[{ value: 'start', label: 'Show the Start screen' }, { value: 'blank', label: 'Open a blank document' }]} />
        </div>

        <div className="bs-sub">Saving</div>
        <Checkbox checked={s.autoSave} onChange={(v) => setS({ autoSave: v })} label="AutoSave documents that are already saved to a file" />
        <label className="field" style={{ maxWidth: 360 }}>
          <span className="field-label">Save a version to history every</span>
          <select className="select" value={s.versionIntervalMin} onChange={(e) => setS({ versionIntervalMin: Number(e.target.value) })}>
            {[1, 2, 5, 10, 15, 30].map((m) => (
              <option key={m} value={m}>
                {m} minute{m > 1 ? 's' : ''} of editing
              </option>
            ))}
          </select>
        </label>
        <div className="hint">Unsaved work is also kept in a recovery file every couple of seconds, so nothing is lost if the PC shuts down unexpectedly.</div>

        <div className="bs-sub">New documents</div>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Default font</span>
            <input className="input" value={s.defaultFont} onChange={(e) => setS({ defaultFont: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">Default size (pt)</span>
            <input className="input" type="number" min={6} max={72} value={s.defaultFontSize} onChange={(e) => setS({ defaultFontSize: Number(e.target.value) || 11 })} />
          </label>
        </div>

        <div className="bs-sub">Proofing</div>
        <Checkbox checked={s.spellcheck} onChange={(v) => setS({ spellcheck: v })} label="Check spelling as you type" />
        <label className="field" style={{ maxWidth: 360 }}>
          <span className="field-label">Spelling language</span>
          <select
            className="select"
            value={s.spellLanguages[0]}
            onChange={(e) => {
              setS({ spellLanguages: [e.target.value] })
              void window.pe.spell.setLanguages([e.target.value])
            }}
          >
            {langOptions.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>

        <div className="bs-sub">Display</div>
        <Checkbox checked={s.showRuler} onChange={(v) => setS({ showRuler: v })} label="Show the ruler" />
        <Checkbox checked={s.showFormattingMarks} onChange={(v) => setS({ showFormattingMarks: v })} label="Show formatting marks (¶)" />
        <div className="field">
          <span className="field-label">Measurement units</span>
          <Seg value={s.units} onChange={(v) => setS({ units: v })} options={[{ value: 'cm', label: 'Centimeters' }, { value: 'in', label: 'Inches' }]} />
        </div>
        <div className="field">
          <span className="field-label">Ribbon</span>
          <Seg value={s.ribbonMode} onChange={(v) => setS({ ribbonMode: v })} options={[{ value: 'full', label: 'Classic' }, { value: 'simplified', label: 'Simplified' }]} />
        </div>

        <div className="bs-sub">AI (optional)</div>
        <div className="hint">
          Personal Editor works fully offline. If you want AI handwriting recognition for messy pages, add a Claude API key. You pay Anthropic per use (usually a fraction of a cent per page); nothing is
          sent anywhere unless you choose the AI option.
        </div>
        <label className="field">
          <span className="field-label">Claude API key</span>
          <input className="input" type="password" placeholder="sk-ant-…" value={s.aiApiKey ?? ''} onChange={(e) => setS({ aiApiKey: e.target.value.trim() })} />
        </label>
      </div>
    </>
  )
}

function AboutPage(): ReactNode {
  const [info, setInfo] = useState<{ version: string; userData: string } | null>(null)
  useEffect(() => {
    void window.pe.app.info().then(setInfo)
  }, [])
  const shortcuts: [string, string][] = [
    ['New / Open / Save', 'Ctrl+N / Ctrl+O / Ctrl+S'],
    ['Save As', 'F12 or Ctrl+Shift+S'],
    ['Print', 'Ctrl+P'],
    ['Search commands', 'Alt+Q'],
    ['Insert anything', 'Type / on an empty line'],
    ['Find / Replace', 'Ctrl+F / Ctrl+H'],
    ['Bold / Italic / Underline', 'Ctrl+B / I / U'],
    ['Headings 1–3', 'Ctrl+Alt+1 / 2 / 3'],
    ['Align left / center / right / justify', 'Ctrl+L / E / R / J'],
    ['Bigger / smaller text', 'Ctrl+Shift+> / <'],
    ['Line spacing 1 / 1.5 / 2', 'Ctrl+1 / Ctrl+5 / Ctrl+2'],
    ['Page break', 'Ctrl+Enter'],
    ['Link', 'Ctrl+K'],
    ['Footnote', 'Ctrl+Alt+F'],
    ['Comment', 'Ctrl+Alt+M'],
    ['Track changes', 'Ctrl+Shift+E'],
    ['Word count', 'Ctrl+Shift+G'],
    ['Format painter (copy / paste)', 'Ctrl+Shift+C / Ctrl+Shift+V'],
    ['Focus mode', 'F11'],
    ['Next document tab', 'Ctrl+Tab'],
    ['Zoom', 'Ctrl + mouse wheel']
  ]
  return (
    <>
      <div className="hero">
        <Logo size={52} />
        <div>
          <h1>Personal Editor</h1>
          <p>Version {info?.version ?? '1.0.0'} · Made for personal use · Works offline</p>
        </div>
      </div>
      <div className="bs-sub">
        <Keyboard size={18} /> Keyboard shortcuts
      </div>
      <div className="kv" style={{ maxWidth: 620 }}>
        {shortcuts.flatMap(([a, b]) => [<span key={a}>{a}</span>, <span key={a + 'k'}>{b}</span>])}
      </div>
      <div className="bs-sub">Your data</div>
      <p className="hint" style={{ maxWidth: 620 }}>
        Documents are saved wherever you choose. Settings, recent files, version history and crash recovery are stored in {info?.userData ?? 'your app data folder'}.
      </p>
    </>
  )
}
