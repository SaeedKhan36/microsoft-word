import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import katex from 'katex'
import { renderToStaticMarkup } from 'react-dom/server'
import { icons } from 'lucide-react'
import { Sigma, BarChart3, Image as ImageIcon, Shapes, Smile, Library, GitCompare, Plus, Trash2, FolderOpen, ClipboardPaste, Globe, Pencil } from 'lucide-react'
import { NodeSelection } from '@tiptap/pm/state'
import { diffArrays, diffWordsWithSpace } from 'diff'
import { Dialog, Seg } from '../ui'
import { useApp, activeEditor, activeDoc, markDirty } from '@/state/store'
import { renderChartSvg, sampleChart, CHART_COLORS, type ChartData, type ChartType } from '@/lib/chart'
import { SHAPES, renderShapeSvg } from '@/lib/shapes'
import { fileToDataUrl, svgToDataUrl, bytesToDataUrl, downscaleDataUrl } from '@/lib/images'
import type { Source } from '@/lib/types'
import { uid } from '@/lib/units'
import { formatBibliographyEntry, formatCitation } from '@/lib/citations'
import { parsePed } from '@/lib/ped'
import { importDocx } from '@/lib/docx-import'
import { markdownToHtml, textToHtml, escapeHtml } from '@/lib/convert'
import { basename } from '@/lib/io'

type Close = { onClose: () => void }

// ------------------------------------------------------------------ Equation

const MATH_SNIPPETS: { label: string; tex: string }[] = [
  { label: 'a/b', tex: '\\frac{a}{b}' },
  { label: 'xⁿ', tex: 'x^{n}' },
  { label: 'xₙ', tex: 'x_{n}' },
  { label: '√x', tex: '\\sqrt{x}' },
  { label: 'ⁿ√x', tex: '\\sqrt[n]{x}' },
  { label: '∑', tex: '\\sum_{i=1}^{n}' },
  { label: '∏', tex: '\\prod_{i=1}^{n}' },
  { label: '∫', tex: '\\int_{a}^{b}' },
  { label: '∬', tex: '\\iint' },
  { label: '∮', tex: '\\oint' },
  { label: 'lim', tex: '\\lim_{x \\to \\infty}' },
  { label: 'd/dx', tex: '\\frac{d}{dx}' },
  { label: '∂', tex: '\\frac{\\partial f}{\\partial x}' },
  { label: 'matrix', tex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
  { label: 'cases', tex: 'f(x) = \\begin{cases} 1 & x > 0 \\\\ 0 & x \\le 0 \\end{cases}' },
  { label: '( )', tex: '\\left( x \\right)' },
  { label: 'vec', tex: '\\vec{v}' },
  { label: 'hat', tex: '\\hat{x}' },
  { label: 'bar', tex: '\\overline{x}' },
  { label: 'log', tex: '\\log_{b} x' },
  { label: 'sin', tex: '\\sin \\theta' },
  { label: 'binom', tex: '\\binom{n}{k}' }
]
const MATH_SYMBOLS = ['\\alpha', '\\beta', '\\gamma', '\\delta', '\\theta', '\\lambda', '\\mu', '\\pi', '\\sigma', '\\phi', '\\omega', '\\Delta', '\\Sigma', '\\Omega', '\\infty', '\\pm', '\\times', '\\div', '\\cdot', '\\neq', '\\approx', '\\leq', '\\geq', '\\equiv', '\\in', '\\notin', '\\subset', '\\cup', '\\cap', '\\forall', '\\exists', '\\rightarrow', '\\Rightarrow', '\\leftrightarrow', '\\nabla', '\\partial', '\\angle', '\\degree', '\\therefore']

export function EquationDialog({ onClose, mode: initialMode, latex: initial, pos }: Close & { mode: 'inline' | 'block'; latex?: string; pos?: number }): ReactNode {
  const e = activeEditor()!
  const editing = pos !== undefined
  const [mode, setMode] = useState(initialMode)
  const [tex, setTex] = useState(initial ?? 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}')
  const ta = useRef<HTMLTextAreaElement>(null)
  const preview = useMemo(() => {
    try {
      return { html: katex.renderToString(tex || '\\,', { displayMode: true, throwOnError: true }), error: '' }
    } catch (err) {
      return { html: '', error: (err as Error).message.replace(/^KaTeX parse error: /, '') }
    }
  }, [tex])
  const insertAtCursor = (s: string): void => {
    const el = ta.current
    if (!el) return setTex((t) => t + s)
    const a = el.selectionStart
    const b = el.selectionEnd
    const next = tex.slice(0, a) + s + tex.slice(b)
    setTex(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(a + s.length, a + s.length)
    })
  }
  const apply = (): void => {
    if (!tex.trim()) return
    if (editing) {
      if (initialMode === 'inline') e.chain().focus().updateInlineMath({ latex: tex, pos }).run()
      else e.chain().focus().updateBlockMath({ latex: tex, pos }).run()
    } else if (mode === 'inline') e.chain().focus().insertInlineMath({ latex: tex }).run()
    else e.chain().focus().insertBlockMath({ latex: tex }).run()
    onClose()
  }
  return (
    <Dialog
      title={editing ? 'Edit Equation' : 'Insert Equation'}
      icon={<Sigma size={20} />}
      onClose={onClose}
      size="wide"
      footer={
        <>
          {editing && (
            <button
              className="btn left danger"
              onClick={() => {
                if (initialMode === 'inline') e.chain().focus().deleteInlineMath({ pos }).run()
                else e.chain().focus().deleteBlockMath({ pos }).run()
                onClose()
              }}
            >
              Delete
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={apply} disabled={!!preview.error}>
            {editing ? 'Update' : 'Insert'}
          </button>
        </>
      }
    >
      <div className="form">
        {!editing && <Seg value={mode} onChange={setMode} options={[{ value: 'block', label: 'Display (own line)' }, { value: 'inline', label: 'Inline (in text)' }]} />}
        <div className="section-label">Structures</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {MATH_SNIPPETS.map((s) => (
            <button key={s.label} className="btn sm" onClick={() => insertAtCursor(s.tex)} title={s.tex}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="section-label">Symbols</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {MATH_SYMBOLS.map((s) => (
            <button key={s} className="symbol-cell" style={{ width: 34, height: 30, fontSize: 15 }} onClick={() => insertAtCursor(`${s} `)} dangerouslySetInnerHTML={{ __html: katex.renderToString(s, { throwOnError: false }) }} />
          ))}
        </div>
        <label className="field">
          <span className="field-label">LaTeX</span>
          <textarea ref={ta} className="textarea" rows={3} style={{ fontFamily: 'JetBrains Mono, Consolas, monospace' }} value={tex} onChange={(ev) => setTex(ev.target.value)} autoFocus onKeyDown={(ev) => ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey) && apply()} />
        </label>
        <div className="preview-box" style={{ background: '#fff', color: '#111', textAlign: 'center', fontSize: 18, minHeight: 80 }}>
          {preview.error ? <span style={{ color: 'var(--danger)', fontSize: 13 }}>{preview.error}</span> : <span dangerouslySetInnerHTML={{ __html: preview.html }} />}
        </div>
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Chart

const CHART_TYPES: { id: ChartType; name: string }[] = [
  { id: 'column', name: 'Column' },
  { id: 'bar', name: 'Bar' },
  { id: 'line', name: 'Line' },
  { id: 'area', name: 'Area' },
  { id: 'pie', name: 'Pie' },
  { id: 'doughnut', name: 'Doughnut' }
]

export function ChartDialog({ onClose, edit }: Close & { edit: boolean }): ReactNode {
  const e = activeEditor()!
  const sel = e.state.selection
  const existing = edit && sel instanceof NodeSelection && sel.node.type.name === 'chart' ? (sel.node.attrs.data as ChartData) : null
  const [d, setD] = useState<ChartData>(existing ? structuredClone(existing) : sampleChart())
  const svg = useMemo(() => renderChartSvg(d), [d])
  const setCell = (si: number, li: number, v: string): void => {
    setD((x) => {
      const series = x.series.map((s, i) => (i === si ? { ...s, values: s.values.map((val, j) => (j === li ? Number(v) || 0 : val)) } : s))
      return { ...x, series }
    })
  }
  const apply = (): void => {
    if (existing) e.chain().focus().updateAttributes('chart', { data: d }).run()
    else e.chain().focus().insertChart(d).run()
    onClose()
  }
  return (
    <Dialog
      title={existing ? 'Edit Chart' : 'Insert Chart'}
      icon={<BarChart3 size={20} />}
      onClose={onClose}
      size="xwide"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={apply}>
            {existing ? 'Update' : 'Insert'}
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 20 }}>
        <div className="form">
          <div className="tiles" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
            {CHART_TYPES.map((t) => (
              <button key={t.id} className={`tile ${d.type === t.id ? 'on' : ''}`} style={{ padding: 6, alignItems: 'center', fontSize: 11.5 }} onClick={() => setD({ ...d, type: t.id })}>
                {t.name}
              </button>
            ))}
          </div>
          <label className="field">
            <span className="field-label">Title</span>
            <input className="input" value={d.title} onChange={(ev) => setD({ ...d, title: ev.target.value })} />
          </label>
          <div className="section-label">Data</div>
          <div style={{ overflow: 'auto', maxHeight: 280 }}>
            <table className="data-grid">
              <thead>
                <tr>
                  <th style={{ width: 100 }} />
                  {d.series.map((s, si) => (
                    <th key={si}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <input type="color" value={s.color} onChange={(ev) => setD({ ...d, series: d.series.map((x, i) => (i === si ? { ...x, color: ev.target.value } : x)) })} style={{ width: 22, height: 22, border: 'none', padding: 0, minWidth: 22 }} />
                        <input value={s.name} onChange={(ev) => setD({ ...d, series: d.series.map((x, i) => (i === si ? { ...x, name: ev.target.value } : x)) })} />
                        {d.series.length > 1 && (
                          <button className="icon-btn sm" onClick={() => setD({ ...d, series: d.series.filter((_, i) => i !== si) })}>
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.labels.map((l, li) => (
                  <tr key={li}>
                    <td style={{ display: 'flex' }}>
                      <input value={l} onChange={(ev) => setD({ ...d, labels: d.labels.map((x, i) => (i === li ? ev.target.value : x)) })} />
                      {d.labels.length > 1 && (
                        <button className="icon-btn sm" onClick={() => setD({ ...d, labels: d.labels.filter((_, i) => i !== li), series: d.series.map((s) => ({ ...s, values: s.values.filter((_, i) => i !== li) })) })}>
                          <Trash2 size={12} />
                        </button>
                      )}
                    </td>
                    {d.series.map((s, si) => (
                      <td key={si}>
                        <input type="number" value={s.values[li] ?? 0} onChange={(ev) => setCell(si, li, ev.target.value)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn sm" onClick={() => setD({ ...d, labels: [...d.labels, `Item ${d.labels.length + 1}`], series: d.series.map((s) => ({ ...s, values: [...s.values, 0] })) })}>
              <Plus size={13} /> Row
            </button>
            <button className="btn sm" onClick={() => setD({ ...d, series: [...d.series, { name: `Series ${d.series.length + 1}`, values: d.labels.map(() => 0), color: CHART_COLORS[d.series.length % CHART_COLORS.length] }] })}>
              <Plus size={13} /> Series
            </button>
          </div>
          <div className="form-grid">
            <label className="field">
              <span className="field-label">Width (px)</span>
              <input className="input" type="number" min={200} max={900} value={d.width} onChange={(ev) => setD({ ...d, width: Number(ev.target.value) || 560 })} />
            </label>
            <label className="field">
              <span className="field-label">Height (px)</span>
              <input className="input" type="number" min={150} max={800} value={d.height} onChange={(ev) => setD({ ...d, height: Number(ev.target.value) || 320 })} />
            </label>
          </div>
        </div>
        <div className="preview-box" style={{ background: '#fff', display: 'grid', placeItems: 'center' }}>
          <div style={{ maxWidth: '100%' }} dangerouslySetInnerHTML={{ __html: svg.replace('<svg ', '<svg style="max-width:100%;height:auto" ') }} />
        </div>
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Image properties

export function ImagePropsDialog({ onClose }: Close): ReactNode {
  const e = activeEditor()!
  const sel = e.state.selection
  const node = sel instanceof NodeSelection && sel.node.type.name === 'image' ? sel.node : null
  const [alt, setAlt] = useState<string>(node?.attrs.alt ?? '')
  const [width, setWidth] = useState<number>(node?.attrs.width ?? 0)
  if (!node) return null
  return (
    <Dialog
      title="Picture"
      icon={<ImageIcon size={20} />}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => (e.chain().focus().updateImage({ alt, width: width || null }).run(), onClose())}>
            OK
          </button>
        </>
      }
    >
      <div className="form">
        <img src={node.attrs.src} style={{ maxHeight: 160, maxWidth: '100%', objectFit: 'contain', alignSelf: 'center', borderRadius: 6 }} />
        <label className="field">
          <span className="field-label">Alt text (describe the picture for people who can't see it)</span>
          <textarea className="textarea" rows={3} autoFocus value={alt} onChange={(ev) => setAlt(ev.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Width in pixels (0 = original size)</span>
          <input className="input" type="number" min={0} max={2000} value={width} onChange={(ev) => setWidth(Number(ev.target.value))} />
        </label>
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Insert picture

export function InsertPictureDialog({ onClose, replace }: Close & { replace: boolean }): ReactNode {
  const e = activeEditor()!
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const put = (src: string, alt = ''): void => {
    const sel = e.state.selection
    if (replace && sel instanceof NodeSelection && sel.node.type.name === 'image') e.chain().focus().updateImage({ src }).run()
    else e.chain().focus().insertImage({ src, alt, layout: 'inline' }).run()
    onClose()
  }
  const fromFile = async (): Promise<void> => {
    const paths = await window.pe.dialog.open({ title: 'Insert Picture', filters: [{ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] }], multi: !replace })
    if (!paths.length) return
    setBusy(true)
    try {
      for (const p of paths) {
        const bytes = await window.pe.fs.read(p)
        const ext = p.split('.').pop()!.toLowerCase()
        const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`
        const raw = bytesToDataUrl(bytes, mime)
        const src = mime === 'image/svg+xml' || mime === 'image/gif' ? raw : await downscaleDataUrl(raw, 2400, mime)
        const sel = e.state.selection
        if (replace && sel instanceof NodeSelection && sel.node.type.name === 'image') e.chain().focus().updateImage({ src }).run()
        else e.chain().focus().insertImage({ src, alt: basename(p).replace(/\.[^.]+$/, ''), layout: paths.length === 1 ? 'center' : 'inline' }).run()
      }
      onClose()
    } finally {
      setBusy(false)
    }
  }
  const fromClipboard = async (): Promise<void> => {
    const data = await window.pe.clipboard.readImage()
    if (!data) {
      useApp.getState().toast('There is no picture on the clipboard. Copy a picture or take a screenshot (Win+Shift+S) first.', 'info')
      return
    }
    put(await downscaleDataUrl(data, 2400, 'image/png'), 'Pasted picture')
  }
  return (
    <Dialog title={replace ? 'Change Picture' : 'Insert Picture'} icon={<ImageIcon size={20} />} onClose={onClose}>
      <div className="bs-cards" style={{ gridTemplateColumns: '1fr' }}>
        <button className="bs-card" onClick={() => void fromFile()} disabled={busy}>
          <span className="ic">{busy ? <span className="spinner" /> : <FolderOpen size={20} />}</span>
          <span>
            <b>This PC…</b>
            <span>PNG, JPG, GIF, WebP, BMP or SVG. Large photos are resized to keep the document small.</span>
          </span>
        </button>
        <button className="bs-card" onClick={() => void fromClipboard()}>
          <span className="ic">
            <ClipboardPaste size={20} />
          </span>
          <span>
            <b>From clipboard</b>
            <span>Paste a copied picture or screenshot.</span>
          </span>
        </button>
        <div className="bs-card">
          <span className="ic">
            <Globe size={20} />
          </span>
          <span style={{ flex: 1 }}>
            <b>From the web</b>
            <span>Link to an online picture (needs internet to show).</span>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input className="input" placeholder="https://…/picture.png" value={url} onChange={(ev) => setUrl(ev.target.value)} />
              <button className="btn" disabled={!/^https?:\/\//.test(url)} onClick={() => put(url)}>
                Insert
              </button>
            </div>
          </span>
        </div>
      </div>
      <div className="hint" style={{ marginTop: 10 }}>Tip: you can also drag pictures straight onto the page or paste them with Ctrl+V.</div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Shapes

export function ShapesDialog({ onClose }: Close): ReactNode {
  const e = activeEditor()!
  const [fill, setFill] = useState('#4472c4')
  const [stroke, setStroke] = useState('#2f528f')
  const [sw, setSw] = useState(2)
  const groups = Array.from(new Set(SHAPES.map((s) => s.group)))
  const insert = (kind: string): void => {
    const s = SHAPES.find((x) => x.kind === kind)!
    const svg = renderShapeSvg(kind, fill, stroke, sw)
    e.chain()
      .focus()
      .insertImage({ src: svgToDataUrl(svg), alt: s.name, width: s.w, layout: 'center', shape: JSON.stringify({ kind, fill, stroke, strokeWidth: sw }) })
      .run()
    onClose()
  }
  return (
    <Dialog title="Shapes" icon={<Shapes size={20} />} onClose={onClose} size="wide">
      <div className="form">
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="check">
            Fill <input type="color" value={fill} onChange={(ev) => setFill(ev.target.value)} />
          </label>
          <label className="check">
            Outline <input type="color" value={stroke} onChange={(ev) => setStroke(ev.target.value)} />
          </label>
          <label className="check">
            Weight <input type="range" min={0} max={10} value={sw} onChange={(ev) => setSw(Number(ev.target.value))} style={{ accentColor: 'var(--accent)' }} />
          </label>
          <button className="btn sm" onClick={() => setFill('none')}>
            No fill
          </button>
        </div>
        {groups.map((g) => (
          <div key={g}>
            <div className="section-label">{g}</div>
            <div className="symbol-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))', maxHeight: 'none' }}>
              {SHAPES.filter((s) => s.group === g).map((s) => (
                <button key={s.kind} className="symbol-cell" style={{ height: 52, padding: 6 }} onClick={() => insert(s.kind)} title={s.name}>
                  <img src={svgToDataUrl(renderShapeSvg(s.kind, fill, stroke, Math.max(1, sw)))} style={{ maxWidth: '100%', maxHeight: '100%' }} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Icons

const ICON_NAMES = Object.keys(icons)

export function IconsDialog({ onClose }: Close): ReactNode {
  const e = activeEditor()!
  const [q, setQ] = useState('')
  const [color, setColor] = useState('#2f5bea')
  const [stroke, setStroke] = useState(2)
  const list = useMemo(() => {
    const query = q.toLowerCase().replace(/\s+/g, '')
    return ICON_NAMES.filter((n) => !query || n.toLowerCase().includes(query)).slice(0, 180)
  }, [q])
  const insert = (name: string): void => {
    const Icon = icons[name as keyof typeof icons]
    const svg = renderToStaticMarkup(<Icon size={96} color={color} strokeWidth={stroke} xmlns="http://www.w3.org/2000/svg" />)
    e.chain().focus().insertImage({ src: svgToDataUrl(svg), alt: name, width: 64 }).run()
    onClose()
  }
  return (
    <Dialog title="Icons" icon={<Smile size={20} />} onClose={onClose} size="wide">
      <div className="form">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input className="input" autoFocus placeholder={`Search ${ICON_NAMES.length.toLocaleString()} icons (e.g. heart, phone, star)`} value={q} onChange={(ev) => setQ(ev.target.value)} />
          <input type="color" value={color} onChange={(ev) => setColor(ev.target.value)} style={{ width: 40, height: 32, border: 'none', background: 'none' }} />
          <select className="select" style={{ width: 110 }} value={stroke} onChange={(ev) => setStroke(Number(ev.target.value))}>
            <option value={1}>Thin</option>
            <option value={1.5}>Light</option>
            <option value={2}>Regular</option>
            <option value={2.5}>Bold</option>
          </select>
        </div>
        <div className="symbol-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(48px, 1fr))', maxHeight: 380 }}>
          {list.map((n) => {
            const Icon = icons[n as keyof typeof icons]
            return (
              <button key={n} className="symbol-cell" style={{ height: 48 }} onClick={() => insert(n)} title={n}>
                <Icon size={22} color={color} strokeWidth={stroke} />
              </button>
            )
          })}
        </div>
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Sources & citations

const emptySource = (): Source => ({ id: uid('s'), type: 'book', authors: '', title: '', year: '', publisher: '', city: '', journal: '', volume: '', pages: '', url: '', accessed: '' })

export function SourcesDialog({ onClose, insert }: Close & { insert: boolean }): ReactNode {
  const doc = activeDoc()!
  const e = activeEditor()!
  const [editing, setEditing] = useState<Source | null>(doc.sources.length ? null : emptySource())
  const [selected, setSelected] = useState<string | null>(doc.sources[0]?.id ?? null)
  const [page, setPage] = useState('')
  const sources = useApp((s) => s.docs.find((d) => d.id === doc.id)?.sources ?? [])
  const style = doc.styles.citationStyle
  const save = (s: Source): void => {
    useApp.getState().updateDoc(doc.id, (d) => ({ sources: d.sources.some((x) => x.id === s.id) ? d.sources.map((x) => (x.id === s.id ? s : x)) : [...d.sources, s] }))
    markDirty(doc.id)
    setSelected(s.id)
    setEditing(null)
  }
  const del = (id: string): void => {
    useApp.getState().updateDoc(doc.id, (d) => ({ sources: d.sources.filter((x) => x.id !== id) }))
    markDirty(doc.id)
  }
  const field = (k: keyof Source, label: string, wide = false): ReactNode =>
    editing && (
      <label className="field" style={wide ? { gridColumn: '1 / -1' } : undefined}>
        <span className="field-label">{label}</span>
        <input className="input" value={editing[k]} onChange={(ev) => setEditing({ ...editing, [k]: ev.target.value })} />
      </label>
    )
  return (
    <Dialog
      title={insert ? 'Insert Citation' : 'Manage Sources'}
      icon={<Library size={20} />}
      onClose={onClose}
      size="wide"
      footer={
        editing ? (
          <>
            <button className="btn" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn primary" disabled={!editing.title.trim()} onClick={() => save(editing)}>
              Save source
            </button>
          </>
        ) : (
          <>
            <button className="btn left" onClick={() => setEditing(emptySource())}>
              <Plus size={14} /> New source
            </button>
            <button className="btn" onClick={onClose}>
              Close
            </button>
            {insert && (
              <button className="btn primary" disabled={!selected} onClick={() => (selected && e.chain().focus().insertCitation(selected, page).run(), onClose())}>
                Insert citation
              </button>
            )}
          </>
        )
      }
    >
      {editing ? (
        <div className="form">
          <div className="form-row">
            <label>Type of source</label>
            <select className="select" value={editing.type} onChange={(ev) => setEditing({ ...editing, type: ev.target.value as Source['type'] })}>
              <option value="book">Book</option>
              <option value="article">Journal article</option>
              <option value="website">Website</option>
              <option value="report">Report</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="form-grid">
            {field('authors', 'Authors (Last, First; Last, First)', true)}
            {field('title', 'Title', true)}
            {field('year', 'Year')}
            {editing.type === 'article' ? field('journal', 'Journal') : field('publisher', 'Publisher')}
            {editing.type === 'article' ? field('volume', 'Volume') : field('city', 'City')}
            {field('pages', 'Pages')}
            {field('url', 'URL', true)}
          </div>
          <div className="section-label">Preview ({style.toUpperCase()})</div>
          <div className="preview-box" dangerouslySetInnerHTML={{ __html: formatBibliographyEntry(editing, style, 0, true) }} />
        </div>
      ) : (
        <div className="form">
          {!sources.length && <div className="pane-empty">No sources yet. Add the books, articles and websites you cite.</div>}
          {sources.map((s) => (
            <div key={s.id} className={`card ${selected === s.id ? 'active' : ''}`} onClick={() => setSelected(s.id)} style={{ cursor: 'default' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div dangerouslySetInnerHTML={{ __html: formatBibliographyEntry(s, style, 0, true) }} />
                  <div className="hint">In text: {formatCitation(s, style)}</div>
                </div>
                <button className="icon-btn sm" onClick={() => setEditing(s)}>
                  <Pencil size={14} />
                </button>
                <button className="icon-btn sm" onClick={() => del(s.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {insert && sources.length > 0 && (
            <label className="field" style={{ maxWidth: 220 }}>
              <span className="field-label">Page (optional)</span>
              <input className="input" value={page} onChange={(ev) => setPage(ev.target.value)} />
            </label>
          )}
        </div>
      )}
    </Dialog>
  )
}

// ------------------------------------------------------------------ Compare documents

interface Block {
  tag: string
  text: string
}

function blocksFromHtml(html: string): Block[] {
  const d = new DOMParser().parseFromString(html, 'text/html')
  const out: Block[] = []
  d.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, pre, blockquote > p, td, th').forEach((el) => {
    if (el.tagName === 'P' && el.closest('li, td, th')) return
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (text) out.push({ tag: el.tagName === 'LI' || el.tagName === 'TD' || el.tagName === 'TH' ? 'p' : el.tagName.toLowerCase(), text })
  })
  return out
}

async function loadComparable(path: string): Promise<Block[]> {
  const bytes = await window.pe.fs.read(path)
  const ext = path.split('.').pop()!.toLowerCase()
  if (ext === 'ped') {
    const { generateHTML } = await import('@tiptap/core')
    const { buildExtensions } = await import('@/editor/extensions')
    const p = await parsePed(bytes)
    return blocksFromHtml(generateHTML(p.content, buildExtensions({ baseFontSize: () => 11 })))
  }
  if (ext === 'docx') return blocksFromHtml((await importDocx(bytes)).html)
  const text = new TextDecoder().decode(bytes)
  if (ext === 'md' || ext === 'markdown') return blocksFromHtml(markdownToHtml(text))
  if (ext === 'html' || ext === 'htm') return blocksFromHtml(text)
  return blocksFromHtml(textToHtml(text))
}

export function CompareDialog({ onClose }: Close): ReactNode {
  const doc = activeDoc()!
  const e = activeEditor()!
  const [path, setPath] = useState<string | null>(null)
  const [direction, setDirection] = useState<'other-original' | 'this-original'>('other-original')
  const [busy, setBusy] = useState(false)
  const pick = async (): Promise<void> => {
    const p = await window.pe.dialog.open({ title: 'Choose a document to compare', filters: [{ name: 'Documents', extensions: ['ped', 'docx', 'md', 'html', 'htm', 'txt'] }] })
    if (p[0]) setPath(p[0])
  }
  const run = async (): Promise<void> => {
    if (!path) return
    setBusy(true)
    try {
      const other = await loadComparable(path)
      const current = blocksFromHtml(e.getHTML())
      const [orig, rev] = direction === 'other-original' ? [other, current] : [current, other]
      const author = direction === 'other-original' ? useApp.getState().settings.userName : basename(path)
      const date = Date.now()
      const ins = (t: string): string => `<ins data-author="${escapeHtml(author)}" data-date="${date}">${escapeHtml(t)}</ins>`
      const del = (t: string): string => `<del data-author="${escapeHtml(author)}" data-date="${date}">${escapeHtml(t)}</del>`
      const parts = diffArrays(orig.map((b) => b.text), rev.map((b) => b.text))
      let html = ''
      let oi = 0
      let ri = 0
      let changes = 0
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        const next = parts[i + 1]
        if (part.removed && next?.added) {
          // Pair removed/added blocks and show word-level changes.
          const n = Math.max(part.value.length, next.value.length)
          for (let k = 0; k < n; k++) {
            const a = part.value[k]
            const b = next.value[k]
            const tag = (rev[ri + k] ?? orig[oi + k])?.tag ?? 'p'
            if (a !== undefined && b !== undefined) {
              const words = diffWordsWithSpace(a, b)
              html += `<${tag}>${words.map((w) => (w.added ? (changes++, ins(w.value)) : w.removed ? (changes++, del(w.value)) : escapeHtml(w.value))).join('')}</${tag}>`
            } else if (b !== undefined) {
              changes++
              html += `<${tag}>${ins(b)}</${tag}>`
            } else if (a !== undefined) {
              changes++
              html += `<${tag}>${del(a)}</${tag}>`
            }
          }
          oi += part.value.length
          ri += next.value.length
          i++
          continue
        }
        for (const t of part.value) {
          if (part.added) {
            changes++
            html += `<${rev[ri]?.tag ?? 'p'}>${ins(t)}</${rev[ri]?.tag ?? 'p'}>`
            ri++
          } else if (part.removed) {
            changes++
            html += `<${orig[oi]?.tag ?? 'p'}>${del(t)}</${orig[oi]?.tag ?? 'p'}>`
            oi++
          } else {
            html += `<${rev[ri]?.tag ?? 'p'}>${escapeHtml(t)}</${rev[ri]?.tag ?? 'p'}>`
            oi++
            ri++
          }
        }
      }
      const id = useApp.getState().addDoc({ title: `Comparison of ${doc.title} and ${basename(path).replace(/\.[^.]+$/, '')}`, initial: { html }, styles: doc.styles, dirty: true })
      useApp.getState().set({ rightPane: 'changes', activeId: id })
      useApp.getState().toast(`Found ${changes} change${changes === 1 ? '' : 's'}. Accept or reject them in the Reviewing Pane.`, 'success')
      onClose()
    } catch (err) {
      useApp.getState().toast(`Couldn't compare: ${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      title="Compare Documents"
      icon={<GitCompare size={20} />}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!path || busy} onClick={() => void run()}>
            {busy ? <span className="spinner" /> : null} Compare
          </button>
        </>
      }
    >
      <div className="form">
        <div className="hint">See exactly what changed between two versions. The result opens as a new document with every difference shown as a tracked change.</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn" onClick={() => void pick()}>
            <FolderOpen size={14} /> Choose document…
          </button>
          <span className="hint" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{path ?? 'No document chosen'}</span>
        </div>
        <div className="field">
          <span className="field-label">Which is the original?</span>
          <Seg
            value={direction}
            onChange={setDirection}
            options={[
              { value: 'other-original', label: 'The chosen file' },
              { value: 'this-original', label: `“${doc.title}”` }
            ]}
          />
        </div>
      </div>
    </Dialog>
  )
}

export { fileToDataUrl }
