import { useState, type ReactNode } from 'react'
import { FileText, Stamp, Frame, Table, Lock, KeyRound } from 'lucide-react'
import { Dialog, Checkbox, Seg } from '../ui'
import { useApp, activeEditor, activeDoc, markDirty } from '@/state/store'
import { PAPER_SIZES, MARGIN_PRESETS } from '@/lib/defaults'
import type { PageSettings, Watermark, PageBorder } from '@/lib/types'
import { openPath } from '@/lib/io'

type Close = { onClose: () => void }

function updatePage(patch: Partial<PageSettings>): void {
  const doc = activeDoc()
  if (!doc) return
  useApp.getState().updateDoc(doc.id, (d) => ({ page: { ...d.page, ...patch } }))
  markDirty(doc.id)
}

// ------------------------------------------------------------------ Page Setup

export function PageSetupDialog({ onClose }: Close): ReactNode {
  const doc = activeDoc()!
  const units = useApp((s) => s.settings.units)
  const [p, setP] = useState<PageSettings>(structuredClone(doc.page))
  const [tab, setTab] = useState<'margins' | 'paper' | 'layout'>('margins')
  const div = units === 'in' ? 25.4 : 10
  const unitLabel = units === 'in' ? 'in' : 'cm'
  const num = (mm: number): string => String(Math.round((mm / div) * 100) / 100)
  const setMargin = (k: keyof PageSettings['margins'], v: string): void => {
    const n = parseFloat(v)
    if (Number.isFinite(n) && n >= 0) setP((x) => ({ ...x, margins: { ...x.margins, [k]: n * div } }))
  }
  const land = p.orientation === 'landscape'
  const pw = land ? p.heightMm : p.widthMm
  const ph = land ? p.widthMm : p.heightMm
  const s = 150 / Math.max(pw, ph)
  return (
    <Dialog
      title="Page Setup"
      icon={<FileText size={20} />}
      onClose={onClose}
      size="wide"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => (updatePage(p), onClose())}>
            OK
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 190px', gap: 24 }}>
        <div className="form">
          <Seg value={tab} onChange={setTab} options={[{ value: 'margins', label: 'Margins' }, { value: 'paper', label: 'Paper' }, { value: 'layout', label: 'Layout' }]} />
          {tab === 'margins' && (
            <>
              <div className="form-grid">
                {(['top', 'bottom', 'left', 'right'] as const).map((k) => (
                  <label key={k} className="field">
                    <span className="field-label">
                      {k[0].toUpperCase() + k.slice(1)} ({unitLabel})
                    </span>
                    <input className="input" type="number" step={0.1} min={0} defaultValue={num(p.margins[k])} onChange={(e) => setMargin(k, e.target.value)} />
                  </label>
                ))}
              </div>
              <div className="section-label">Presets</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {MARGIN_PRESETS.map((m) => (
                  <button key={m.name} className="btn sm" onClick={() => setP((x) => ({ ...x, margins: m.m }))}>
                    {m.name}
                  </button>
                ))}
              </div>
              <div className="form-row">
                <label>Orientation</label>
                <Seg value={p.orientation} onChange={(v) => setP((x) => ({ ...x, orientation: v }))} options={[{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]} />
              </div>
            </>
          )}
          {tab === 'paper' && (
            <>
              <label className="field">
                <span className="field-label">Paper size</span>
                <select
                  className="select"
                  value={p.sizeName}
                  onChange={(e) => {
                    const ps = PAPER_SIZES.find((x) => x.name === e.target.value)
                    if (ps) setP((x) => ({ ...x, sizeName: ps.name, widthMm: ps.w, heightMm: ps.h }))
                    else setP((x) => ({ ...x, sizeName: 'Custom' }))
                  }}
                >
                  {PAPER_SIZES.map((ps) => (
                    <option key={ps.name} value={ps.name}>
                      {ps.label} ({num(ps.w)} × {num(ps.h)} {unitLabel})
                    </option>
                  ))}
                  <option value="Custom">Custom size</option>
                </select>
              </label>
              <div className="form-grid">
                <label className="field">
                  <span className="field-label">Width ({unitLabel})</span>
                  <input className="input" type="number" step={0.1} value={num(p.widthMm)} onChange={(e) => setP((x) => ({ ...x, sizeName: 'Custom', widthMm: Math.max(50, parseFloat(e.target.value) * div || x.widthMm) }))} />
                </label>
                <label className="field">
                  <span className="field-label">Height ({unitLabel})</span>
                  <input className="input" type="number" step={0.1} value={num(p.heightMm)} onChange={(e) => setP((x) => ({ ...x, sizeName: 'Custom', heightMm: Math.max(50, parseFloat(e.target.value) * div || x.heightMm) }))} />
                </label>
              </div>
            </>
          )}
          {tab === 'layout' && (
            <>
              <div className="section-label">Headers and footers</div>
              <Checkbox checked={p.differentFirstPage} onChange={(v) => setP((x) => ({ ...x, differentFirstPage: v }))} label="Different first page" />
              <div className="form-grid">
                <label className="field">
                  <span className="field-label">Header from edge ({unitLabel})</span>
                  <input className="input" type="number" step={0.1} defaultValue={num(p.headerDistanceMm)} onChange={(e) => setP((x) => ({ ...x, headerDistanceMm: (parseFloat(e.target.value) || 0) * div }))} />
                </label>
                <label className="field">
                  <span className="field-label">Footer from edge ({unitLabel})</span>
                  <input className="input" type="number" step={0.1} defaultValue={num(p.footerDistanceMm)} onChange={(e) => setP((x) => ({ ...x, footerDistanceMm: (parseFloat(e.target.value) || 0) * div }))} />
                </label>
                <label className="field">
                  <span className="field-label">Start page numbers at</span>
                  <input className="input" type="number" min={0} value={p.pageNumberStart} onChange={(e) => setP((x) => ({ ...x, pageNumberStart: parseInt(e.target.value, 10) || 1 }))} />
                </label>
                <label className="field">
                  <span className="field-label">Line numbers</span>
                  <select className="select" value={p.lineNumbers} onChange={(e) => setP((x) => ({ ...x, lineNumbers: e.target.value as PageSettings['lineNumbers'] }))}>
                    <option value="none">None</option>
                    <option value="continuous">Continuous</option>
                    <option value="page">Restart each page</option>
                  </select>
                </label>
              </div>
              <Checkbox checked={p.hyphenation} onChange={(v) => setP((x) => ({ ...x, hyphenation: v }))} label="Hyphenate words automatically" />
            </>
          )}
        </div>
        <div>
          <div className="section-label">Preview</div>
          <div style={{ display: 'grid', placeItems: 'center', height: 170, background: 'var(--surface-2)', borderRadius: 8 }}>
            <div style={{ width: pw * s, height: ph * s, background: '#fff', boxShadow: 'var(--shadow-1)', position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  left: p.margins.left * s,
                  right: p.margins.right * s,
                  top: p.margins.top * s,
                  bottom: p.margins.bottom * s,
                  backgroundImage: 'repeating-linear-gradient(#d0d4dc 0 1px, transparent 1px 5px)'
                }}
              />
            </div>
          </div>
          <div className="hint" style={{ marginTop: 8, textAlign: 'center' }}>
            {num(pw)} × {num(ph)} {unitLabel}
          </div>
        </div>
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Watermark

export function WatermarkDialog({ onClose }: Close): ReactNode {
  const doc = activeDoc()!
  const [w, setW] = useState<Watermark>(doc.page.watermark ?? { text: 'DRAFT', color: '#9e9e9e', opacity: 0.22, diagonal: true, fontSize: 110 })
  return (
    <Dialog
      title="Watermark"
      icon={<Stamp size={20} />}
      onClose={onClose}
      footer={
        <>
          <button className="btn left ghost" onClick={() => (updatePage({ watermark: null }), onClose())}>
            No watermark
          </button>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => (updatePage({ watermark: w }), onClose())}>
            Apply
          </button>
        </>
      }
    >
      <div className="form">
        <label className="field">
          <span className="field-label">Text</span>
          <input className="input" list="pe-wm" value={w.text} onChange={(e) => setW({ ...w, text: e.target.value })} />
          <datalist id="pe-wm">
            {['ASAP', 'CONFIDENTIAL', 'COPY', 'DO NOT COPY', 'DRAFT', 'ORIGINAL', 'PERSONAL', 'SAMPLE', 'TOP SECRET', 'URGENT'].map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Size: {w.fontSize}px</span>
            <input type="range" min={30} max={200} value={w.fontSize} onChange={(e) => setW({ ...w, fontSize: Number(e.target.value) })} style={{ accentColor: 'var(--accent)' }} />
          </label>
          <label className="field">
            <span className="field-label">Transparency: {Math.round((1 - w.opacity) * 100)}%</span>
            <input type="range" min={5} max={80} value={Math.round(w.opacity * 100)} onChange={(e) => setW({ ...w, opacity: Number(e.target.value) / 100 })} style={{ accentColor: 'var(--accent)' }} />
          </label>
          <label className="field">
            <span className="field-label">Color</span>
            <input type="color" value={w.color} onChange={(e) => setW({ ...w, color: e.target.value })} style={{ width: 60, height: 32, border: 'none', background: 'none' }} />
          </label>
          <div className="field">
            <span className="field-label">Layout</span>
            <Seg value={w.diagonal ? 'd' : 'h'} onChange={(v) => setW({ ...w, diagonal: v === 'd' })} options={[{ value: 'd', label: 'Diagonal' }, { value: 'h', label: 'Horizontal' }]} />
          </div>
        </div>
        <div className="preview-box" style={{ background: '#fff', height: 150, position: 'relative', overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
          <span style={{ color: w.color, opacity: w.opacity, fontWeight: 700, fontSize: w.fontSize / 3.2, transform: w.diagonal ? 'rotate(-40deg)' : undefined, whiteSpace: 'nowrap' }}>{w.text}</span>
        </div>
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Page borders

export function PageBorderDialog({ onClose }: Close): ReactNode {
  const doc = activeDoc()!
  const [b, setB] = useState<PageBorder>(doc.page.border.style === 'none' ? { ...doc.page.border, style: 'single' } : doc.page.border)
  return (
    <Dialog
      title="Page Borders"
      icon={<Frame size={20} />}
      onClose={onClose}
      footer={
        <>
          <button className="btn left ghost" onClick={() => (updatePage({ border: { ...b, style: 'none' } }), onClose())}>
            No border
          </button>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => (updatePage({ border: b }), onClose())}>
            Apply
          </button>
        </>
      }
    >
      <div className="form">
        <div className="tiles">
          {(['single', 'double', 'thick', 'dashed', 'dotted'] as const).map((s) => (
            <button key={s} className={`tile ${b.style === s ? 'on' : ''}`} onClick={() => setB({ ...b, style: s })}>
              <span
                style={{
                  height: 40,
                  border: s === 'double' ? `3px double ${b.color}` : s === 'thick' ? `3px solid ${b.color}` : s === 'dashed' ? `1.5px dashed ${b.color}` : s === 'dotted' ? `2px dotted ${b.color}` : `1px solid ${b.color}`
                }}
              />
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Color</span>
            <input type="color" value={b.color} onChange={(e) => setB({ ...b, color: e.target.value })} style={{ width: 60, height: 32, border: 'none', background: 'none' }} />
          </label>
          <label className="field">
            <span className="field-label">Distance from page edge: {b.offsetMm} mm</span>
            <input type="range" min={2} max={25} value={b.offsetMm} onChange={(e) => setB({ ...b, offsetMm: Number(e.target.value) })} style={{ accentColor: 'var(--accent)' }} />
          </label>
        </div>
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Table

export function TableDialog({ onClose }: Close): ReactNode {
  const e = activeEditor()!
  const [rows, setRows] = useState(3)
  const [cols, setCols] = useState(4)
  const [header, setHeader] = useState(true)
  const [style, setStyle] = useState('grid')
  const insert = (): void => {
    e.chain().focus().insertTable({ rows, cols, withHeaderRow: header }).run()
    e.chain().updateAttributes('table', { tableStyle: style, headerRow: header }).run()
    onClose()
  }
  return (
    <Dialog
      title="Insert Table"
      icon={<Table size={20} />}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={insert}>
            Insert
          </button>
        </>
      }
    >
      <div className="form">
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Columns</span>
            <input className="input" type="number" min={1} max={63} value={cols} onChange={(ev) => setCols(Math.max(1, Math.min(63, Number(ev.target.value) || 1)))} />
          </label>
          <label className="field">
            <span className="field-label">Rows</span>
            <input className="input" type="number" min={1} max={500} value={rows} onChange={(ev) => setRows(Math.max(1, Math.min(500, Number(ev.target.value) || 1)))} />
          </label>
        </div>
        <Checkbox checked={header} onChange={setHeader} label="Header row" />
        <label className="field">
          <span className="field-label">Style</span>
          <select className="select" value={style} onChange={(ev) => setStyle(ev.target.value)}>
            <option value="grid">Grid</option>
            <option value="plain">Plain</option>
            <option value="minimal">Minimal</option>
            <option value="accent">Accent header</option>
            <option value="soft">Soft</option>
            <option value="dark">Dark header</option>
          </select>
        </label>
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Passwords

export function PasswordDialog({ onClose, path, wrong }: Close & { path: string; wrong: boolean }): ReactNode {
  const [pw, setPw] = useState('')
  const submit = (): void => {
    onClose()
    void openPath(path, pw)
  }
  return (
    <Dialog
      title="Password"
      icon={<Lock size={20} />}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!pw} onClick={submit}>
            Open
          </button>
        </>
      }
    >
      <div className="form">
        <div>
          <b>{path.split(/[\\/]/).pop()}</b> is protected.
        </div>
        {wrong && <div style={{ color: 'var(--danger)' }}>That password is incorrect. Passwords are case-sensitive.</div>}
        <input className="input" type="password" autoFocus placeholder="Enter password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && pw && submit()} />
      </div>
    </Dialog>
  )
}

export function SetPasswordDialog({ onClose }: Close): ReactNode {
  const doc = activeDoc()!
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const ok = pw.length >= 4 && pw === pw2
  return (
    <Dialog
      title="Encrypt Document"
      icon={<KeyRound size={20} />}
      onClose={onClose}
      footer={
        <>
          {doc.password && (
            <button
              className="btn left danger"
              onClick={() => {
                useApp.getState().updateDoc(doc.id, { password: null })
                markDirty(doc.id)
                useApp.getState().toast('Password removed. Save the document to apply.', 'info')
                onClose()
              }}
            >
              Remove password
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!ok}
            onClick={() => {
              useApp.getState().updateDoc(doc.id, { password: pw, format: 'ped' })
              markDirty(doc.id)
              useApp.getState().toast('The document will be encrypted the next time you save it (as .ped).', 'success')
              onClose()
            }}
          >
            Encrypt
          </button>
        </>
      }
    >
      <div className="form">
        <div className="hint">
          The document is encrypted with AES-256 when saved as a .ped file. If you lose the password, the document can't be recovered — keep it somewhere safe.
        </div>
        <input className="input" type="password" autoFocus placeholder="Password (at least 4 characters)" value={pw} onChange={(e) => setPw(e.target.value)} />
        <input className="input" type="password" placeholder="Confirm password" value={pw2} onChange={(e) => setPw2(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ok && (e.currentTarget.closest('.dialog')?.querySelector<HTMLButtonElement>('.btn.primary')?.click())} />
        {pw2 && pw !== pw2 && <div style={{ color: 'var(--danger)', fontSize: 12 }}>The passwords don't match.</div>}
      </div>
    </Dialog>
  )
}
