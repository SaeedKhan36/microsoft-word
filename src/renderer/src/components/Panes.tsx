import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  X,
  Search,
  MessageSquarePlus,
  MessagesSquare,
  CheckCircle2,
  RotateCcw,
  Trash2,
  Reply,
  Check,
  XCircle,
  History,
  Eye,
  Copy,
  Pencil,
  Save,
  SpellCheck,
  BookPlus,
  EyeOff,
  FilePenLine,
  Heading,
  FileText,
  Bookmark,
  ListTree
} from 'lucide-react'
import { generateHTML } from '@tiptap/core'
import { useApp, useActiveDoc, markDirty, type DocTab } from '@/state/store'
import { useActiveEditor, Checkbox } from './ui'
import { collectHeadings } from '@/editor/ext/references'
import { collectChanges } from '@/editor/ext/track-changes'
import { gotoComment, newComment, removeCommentMarks, scrollToPos, scrollSelectionIntoView } from '@/state/commands'
import { uid } from '@/lib/units'
import type { VersionEntry } from '@shared/types'
import { snapshot, openPayload } from '@/lib/io'
import type { PedPayload } from '@/lib/types'
import { buildExtensions } from '@/editor/extensions'
import { STYLE_PRESETS } from './ribbon/HomeTab'
import { fontStack } from './DocumentView'

const COLORS = ['#2f5bea', '#d1495b', '#0a7c86', '#7c3aed', '#c2410c', '#15803d', '#b45309', '#be185d']
export function avatarColor(name: string): string {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return COLORS[h % COLORS.length]
}

export function timeAgo(t: number): string {
  const s = (Date.now() - t) / 1000
  if (s < 60) return 'Just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}

// ------------------------------------------------------------------ navigation pane (left)

export function NavPane(): ReactNode {
  const tab = useApp((s) => s.navTab)
  const editor = useActiveEditor()
  const doc = useActiveDoc()
  const [query, setQuery] = useState('')
  const set = useApp.getState().set
  if (!editor || !doc) return null
  const headings = collectHeadings(editor.state.doc)
  const sel = editor.state.selection.from
  let current = -1
  headings.forEach((h, i) => {
    if (h.pos <= sel) current = i
  })
  const s = editor.storage.search
  const pageStarts = doc.pagination.pageStarts
  const bookmarks: { name: string; pos: number }[] = []
  editor.state.doc.descendants((n, pos) => {
    if (n.type.name === 'bookmark') bookmarks.push({ name: n.attrs.name, pos })
    return true
  })

  return (
    <aside className="pane">
      <div className="pane-head">
        <div className="pane-title">Navigation</div>
        <button className="icon-btn" onClick={() => set({ leftPane: false })} aria-label="Close navigation">
          <X size={16} />
        </button>
      </div>
      <div style={{ padding: '0 12px 10px' }}>
        <div className="bs-search" style={{ height: 32, borderRadius: 8 }}>
          <Search size={14} color="var(--text-3)" />
          <input
            placeholder="Search document"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              editor.commands.setSearch(e.target.value)
              set({ navTab: 'results' })
            }}
          />
          {query && (
            <button className="icon-btn sm" onClick={() => {
              setQuery('')
              editor.commands.clearSearch()
              set({ navTab: 'headings' })
            }}>
              <X size={13} />
            </button>
          )}
        </div>
      </div>
      <div className="pane-tabs">
        {(['headings', 'pages', 'results'] as const).map((t) => (
          <button key={t} className={`pane-tab ${tab === t ? 'on' : ''}`} onClick={() => set({ navTab: t })}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div className="pane-body">
        {tab === 'headings' &&
          (headings.length ? (
            <>
              {headings.map((h, i) => (
                <button
                  key={h.pos}
                  className={`nav-heading l${h.level} ${i === current ? 'current' : ''}`}
                  style={{ paddingLeft: 8 + (h.level - 1) * 14 }}
                  onClick={() => scrollToPos(editor, h.pos)}
                  title={h.text}
                >
                  {h.text || <i>(empty heading)</i>}
                </button>
              ))}
              {bookmarks.length > 0 && (
                <>
                  <div className="section-label" style={{ margin: '14px 8px 4px' }}>Bookmarks</div>
                  {bookmarks.map((b) => (
                    <button key={b.pos} className="nav-heading" onClick={() => scrollToPos(editor, b.pos)}>
                      <Bookmark size={12} style={{ verticalAlign: -1, marginRight: 6 }} />
                      {b.name}
                    </button>
                  ))}
                </>
              )}
            </>
          ) : (
            <div className="pane-empty">
              <ListTree size={28} />
              Create an interactive outline of your document. Apply Heading styles to your titles and they will appear here.
            </div>
          ))}
        {tab === 'pages' &&
          pageStarts.map((start, i) => {
            const end = pageStarts[i + 1] ?? editor.state.doc.content.size
            const text = editor.state.doc.textBetween(Math.min(start, end), end, ' ', ' ').slice(0, 140)
            return (
              <button
                key={i}
                className={`nav-page ${doc.stats.currentPage === i + 1 ? 'current' : ''}`}
                onClick={() => {
                  const canvas = (editor.view.dom as HTMLElement).closest('.canvas') as HTMLElement | null
                  const sheet = canvas?.querySelectorAll<HTMLElement>('.pe-sheet')[i]
                  sheet?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  editor.chain().focus().setTextSelection(Math.min(start + 1, editor.state.doc.content.size)).run()
                }}
              >
                <span className="nav-page-thumb">{i + 1}</span>
                <span className="nav-page-text">{text || <i>Blank page</i>}</span>
              </button>
            )
          })}
        {tab === 'results' && (
          <>
            {!s.query && <div className="pane-empty"><Search size={26} />Type in the search box to find text in your document.</div>}
            {s.query && !s.matches.length && <div className="pane-empty">No results for “{s.query}”.</div>}
            {s.query && s.matches.length > 0 && <div className="hint" style={{ padding: '0 8px 8px' }}>{s.matches.length} result{s.matches.length === 1 ? '' : 's'}</div>}
            {s.matches.slice(0, 300).map((m, i) => {
              const $p = editor.state.doc.resolve(m.from)
              const block = $p.parent.textContent
              const off = m.from - $p.start()
              const len = m.to - m.from
              const before = block.slice(Math.max(0, off - 40), off)
              const hit = block.slice(off, off + len)
              const after = block.slice(off + len, off + len + 60)
              return (
                <button key={i} className={`nav-result ${i === s.current ? 'current' : ''}`} onClick={() => editor.commands.gotoMatch(i)}>
                  {off > 40 ? '…' : ''}
                  {before}
                  <mark>{hit}</mark>
                  {after}
                </button>
              )
            })}
          </>
        )}
      </div>
    </aside>
  )
}

// ------------------------------------------------------------------ right panes

export function RightPane(): ReactNode {
  const pane = useApp((s) => s.rightPane)
  const close = (): void => useApp.getState().set({ rightPane: null })
  const titles: Record<string, string> = {
    comments: 'Comments',
    changes: 'Tracked Changes',
    versions: 'Version History',
    styles: 'Styles',
    spelling: 'Editor — Spelling'
  }
  return (
    <aside className="pane right">
      <div className="pane-head">
        <div className="pane-title">{titles[pane ?? ''] ?? ''}</div>
        <button className="icon-btn" onClick={close} aria-label="Close pane">
          <X size={16} />
        </button>
      </div>
      {pane === 'comments' && <CommentsPane />}
      {pane === 'changes' && <ChangesPane />}
      {pane === 'versions' && <VersionsPane />}
      {pane === 'styles' && <StylesPane />}
      {pane === 'spelling' && <SpellingPane />}
    </aside>
  )
}

function CommentsPane(): ReactNode {
  const doc = useActiveDoc()
  const editor = useActiveEditor()
  const activeId = useApp((s) => s.activeCommentId)
  const [showResolved, setShowResolved] = useState(true)
  if (!doc || !editor) return null
  // Order threads by their position in the document.
  const order = new Map<string, number>()
  editor.state.doc.descendants((node, pos) => {
    if (node.isText) for (const m of node.marks) if (m.type.name === 'comment' && !order.has(m.attrs.id)) order.set(m.attrs.id, pos)
    return true
  })
  const threads = doc.comments.filter((c) => showResolved || !c.resolved).sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9))
  return (
    <>
      <div style={{ padding: '0 12px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="btn sm primary" onClick={() => newComment()}>
          <MessageSquarePlus size={14} /> New
        </button>
        <span style={{ flex: 1 }} />
        <Checkbox checked={showResolved} onChange={setShowResolved} label={<span className="hint">Show resolved</span>} />
      </div>
      <div className="pane-body">
        {!threads.length && (
          <div className="pane-empty">
            <MessagesSquare size={28} />
            No comments yet. Select some text and choose New Comment (Ctrl+Alt+M).
          </div>
        )}
        {threads.map((t) => (
          <CommentCard key={t.id} doc={doc} thread={t} active={t.id === activeId} orphan={!order.has(t.id)} />
        ))}
      </div>
    </>
  )
}

function CommentCard({ doc, thread, active, orphan }: { doc: DocTab; thread: DocTab['comments'][number]; active: boolean; orphan: boolean }): ReactNode {
  const editor = useActiveEditor()
  const settings = useApp((s) => s.settings)
  const [editing, setEditing] = useState(!thread.text)
  const [text, setText] = useState(thread.text)
  const [reply, setReply] = useState('')
  const update = (patch: Partial<typeof thread>): void => {
    useApp.getState().updateDoc(doc.id, (d) => ({ comments: d.comments.map((c) => (c.id === thread.id ? { ...c, ...patch } : c)) }))
    markDirty(doc.id)
  }
  const remove = (): void => {
    if (editor) removeCommentMarks(editor, thread.id)
    useApp.getState().updateDoc(doc.id, (d) => ({ comments: d.comments.filter((c) => c.id !== thread.id) }))
    markDirty(doc.id)
  }
  return (
    <div className={`card ${active ? 'active' : ''} ${thread.resolved ? 'resolved' : ''}`} onClick={() => !active && gotoComment(thread.id)}>
      <div className="card-head">
        <span className="avatar" style={{ background: avatarColor(thread.author) }}>
          {thread.initials || thread.author.slice(0, 2).toUpperCase()}
        </span>
        <div className="card-meta">
          <b>{thread.author}</b>
          <span>
            {timeAgo(thread.date)}
            {thread.resolved ? ' · Resolved' : ''}
            {orphan ? ' · text removed' : ''}
          </span>
        </div>
        <button className="icon-btn sm" onClick={(e) => (e.stopPropagation(), remove())} data-tip="Delete thread">
          <Trash2 size={14} />
        </button>
      </div>
      {thread.quote && <div className="card-quote">{thread.quote}</div>}
      {editing ? (
        <div onClick={(e) => e.stopPropagation()}>
          <textarea
            className="textarea"
            rows={3}
            autoFocus
            placeholder="Add a comment…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                update({ text })
                setEditing(false)
              }
            }}
          />
          <div className="card-actions">
            <button className="btn sm primary" disabled={!text.trim()} onClick={() => (update({ text }), setEditing(false))}>
              Post
            </button>
            <button className="btn sm ghost" onClick={() => (thread.text ? setEditing(false) : remove())}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="card-text">{thread.text}</div>
      )}
      {thread.replies.map((r) => (
        <div key={r.id} className="reply">
          <div className="card-head" style={{ marginBottom: 2 }}>
            <span className="avatar" style={{ background: avatarColor(r.author), width: 22, height: 22, fontSize: 10 }}>
              {r.initials}
            </span>
            <div className="card-meta">
              <b>{r.author}</b>
              <span>{timeAgo(r.date)}</span>
            </div>
          </div>
          <div className="card-text">{r.text}</div>
        </div>
      ))}
      {active && !editing && (
        <div onClick={(e) => e.stopPropagation()}>
          <div className="reply" style={{ display: 'flex', gap: 6 }}>
            <input
              className="input"
              placeholder="Reply…"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && reply.trim()) {
                  update({ replies: [...thread.replies, { id: uid('r'), author: settings.userName, initials: settings.userInitials, date: Date.now(), text: reply.trim() }] })
                  setReply('')
                }
              }}
            />
            <button
              className="icon-btn"
              disabled={!reply.trim()}
              onClick={() => {
                update({ replies: [...thread.replies, { id: uid('r'), author: settings.userName, initials: settings.userInitials, date: Date.now(), text: reply.trim() }] })
                setReply('')
              }}
              aria-label="Send reply"
            >
              <Reply size={16} />
            </button>
          </div>
          <div className="card-actions">
            <button className="btn sm" onClick={() => setEditing(true)}>
              <Pencil size={13} /> Edit
            </button>
            <button className="btn sm" onClick={() => update({ resolved: !thread.resolved })}>
              {thread.resolved ? <RotateCcw size={13} /> : <CheckCircle2 size={13} />} {thread.resolved ? 'Reopen' : 'Resolve'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ChangesPane(): ReactNode {
  const editor = useActiveEditor()
  const doc = useActiveDoc()
  if (!editor || !doc) return null
  const changes = collectChanges(editor.state.doc)
  return (
    <>
      <div style={{ padding: '0 12px 10px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="btn sm" disabled={!changes.length} onClick={() => editor.chain().focus().acceptAllChanges().run()}>
          <Check size={14} /> Accept all
        </button>
        <button className="btn sm" disabled={!changes.length} onClick={() => editor.chain().focus().rejectAllChanges().run()}>
          <XCircle size={14} /> Reject all
        </button>
      </div>
      <div className="pane-body">
        <div className="hint" style={{ padding: '0 4px 10px' }}>
          {changes.length} change{changes.length === 1 ? '' : 's'} · {changes.filter((c) => c.type === 'insertion').length} insertions, {changes.filter((c) => c.type === 'deletion').length} deletions
        </div>
        {!changes.length && (
          <div className="pane-empty">
            <FilePenLine size={28} />
            No tracked changes. Turn on Track Changes (Ctrl+Shift+E) and your edits will be listed here.
          </div>
        )}
        {changes.map((c, i) => (
          <div
            key={`${c.id}-${i}`}
            className="card"
            onClick={() => {
              editor.chain().focus().setTextSelection({ from: c.from, to: c.to }).run()
              scrollSelectionIntoView(editor)
            }}
          >
            <div className="card-head">
              <span className="avatar" style={{ background: avatarColor(c.author || '?') }}>
                {(c.author || '?').slice(0, 2).toUpperCase()}
              </span>
              <div className="card-meta">
                <b>{c.type === 'insertion' ? 'Inserted' : 'Deleted'}</b>
                <span>
                  {c.author} · {c.date ? timeAgo(c.date) : ''}
                </span>
              </div>
            </div>
            <div className={`card-text ${c.type === 'insertion' ? 'change-ins' : 'change-del'}`}>{c.text.length > 160 ? c.text.slice(0, 160) + '…' : c.text}</div>
            <div className="card-actions">
              <button className="btn sm" onClick={(e) => (e.stopPropagation(), editor.chain().focus().acceptChange(c.id).run())}>
                <Check size={13} /> Accept
              </button>
              <button className="btn sm" onClick={(e) => (e.stopPropagation(), editor.chain().focus().rejectChange(c.id).run())}>
                <XCircle size={13} /> Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function VersionsPane(): ReactNode {
  const doc = useActiveDoc()
  const editor = useActiveEditor()
  const [list, setList] = useState<VersionEntry[] | null>(null)
  const [preview, setPreview] = useState<{ v: VersionEntry; html: string; payload: PedPayload } | null>(null)
  const reload = (): void => {
    if (doc) void window.pe.versions.list(doc.id).then(setList)
  }
  useEffect(reload, [doc?.id])
  if (!doc || !editor) return null

  const load = async (v: VersionEntry): Promise<PedPayload | null> => {
    const data = await window.pe.versions.get(doc.id, v.id)
    return data ? (JSON.parse(data) as PedPayload) : null
  }
  const restore = async (v: VersionEntry): Promise<void> => {
    const p = await load(v)
    if (!p) return
    await snapshot(doc.id, 'restore', 'Before restoring an earlier version')
    editor.commands.setContent(p.content)
    useApp.getState().updateDoc(doc.id, { page: p.page, styles: p.styles, comments: p.comments, sources: p.sources })
    markDirty(doc.id)
    useApp.getState().toast(`Restored the version from ${new Date(v.createdAt).toLocaleString()}. You can undo with Ctrl+Z.`, 'success')
    setPreview(null)
    reload()
  }
  const groups = new Map<string, VersionEntry[]>()
  for (const v of list ?? []) {
    const day = new Date(v.createdAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
    groups.set(day, [...(groups.get(day) ?? []), v])
  }
  return (
    <>
      <div style={{ padding: '0 12px 10px', display: 'flex', gap: 6 }}>
        <button className="btn sm primary" onClick={() => void snapshot(doc.id, 'manual', 'Saved version').then(reload)}>
          <Save size={14} /> Save a version now
        </button>
      </div>
      <div className="pane-body">
        {list && !list.length && (
          <div className="pane-empty">
            <History size={28} />
            Versions are saved automatically while you work and every time you save.
          </div>
        )}
        {[...groups.entries()].map(([day, vs]) => (
          <div key={day}>
            <div className="section-label" style={{ margin: '10px 4px 6px' }}>{day}</div>
            {vs.map((v) => (
              <div key={v.id} className="card" style={{ padding: '8px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 13 }}>{new Date(v.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</b>
                    <span className="hint"> · {v.label || { auto: 'Autosaved', save: 'Saved', manual: 'Saved version', restore: 'Before restore' }[v.reason]}</span>
                    <div className="hint">{v.words.toLocaleString()} words</div>
                  </div>
                  <button
                    className="icon-btn sm"
                    data-tip="Preview"
                    onClick={async () => {
                      const p = await load(v)
                      if (!p) return
                      const html = generateHTML(p.content, buildExtensions({ baseFontSize: () => p.styles.fontSize }))
                      setPreview({ v, html, payload: p })
                    }}
                  >
                    <Eye size={15} />
                  </button>
                  <button className="icon-btn sm" data-tip="Restore this version" onClick={() => void restore(v)}>
                    <RotateCcw size={15} />
                  </button>
                  <button
                    className="icon-btn sm"
                    data-tip="Open as a copy"
                    onClick={async () => {
                      const p = await load(v)
                      if (p) openPayload(p, { title: `${doc.title} (${new Date(v.createdAt).toLocaleString()})`, asCopy: true })
                    }}
                  >
                    <Copy size={15} />
                  </button>
                  <button className="icon-btn sm" data-tip="Delete version" onClick={() => void window.pe.versions.remove(doc.id, v.id).then(reload)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      {preview && (
        <VersionPreview
          title={`${new Date(preview.v.createdAt).toLocaleString()} · ${preview.v.words.toLocaleString()} words`}
          html={preview.html}
          payload={preview.payload}
          onClose={() => setPreview(null)}
          onRestore={() => void restore(preview.v)}
        />
      )}
    </>
  )
}

function VersionPreview({ title, html, payload, onClose, onRestore }: { title: string; html: string; payload: PedPayload; onClose: () => void; onRestore: () => void }): ReactNode {
  const vars = useMemo(
    () =>
      ({
        '--doc-font': fontStack(payload.styles.bodyFont),
        '--doc-heading-font': fontStack(payload.styles.headingFont),
        '--doc-size': `${payload.styles.fontSize}pt`,
        '--doc-line': String(payload.styles.lineHeight),
        '--doc-heading-color': payload.styles.headingColor
      }) as React.CSSProperties,
    [payload]
  )
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog xwide" style={{ height: 'calc(100vh - 80px)' }}>
        <div className="dialog-head">
          <History size={20} />
          <div className="dialog-title">Version from {title}</div>
          <button className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="dialog-body" style={{ background: 'var(--canvas)', padding: 24 }}>
          <div className="pe-stack" style={{ ...vars, background: '#fff', maxWidth: 800, margin: '0 auto', padding: '48px 64px', boxShadow: 'var(--shadow-page)' }}>
            <div className="pe-doc" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>
        <div className="dialog-foot">
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn primary" onClick={onRestore}>
            <RotateCcw size={14} /> Restore this version
          </button>
        </div>
      </div>
    </div>
  )
}

function StylesPane(): ReactNode {
  const editor = useActiveEditor()
  const doc = useActiveDoc()
  if (!editor || !doc) return null
  const vars = { '--h-color': doc.styles.headingColor, '--h-font': fontStack(doc.styles.headingFont), '--h-accent': doc.styles.accent } as React.CSSProperties
  return (
    <div className="pane-body" style={vars}>
      {STYLE_PRESETS.map((s) => (
        <button
          key={s.id}
          className={`nav-heading ${s.isActive(editor) ? 'current' : ''}`}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px' }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => s.apply(editor)}
        >
          <span style={{ ...s.sample, fontSize: Math.min(Number(s.sample.fontSize ?? 13), 16) }}>{s.name}</span>
          <Heading size={13} color="var(--text-3)" />
        </button>
      ))}
      <div className="menu-sep" />
      <button className="btn sm" style={{ margin: 8 }} onClick={() => editor.chain().focus().unsetAllMarks().setParagraphStyle('normal').run()}>
        Clear All Formatting
      </button>
    </div>
  )
}

const ignored = new Set<string>()

function SpellingPane(): ReactNode {
  const editor = useActiveEditor()
  const doc = useActiveDoc()
  const [tick, setTick] = useState(0)
  const issues = useMemo(() => {
    if (!editor) return []
    const counts = new Map<string, number>()
    const text = editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n', ' ')
    for (const m of text.matchAll(/\p{L}[\p{L}'’]*\p{L}|\p{L}/gu)) {
      const w = m[0]
      if (w.length < 2 || ignored.has(w)) continue
      counts.set(w, (counts.get(w) ?? 0) + 1)
    }
    const out: { word: string; count: number; suggestions: string[] }[] = []
    for (const [w, n] of counts) {
      if (window.pe.spell.isMisspelled(w)) out.push({ word: w, count: n, suggestions: window.pe.spell.suggestions(w).slice(0, 5) })
      if (out.length > 200) break
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, doc?.changeCounter, tick])
  if (!editor || !doc) return null

  const findWord = (word: string): void => {
    editor.commands.setSearch(word, { caseSensitive: true, wholeWord: true, regex: false })
    editor.commands.findNext()
  }
  const replaceAll = (word: string, rep: string): void => {
    editor.commands.setSearch(word, { caseSensitive: true, wholeWord: true, regex: false })
    editor.commands.replaceAll(rep)
    editor.commands.clearSearch()
    setTick((t) => t + 1)
  }
  return (
    <div className="pane-body">
      <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <SpellCheck size={26} color={issues.length ? 'var(--warning)' : 'var(--success)'} />
        <div>
          <b style={{ fontSize: 15 }}>{issues.length ? `${issues.length} spelling suggestion${issues.length === 1 ? '' : 's'}` : 'No spelling issues found'}</b>
          <div className="hint">{doc.stats.words.toLocaleString()} words checked</div>
        </div>
      </div>
      {issues.map((it) => (
        <div key={it.word} className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button className="btn ghost sm" style={{ fontWeight: 700, textDecoration: 'underline wavy #d1343b', padding: '0 4px' }} onClick={() => findWord(it.word)}>
              {it.word}
            </button>
            <span className="hint">×{it.count}</span>
            <span style={{ flex: 1 }} />
            <button className="icon-btn sm" data-tip="Ignore" onClick={() => (ignored.add(it.word), setTick((t) => t + 1))}>
              <EyeOff size={14} />
            </button>
            <button className="icon-btn sm" data-tip="Add to dictionary" onClick={() => void window.pe.spell.add(it.word).then(() => (ignored.add(it.word), setTick((t) => t + 1)))}>
              <BookPlus size={14} />
            </button>
          </div>
          <div className="card-actions">
            {it.suggestions.length ? (
              it.suggestions.map((s) => (
                <button key={s} className="btn sm" onClick={() => replaceAll(it.word, s)} data-tip={`Change all to “${s}”`}>
                  {s}
                </button>
              ))
            ) : (
              <span className="hint">No suggestions</span>
            )}
          </div>
        </div>
      ))}
      <div className="hint" style={{ padding: 8 }}>
        <FileText size={12} style={{ verticalAlign: -2 }} /> Misspelled words are also underlined in red. Right-click one for quick fixes.
      </div>
    </div>
  )
}
