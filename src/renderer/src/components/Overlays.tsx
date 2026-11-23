import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Search,
  X,
  ChevronUp,
  ChevronDown,
  CaseSensitive,
  WholeWord,
  Regex,
  Replace,
  ReplaceAll,
  CheckCircle2,
  AlertCircle,
  Info,
  Scissors,
  Copy,
  ClipboardPaste,
  ClipboardType,
  Link2,
  MessageSquarePlus,
  Type,
  Pilcrow,
  BookPlus,
  Rows3,
  Columns3,
  Trash2,
  TableCellsMerge,
  Image as ImageIcon,
  ExternalLink,
  Unlink,
  Check,
  XCircle,
  Globe,
  Pilcrow as PIcon,
  Heading1,
  Heading2,
  Heading3,
  Type as TypeIcon,
  List,
  ListOrdered,
  ListChecks,
  Table as TableI,
  Quote,
  MessageSquareQuote,
  SquareDashed,
  Code2,
  Minus,
  FileDown,
  Columns2,
  Sigma,
  PenLine,
  BarChart3,
  ListTree,
  Superscript,
  CalendarDays,
  Omega,
  Image as ImageI
} from 'lucide-react'
import { useApp, activeEditor } from '@/state/store'
import { allCommands, clipboardAction, newComment, pasteText } from '@/state/commands'
import { useSlash } from '@/editor/ext/keymap'
import { useActiveEditor, Popover, MenuList, fmtKeys, type MenuItemDef } from './ui'
import { NodeSelection } from '@tiptap/pm/state'

// ------------------------------------------------------------------ command palette

export function CommandPalette(): ReactNode {
  const open = useApp((s) => s.palette)
  const [q, setQ] = useState('')
  const [hot, setHot] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const cmds = useMemo(() => (open ? allCommands() : []), [open])
  const results = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return cmds.slice(0, 40)
    const words = query.split(/\s+/)
    return cmds
      .map((c) => {
        const hay = `${c.label} ${c.group} ${c.keywords ?? ''}`.toLowerCase()
        if (!words.every((w) => hay.includes(w))) return null
        const score = (c.label.toLowerCase().startsWith(query) ? 10 : 0) + (c.label.toLowerCase().includes(query) ? 5 : 0)
        return { c, score }
      })
      .filter(Boolean)
      .sort((a, b) => b!.score - a!.score)
      .map((x) => x!.c)
      .slice(0, 60)
  }, [q, cmds])
  useEffect(() => {
    setHot(0)
  }, [q])
  useEffect(() => {
    if (open) setQ('')
  }, [open])
  useEffect(() => {
    listRef.current?.querySelector('.hot')?.scrollIntoView({ block: 'nearest' })
  }, [hot])
  if (!open) return null
  const close = (): void => useApp.getState().set({ palette: false })
  const run = (i: number): void => {
    const c = results[i]
    close()
    if (c) setTimeout(() => c.run(), 0)
  }
  return createPortal(
    <div className="overlay" style={{ background: 'rgba(15,20,30,.18)', placeItems: 'start center' }} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-label="Search commands">
        <div className="palette-input">
          <Search size={18} color="var(--text-3)" />
          <input
            autoFocus
            placeholder="What do you want to do? Try “table”, “pdf”, “margins”…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setHot((h) => Math.min(results.length - 1, h + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setHot((h) => Math.max(0, h - 1))
              } else if (e.key === 'Enter') run(hot)
              else if (e.key === 'Escape') close()
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list" ref={listRef}>
          {results.length === 0 && <div className="pane-empty">No matching commands.</div>}
          {results.map((c, i) => (
            <button key={c.id} className={`palette-item ${i === hot ? 'hot' : ''}`} onMouseEnter={() => setHot(i)} onClick={() => run(i)}>
              <span>{c.label}</span>
              <span className="group">{c.group}</span>
              {c.keys && <kbd>{fmtKeys(c.keys)}</kbd>}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}

// ------------------------------------------------------------------ slash menu

const SLASH_ICONS: Record<string, ReactNode> = {
  Pilcrow: <PIcon size={16} />,
  Heading1: <Heading1 size={16} />,
  Heading2: <Heading2 size={16} />,
  Heading3: <Heading3 size={16} />,
  Type: <TypeIcon size={16} />,
  List: <List size={16} />,
  ListOrdered: <ListOrdered size={16} />,
  ListChecks: <ListChecks size={16} />,
  Table: <TableI size={16} />,
  Image: <ImageI size={16} />,
  Quote: <Quote size={16} />,
  MessageSquareQuote: <MessageSquareQuote size={16} />,
  SquareDashed: <SquareDashed size={16} />,
  Code2: <Code2 size={16} />,
  Minus: <Minus size={16} />,
  FileDown: <FileDown size={16} />,
  Columns2: <Columns2 size={16} />,
  Sigma: <Sigma size={16} />,
  PenLine: <PenLine size={16} />,
  BarChart3: <BarChart3 size={16} />,
  ListTree: <ListTree size={16} />,
  Superscript: <Superscript size={16} />,
  CalendarDays: <CalendarDays size={16} />,
  Omega: <Omega size={16} />
}

export function SlashMenu(): ReactNode {
  const { open, items, index, rect, command } = useSlash()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector('.hot')?.scrollIntoView({ block: 'nearest' })
  }, [index])
  if (!open || !rect || !items.length) return null
  return (
    <Popover anchor={rect} onClose={() => useSlash.setState({ open: false })} className="slash-menu">
      <div ref={ref}>
        <div className="menu-label">Insert</div>
        {items.map((it, i) => (
          <button key={it.id} className={`slash-item ${i === index ? 'hot' : ''}`} onMouseEnter={() => useSlash.setState({ index: i })} onClick={() => command?.(it)}>
            <span className="slash-ic">{SLASH_ICONS[it.icon] ?? <PIcon size={16} />}</span>
            <span>
              <b>{it.title}</b>
              <span>{it.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </Popover>
  )
}

// ------------------------------------------------------------------ find & replace

export function FindBar(): ReactNode {
  const find = useApp((s) => s.find)
  const editor = useActiveEditor()
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [, setTick] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!editor) return
    const l = (): void => setTick((t) => t + 1)
    editor.storage.search.listeners.add(l)
    return () => {
      editor.storage.search.listeners.delete(l)
    }
  }, [editor])
  useEffect(() => {
    if (find.open) {
      const q = editor?.storage.search.query
      if (q) setQuery(q)
      setTimeout(() => inputRef.current?.select(), 0)
    }
  }, [find.open, editor])
  if (!find.open || !editor) return null
  const s = editor.storage.search
  const opts = s.options
  const close = (): void => {
    editor.commands.clearSearch()
    useApp.getState().set({ find: { open: false, replace: false } })
    editor.commands.focus()
  }
  const setOpt = (k: keyof typeof opts): void => {
    editor.commands.setSearch(query, { [k]: !opts[k] })
  }
  return (
    <div className="findbar" role="search">
      <div className="findbar-row">
        <button className="icon-btn sm" onClick={() => useApp.getState().set({ find: { ...find, replace: !find.replace } })} aria-label="Toggle replace" data-tip="Toggle Replace">
          {find.replace ? <ChevronDown size={15} /> : <ChevronUp size={15} style={{ transform: 'rotate(90deg)' }} />}
        </button>
        <input
          ref={inputRef}
          className="input"
          placeholder="Find in document"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            editor.commands.setSearch(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (e.shiftKey) editor.commands.findPrevious()
              else editor.commands.findNext()
            }
            if (e.key === 'Escape') close()
          }}
        />
        <span className="findbar-count">{s.query ? (s.matches.length ? `${s.current + 1} of ${s.matches.length}` : 'No results') : ''}</span>
        <button className={`icon-btn sm opt ${opts.caseSensitive ? 'on' : ''}`} onClick={() => setOpt('caseSensitive')} data-tip="Match Case">
          <CaseSensitive size={16} />
        </button>
        <button className={`icon-btn sm opt ${opts.wholeWord ? 'on' : ''}`} onClick={() => setOpt('wholeWord')} data-tip="Whole Words Only">
          <WholeWord size={16} />
        </button>
        <button className={`icon-btn sm opt ${opts.regex ? 'on' : ''}`} onClick={() => setOpt('regex')} data-tip="Use Regular Expressions">
          <Regex size={16} />
        </button>
        <button className="icon-btn sm" onClick={() => editor.commands.findPrevious()} data-tip="Previous" data-tip-keys="Shift+Enter">
          <ChevronUp size={16} />
        </button>
        <button className="icon-btn sm" onClick={() => editor.commands.findNext()} data-tip="Next" data-tip-keys="Enter">
          <ChevronDown size={16} />
        </button>
        <button className="icon-btn sm" onClick={close} data-tip="Close" data-tip-keys="Esc">
          <X size={16} />
        </button>
      </div>
      {find.replace && (
        <div className="findbar-row" style={{ paddingLeft: 28 }}>
          <input
            className="input"
            placeholder="Replace with"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                editor.commands.replaceCurrent(replacement)
                editor.commands.findNext()
              }
              if (e.key === 'Escape') close()
            }}
          />
          <button
            className="btn sm"
            onClick={() => {
              editor.commands.replaceCurrent(replacement)
              editor.commands.findNext()
            }}
            disabled={!s.matches.length}
          >
            <Replace size={14} /> Replace
          </button>
          <button
            className="btn sm"
            onClick={() => {
              const n = s.matches.length
              editor.commands.replaceAll(replacement)
              useApp.getState().toast(`Replaced ${n} occurrence${n === 1 ? '' : 's'}.`, 'success')
            }}
            disabled={!s.matches.length}
          >
            <ReplaceAll size={14} /> All
          </button>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ toasts

export function Toasts(): ReactNode {
  const toasts = useApp((s) => s.toasts)
  return createPortal(
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.kind === 'success' ? <CheckCircle2 size={17} /> : t.kind === 'error' ? <AlertCircle size={17} /> : <Info size={17} />}
          <span>{t.text}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action!.run()
                useApp.getState().dismissToast(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
          <button onClick={() => useApp.getState().dismissToast(t.id)} aria-label="Dismiss" style={{ background: 'transparent', padding: 2 }}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>,
    document.body
  )
}

// ------------------------------------------------------------------ context menu

export function ContextMenu(): ReactNode {
  const cm = useApp((s) => s.contextMenu)
  if (!cm) return null
  const editor = activeEditor()
  const close = (): void => useApp.getState().set({ contextMenu: null })
  const items: MenuItemDef[] = []
  if (cm.misspelledWord) {
    if (cm.dictionarySuggestions.length) {
      for (const s of cm.dictionarySuggestions.slice(0, 6)) items.push({ label: s, className: 'menu-suggestion', onClick: () => void window.pe.spell.replace(s) })
    } else items.push({ label: 'No spelling suggestions', disabled: true })
    items.push({ label: 'Add to Dictionary', icon: <BookPlus size={16} />, onClick: () => void window.pe.spell.add(cm.misspelledWord) })
    items.push({ sep: true })
  }
  if (cm.isEditable && editor && editor.view.dom.contains(document.elementFromPoint(cm.clientX, cm.clientY))) {
    const sel = editor.state.selection
    const inTable = editor.isActive('table')
    const isImage = sel instanceof NodeSelection && sel.node.type.name === 'image'
    const link = editor.getAttributes('link').href as string | undefined
    const change = editor.isActive('insertion') || editor.isActive('deletion')
    items.push(
      { label: 'Cut', icon: <Scissors size={16} />, shortcut: 'Ctrl+X', disabled: sel.empty, onClick: () => clipboardAction('cut') },
      { label: 'Copy', icon: <Copy size={16} />, shortcut: 'Ctrl+C', disabled: sel.empty, onClick: () => clipboardAction('copy') },
      { label: 'Paste', icon: <ClipboardPaste size={16} />, shortcut: 'Ctrl+V', onClick: () => clipboardAction('paste') },
      { label: 'Paste as Text', icon: <ClipboardType size={16} />, shortcut: 'Ctrl+Shift+V', onClick: () => void pasteText() },
      { sep: true }
    )
    if (change) {
      items.push(
        { label: 'Accept Change', icon: <Check size={16} />, onClick: () => editor.chain().focus().acceptChangeAt().run() },
        { label: 'Reject Change', icon: <XCircle size={16} />, onClick: () => editor.chain().focus().rejectChangeAt().run() },
        { sep: true }
      )
    }
    if (inTable) {
      items.push({
        label: 'Table',
        icon: <TableI size={16} />,
        submenu: [
          { label: 'Insert Row Above', icon: <Rows3 size={16} />, onClick: () => editor.chain().focus().addRowBefore().run() },
          { label: 'Insert Row Below', icon: <Rows3 size={16} />, onClick: () => editor.chain().focus().addRowAfter().run() },
          { label: 'Insert Column Left', icon: <Columns3 size={16} />, onClick: () => editor.chain().focus().addColumnBefore().run() },
          { label: 'Insert Column Right', icon: <Columns3 size={16} />, onClick: () => editor.chain().focus().addColumnAfter().run() },
          { sep: true },
          { label: 'Merge Cells', icon: <TableCellsMerge size={16} />, disabled: !editor.can().mergeCells(), onClick: () => editor.chain().focus().mergeCells().run() },
          { label: 'Split Cell', disabled: !editor.can().splitCell(), onClick: () => editor.chain().focus().splitCell().run() },
          { sep: true },
          { label: 'Delete Row', icon: <Trash2 size={16} />, onClick: () => editor.chain().focus().deleteRow().run() },
          { label: 'Delete Column', icon: <Trash2 size={16} />, onClick: () => editor.chain().focus().deleteColumn().run() },
          { label: 'Delete Table', icon: <Trash2 size={16} />, danger: true, onClick: () => editor.chain().focus().deleteTable().run() }
        ]
      })
    }
    if (isImage) {
      items.push(
        { label: 'Picture Format', icon: <ImageIcon size={16} />, onClick: () => useApp.getState().set({ ribbonTab: 'picture' }) },
        { label: 'Edit Alt Text…', onClick: () => useApp.getState().openDialog('imageProps') },
        { label: 'Insert Caption…', onClick: () => useApp.getState().openDialog('caption') },
        { sep: true }
      )
    }
    items.push(
      { label: 'Font…', icon: <Type size={16} />, onClick: () => useApp.getState().openDialog('font') },
      { label: 'Paragraph…', icon: <Pilcrow size={16} />, onClick: () => useApp.getState().openDialog('paragraph') },
      { sep: true }
    )
    if (link) {
      items.push(
        { label: 'Open Link', icon: <ExternalLink size={16} />, onClick: () => void window.pe.shell.openExternal(link) },
        { label: 'Edit Link…', icon: <Link2 size={16} />, onClick: () => useApp.getState().openDialog('link') },
        { label: 'Remove Link', icon: <Unlink size={16} />, onClick: () => editor.chain().focus().extendMarkRange('link').unsetLink().run() }
      )
    } else items.push({ label: 'Link…', icon: <Link2 size={16} />, shortcut: 'Ctrl+K', onClick: () => useApp.getState().openDialog('link') })
    items.push({ label: 'New Comment', icon: <MessageSquarePlus size={16} />, shortcut: 'Ctrl+Alt+M', onClick: () => newComment() })
    if (cm.selectionText.trim()) {
      items.push({ sep: true }, { label: `Search the web for “${cm.selectionText.trim().slice(0, 24)}${cm.selectionText.length > 24 ? '…' : ''}”`, icon: <Globe size={16} />, onClick: () => void window.pe.shell.openExternal(`https://www.bing.com/search?q=${encodeURIComponent(cm.selectionText.trim())}`) })
    }
  } else if (cm.isEditable) {
    items.push(
      { label: 'Cut', icon: <Scissors size={16} />, onClick: () => document.execCommand('cut') },
      { label: 'Copy', icon: <Copy size={16} />, onClick: () => document.execCommand('copy') },
      { label: 'Paste', icon: <ClipboardPaste size={16} />, onClick: () => void window.pe.clipboard.paste() }
    )
  } else if (cm.selectionText) {
    items.push({ label: 'Copy', icon: <Copy size={16} />, onClick: () => document.execCommand('copy') })
  }
  while (items.length && items[items.length - 1].sep) items.pop()
  if (!items.length) return null
  return (
    <Popover anchor={{ x: cm.clientX, y: cm.clientY }} onClose={close} offset={0}>
      <MenuList items={items} close={close} />
    </Popover>
  )
}

export function DropOverlay(): ReactNode {
  const [over, setOver] = useState(false)
  useEffect(() => {
    let depth = 0
    const isFiles = (e: DragEvent): boolean => !!e.dataTransfer?.types.includes('Files')
    const enter = (e: DragEvent): void => {
      if (!isFiles(e)) return
      depth++
      const target = e.target as HTMLElement
      if (target.closest?.('.pe-doc')) return
      setOver(true)
    }
    const leave = (): void => {
      depth = Math.max(0, depth - 1)
      if (!depth) setOver(false)
    }
    const drop = (): void => {
      depth = 0
      setOver(false)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [])
  if (!over) return null
  return <div className="drop-overlay">Drop documents to open them</div>
}
