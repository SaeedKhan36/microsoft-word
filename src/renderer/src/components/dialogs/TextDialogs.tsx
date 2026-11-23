import { useMemo, useState, type ReactNode } from 'react'
import { Type, Pilcrow, Link2, Omega, CalendarDays, Hash, Superscript, Bookmark, Captions, Navigation, ZoomIn, Target, LayoutTemplate, Trash2 } from 'lucide-react'
import { Dialog, Checkbox, Seg } from '../ui'
import { useApp, activeEditor, activeDoc, markDirty } from '@/state/store'
import { FontCombo, useFontList } from '../ribbon/controls'
import { fontStack } from '../DocumentView'
import { currentFontSize } from '@/editor/ext/keymap'
import { THEME_COLORS, STANDARD_COLORS, FONT_SIZES } from '@/lib/defaults'
import { readability, countWords } from '@/lib/textstats'
import { findFootnote, removeFootnote, updateFootnote, collectHeadings } from '@/editor/ext/references'
import { scrollToPos, setZoom } from '@/state/commands'
import { saveAsTemplate } from '@/lib/io'

type Close = { onClose: () => void }

// ------------------------------------------------------------------ Font

export function FontDialog({ onClose }: Close): ReactNode {
  const e = activeEditor()!
  const doc = activeDoc()!
  const ts = e.getAttributes('textStyle')
  const u = e.getAttributes('underline')
  const [font, setFont] = useState<string>(((ts.fontFamily as string) || doc.styles.bodyFont).replace(/["']/g, '').split(',')[0])
  const [size, setSize] = useState<number>(currentFontSize(e) || doc.styles.fontSize)
  const [bold, setBold] = useState(e.isActive('bold'))
  const [italic, setItalic] = useState(e.isActive('italic'))
  const [underline, setUnderline] = useState<string>(e.isActive('underline') ? (u.underlineStyle as string) || 'solid' : 'none')
  const [color, setColor] = useState<string>((ts.color as string) || '')
  const [strike, setStrike] = useState(e.isActive('strike'))
  const [sup, setSup] = useState(e.isActive('superscript'))
  const [sub, setSub] = useState(e.isActive('subscript'))
  const [caps, setCaps] = useState<string>((ts.textCase as string) || 'none')
  const [spacing, setSpacing] = useState<string>((ts.letterSpacing as string) || '')
  useFontList()
  const apply = (): void => {
    const c = e.chain().focus()
    c.setFontFamily(font).setFontSize(`${size}pt`)
    bold ? c.setBold() : c.unsetBold()
    italic ? c.setItalic() : c.unsetItalic()
    strike ? c.setStrike() : c.unsetStrike()
    sup ? c.setSuperscript() : c.unsetSuperscript()
    sub ? c.setSubscript() : c.unsetSubscript()
    if (underline === 'none') c.unsetUnderline()
    else c.setUnderline().updateAttributes('underline', { underlineStyle: underline === 'solid' ? null : underline })
    if (color) c.setColor(color)
    else c.unsetColor()
    c.setMark('textStyle', { textCase: caps === 'none' ? null : caps, letterSpacing: spacing || null })
    c.run()
    onClose()
  }
  const previewStyle: React.CSSProperties = {
    fontFamily: fontStack(font),
    fontSize: `${Math.min(size, 40)}pt`,
    fontWeight: bold ? 700 : 400,
    fontStyle: italic ? 'italic' : 'normal',
    textDecorationLine: [underline !== 'none' ? 'underline' : '', strike ? 'line-through' : ''].join(' ').trim() || 'none',
    textDecorationStyle: underline !== 'none' && underline !== 'solid' ? (underline as React.CSSProperties['textDecorationStyle']) : undefined,
    color: color || undefined,
    fontVariant: caps === 'small-caps' ? 'small-caps' : undefined,
    textTransform: caps === 'all-caps' ? 'uppercase' : undefined,
    letterSpacing: spacing || undefined,
    verticalAlign: sup ? 'super' : sub ? 'sub' : undefined
  }
  return (
    <Dialog
      title="Font"
      icon={<Type size={20} />}
      onClose={onClose}
      size="wide"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={apply}>
            OK
          </button>
        </>
      }
    >
      <div className="form">
        <div className="form-grid three">
          <div className="field">
            <span className="field-label">Font</span>
            <FontCombo value={font} onChange={setFont} width={200} />
          </div>
          <label className="field">
            <span className="field-label">Style</span>
            <select className="select" value={`${bold ? 'b' : ''}${italic ? 'i' : ''}`} onChange={(ev) => (setBold(ev.target.value.includes('b')), setItalic(ev.target.value.includes('i')))}>
              <option value="">Regular</option>
              <option value="i">Italic</option>
              <option value="b">Bold</option>
              <option value="bi">Bold Italic</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Size</span>
            <input className="input" list="pe-sizes" type="number" min={1} max={1638} step={0.5} value={size} onChange={(ev) => setSize(Number(ev.target.value) || 11)} />
            <datalist id="pe-sizes">
              {FONT_SIZES.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span className="field-label">Underline style</span>
            <select className="select" value={underline} onChange={(ev) => setUnderline(ev.target.value)}>
              <option value="none">(none)</option>
              <option value="solid">Single</option>
              <option value="double">Double</option>
              <option value="dotted">Dotted</option>
              <option value="dashed">Dashed</option>
              <option value="wavy">Wave</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Character spacing</span>
            <select className="select" value={spacing} onChange={(ev) => setSpacing(ev.target.value)}>
              <option value="">Normal</option>
              <option value="-0.05em">Condensed (more)</option>
              <option value="-0.03em">Condensed</option>
              <option value="0.05em">Expanded</option>
              <option value="0.1em">Expanded (more)</option>
              <option value="0.2em">Very wide</option>
            </select>
          </label>
          <div className="field">
            <span className="field-label">Font color</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="color" value={color || '#000000'} onChange={(ev) => setColor(ev.target.value)} style={{ width: 40, height: 32, border: 'none', background: 'none' }} />
              <button className="btn sm ghost" onClick={() => setColor('')}>
                Automatic
              </button>
            </div>
          </div>
        </div>
        <div className="swatches" style={{ gridTemplateColumns: 'repeat(20, 20px)' }}>
          {[...THEME_COLORS[0], ...THEME_COLORS[4], ...STANDARD_COLORS].map((c, i) => (
            <button key={i} className="swatch" style={{ background: c }} onClick={() => setColor(c)} />
          ))}
        </div>
        <div className="section-label">Effects</div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <Checkbox checked={strike} onChange={setStrike} label="Strikethrough" />
          <Checkbox checked={sup} onChange={(v) => (setSup(v), v && setSub(false))} label="Superscript" />
          <Checkbox checked={sub} onChange={(v) => (setSub(v), v && setSup(false))} label="Subscript" />
          <Checkbox checked={caps === 'small-caps'} onChange={(v) => setCaps(v ? 'small-caps' : 'none')} label="Small caps" />
          <Checkbox checked={caps === 'all-caps'} onChange={(v) => setCaps(v ? 'all-caps' : 'none')} label="All caps" />
        </div>
        <div className="section-label">Preview</div>
        <div className="preview-box" style={{ textAlign: 'center', background: '#fff', color: '#1b1b1b' }}>
          <span style={previewStyle}>{e.state.doc.textBetween(e.state.selection.from, e.state.selection.to).slice(0, 40) || font}</span>
        </div>
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Paragraph

export function ParagraphDialog({ onClose }: Close): ReactNode {
  const e = activeEditor()!
  const doc = activeDoc()!
  const a = e.isActive('heading') ? e.getAttributes('heading') : e.getAttributes('paragraph')
  const [align, setAlign] = useState<string>((a.textAlign as string) || 'left')
  const [left, setLeft] = useState<number>(Number(a.indentLeft) || 0)
  const [right, setRight] = useState<number>(Number(a.indentRight) || 0)
  const fl = Number(a.firstLine) || 0
  const [special, setSpecial] = useState<'none' | 'first' | 'hanging'>(fl > 0 ? 'first' : fl < 0 ? 'hanging' : 'none')
  const [by, setBy] = useState<number>(Math.abs(fl) || 36)
  const [before, setBefore] = useState<number>(a.spaceBefore ?? 0)
  const [after, setAfter] = useState<number>(a.spaceAfter ?? doc.styles.spaceAfter)
  const [line, setLine] = useState<number>(a.lineHeight ?? doc.styles.lineHeight)
  const [keepNext, setKeepNext] = useState(!!a.keepWithNext)
  const [breakBefore, setBreakBefore] = useState(!!a.pageBreakBefore)
  const apply = (): void => {
    e.chain()
      .focus()
      .setTextAlign(align)
      .setParagraphFormat({
        indentLeft: left || null,
        indentRight: right || null,
        firstLine: special === 'none' ? null : special === 'first' ? by : -by,
        spaceBefore: before,
        spaceAfter: after,
        lineHeight: line,
        keepWithNext: keepNext,
        pageBreakBefore: breakBefore
      })
      .run()
    onClose()
  }
  return (
    <Dialog
      title="Paragraph"
      icon={<Pilcrow size={20} />}
      onClose={onClose}
      footer={
        <>
          <button className="btn left ghost" onClick={() => (e.chain().focus().setParagraphFormat({ indentLeft: null, indentRight: null, firstLine: null, spaceBefore: null, spaceAfter: null, lineHeight: null }).run(), onClose())}>
            Reset
          </button>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={apply}>
            OK
          </button>
        </>
      }
    >
      <div className="form">
        <div className="section-label">General</div>
        <div className="form-row">
          <label>Alignment</label>
          <Seg value={align} onChange={setAlign} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centered' }, { value: 'right', label: 'Right' }, { value: 'justify', label: 'Justified' }]} />
        </div>
        <div className="section-label">Indentation (points)</div>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Left</span>
            <input className="input" type="number" step={6} min={0} value={left} onChange={(ev) => setLeft(Number(ev.target.value))} />
          </label>
          <label className="field">
            <span className="field-label">Right</span>
            <input className="input" type="number" step={6} min={0} value={right} onChange={(ev) => setRight(Number(ev.target.value))} />
          </label>
          <label className="field">
            <span className="field-label">Special</span>
            <select className="select" value={special} onChange={(ev) => setSpecial(ev.target.value as typeof special)}>
              <option value="none">(none)</option>
              <option value="first">First line</option>
              <option value="hanging">Hanging</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">By</span>
            <input className="input" type="number" step={6} min={0} disabled={special === 'none'} value={by} onChange={(ev) => setBy(Number(ev.target.value))} />
          </label>
        </div>
        <div className="section-label">Spacing</div>
        <div className="form-grid three">
          <label className="field">
            <span className="field-label">Before (pt)</span>
            <input className="input" type="number" step={6} min={0} value={before} onChange={(ev) => setBefore(Number(ev.target.value))} />
          </label>
          <label className="field">
            <span className="field-label">After (pt)</span>
            <input className="input" type="number" step={6} min={0} value={after} onChange={(ev) => setAfter(Number(ev.target.value))} />
          </label>
          <label className="field">
            <span className="field-label">Line spacing</span>
            <select className="select" value={String(line)} onChange={(ev) => setLine(Number(ev.target.value))}>
              {[1, 1.08, 1.15, 1.5, 2, 2.5, 3].map((v) => (
                <option key={v} value={v}>
                  {v === 1 ? 'Single' : v === 1.5 ? '1.5 lines' : v === 2 ? 'Double' : `Multiple ${v}`}
                </option>
              ))}
              {![1, 1.08, 1.15, 1.5, 2, 2.5, 3].includes(line) && <option value={line}>{line}</option>}
            </select>
          </label>
        </div>
        <div className="section-label">Line and page breaks</div>
        <Checkbox checked={keepNext} onChange={setKeepNext} label="Keep with next" />
        <Checkbox checked={breakBefore} onChange={setBreakBefore} label="Page break before" />
        <div className="section-label">Preview</div>
        <div className="preview-box" style={{ background: '#fff', color: '#888', fontSize: 9, lineHeight: 1.3 }}>
          <div style={{ marginBottom: 6 }}>Previous paragraph previous paragraph previous paragraph previous paragraph.</div>
          <div
            style={{
              color: '#1b1b1b',
              textAlign: align as React.CSSProperties['textAlign'],
              marginLeft: left * 0.6,
              marginRight: right * 0.6,
              textIndent: special === 'first' ? by * 0.6 : special === 'hanging' ? -by * 0.6 : 0,
              paddingLeft: special === 'hanging' ? by * 0.6 : 0,
              lineHeight: line,
              paddingTop: before * 0.6,
              paddingBottom: after * 0.6
            }}
          >
            Sample text of the paragraph you are formatting. Sample text of the paragraph you are formatting. Sample text of the paragraph you are formatting.
          </div>
          <div>Following paragraph following paragraph following paragraph.</div>
        </div>
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Link

export function LinkDialog({ onClose }: Close): ReactNode {
  const e = activeEditor()!
  const existing = e.getAttributes('link').href as string | undefined
  if (existing) e.commands.extendMarkRange('link')
  const { from, to } = e.state.selection
  const selected = e.state.doc.textBetween(from, to, ' ')
  const [text, setText] = useState(selected)
  const [url, setUrl] = useState(existing ?? '')
  const [kind, setKind] = useState<'web' | 'place' | 'email'>(existing?.startsWith('#') ? 'place' : existing?.startsWith('mailto:') ? 'email' : 'web')
  const headings = collectHeadings(e.state.doc)
  const bookmarks: string[] = []
  e.state.doc.descendants((n) => {
    if (n.type.name === 'bookmark') bookmarks.push(n.attrs.name)
    return true
  })
  const apply = (): void => {
    let href = url.trim()
    if (!href) return
    if (kind === 'web' && !/^[a-z]+:/i.test(href) && !href.startsWith('#')) href = `https://${href}`
    if (kind === 'email' && !href.startsWith('mailto:')) href = `mailto:${href}`
    const label = text || href.replace(/^mailto:|^https?:\/\//, '')
    if (from === to || text !== selected) {
      e.chain().focus().insertContentAt({ from, to }, { type: 'text', text: label, marks: [{ type: 'link', attrs: { href } }] }).run()
    } else e.chain().focus().setLink({ href }).run()
    onClose()
  }
  return (
    <Dialog
      title={existing ? 'Edit Link' : 'Insert Link'}
      icon={<Link2 size={20} />}
      onClose={onClose}
      footer={
        <>
          {existing && (
            <button className="btn left danger" onClick={() => (e.chain().focus().extendMarkRange('link').unsetLink().run(), onClose())}>
              Remove Link
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={apply} disabled={!url.trim()}>
            OK
          </button>
        </>
      }
    >
      <div className="form">
        <Seg value={kind} onChange={(v) => (setKind(v), setUrl(''))} options={[{ value: 'web', label: 'Web page' }, { value: 'place', label: 'Place in this document' }, { value: 'email', label: 'Email address' }]} />
        <label className="field">
          <span className="field-label">Text to display</span>
          <input className="input" value={text} onChange={(ev) => setText(ev.target.value)} placeholder="Link text" />
        </label>
        {kind === 'place' ? (
          <label className="field">
            <span className="field-label">Place</span>
            <select className="select" value={url} onChange={(ev) => setUrl(ev.target.value)}>
              <option value="">Choose a heading or bookmark…</option>
              {bookmarks.map((b) => (
                <option key={b} value={`#bm-${b}`}>
                  Bookmark: {b}
                </option>
              ))}
              {headings.map((h) => (
                <option key={h.pos} value={`#h-${h.pos}`}>
                  {'  '.repeat(h.level - 1)}
                  {h.text}
                </option>
              ))}
            </select>
            <span className="hint">Ctrl+Click the link to jump. Bookmarks keep working even when headings move.</span>
          </label>
        ) : (
          <label className="field">
            <span className="field-label">{kind === 'email' ? 'Email address' : 'Address'}</span>
            <input className="input" autoFocus value={url} onChange={(ev) => setUrl(ev.target.value)} placeholder={kind === 'email' ? 'name@example.com' : 'https://'} onKeyDown={(ev) => ev.key === 'Enter' && apply()} />
          </label>
        )}
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Symbols

const SYMBOL_SETS: Record<string, string> = {
  Common: '©®™°±×÷≠≈≤≥∞√∑∏∫∂∆∇πΩµ€£¥¢$§¶†‡•…–—‘’“”«»‹›¡¿½¼¾⅓⅔⅛¹²³‰№℃℉',
  Arrows: '←↑→↓↔↕↖↗↘↙⇐⇑⇒⇓⇔⇕➔➜➝➞➟➠➡➢➣➤➥➦↩↪↺↻⤴⤵',
  Math: '∀∁∂∃∄∅∆∇∈∉∋∌∏∐∑−∓∗∘∙√∛∜∝∞∟∠∡∢∣∤∥∦∧∨∩∪∫∬∭∮∴∵∶∷∼∽≃≅≈≉≡≢≤≥≦≧≪≫⊂⊃⊄⊅⊆⊇⊕⊗⊥⋅⌈⌉⌊⌋',
  Greek: 'αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ',
  Currency: '$€£¥¢₹₽₩₪₫₦₱₲₴₵₸₺₼₾฿₡₭₮₤',
  Shapes: '■□▪▫▲△▶▷▼▽◀◁◆◇○◎●◐◑★☆✦✧✩✪✫✬✭✮✯✰❖♠♣♥♦♤♧♡♢',
  Checks: '✓✔✕✖✗✘☐☑☒⊠⊡',
  Latin: 'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ',
  Emoji: '😀😃😄😁😆😅😂🙂😉😊😍🤔😎😢😭😡👍👎👏🙏💪✌️👋🎉🎂🎁💡📌📎📅📝📚✏️✅❌⚠️❗❓⭐🔥💯❤️💙💚'
}

export function SymbolDialog({ onClose }: Close): ReactNode {
  const e = activeEditor()!
  const [set, setSet] = useState('Common')
  const [recent, setRecent] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('pe-recent-symbols') || '[]')
    } catch {
      return []
    }
  })
  const chars = Array.from(SYMBOL_SETS[set])
  const insert = (c: string): void => {
    e.chain().focus().insertContent(c).run()
    const next = [c, ...recent.filter((x) => x !== c)].slice(0, 16)
    setRecent(next)
    try {
      localStorage.setItem('pe-recent-symbols', JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }
  return (
    <Dialog title="Symbol" icon={<Omega size={20} />} onClose={onClose} size="wide" footer={<button className="btn primary" onClick={onClose}>Done</button>}>
      <div className="form">
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {Object.keys(SYMBOL_SETS).map((k) => (
            <button key={k} className={`pane-tab ${set === k ? 'on' : ''}`} onClick={() => setSet(k)}>
              {k}
            </button>
          ))}
        </div>
        <div className="symbol-grid">
          {chars.map((c, i) => (
            <button key={i} className="symbol-cell" onClick={() => insert(c)} title={`U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`}>
              {c}
            </button>
          ))}
        </div>
        {recent.length > 0 && (
          <>
            <div className="section-label">Recently used</div>
            <div className="symbol-grid" style={{ maxHeight: 50 }}>
              {recent.map((c, i) => (
                <button key={i} className="symbol-cell" onClick={() => insert(c)}>
                  {c}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Date & time

export function DateTimeDialog({ onClose }: Close): ReactNode {
  const e = activeEditor()!
  const d = new Date()
  const formats: string[] = useMemo(
    () => [
      d.toLocaleDateString(),
      d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
      d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }),
      d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }),
      d.toISOString().slice(0, 10),
      d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      d.toLocaleString(),
      d.toLocaleTimeString(),
      d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )
  const [sel, setSel] = useState(1)
  return (
    <Dialog
      title="Date and Time"
      icon={<CalendarDays size={20} />}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => (e.chain().focus().insertContent(formats[sel]).run(), onClose())}>
            Insert
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 2 }}>
        {formats.map((f, i) => (
          <button key={i} className={`menu-item ${i === sel ? 'checked' : ''}`} onClick={() => setSel(i)} onDoubleClick={() => (e.chain().focus().insertContent(f).run(), onClose())}>
            {f}
          </button>
        ))}
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Word count

export function WordCountDialog({ onClose }: Close): ReactNode {
  const e = activeEditor()!
  const doc = activeDoc()!
  const { from, to, empty } = e.state.selection
  const text = empty ? e.state.doc.textBetween(0, e.state.doc.content.size, '\n', ' ') : e.state.doc.textBetween(from, to, '\n', ' ')
  const r = readability(text)
  let footnoteWords = 0
  e.state.doc.descendants((n) => {
    if (n.type.name === 'footnote') footnoteWords += countWords(String(n.attrs.text || ''))
    return true
  })
  const lines = text.split('\n').filter((l) => l.trim()).length
  return (
    <Dialog title={empty ? 'Word Count' : 'Word Count (selection)'} icon={<Hash size={20} />} onClose={onClose} footer={<button className="btn primary" onClick={onClose}>Close</button>}>
      <div className="kv">
        <span>Pages</span>
        <span>{doc.pagination.pages}</span>
        <span>Words</span>
        <span>{r.words.toLocaleString()}</span>
        <span>Characters (no spaces)</span>
        <span>{text.replace(/\s/g, '').length.toLocaleString()}</span>
        <span>Characters (with spaces)</span>
        <span>{text.replace(/\n/g, '').length.toLocaleString()}</span>
        <span>Paragraphs</span>
        <span>{lines.toLocaleString()}</span>
        <span>Sentences</span>
        <span>{r.sentences.toLocaleString()}</span>
        <span>Words in footnotes</span>
        <span>{footnoteWords.toLocaleString()}</span>
      </div>
      <div className="section-label" style={{ marginTop: 18 }}>Readability</div>
      <div className="kv">
        <span>Reading ease (Flesch)</span>
        <span>
          {r.fleschEase.toFixed(0)} — {r.label}
        </span>
        <span>Grade level</span>
        <span>{r.grade.toFixed(1)}</span>
        <span>Average sentence</span>
        <span>{r.avgSentence.toFixed(1)} words</span>
        <span>Average word</span>
        <span>{r.avgWordLength.toFixed(1)} letters</span>
        <span>Reading time</span>
        <span>{Math.max(1, Math.round(r.readingMinutes))} min</span>
        <span>Speaking time</span>
        <span>{Math.max(1, Math.round(r.speakingMinutes))} min</span>
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Footnote

export function FootnoteDialog({ onClose, id, isNew }: Close & { id: string; isNew: boolean }): ReactNode {
  const e = activeEditor()!
  const found = findFootnote(e, id)
  const [text, setText] = useState(found?.text ?? '')
  if (!found) return null
  return (
    <Dialog
      title={isNew ? 'New Footnote' : 'Edit Footnote'}
      icon={<Superscript size={20} />}
      onClose={() => {
        if (isNew && !text.trim()) removeFootnote(e, id)
        onClose()
      }}
      footer={
        <>
          <button className="btn left danger" onClick={() => (removeFootnote(e, id), onClose())}>
            <Trash2 size={14} /> Delete footnote
          </button>
          <button className="btn primary" onClick={() => (updateFootnote(e, id, text.trim()), onClose(), e.commands.focus())}>
            Save
          </button>
        </>
      }
    >
      <textarea
        className="textarea"
        rows={4}
        autoFocus
        placeholder="Footnote text (shown at the bottom of the page)"
        value={text}
        onChange={(ev) => setText(ev.target.value)}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
            updateFootnote(e, id, text.trim())
            onClose()
          }
        }}
      />
      <div className="hint" style={{ marginTop: 6 }}>Ctrl+Enter to save.</div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Bookmark

export function BookmarkDialog({ onClose }: Close): ReactNode {
  const e = activeEditor()!
  const [name, setName] = useState('')
  const marks: { name: string; pos: number }[] = []
  e.state.doc.descendants((n, pos) => {
    if (n.type.name === 'bookmark') marks.push({ name: n.attrs.name, pos })
    return true
  })
  const valid = /^[A-Za-z][\w]*$/.test(name) && !marks.some((m) => m.name === name)
  return (
    <Dialog
      title="Bookmark"
      icon={<Bookmark size={20} />}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn primary" disabled={!valid} onClick={() => (e.chain().focus().insertBookmark(name).run(), onClose())}>
            Add
          </button>
        </>
      }
    >
      <div className="form">
        <label className="field">
          <span className="field-label">Bookmark name (letters, numbers and _; must start with a letter)</span>
          <input className="input" autoFocus value={name} onChange={(ev) => setName(ev.target.value.replace(/\s/g, '_'))} onKeyDown={(ev) => ev.key === 'Enter' && valid && (e.chain().focus().insertBookmark(name).run(), onClose())} />
        </label>
        {marks.length > 0 && (
          <>
            <div className="section-label">Bookmarks in this document</div>
            {marks.map((m) => (
              <div key={m.pos} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ flex: 1 }}>{m.name}</span>
                <button className="btn sm" onClick={() => (scrollToPos(e, m.pos), onClose())}>
                  Go To
                </button>
                <button className="btn sm ghost" onClick={() => e.chain().focus().deleteRange({ from: m.pos, to: m.pos + 1 }).run()}>
                  Delete
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Caption

export function CaptionDialog({ onClose }: Close): ReactNode {
  const e = activeEditor()!
  const [label, setLabel] = useState('Figure')
  const [text, setText] = useState('')
  return (
    <Dialog
      title="Insert Caption"
      icon={<Captions size={20} />}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => (e.chain().focus().insertCaption(label, text).run(), onClose())}>
            Insert
          </button>
        </>
      }
    >
      <div className="form">
        <div className="form-row">
          <label>Label</label>
          <Seg value={label} onChange={setLabel} options={['Figure', 'Table', 'Equation'].map((l) => ({ value: l, label: l }))} />
        </div>
        <label className="field">
          <span className="field-label">Caption</span>
          <input className="input" autoFocus placeholder="Describe the figure" value={text} onChange={(ev) => setText(ev.target.value)} onKeyDown={(ev) => ev.key === 'Enter' && (e.chain().focus().insertCaption(label, text).run(), onClose())} />
        </label>
        <div className="hint">Captions are numbered automatically and renumber when you add or move them. The caption is added below the current paragraph.</div>
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Go To

export function GotoDialog({ onClose }: Close): ReactNode {
  const e = activeEditor()!
  const doc = activeDoc()!
  const [page, setPage] = useState(String(doc.stats.currentPage))
  const headings = collectHeadings(e.state.doc)
  const go = (): void => {
    const n = Math.max(1, Math.min(doc.pagination.pages, parseInt(page, 10) || 1))
    const start = doc.pagination.pageStarts[n - 1] ?? 0
    const sheet = (e.view.dom as HTMLElement).closest('.canvas')?.querySelectorAll<HTMLElement>('.pe-sheet')[n - 1]
    sheet?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    e.chain().focus().setTextSelection(Math.min(start + 1, e.state.doc.content.size)).run()
    onClose()
  }
  return (
    <Dialog
      title="Go To"
      icon={<Navigation size={20} />}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn primary" onClick={go}>
            Go To
          </button>
        </>
      }
    >
      <div className="form">
        <label className="field">
          <span className="field-label">Page number (1–{doc.pagination.pages})</span>
          <input className="input" autoFocus value={page} onChange={(ev) => setPage(ev.target.value)} onKeyDown={(ev) => ev.key === 'Enter' && go()} />
        </label>
        {headings.length > 0 && (
          <>
            <div className="section-label">Or jump to a heading</div>
            <div style={{ maxHeight: 240, overflow: 'auto' }}>
              {headings.map((h) => (
                <button key={h.pos} className="nav-heading" style={{ paddingLeft: 8 + (h.level - 1) * 14 }} onClick={() => (scrollToPos(e, h.pos), onClose())}>
                  {h.text}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ simple prompts

export function PromptDialog({ onClose, kind }: Close & { kind: string }): ReactNode {
  const doc = activeDoc()
  const goal = useApp((s) => s.settings.wordGoal) ?? 0
  const [value, setValue] = useState(kind === 'goal' ? String(goal || 500) : (doc?.title ?? 'My template'))
  if (kind === 'goal') {
    return (
      <Dialog
        title="Writing Goal"
        icon={<Target size={20} />}
        onClose={onClose}
        footer={
          <>
            <button className="btn left ghost" onClick={() => (useApp.getState().setSettings({ wordGoal: 0 }), onClose())}>
              Turn off
            </button>
            <button className="btn primary" onClick={() => (useApp.getState().setSettings({ wordGoal: Math.max(0, parseInt(value, 10) || 0) }), onClose())}>
              Set goal
            </button>
          </>
        }
      >
        <label className="field">
          <span className="field-label">Words to write this session</span>
          <input className="input" type="number" min={0} step={50} autoFocus value={value} onChange={(ev) => setValue(ev.target.value)} />
        </label>
        <div className="hint" style={{ marginTop: 8 }}>Your progress shows as a ring in the status bar.</div>
      </Dialog>
    )
  }
  return (
    <Dialog
      title="Save as Template"
      icon={<LayoutTemplate size={20} />}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!value.trim() || !doc} onClick={() => (doc && void saveAsTemplate(doc.id, value.trim()), onClose())}>
            Save
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">Template name</span>
        <input className="input" autoFocus value={value} onChange={(ev) => setValue(ev.target.value)} />
      </label>
      <div className="hint" style={{ marginTop: 8 }}>The template appears under File → New.</div>
    </Dialog>
  )
}

export function ZoomDialog({ onClose }: Close): ReactNode {
  const zoom = useApp((s) => s.zoom)
  const [v, setV] = useState(Math.round(zoom * 100))
  return (
    <Dialog
      title="Zoom"
      icon={<ZoomIn size={20} />}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => (setZoom(v / 100), onClose())}>
            OK
          </button>
        </>
      }
    >
      <div className="form">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[50, 75, 100, 125, 150, 200, 300].map((z) => (
            <button key={z} className={`btn sm ${v === z ? 'primary' : ''}`} onClick={() => setV(z)}>
              {z}%
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn sm" onClick={() => (window.dispatchEvent(new CustomEvent('pe-fit', { detail: 'width' })), onClose())}>
            Page width
          </button>
          <button className="btn sm" onClick={() => (window.dispatchEvent(new CustomEvent('pe-fit', { detail: 'page' })), onClose())}>
            Whole page
          </button>
        </div>
        <label className="field">
          <span className="field-label">Percent</span>
          <input className="input" type="number" min={10} max={500} value={v} onChange={(ev) => setV(Number(ev.target.value))} />
        </label>
      </div>
    </Dialog>
  )
}

export { markDirty }
