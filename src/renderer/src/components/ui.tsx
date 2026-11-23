import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/core'
import { Check, X } from 'lucide-react'
import { useApp, getEditor } from '@/state/store'

// ------------------------------------------------------------------ shortcut labels

/** Show shortcuts the way each platform writes them: Ctrl+Shift+S on Windows, ⇧⌘S on a Mac. */
export function fmtKeys(keys: string | undefined): string {
  if (!keys) return ''
  if (useApp.getState().platform !== 'darwin') return keys
  return keys
    .split(' / ')
    .map((combo) => {
      const parts = combo.split('+')
      const key = parts.pop() ?? ''
      const mods = parts.map((p) => ({ Ctrl: '⌘', Alt: '⌥', Shift: '⇧', Cmd: '⌘' })[p] ?? p)
      // macOS orders modifiers as ⌃⌥⇧⌘.
      const order = ['⌃', '⌥', '⇧', '⌘']
      mods.sort((a, b) => order.indexOf(a) - order.indexOf(b))
      return mods.join('') + (key === 'Enter' ? '↩' : key === 'Space' ? 'Space' : key)
    })
    .join(' / ')
}

// ------------------------------------------------------------------ editor subscription

/** Returns the active editor and re-renders on every editor transaction (batched per frame). */
export function useActiveEditor(): Editor | null {
  const activeId = useApp((s) => s.activeId)
  const [, setTick] = useState(0)
  const editor = getEditor(activeId)
  const docsLen = useApp((s) => s.docs.length)
  useEffect(() => {
    if (!editor) return
    let frame = 0
    const onTx = (): void => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        setTick((t) => t + 1)
      })
    }
    editor.on('transaction', onTx)
    return () => {
      editor.off('transaction', onTx)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [editor])
  // Editors register after mount; poll briefly until it exists.
  useEffect(() => {
    if (editor || !activeId) return
    const t = setInterval(() => {
      if (getEditor(activeId)) {
        setTick((x) => x + 1)
        clearInterval(t)
      }
    }, 50)
    return () => clearInterval(t)
  }, [editor, activeId, docsLen])
  return editor
}

// ------------------------------------------------------------------ popover

type Anchor = HTMLElement | DOMRect | { x: number; y: number } | null

function anchorRect(a: Anchor): DOMRect | null {
  if (!a) return null
  if (a instanceof HTMLElement) return a.getBoundingClientRect()
  if ('width' in a) return a as DOMRect
  return new DOMRect(a.x, a.y, 0, 0)
}

export function Popover({
  anchor,
  onClose,
  children,
  placement = 'bottom-start',
  className = '',
  style,
  offset = 4
}: {
  anchor: Anchor
  onClose: () => void
  children: ReactNode
  placement?: 'bottom-start' | 'bottom-end' | 'right-start' | 'top-start'
  className?: string
  style?: CSSProperties
  offset?: number
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const r = anchorRect(anchor)
    const el = ref.current
    if (!r || !el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    let left = placement === 'bottom-end' ? r.right - w : placement === 'right-start' ? r.right + offset : r.left
    let top = placement === 'right-start' ? r.top - 6 : placement === 'top-start' ? r.top - h - offset : r.bottom + offset
    if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8)
    if (left < 8) left = 8
    if (top + h > window.innerHeight - 8) {
      const above = r.top - h - offset
      top = above > 8 ? above : Math.max(8, window.innerHeight - h - 8)
    }
    setPos({ left, top })
  }, [anchor, placement, offset])

  useEffect(() => {
    const down = (e: MouseEvent): void => {
      const t = e.target as Node
      if (ref.current?.contains(t)) return
      if (anchor instanceof HTMLElement && anchor.contains(t)) return
      // Clicks inside nested popovers (rendered later in the DOM) shouldn't close this one.
      if ((t as HTMLElement).closest?.('.popover') && !ref.current?.contains(t)) {
        const all = Array.from(document.querySelectorAll('.popover'))
        if (all.indexOf((t as HTMLElement).closest('.popover')!) > all.indexOf(ref.current!)) return
      }
      onClose()
    }
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    const t = setTimeout(() => document.addEventListener('mousedown', down, true), 0)
    window.addEventListener('keydown', key, true)
    window.addEventListener('blur', onClose)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', down, true)
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('blur', onClose)
    }
  }, [anchor, onClose])

  return createPortal(
    <div
      ref={ref}
      className={`popover ${className}`}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, ...style }}
      onMouseDown={(e) => {
        // Keep the editor selection when clicking popover chrome (but allow inputs to focus).
        const tag = (e.target as HTMLElement).tagName
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') e.preventDefault()
      }}
    >
      {children}
    </div>,
    document.body
  )
}

/** A trigger that toggles a popover. */
export function Dropdown({
  trigger,
  children,
  placement,
  className
}: {
  trigger: (props: { open: boolean; toggle: () => void; ref: (el: HTMLElement | null) => void }) => ReactNode
  children: (close: () => void) => ReactNode
  placement?: 'bottom-start' | 'bottom-end' | 'right-start'
  className?: string
}): ReactNode {
  const [open, setOpen] = useState(false)
  const [el, setEl] = useState<HTMLElement | null>(null)
  const close = useCallback(() => setOpen(false), [])
  return (
    <>
      {trigger({ open, toggle: () => setOpen((o) => !o), ref: setEl })}
      {open && el && (
        <Popover anchor={el} onClose={close} placement={placement} className={className}>
          {children(close)}
        </Popover>
      )}
    </>
  )
}

export interface MenuItemDef {
  label?: string
  icon?: ReactNode
  shortcut?: string
  onClick?: () => void
  checked?: boolean
  disabled?: boolean
  danger?: boolean
  sep?: boolean
  heading?: string
  className?: string
  submenu?: MenuItemDef[]
}

export function MenuList({ items, close }: { items: MenuItemDef[]; close: () => void }): ReactNode {
  return (
    <div role="menu">
      {items.map((it, i) =>
        it.sep ? (
          <div key={i} className="menu-sep" />
        ) : it.heading ? (
          <div key={i} className="menu-label">
            {it.heading}
          </div>
        ) : it.submenu ? (
          <SubMenu key={i} item={it} close={close} />
        ) : (
          <button
            key={i}
            className={`menu-item ${it.checked ? 'checked' : ''} ${it.danger ? 'danger' : ''} ${it.className ?? ''}`}
            disabled={it.disabled}
            onClick={() => {
              close()
              it.onClick?.()
            }}
          >
            {it.icon}
            <span>{it.label}</span>
            {it.shortcut && <span className="menu-shortcut">{fmtKeys(it.shortcut)}</span>}
          </button>
        )
      )}
    </div>
  )
}

function SubMenu({ item, close }: { item: MenuItemDef; close: () => void }): ReactNode {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button ref={setEl} className={`menu-item ${open ? 'hot' : ''}`} onMouseEnter={() => setOpen(true)} onClick={() => setOpen(true)}>
        {item.icon}
        <span>{item.label}</span>
        <span className="menu-shortcut">›</span>
      </button>
      {open && el && (
        <Popover anchor={el} onClose={() => setOpen(false)} placement="right-start">
          <MenuList items={item.submenu!} close={close} />
        </Popover>
      )}
    </>
  )
}

// ------------------------------------------------------------------ tooltips (data attributes)

export function TooltipLayer(): ReactNode {
  const [tip, setTip] = useState<{ title: string; text?: string; keys?: string; x: number; y: number } | null>(null)
  useEffect(() => {
    let timer: number | null = null
    let current: HTMLElement | null = null
    const over = (e: MouseEvent): void => {
      const el = (e.target as HTMLElement).closest?.('[data-tip]') as HTMLElement | null
      if (el === current) return
      current = el
      if (timer) clearTimeout(timer)
      setTip(null)
      if (!el) return
      timer = window.setTimeout(() => {
        if (!el.isConnected) return
        const r = el.getBoundingClientRect()
        setTip({
          title: el.dataset.tip || '',
          text: el.dataset.tipText,
          keys: el.dataset.tipKeys,
          x: Math.min(r.left, window.innerWidth - 290),
          y: r.bottom + 6
        })
      }, 550)
    }
    const hide = (): void => {
      if (timer) clearTimeout(timer)
      current = null
      setTip(null)
    }
    document.addEventListener('mouseover', over)
    document.addEventListener('mousedown', hide, true)
    window.addEventListener('blur', hide)
    return () => {
      document.removeEventListener('mouseover', over)
      document.removeEventListener('mousedown', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])
  if (!tip) return null
  const y = tip.y + 80 > window.innerHeight ? tip.y - 90 : tip.y
  return createPortal(
    <div className="tooltip" style={{ left: tip.x, top: y }}>
      <b>
        {tip.title}
        {tip.keys ? ` (${tip.keys})` : ''}
      </b>
      {tip.text && <span>{tip.text}</span>}
    </div>,
    document.body
  )
}

export function tip(title: string, keys?: string, text?: string): Record<string, string | undefined> {
  return { 'data-tip': title, 'data-tip-keys': keys, 'data-tip-text': text }
}

// ------------------------------------------------------------------ dialog shell

export function Dialog({
  title,
  children,
  footer,
  onClose,
  size = '',
  icon
}: {
  title: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  size?: '' | 'wide' | 'xwide'
  icon?: ReactNode
}): ReactNode {
  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !document.querySelector('.popover')) {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog ${size}`} role="dialog" aria-label={title}>
        <div className="dialog-head">
          {icon}
          <div className="dialog-title">{title}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}

export function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }): ReactNode {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={String(o.value)} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }): ReactNode {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

export function CheckMark(): ReactNode {
  return <Check size={14} />
}

// ------------------------------------------------------------------ logo

export function Logo({ size = 22, className = '' }: { size?: number; className?: string }): ReactNode {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="pe-logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b85ff" />
          <stop offset="1" stopColor="#2340c4" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="15" fill="url(#pe-logo-g)" />
      <path d="M19 13h17l10 10v26.5a2.5 2.5 0 0 1-2.5 2.5h-24.5a2.5 2.5 0 0 1-2.5-2.5v-34a2.5 2.5 0 0 1 2.5-2.5z" fill="#fff" />
      <path d="M36 13v7.5a2.5 2.5 0 0 0 2.5 2.5h7.5z" fill="#c7d5ff" />
      <rect x="22" y="27" width="17" height="3" rx="1.5" fill="#2f5bea" />
      <rect x="22" y="33.5" width="13" height="3" rx="1.5" fill="#2f5bea" opacity=".55" />
      <rect x="22" y="40" width="9" height="3" rx="1.5" fill="#2f5bea" opacity=".35" />
      <path d="M44.5 33.5l6 6-12.5 12.5-7.5 1.8 1.6-7.6z" fill="#ffb02e" />
      <path d="M44.5 33.5l3-3a2.1 2.1 0 0 1 3 0l3 3a2.1 2.1 0 0 1 0 3l-3 3z" fill="#ff7a59" />
      <path d="M32.1 46.2l5.9 5.9-7.5 1.8z" fill="#3b2a1a" opacity=".85" />
    </svg>
  )
}
