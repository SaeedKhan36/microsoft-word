import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, SquareArrowOutDownRight, Ban, Pipette } from 'lucide-react'
import { Dropdown, Popover, tip } from '../ui'
import { useApp } from '@/state/store'
import { THEME_COLORS, STANDARD_COLORS, HIGHLIGHT_COLORS, BUNDLED_FONTS, COMMON_FONTS, FONT_SIZES } from '@/lib/defaults'
import { fontStack } from '../DocumentView'

export function Group({ label, children, launcher, launcherTip }: { label: string; children: ReactNode; launcher?: () => void; launcherTip?: string }): ReactNode {
  return (
    <div className="r-group">
      <div className="r-group-body">{children}</div>
      <div className="r-group-label">
        {label}
        {launcher && (
          <button className="r-group-launcher" onClick={launcher} {...tip(launcherTip ?? `${label} settings`)}>
            <SquareArrowOutDownRight size={10} />
          </button>
        )}
      </div>
    </div>
  )
}

interface BtnProps {
  icon?: ReactNode
  label?: string
  title?: string
  keys?: string
  desc?: string
  onClick?: () => void
  on?: boolean
  disabled?: boolean
  big?: boolean
  showLabel?: boolean
  caret?: boolean
  className?: string
}

export function Btn({ icon, label, title, keys, desc, onClick, on, disabled, big, showLabel, caret, className = '' }: BtnProps): ReactNode {
  return (
    <button
      className={`rbtn ${big ? 'big' : ''} ${on ? 'on' : ''} ${className}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      {...tip(title ?? label ?? '', keys, desc)}
      aria-label={title ?? label}
      aria-pressed={on}
    >
      {icon}
      {(big || showLabel) && label && <span className="rbtn-label">{label}</span>}
      {caret && <ChevronDown size={big ? 12 : 11} className="rbtn-caret" />}
    </button>
  )
}

/** Button that opens a popover. */
export function DropBtn({
  children,
  placement,
  className,
  ...props
}: BtnProps & { children: (close: () => void) => ReactNode; placement?: 'bottom-start' | 'bottom-end'; className?: string }): ReactNode {
  return (
    <Dropdown
      placement={placement}
      className={className}
      trigger={({ toggle, ref, open }) => (
        <span ref={ref} style={{ display: 'inline-block' }}>
          <Btn {...props} on={props.on || open} caret onClick={toggle} />
        </span>
      )}
    >
      {children}
    </Dropdown>
  )
}

/** Split button: main action + dropdown. */
export function SplitBtn({
  icon,
  label,
  title,
  keys,
  desc,
  onClick,
  on,
  big,
  showLabel,
  children,
  disabled
}: BtnProps & { children: (close: () => void) => ReactNode }): ReactNode {
  return (
    <Dropdown
      trigger={({ toggle, ref, open }) => (
        <span ref={ref} className={`rbtn-split ${big ? 'big' : ''}`}>
          <button className={`rbtn ${on ? 'on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={onClick} disabled={disabled} {...tip(title ?? label ?? '', keys, desc)}>
            {icon}
            {(showLabel || big) && label && !big && <span className="rbtn-label">{label}</span>}
          </button>
          <button className={`rbtn ${open ? 'on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={toggle} disabled={disabled} aria-label={`${title ?? label} options`}>
            {big && label && <span className="rbtn-label">{label}</span>}
            <ChevronDown size={11} />
          </button>
        </span>
      )}
    >
      {children}
    </Dropdown>
  )
}

// ------------------------------------------------------------------ colors

export function ColorPalette({
  onPick,
  noneLabel,
  highlight,
  close
}: {
  onPick: (c: string | null) => void
  noneLabel?: string
  highlight?: boolean
  close: () => void
}): ReactNode {
  const inputRef = useRef<HTMLInputElement>(null)
  const pick = (c: string | null): void => {
    onPick(c)
    close()
  }
  if (highlight) {
    return (
      <div style={{ width: 230 }}>
        <div className="swatches" style={{ gridTemplateColumns: 'repeat(5, 36px)', gap: 6 }}>
          {HIGHLIGHT_COLORS.map((h) => (
            <button key={h.c} className="swatch" style={{ background: h.c, width: 36, height: 24 }} onClick={() => pick(h.c)} {...tip(h.name)} />
          ))}
        </div>
        <div className="menu-sep" />
        <button className="menu-item" onClick={() => pick(null)}>
          <Ban size={15} /> No Color
        </button>
      </div>
    )
  }
  return (
    <div style={{ width: 250 }}>
      {noneLabel && (
        <button className="menu-item" onClick={() => pick(null)}>
          <Ban size={15} /> {noneLabel}
        </button>
      )}
      <div className="menu-label">Theme colors</div>
      <div className="swatches tight">
        {THEME_COLORS.flat().map((c, i) => (
          <button key={i} className="swatch" style={{ background: c }} onClick={() => pick(c)} {...tip(c)} />
        ))}
      </div>
      <div className="menu-label">Standard colors</div>
      <div className="swatches">
        {STANDARD_COLORS.map((c) => (
          <button key={c} className="swatch" style={{ background: c }} onClick={() => pick(c)} {...tip(c)} />
        ))}
      </div>
      <div className="menu-sep" />
      <button className="menu-item" onClick={() => inputRef.current?.click()}>
        <Pipette size={15} /> More Colors…
      </button>
      <input
        ref={inputRef}
        type="color"
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
        onChange={(e) => pick(e.target.value)}
      />
    </div>
  )
}

export function ColorBtn({
  icon,
  title,
  color,
  onApply,
  highlight,
  noneLabel,
  big,
  label
}: {
  icon: ReactNode
  title: string
  color: string
  onApply: (c: string | null) => void
  highlight?: boolean
  noneLabel?: string
  big?: boolean
  label?: string
}): ReactNode {
  const [current, setCurrent] = useState(color)
  return (
    <SplitBtn
      icon={
        <span style={{ position: 'relative', display: 'inline-grid', placeItems: 'center' }}>
          {icon}
          <span style={{ position: 'absolute', left: -1, right: -1, bottom: -4, height: 4, borderRadius: 1, background: current, border: '1px solid rgba(0,0,0,.08)' }} />
        </span>
      }
      title={title}
      label={label}
      big={big}
      onClick={() => onApply(current)}
    >
      {(close) => (
        <ColorPalette
          highlight={highlight}
          noneLabel={noneLabel}
          close={close}
          onPick={(c) => {
            if (c) setCurrent(c)
            onApply(c)
          }}
        />
      )}
    </SplitBtn>
  )
}

// ------------------------------------------------------------------ font pickers

export function useFontList(): { recent: string[]; bundled: string[]; common: string[]; all: string[] } {
  const fonts = useApp((s) => s.fonts)
  return useMemo(() => {
    const installed = new Set(fonts)
    const common = COMMON_FONTS.filter((f) => installed.has(f) || f === 'Calibri' || !fonts.length)
    const all = Array.from(new Set([...fonts, ...BUNDLED_FONTS])).sort((a, b) => a.localeCompare(b))
    return { recent: [], bundled: BUNDLED_FONTS, common, all }
  }, [fonts])
}

export function FontCombo({ value, onChange, width = 150 }: { value: string; onChange: (f: string) => void; width?: number }): ReactNode {
  const [text, setText] = useState(value)
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const lists = useFontList()
  useEffect(() => setText(value), [value])
  const q = filter.toLowerCase()
  const match = (f: string): boolean => !q || f.toLowerCase().includes(q)
  const commit = (f: string): void => {
    setOpen(false)
    setFilter('')
    if (f.trim()) onChange(f.trim())
  }
  return (
    <div className="combo" ref={ref} {...tip('Font', 'Ctrl+Shift+F', 'Pick a new font for your text.')}>
      <input
        className="r-field"
        style={{ width, fontFamily: fontStack(text) }}
        value={text}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          setText(e.target.value)
          setFilter(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(text)
          if (e.key === 'Escape') {
            setText(value)
            setOpen(false)
          }
        }}
      />
      <button className="combo-caret" onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((o) => !o)} aria-label="Fonts">
        <ChevronDown size={12} />
      </button>
      {open && ref.current && (
        <Popover anchor={ref.current} onClose={() => setOpen(false)} className="font-list">
          {!q && (
            <>
              <div className="menu-label">Document fonts</div>
              {lists.bundled.map((f) => (
                <FontItem key={`b${f}`} f={f} onPick={commit} on={f === value} />
              ))}
              <div className="menu-label">Popular</div>
              {lists.common.map((f) => (
                <FontItem key={`c${f}`} f={f} onPick={commit} on={f === value} />
              ))}
              <div className="menu-label">All fonts</div>
            </>
          )}
          {lists.all.filter(match).map((f) => (
            <FontItem key={f} f={f} onPick={commit} on={f === value} />
          ))}
        </Popover>
      )}
    </div>
  )
}

function FontItem({ f, onPick, on }: { f: string; onPick: (f: string) => void; on: boolean }): ReactNode {
  return (
    <button className={`menu-item font-item ${on ? 'checked' : ''}`} style={{ fontFamily: `"${f}", var(--font-ui)`, contentVisibility: 'auto' }} onClick={() => onPick(f)}>
      {f}
    </button>
  )
}

export function SizeCombo({ value, onChange }: { value: number; onChange: (n: number) => void }): ReactNode {
  const [text, setText] = useState(String(value || ''))
  useEffect(() => setText(value ? String(value) : ''), [value])
  return (
    <Dropdown
      trigger={({ toggle, ref }) => (
        <div className="combo" ref={ref as never} {...tip('Font Size', 'Ctrl+Shift+> / <', 'Change the size of your text.')}>
          <input
            className="r-field"
            style={{ width: 54 }}
            value={text}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const n = parseFloat(text)
                if (n > 0 && n <= 1638) onChange(n)
              }
            }}
          />
          <button className="combo-caret" onMouseDown={(e) => e.preventDefault()} onClick={toggle} aria-label="Sizes">
            <ChevronDown size={12} />
          </button>
        </div>
      )}
    >
      {(close) => (
        <div style={{ width: 80, maxHeight: 360 }}>
          {FONT_SIZES.map((s) => (
            <button
              key={s}
              className={`menu-item ${s === value ? 'checked' : ''}`}
              onClick={() => {
                close()
                onChange(s)
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </Dropdown>
  )
}

export function Spin({ label, value, unit, step = 1, min = 0, max = 999, onChange, width = 64 }: { label: string; value: number; unit: string; step?: number; min?: number; max?: number; onChange: (n: number) => void; width?: number }): ReactNode {
  const [text, setText] = useState(`${value} ${unit}`)
  useEffect(() => setText(`${Math.round(value * 100) / 100} ${unit}`), [value, unit])
  const commit = (n: number): void => onChange(Math.max(min, Math.min(max, Math.round(n * 100) / 100)))
  return (
    <div className="spin">
      <label>{label}</label>
      <input
        className="r-field"
        style={{ width }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = parseFloat(text)
          if (Number.isFinite(n)) commit(n)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const n = parseFloat(text)
            if (Number.isFinite(n)) commit(n)
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            commit(value + step)
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            commit(value - step)
          }
        }}
      />
    </div>
  )
}

/** Visual grid used to pick a table size. */
export function TableGridPicker({ onPick, close }: { onPick: (rows: number, cols: number) => void; close: () => void }): ReactNode {
  const [hover, setHover] = useState({ r: 0, c: 0 })
  const R = 8
  const Cn = 10
  return (
    <div>
      <div className="menu-label">{hover.r && hover.c ? `${hover.c} × ${hover.r} Table` : 'Insert Table'}</div>
      <div className="grid-picker" style={{ gridTemplateColumns: `repeat(${Cn}, 17px)` }} onMouseLeave={() => setHover({ r: 0, c: 0 })}>
        {Array.from({ length: R * Cn }, (_, i) => {
          const r = Math.floor(i / Cn) + 1
          const c = (i % Cn) + 1
          return (
            <span
              key={i}
              className={`grid-picker-cell ${r <= hover.r && c <= hover.c ? 'on' : ''}`}
              onMouseEnter={() => setHover({ r, c })}
              onClick={() => {
                close()
                onPick(r, c)
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
