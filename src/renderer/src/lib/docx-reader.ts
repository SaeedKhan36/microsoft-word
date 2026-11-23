/**
 * Word (.docx) reader that keeps the look of the document: fonts, sizes, colours, highlighting,
 * alignment, indents, spacing, lists, tables (widths, merged cells, shading), pictures at their
 * real size, footnotes, page breaks, hyperlinks, equations, tracked changes and comments.
 *
 * It reads the Office Open XML parts directly and produces editor JSON.
 */
import JSZip from 'jszip'
import type { JSONContent } from '@tiptap/core'
import type { CommentThread, DocStyles } from './types'
import { bytesToDataUrl } from './images'
import { uid } from './units'

type El = Element
type Marks = NonNullable<JSONContent['marks']>

// ------------------------------------------------------------------ small XML helpers

const local = (el: Node): string => (el as El).localName ?? ''
const isMath = (el: El): boolean => (el.namespaceURI ?? '').includes('math')
const kids = (el: El | null | undefined, name?: string): El[] =>
  el ? (Array.from(el.children) as El[]).filter((c) => !name || (local(c) === name && !isMath(c))) : []
const kid = (el: El | null | undefined, name: string): El | null => kids(el, name)[0] ?? null
function attr(el: El | null | undefined, name: string): string | null {
  if (!el) return null
  for (const a of Array.from(el.attributes)) if (a.localName === name) return a.value
  return null
}
const val = (el: El | null | undefined): string | null => attr(el, 'val')
/** Word boolean properties: <w:b/> is on, <w:b w:val="0|false|off"/> is off. */
function flag(el: El | null): boolean | undefined {
  if (!el) return undefined
  const v = val(el)
  return !(v === '0' || v === 'false' || v === 'off' || v === 'none')
}
const num = (s: string | null): number | null => {
  if (s === null || s === undefined || s === '') return null
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}
const twipToPt = (tw: number): number => Math.round((tw / 20) * 10) / 10
function descendants(el: El, name: string): El[] {
  return Array.from(el.getElementsByTagName('*')).filter((e) => local(e) === name) as El[]
}

// ------------------------------------------------------------------ properties

interface RunProps {
  bold?: boolean
  italic?: boolean
  underline?: string | null
  strike?: boolean
  vertAlign?: string | null
  color?: string | null
  size?: number | null // pt
  font?: string | null
  highlight?: string | null
  caps?: boolean
  smallCaps?: boolean
  spacing?: number | null // pt
}

interface ParaProps {
  align?: string | null
  indLeft?: number | null
  indRight?: number | null
  firstLine?: number | null // pt, negative = hanging
  before?: number | null
  after?: number | null
  line?: number | null // multiple of single
  lineExactPt?: number | null
  shading?: string | null
  border?: string | null
  borderColor?: string | null
  keepNext?: boolean
  pageBreakBefore?: boolean
  numId?: string | null
  ilvl?: number | null
}

const HIGHLIGHT: Record<string, string> = {
  yellow: '#ffff00',
  green: '#00ff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  blue: '#0000ff',
  red: '#ff0000',
  darkBlue: '#000080',
  darkCyan: '#008080',
  darkGreen: '#008000',
  darkMagenta: '#800080',
  darkRed: '#800000',
  darkYellow: '#808000',
  darkGray: '#808080',
  lightGray: '#c0c0c0',
  black: '#000000',
  white: '#ffffff'
}

interface Ctx {
  theme: { major: string; minor: string; colors: Record<string, string> }
  styles: Map<string, El>
  defaults: { r: RunProps; p: ParaProps }
  numbering: { nums: Map<string, { abs: string; starts: Map<number, number> }>; abstracts: Map<string, Map<number, { fmt: string; start: number; text: string }>> }
  rels: Map<string, { target: string; external: boolean }>
  zip: JSZip
  media: Map<string, string>
  footnotes: Map<string, string>
  endnotes: Map<string, string>
  comments: Map<string, CommentThread>
  openComments: Set<string>
  messages: Set<string>
  base: { font: string; size: number; color: string }
  contentWidthPx: number
  tableStack: { r: RunProps; p: ParaProps }[]
}

function readRunProps(rPr: El | null, ctx: Ctx): RunProps {
  const p: RunProps = {}
  if (!rPr) return p
  const b = flag(kid(rPr, 'b'))
  if (b !== undefined) p.bold = b
  const i = flag(kid(rPr, 'i'))
  if (i !== undefined) p.italic = i
  const u = kid(rPr, 'u')
  if (u) p.underline = val(u) ?? 'single'
  const s = flag(kid(rPr, 'strike')) ?? flag(kid(rPr, 'dstrike'))
  if (s !== undefined) p.strike = s
  const va = kid(rPr, 'vertAlign')
  if (va) p.vertAlign = val(va)
  const c = kid(rPr, 'color')
  if (c) {
    const v = val(c)
    if (v && v !== 'auto') p.color = `#${v.toLowerCase()}`
    else if (attr(c, 'themeColor') && ctx.theme.colors[attr(c, 'themeColor')!]) p.color = ctx.theme.colors[attr(c, 'themeColor')!]
    else if (v === 'auto') p.color = null
  }
  const sz = num(val(kid(rPr, 'sz')))
  if (sz) p.size = sz / 2
  const f = kid(rPr, 'rFonts')
  if (f) {
    const font = attr(f, 'ascii') ?? attr(f, 'hAnsi') ?? attr(f, 'cs')
    const themeFont = attr(f, 'asciiTheme') ?? attr(f, 'hAnsiTheme')
    if (font) p.font = font
    else if (themeFont) p.font = themeFont.startsWith('major') ? ctx.theme.major : ctx.theme.minor
  }
  const hl = kid(rPr, 'highlight')
  if (hl && val(hl) && val(hl) !== 'none') p.highlight = HIGHLIGHT[val(hl)!] ?? null
  const shd = kid(rPr, 'shd')
  if (shd && !p.highlight) {
    const fill = attr(shd, 'fill')
    if (fill && fill !== 'auto' && fill.toUpperCase() !== 'FFFFFF') p.highlight = `#${fill.toLowerCase()}`
  }
  const caps = flag(kid(rPr, 'caps'))
  if (caps !== undefined) p.caps = caps
  const sc = flag(kid(rPr, 'smallCaps'))
  if (sc !== undefined) p.smallCaps = sc
  const sp = num(val(kid(rPr, 'spacing')))
  if (sp) p.spacing = twipToPt(sp)
  return p
}

function readParaProps(pPr: El | null): ParaProps {
  const p: ParaProps = {}
  if (!pPr) return p
  const jc = val(kid(pPr, 'jc'))
  if (jc) p.align = jc === 'both' || jc === 'distribute' ? 'justify' : jc === 'end' ? 'right' : jc === 'start' ? 'left' : jc
  const ind = kid(pPr, 'ind')
  if (ind) {
    const l = num(attr(ind, 'left') ?? attr(ind, 'start'))
    const r = num(attr(ind, 'right') ?? attr(ind, 'end'))
    const fl = num(attr(ind, 'firstLine'))
    const h = num(attr(ind, 'hanging'))
    if (l !== null) p.indLeft = twipToPt(l)
    if (r !== null) p.indRight = twipToPt(r)
    if (h !== null) p.firstLine = -twipToPt(h)
    else if (fl !== null) p.firstLine = twipToPt(fl)
  }
  const sp = kid(pPr, 'spacing')
  if (sp) {
    const before = num(attr(sp, 'before'))
    const after = num(attr(sp, 'after'))
    const line = num(attr(sp, 'line'))
    const rule = attr(sp, 'lineRule') ?? 'auto'
    if (before !== null && attr(sp, 'beforeAutospacing') !== '1') p.before = twipToPt(before)
    if (after !== null && attr(sp, 'afterAutospacing') !== '1') p.after = twipToPt(after)
    if (line !== null) {
      if (rule === 'auto') p.line = Math.round((line / 240) * 100) / 100
      else p.lineExactPt = line / 20
    }
  }
  const shd = kid(pPr, 'shd')
  if (shd) {
    const fill = attr(shd, 'fill')
    if (fill && fill !== 'auto') p.shading = `#${fill.toLowerCase()}`
  }
  const bdr = kid(pPr, 'pBdr')
  if (bdr) {
    const sides = kids(bdr).filter((s) => val(s) && val(s) !== 'none' && val(s) !== 'nil').map(local)
    if (sides.length >= 4) p.border = 'box'
    else if (sides.includes('left')) p.border = 'left'
    else if (sides.includes('top')) p.border = 'top'
    else if (sides.includes('bottom')) p.border = 'bottom'
    const color = kids(bdr).map((s) => attr(s, 'color')).find((c) => c && c !== 'auto')
    if (color) p.borderColor = `#${color.toLowerCase()}`
  }
  const kn = flag(kid(pPr, 'keepNext'))
  if (kn !== undefined) p.keepNext = kn
  const pb = flag(kid(pPr, 'pageBreakBefore'))
  if (pb !== undefined) p.pageBreakBefore = pb
  const numPr = kid(pPr, 'numPr')
  if (numPr) {
    p.numId = val(kid(numPr, 'numId'))
    p.ilvl = num(val(kid(numPr, 'ilvl'))) ?? 0
  }
  return p
}

/** Resolve a style's properties including everything it is based on. */
function styleChain(id: string | null, ctx: Ctx, seen = new Set<string>()): { r: RunProps; p: ParaProps; names: string[] } {
  if (!id || seen.has(id)) return { r: {}, p: {}, names: [] }
  seen.add(id)
  const st = ctx.styles.get(id)
  if (!st) return { r: {}, p: {}, names: [] }
  const parent = styleChain(val(kid(st, 'basedOn')), ctx, seen)
  return {
    r: { ...parent.r, ...readRunProps(kid(st, 'rPr'), ctx) },
    p: { ...parent.p, ...readParaProps(kid(st, 'pPr')) },
    names: [...parent.names, (val(kid(st, 'name')) ?? id).toLowerCase(), id.toLowerCase()]
  }
}

// ------------------------------------------------------------------ marks & text

function marksFor(r: RunProps, ctx: Ctx, extra: Marks = []): Marks {
  const m: Marks = []
  if (r.bold) m.push({ type: 'bold' })
  if (r.italic) m.push({ type: 'italic' })
  if (r.underline && r.underline !== 'none') {
    const style = { double: 'double', dotted: 'dotted', dottedHeavy: 'dotted', dash: 'dashed', dashLong: 'dashed', wave: 'wavy', wavyHeavy: 'wavy', wavyDouble: 'wavy' }[r.underline] ?? null
    m.push({ type: 'underline', attrs: style ? { underlineStyle: style } : {} })
  }
  if (r.strike) m.push({ type: 'strike' })
  if (r.vertAlign === 'superscript') m.push({ type: 'superscript' })
  if (r.vertAlign === 'subscript') m.push({ type: 'subscript' })
  if (r.highlight) m.push({ type: 'highlight', attrs: { color: r.highlight } })
  const ts: Record<string, string | null> = {}
  if (r.font && r.font !== ctx.base.font) ts.fontFamily = r.font
  if (r.size && Math.abs(r.size - ctx.base.size) > 0.01) ts.fontSize = `${r.size}pt`
  if (r.color && r.color !== ctx.base.color) ts.color = r.color
  if (r.smallCaps) ts.textCase = 'small-caps'
  else if (r.caps) ts.textCase = 'all-caps'
  if (r.spacing) ts.letterSpacing = `${r.spacing}pt`
  if (Object.keys(ts).length) m.push({ type: 'textStyle', attrs: ts })
  return [...m, ...extra]
}

function textNode(text: string, marks: Marks): JSONContent | null {
  if (!text) return null
  return marks.length ? { type: 'text', text, marks } : { type: 'text', text }
}

// ------------------------------------------------------------------ math (OMML → LaTeX)

function ommlToLatex(el: El): string {
  const inner = (e: El | null): string => (e ? kidsAll(e).map(ommlToLatex).join('') : '')
  const n = local(el)
  switch (n) {
    case 'oMathPara':
    case 'oMath':
    case 'e':
    case 'num':
    case 'den':
    case 'sub':
    case 'sup':
    case 'deg':
    case 'lim':
    case 'fName':
      return inner(el)
    case 'r':
      return kidsAll(el)
        .filter((c) => local(c) === 't')
        .map((t) => latexEscape(t.textContent ?? ''))
        .join('')
    case 'f':
      return `\\frac{${inner(childM(el, 'num'))}}{${inner(childM(el, 'den'))}}`
    case 'sSup':
      return `{${inner(childM(el, 'e'))}}^{${inner(childM(el, 'sup'))}}`
    case 'sSub':
      return `{${inner(childM(el, 'e'))}}_{${inner(childM(el, 'sub'))}}`
    case 'sSubSup':
      return `{${inner(childM(el, 'e'))}}_{${inner(childM(el, 'sub'))}}^{${inner(childM(el, 'sup'))}}`
    case 'rad': {
      const deg = inner(childM(el, 'deg'))
      return deg ? `\\sqrt[${deg}]{${inner(childM(el, 'e'))}}` : `\\sqrt{${inner(childM(el, 'e'))}}`
    }
    case 'nary': {
      const chr = attr(childM(childM(el, 'naryPr'), 'chr'), 'val') ?? '∫'
      const op = { '∑': '\\sum', '∏': '\\prod', '∫': '\\int', '∬': '\\iint', '∮': '\\oint', '⋃': '\\bigcup', '⋂': '\\bigcap' }[chr] ?? '\\int'
      const sub = inner(childM(el, 'sub'))
      const sup = inner(childM(el, 'sup'))
      return `${op}${sub ? `_{${sub}}` : ''}${sup ? `^{${sup}}` : ''} ${inner(childM(el, 'e'))}`
    }
    case 'd': {
      const pr = childM(el, 'dPr')
      const beg = attr(childM(pr, 'begChr'), 'val') ?? '('
      const end = attr(childM(pr, 'endChr'), 'val') ?? ')'
      const parts = kidsAll(el).filter((c) => local(c) === 'e').map(ommlToLatex)
      return `\\left${delim(beg)} ${parts.join(', ')} \\right${delim(end)}`
    }
    case 'func':
      return `${inner(childM(el, 'fName'))} ${inner(childM(el, 'e'))}`
    case 'limLow':
      return `${inner(childM(el, 'e'))}_{${inner(childM(el, 'lim'))}}`
    case 'limUpp':
      return `${inner(childM(el, 'e'))}^{${inner(childM(el, 'lim'))}}`
    case 'bar':
      return `\\overline{${inner(childM(el, 'e'))}}`
    case 'acc': {
      const chr = attr(childM(childM(el, 'accPr'), 'chr'), 'val') ?? '^'
      const cmd = { '̂': 'hat', '̃': 'tilde', '̇': 'dot', '⃗': 'vec', '̄': 'bar' }[chr] ?? 'hat'
      return `\\${cmd}{${inner(childM(el, 'e'))}}`
    }
    case 'm':
      return `\\begin{matrix}${kidsAll(el)
        .filter((c) => local(c) === 'mr')
        .map((row) => kidsAll(row).filter((c) => local(c) === 'e').map(ommlToLatex).join(' & '))
        .join(' \\\\ ')}\\end{matrix}`
    case 'eqArr':
      return `\\begin{aligned}${kidsAll(el)
        .filter((c) => local(c) === 'e')
        .map(ommlToLatex)
        .join(' \\\\ ')}\\end{aligned}`
    case 'box':
    case 'borderBox':
    case 'groupChr':
      return inner(childM(el, 'e'))
    default:
      return local(el).endsWith('Pr') ? '' : inner(el)
  }
}
const kidsAll = (el: El): El[] => Array.from(el.children) as El[]
const childM = (el: El | null, name: string): El | null => (el ? (kidsAll(el).find((c) => local(c) === name) ?? null) : null)
const delim = (c: string): string => ({ '(': '(', ')': ')', '[': '[', ']': ']', '{': '\\{', '}': '\\}', '|': '|', '': '.' })[c] ?? '('
const MATH_SYMBOLS: Record<string, string> = { 'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta', 'θ': '\\theta', 'λ': '\\lambda', 'μ': '\\mu', 'π': '\\pi', 'σ': '\\sigma', 'φ': '\\phi', 'ω': '\\omega', 'Δ': '\\Delta', 'Σ': '\\Sigma', 'Ω': '\\Omega', '∞': '\\infty', '±': '\\pm', '×': '\\times', '÷': '\\div', '≤': '\\leq', '≥': '\\geq', '≠': '\\neq', '≈': '\\approx', '→': '\\rightarrow', '∈': '\\in', '·': '\\cdot', '∂': '\\partial', '∇': '\\nabla' }
const latexEscape = (s: string): string => s.replace(/[αβγδθλμπσφωΔΣΩ∞±×÷≤≥≠≈→∈·∂∇]/g, (c) => `${MATH_SYMBOLS[c]} `).replace(/([%#&])/g, '\\$1')

// ------------------------------------------------------------------ images

async function imageSrc(rid: string | null, ctx: Ctx): Promise<string | null> {
  if (!rid) return null
  const rel = ctx.rels.get(rid)
  if (!rel) return null
  if (rel.external) return rel.target
  if (ctx.media.has(rel.target)) return ctx.media.get(rel.target)!
  const path = rel.target.startsWith('/') ? rel.target.slice(1) : `word/${rel.target}`.replace(/word\/\.\.\//, '')
  const f = ctx.zip.file(path)
  if (!f) return null
  const ext = path.split('.').pop()!.toLowerCase()
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : ext === 'emf' || ext === 'wmf' ? '' : `image/${ext}`
  if (!mime) {
    ctx.messages.add('Some pictures use old Windows formats (EMF/WMF) and could not be shown.')
    return null
  }
  const src = bytesToDataUrl(await f.async('uint8array'), mime)
  ctx.media.set(rel.target, src)
  return src
}

const EMU_PER_PX = 9525

async function drawingToImage(d: El, ctx: Ctx): Promise<JSONContent | null> {
  const blip = descendants(d, 'blip')[0]
  const src = await imageSrc(attr(blip, 'embed') ?? attr(blip, 'link'), ctx)
  if (!src) {
    const txbx = descendants(d, 'txbxContent')[0]
    if (txbx) return { type: '__textbox', content: [], attrs: { el: txbx } } as unknown as JSONContent
    return null
  }
  const extent = descendants(d, 'extent')[0]
  const cx = num(attr(extent, 'cx'))
  const anchor = kids(d).find((c) => local(c) === 'anchor')
  let layout = 'inline'
  if (anchor) {
    const posH = descendants(anchor, 'positionH')[0]
    const align = descendants(posH ?? anchor, 'align')[0]?.textContent
    const wrapSquare = descendants(anchor, 'wrapSquare')[0] ?? descendants(anchor, 'wrapTight')[0]
    if (wrapSquare) layout = align === 'right' ? 'float-right' : 'float-left'
    else layout = align === 'right' ? 'right' : align === 'center' ? 'center' : 'left'
  }
  const alt = attr(descendants(d, 'docPr')[0], 'descr') ?? ''
  return { type: 'image', attrs: { src, alt, width: cx ? Math.round(cx / EMU_PER_PX) : null, layout } }
}

// ------------------------------------------------------------------ paragraphs

interface ParaOut {
  blocks: JSONContent[] // a paragraph can split into several blocks (page breaks, text boxes)
}

async function convertParagraph(p: El, ctx: Ctx, inList: boolean): Promise<{ out: ParaOut; props: ParaProps; styleNames: string[]; isHeading: number | null; styleId: string | null }> {
  const pPr = kid(p, 'pPr')
  const styleId = val(kid(pPr, 'pStyle'))
  const chain = styleChain(styleId ?? 'Normal', ctx)
  // Inside a table, the table style sits between the Normal style and any other paragraph style.
  const table = ctx.tableStack[ctx.tableStack.length - 1]
  const plainStyle = !styleId || styleId.toLowerCase() === 'normal'
  const props: ParaProps = table
    ? plainStyle
      ? { ...ctx.defaults.p, ...chain.p, ...table.p, ...readParaProps(pPr) }
      : { ...ctx.defaults.p, ...table.p, ...chain.p, ...readParaProps(pPr) }
    : { ...ctx.defaults.p, ...chain.p, ...readParaProps(pPr) }
  const paraRun: RunProps = table
    ? plainStyle
      ? { ...ctx.defaults.r, ...chain.r, ...table.r, ...readRunProps(kid(pPr, 'rPr'), ctx) }
      : { ...ctx.defaults.r, ...table.r, ...chain.r, ...readRunProps(kid(pPr, 'rPr'), ctx) }
    : { ...ctx.defaults.r, ...chain.r, ...readRunProps(kid(pPr, 'rPr'), ctx) }
  const names = chain.names
  let heading: number | null = null
  for (const n of names) {
    const m = n.match(/^heading ?(\d)$/)
    if (m) heading = Math.min(6, Number(m[1]))
  }
  const outline = num(val(kid(pPr, 'outlineLvl')))
  if (heading === null && outline !== null && outline < 6 && names.some((n) => n.includes('heading'))) heading = outline + 1

  const blocks: JSONContent[] = []
  let inline: JSONContent[] = []
  const after: JSONContent[] = []
  const flush = (): void => {
    blocks.push({ type: '__para', content: inline })
    inline = []
  }

  // Complex fields: show the field result (between "separate" and "end").
  let fieldDepth = 0
  let inResult = false

  const walk = async (nodes: El[], extraMarks: Marks, runStyle?: RunProps): Promise<void> => {
    for (const el of nodes) {
      const n = local(el)
      if (isMath(el)) {
        if (n === 'oMathPara' || n === 'oMath') {
          const latex = ommlToLatex(el).replace(/\s+/g, ' ').trim()
          if (n === 'oMathPara' || (nodes.length === 1 && !inline.length)) after.push({ type: 'blockMath', attrs: { latex } })
          else inline.push({ type: 'inlineMath', attrs: { latex } })
        }
        continue
      }
      switch (n) {
        case 'r': {
          const rPr = kid(el, 'rPr')
          const rStyle = val(kid(rPr, 'rStyle'))
          const rs: RunProps = { ...paraRun, ...(runStyle ?? {}), ...(rStyle ? styleChain(rStyle, ctx).r : {}), ...readRunProps(rPr, ctx) }
          const marks = marksFor(rs, ctx, extraMarks)
          for (const c of kids(el)) {
            const cn = local(c)
            if (cn === 'fldChar') {
              const t = attr(c, 'fldCharType')
              if (t === 'begin') fieldDepth++
              else if (t === 'separate') inResult = true
              else if (t === 'end') {
                fieldDepth = Math.max(0, fieldDepth - 1)
                if (!fieldDepth) inResult = false
              }
              continue
            }
            if (fieldDepth && !inResult) continue
            if (cn === 't') {
              const tn = textNode(c.textContent ?? '', marks)
              if (tn) inline.push(tn)
            } else if (cn === 'tab' || cn === 'ptab') inline.push(textNode('\t', marks)!)
            else if (cn === 'br' || cn === 'cr') {
              const type = attr(c, 'type')
              if (type === 'page') {
                flush()
                blocks.push({ type: 'pageBreak' })
              } else if (type !== 'column') inline.push({ type: 'hardBreak' })
            } else if (cn === 'noBreakHyphen') inline.push(textNode('‑', marks)!)
            else if (cn === 'softHyphen') inline.push(textNode('­', marks)!)
            else if (cn === 'sym') {
              const code = attr(c, 'char')
              if (code) inline.push(textNode(String.fromCharCode(parseInt(code, 16) > 0xf000 ? parseInt(code, 16) - 0xf000 : parseInt(code, 16)), marks)!)
            } else if (cn === 'footnoteReference' || cn === 'endnoteReference') {
              const id = attr(c, 'id')!
              const text = (cn === 'footnoteReference' ? ctx.footnotes : ctx.endnotes).get(id) ?? ''
              inline.push({ type: 'footnote', attrs: { id: uid('f'), text } })
            } else if (cn === 'drawing' || cn === 'pict' || cn === 'object') {
              const img = cn === 'drawing' ? await drawingToImage(c, ctx) : await legacyImage(c, ctx)
              if (img && img.type === '__textbox') after.push(...(await textboxBlocks((img.attrs as { el: El }).el, ctx)))
              else if (img) inline.push(img)
            } else if (cn === 'AlternateContent') {
              // Prefer the modern drawing; fall back to the legacy picture.
              const choice = kids(c).find((x) => local(x) === 'Choice')
              const fallback = kids(c).find((x) => local(x) === 'Fallback')
              const drawing = choice ? descendants(choice, 'drawing')[0] : null
              const img = drawing ? await drawingToImage(drawing, ctx) : fallback ? await legacyImage(fallback, ctx) : null
              if (img && img.type === '__textbox') after.push(...(await textboxBlocks((img.attrs as { el: El }).el, ctx)))
              else if (img) inline.push(img)
            }
          }
          break
        }
        case 'hyperlink': {
          const rid = attr(el, 'id')
          const anchor = attr(el, 'anchor')
          const href = rid ? ctx.rels.get(rid)?.target : anchor ? `#bm-${anchor}` : null
          await walk(kids(el), href ? [...extraMarks, { type: 'link', attrs: { href } }] : extraMarks, href ? { color: null, underline: null } : undefined)
          break
        }
        case 'ins':
        case 'del': {
          const change = { type: n === 'ins' ? 'insertion' : 'deletion', attrs: { id: uid('t'), author: attr(el, 'author') ?? 'Author', date: Date.parse(attr(el, 'date') ?? '') || Date.now() } }
          if (n === 'del') {
            // Deleted text lives in <w:delText>; treat it like normal text with a deletion mark.
            for (const r of kids(el, 'r')) for (const dt of kids(r, 'delText')) r.appendChild(Object.assign(r.ownerDocument.createElementNS(r.namespaceURI, 'w:t'), { textContent: dt.textContent }))
          }
          await walk(kids(el), [...extraMarks, change])
          break
        }
        case 'smartTag':
        case 'customXml':
        case 'fldSimple':
        case 'dir':
        case 'bdo':
          await walk(kids(el), extraMarks)
          break
        case 'sdt':
          await walk(kids(kid(el, 'sdtContent')), extraMarks)
          break
        case 'commentRangeStart': {
          const id = attr(el, 'id')!
          if (ctx.comments.has(id)) ctx.openComments.add(id)
          break
        }
        case 'commentRangeEnd':
          ctx.openComments.delete(attr(el, 'id')!)
          break
        case 'bookmarkStart': {
          const name = attr(el, 'name')
          if (name && !name.startsWith('_')) inline.push({ type: 'bookmark', attrs: { name } })
          break
        }
        default:
          break
      }
      // Comment ranges apply to the text inside them.
      if (ctx.openComments.size && n === 'r') {
        const last = inline[inline.length - 1]
        if (last?.type === 'text') {
          last.marks = [...(last.marks ?? []), ...Array.from(ctx.openComments).map((id) => ({ type: 'comment', attrs: { id: ctx.comments.get(id)!.id } }))]
        }
      }
    }
  }

  await walk(kids(p).filter((c) => local(c) !== 'pPr'), [])
  if (inline.length || !blocks.length) flush()

  // Convert paragraph properties into editor attributes (only what differs from the document defaults).
  const attrs: Record<string, unknown> = {}
  if (props.align && props.align !== 'left') attrs.textAlign = props.align
  if (!inList) {
    if (props.indLeft) attrs.indentLeft = props.firstLine && props.firstLine < 0 ? Math.max(0, props.indLeft + props.firstLine) : props.indLeft
    if (props.firstLine) attrs.firstLine = props.firstLine
  }
  if (props.indRight) attrs.indentRight = props.indRight
  const d = ctx.defaults.p
  if (props.before !== undefined && props.before !== null && props.before !== (d.before ?? 0)) attrs.spaceBefore = props.before
  if (props.after !== undefined && props.after !== null && props.after !== d.after) attrs.spaceAfter = props.after
  if (props.line && props.line !== d.line) attrs.lineHeight = props.line
  else if (props.lineExactPt) attrs.lineHeight = Math.max(0.8, Math.round((props.lineExactPt / (paraRun.size ?? ctx.base.size) / 1.17) * 100) / 100)
  if (props.shading) attrs.shading = props.shading
  if (props.border) {
    attrs.borderStyle = props.border
    if (props.borderColor) attrs.borderColor = props.borderColor
  }
  if (props.keepNext && heading === null) attrs.keepWithNext = true
  if (props.pageBreakBefore) attrs.pageBreakBefore = true
  let style: string | null = null
  for (const n of names) {
    if (n === 'title') style = 'title'
    else if (n === 'subtitle') style = 'subtitle'
    else if (n === 'intense quote' || n === 'intensequote') style = 'intense-quote'
    else if (n === 'quote') style = 'quote'
    else if (n === 'caption') style = 'caption'
    else if (n === 'no spacing' || n === 'nospacing') style = 'no-spacing'
  }
  if (style && heading === null) attrs.styleId = style

  const resolved: JSONContent[] = []
  for (const b of blocks) {
    if (b.type !== '__para') {
      resolved.push(b)
      continue
    }
    const content = b.content ?? []
    // A paragraph holding only a picture keeps its alignment on the picture.
    if (content.length === 1 && content[0].type === 'image' && content[0].attrs?.layout === 'inline' && (props.align === 'center' || props.align === 'right')) {
      content[0].attrs = { ...content[0].attrs, layout: props.align }
    }
    resolved.push(heading !== null ? { type: 'heading', attrs: { ...attrs, level: heading }, content } : { type: 'paragraph', attrs, content })
  }
  resolved.push(...after)
  return { out: { blocks: resolved }, props, styleNames: names, isHeading: heading, styleId }
}

async function legacyImage(el: El, ctx: Ctx): Promise<JSONContent | null> {
  const data = descendants(el, 'imagedata')[0]
  const src = await imageSrc(attr(data, 'id'), ctx)
  if (!src) return null
  const shape = descendants(el, 'shape')[0]
  const style = attr(shape, 'style') ?? ''
  const w = style.match(/width:([\d.]+)pt/)
  return { type: 'image', attrs: { src, width: w ? Math.round(parseFloat(w[1]) * (96 / 72)) : null, layout: 'inline' } }
}

async function textboxBlocks(txbx: El, ctx: Ctx): Promise<JSONContent[]> {
  const content = await convertBlocks(kids(txbx), ctx)
  return content.length ? [{ type: 'box', attrs: { variant: 'textbox', float: 'none', width: null }, content }] : []
}

// ------------------------------------------------------------------ lists

const FMT: Record<string, string> = { decimal: '1', lowerLetter: 'a', upperLetter: 'A', lowerRoman: 'i', upperRoman: 'I', decimalZero: '1' }

function listInfo(numId: string, ilvl: number, ctx: Ctx): { bullet: boolean; type: string; start: number; glyph: string } | null {
  const n = ctx.numbering.nums.get(numId)
  if (!n) return null
  const lvl = ctx.numbering.abstracts.get(n.abs)?.get(ilvl)
  if (!lvl || lvl.fmt === 'none') return null
  return { bullet: lvl.fmt === 'bullet', type: FMT[lvl.fmt] ?? '1', start: n.starts.get(ilvl) ?? lvl.start, glyph: lvl.text }
}

function bulletStyle(glyph: string): string | null {
  if ('o◦○'.includes(glyph)) return 'circle'
  if ('§▪■'.includes(glyph)) return 'square'
  if ('–-'.includes(glyph)) return 'dash'
  if ('Ø➢➤►'.includes(glyph)) return 'arrow'
  if ('ü✓✔'.includes(glyph)) return 'check'
  if ('★☆'.includes(glyph)) return 'star'
  if ('v◆♦'.includes(glyph)) return 'diamond'
  return null
}

// ------------------------------------------------------------------ tables

async function convertTable(tbl: El, ctx: Ctx): Promise<JSONContent> {
  let grid = kids(kid(tbl, 'tblGrid'), 'gridCol').map((g) => (num(attr(g, 'w')) ?? 1440) / 15)
  // Keep the table inside the page: scale columns down if the grid is wider than the text area.
  const total = grid.reduce((a, b) => a + b, 0)
  const avail = ctx.tableStack.length ? ctx.contentWidthPx * 0.6 : ctx.contentWidthPx
  if (total > avail) grid = grid.map((w) => (w * avail) / total)
  grid = grid.map((w) => Math.max(20, Math.round(w)))
  // Table style paragraph/run formatting applies to the text inside the table.
  const tblStyleId = val(kid(kid(tbl, 'tblPr'), 'tblStyle'))
  const tStyle = tblStyleId ? styleChain(tblStyleId, ctx) : { r: {}, p: {} }
  ctx.tableStack.push({ r: tStyle.r, p: { firstLine: 0, ...tStyle.p } })
  try {
    return await convertTableBody(tbl, grid, ctx)
  } finally {
    ctx.tableStack.pop()
  }
}

async function convertTableBody(tbl: El, grid: number[], ctx: Ctx): Promise<JSONContent> {
  const rowsEl = kids(tbl, 'tr')
  // First pass: lay cells on the grid so vertical merges can be resolved.
  interface Cell {
    el: El
    col: number
    span: number
    vMerge: string | null
    rowspan: number
    skip: boolean
  }
  const rows: Cell[][] = rowsEl.map((tr) => {
    let col = num(val(kid(kid(tr, 'trPr'), 'gridBefore'))) ?? 0
    return kids(tr, 'tc').map((tc) => {
      const tcPr = kid(tc, 'tcPr')
      const span = num(val(kid(tcPr, 'gridSpan'))) ?? 1
      const vm = kid(tcPr, 'vMerge')
      const cell: Cell = { el: tc, col, span, vMerge: vm ? (val(vm) ?? 'continue') : null, rowspan: 1, skip: false }
      col += span
      return cell
    })
  })
  for (let r = 0; r < rows.length; r++) {
    for (const cell of rows[r]) {
      if (cell.vMerge !== 'continue') continue
      cell.skip = true
      for (let up = r - 1; up >= 0; up--) {
        const above = rows[up].find((c) => c.col === cell.col)
        if (above && !above.skip) {
          above.rowspan++
          break
        }
      }
    }
  }
  const tblBorders = kid(kid(tbl, 'tblPr'), 'tblBorders')
  const noBorders = tblBorders && kids(tblBorders).every((b) => ['none', 'nil'].includes(val(b) ?? ''))
  const firstRowHeader = !!kid(kid(rowsEl[0], 'trPr'), 'tblHeader')
  const outRows: JSONContent[] = []
  for (let r = 0; r < rows.length; r++) {
    const cells: JSONContent[] = []
    for (const cell of rows[r]) {
      if (cell.skip) continue
      const tcPr = kid(cell.el, 'tcPr')
      const shd = attr(kid(tcPr, 'shd'), 'fill')
      const vAlign = val(kid(tcPr, 'vAlign'))
      const widths = grid.slice(cell.col, cell.col + cell.span)
      const content = await convertBlocks(kids(cell.el).filter((c) => local(c) !== 'tcPr'), ctx)
      cells.push({
        type: firstRowHeader && r === 0 ? 'tableHeader' : 'tableCell',
        attrs: {
          colspan: cell.span,
          rowspan: cell.rowspan,
          colwidth: widths.length === cell.span && widths.every(Boolean) ? widths : null,
          backgroundColor: shd && shd !== 'auto' ? `#${shd.toLowerCase()}` : null,
          verticalAlign: vAlign === 'center' ? 'middle' : vAlign === 'bottom' ? 'bottom' : null
        },
        content: content.length ? content : [{ type: 'paragraph' }]
      })
    }
    if (cells.length) outRows.push({ type: 'tableRow', content: cells })
  }
  return { type: 'table', attrs: { tableStyle: noBorders ? 'plain' : 'grid', headerRow: firstRowHeader }, content: outRows }
}

// ------------------------------------------------------------------ blocks

async function convertBlocks(els: El[], ctx: Ctx): Promise<JSONContent[]> {
  const out: JSONContent[] = []
  // Open list stack: one entry per nesting level.
  let stack: { node: JSONContent; numId: string; ilvl: number }[] = []
  const closeLists = (): void => {
    stack = []
  }
  for (const el of els) {
    const n = local(el)
    if (n === 'p') {
      const pPr = kid(el, 'pPr')
      const styleId = val(kid(pPr, 'pStyle'))
      const chainP = styleChain(styleId ?? 'Normal', ctx).p
      const direct = readParaProps(pPr)
      const numId = direct.numId ?? chainP.numId
      const ilvl = direct.ilvl ?? chainP.ilvl ?? 0
      const info = numId && numId !== '0' ? listInfo(numId, ilvl, ctx) : null
      const { out: res } = await convertParagraph(el, ctx, !!info)
      if (info) {
        // Find or create the list for this level.
        while (stack.length && (stack[stack.length - 1].ilvl > ilvl || (stack[stack.length - 1].ilvl === ilvl && stack[stack.length - 1].numId !== numId && listInfo(stack[stack.length - 1].numId, ilvl, ctx)?.bullet !== info.bullet))) stack.pop()
        let top = stack[stack.length - 1]
        if (!top || top.ilvl < ilvl) {
          const list: JSONContent = info.bullet
            ? { type: 'bulletList', attrs: { bulletStyle: bulletStyle(info.glyph) }, content: [] }
            : { type: 'orderedList', attrs: { start: info.start, type: info.type }, content: [] }
          if (top) {
            const items = top.node.content!
            const lastItem = items[items.length - 1]
            if (lastItem) lastItem.content!.push(list)
            else items.push({ type: 'listItem', content: [{ type: 'paragraph' }, list] })
          } else out.push(list)
          top = { node: list, numId: numId as string, ilvl }
          stack.push(top)
        }
        const blocks = res.blocks
        const para = blocks.find((b) => b.type === 'paragraph' || b.type === 'heading') ?? { type: 'paragraph' }
        top.node.content!.push({ type: 'listItem', content: [para.type === 'heading' ? { type: 'paragraph', content: para.content } : para] })
        for (const b of blocks) if (b !== para) out.push(b)
        continue
      }
      closeLists()
      out.push(...res.blocks)
      // A section break inside the document starts a new page.
      const sect = kid(pPr, 'sectPr')
      if (sect && el !== els[els.length - 1]) {
        const type = val(kid(sect, 'type'))
        if (type !== 'continuous') out.push({ type: 'pageBreak' })
      }
    } else if (n === 'tbl') {
      closeLists()
      out.push(await convertTable(el, ctx))
    } else if (n === 'sdt') {
      out.push(...(await convertBlocks(kids(kid(el, 'sdtContent')), ctx)))
    } else if (n === 'customXml' || n === 'ins') {
      out.push(...(await convertBlocks(kids(el), ctx)))
    } else if (isMath(el) && (n === 'oMathPara' || n === 'oMath')) {
      out.push({ type: 'blockMath', attrs: { latex: ommlToLatex(el).trim() } })
    }
  }
  return out
}

// ------------------------------------------------------------------ entry point

async function xml(zip: JSZip, path: string): Promise<Document | null> {
  const f = zip.file(path)
  if (!f) return null
  return new DOMParser().parseFromString(await f.async('string'), 'application/xml')
}

async function notesMap(zip: JSZip, path: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const d = await xml(zip, path)
  if (!d) return map
  for (const note of Array.from(d.documentElement.children) as El[]) {
    const id = attr(note, 'id')
    if (!id || ['separator', 'continuationSeparator', 'continuationNotice'].includes(attr(note, 'type') ?? '')) continue
    const text = kids(note, 'p')
      .map((p) => descendants(p, 't').map((t) => t.textContent).join(''))
      .join('\n')
      .trim()
    map.set(id, text)
  }
  return map
}

export interface DocxReadResult {
  content: JSONContent
  styles: Partial<DocStyles>
  comments: CommentThread[]
  messages: string[]
}

export async function readDocx(bytes: Uint8Array): Promise<DocxReadResult> {
  const zip = await JSZip.loadAsync(bytes)
  const doc = await xml(zip, 'word/document.xml')
  if (!doc) throw new Error('This file is not a valid Word document.')

  // Theme fonts & colours.
  const theme = { major: 'Calibri Light', minor: 'Calibri', colors: {} as Record<string, string> }
  const themeDoc = await xml(zip, 'word/theme/theme1.xml')
  if (themeDoc) {
    const major = descendants(themeDoc.documentElement, 'majorFont')[0]
    const minor = descendants(themeDoc.documentElement, 'minorFont')[0]
    theme.major = attr(kid(major, 'latin'), 'typeface') || theme.major
    theme.minor = attr(kid(minor, 'latin'), 'typeface') || theme.minor
    const scheme = descendants(themeDoc.documentElement, 'clrScheme')[0]
    for (const c of kids(scheme)) {
      const v = attr(descendants(c, 'srgbClr')[0], 'val') ?? attr(descendants(c, 'sysClr')[0], 'lastClr')
      if (v) theme.colors[local(c)] = `#${v.toLowerCase()}`
    }
    theme.colors.text1 = theme.colors.dk1
    theme.colors.text2 = theme.colors.dk2
    theme.colors.background1 = theme.colors.lt1
    theme.colors.background2 = theme.colors.lt2
  }

  // Styles.
  const styles = new Map<string, El>()
  const stylesDoc = await xml(zip, 'word/styles.xml')
  const ctx: Ctx = {
    theme,
    styles,
    defaults: { r: {}, p: {} },
    numbering: { nums: new Map(), abstracts: new Map() },
    rels: new Map(),
    zip,
    media: new Map(),
    footnotes: await notesMap(zip, 'word/footnotes.xml'),
    endnotes: await notesMap(zip, 'word/endnotes.xml'),
    comments: new Map(),
    openComments: new Set(),
    messages: new Set(),
    base: { font: 'Calibri', size: 11, color: '#000000' },
    contentWidthPx: 624,
    tableStack: []
  }
  if (stylesDoc) {
    for (const s of descendants(stylesDoc.documentElement, 'style')) {
      const id = attr(s, 'styleId')
      if (id) styles.set(id, s)
    }
    const dd = descendants(stylesDoc.documentElement, 'docDefaults')[0]
    ctx.defaults.r = readRunProps(descendants(dd ?? stylesDoc.documentElement, 'rPrDefault')[0]?.firstElementChild ?? null, ctx)
    ctx.defaults.p = readParaProps(descendants(dd ?? stylesDoc.documentElement, 'pPrDefault')[0]?.firstElementChild ?? null)
  }
  const normal = styleChain('Normal', ctx)
  const baseRun = { ...ctx.defaults.r, ...normal.r }
  const baseP = { ...ctx.defaults.p, ...normal.p }
  ctx.defaults.p = baseP
  ctx.base = { font: baseRun.font ?? theme.minor, size: baseRun.size ?? 10, color: baseRun.color ?? '#000000' }
  const h1 = styleChain('Heading1', ctx)
  const h1Run = { ...baseRun, ...h1.r }

  // Numbering.
  const numDoc = await xml(zip, 'word/numbering.xml')
  if (numDoc) {
    for (const a of descendants(numDoc.documentElement, 'abstractNum')) {
      const levels = new Map<number, { fmt: string; start: number; text: string }>()
      for (const l of kids(a, 'lvl')) {
        levels.set(num(attr(l, 'ilvl')) ?? 0, { fmt: val(kid(l, 'numFmt')) ?? 'decimal', start: num(val(kid(l, 'start'))) ?? 1, text: val(kid(l, 'lvlText')) ?? '' })
      }
      ctx.numbering.abstracts.set(attr(a, 'abstractNumId')!, levels)
    }
    for (const nEl of descendants(numDoc.documentElement, 'num')) {
      const starts = new Map<number, number>()
      for (const o of kids(nEl, 'lvlOverride')) {
        const s = num(val(kid(o, 'startOverride')))
        if (s !== null) starts.set(num(attr(o, 'ilvl')) ?? 0, s)
      }
      ctx.numbering.nums.set(attr(nEl, 'numId')!, { abs: val(kid(nEl, 'abstractNumId'))!, starts })
    }
  }

  // Relationships (pictures, links).
  const relsDoc = await xml(zip, 'word/_rels/document.xml.rels')
  for (const r of relsDoc ? (Array.from(relsDoc.getElementsByTagName('Relationship')) as El[]) : []) {
    ctx.rels.set(r.getAttribute('Id')!, { target: r.getAttribute('Target')!, external: r.getAttribute('TargetMode') === 'External' })
  }

  // Comments.
  const commentsDoc = await xml(zip, 'word/comments.xml')
  if (commentsDoc) {
    for (const c of descendants(commentsDoc.documentElement, 'comment')) {
      const author = attr(c, 'author') ?? 'Author'
      ctx.comments.set(attr(c, 'id')!, {
        id: uid('c'),
        author,
        initials: attr(c, 'initials') ?? author.slice(0, 2).toUpperCase(),
        date: Date.parse(attr(c, 'date') ?? '') || Date.now(),
        text: kids(c, 'p')
          .map((p) => descendants(p, 't').map((t) => t.textContent).join(''))
          .join('\n'),
        resolved: false,
        replies: [],
        quote: ''
      })
    }
  }

  const body = descendants(doc.documentElement, 'body')[0]
  const finalSect = kids(body).filter((c) => local(c) === 'sectPr').pop()
  if (finalSect) {
    const w = num(attr(kid(finalSect, 'pgSz'), 'w'))
    const mar = kid(finalSect, 'pgMar')
    if (w) ctx.contentWidthPx = (w - (num(attr(mar, 'left')) ?? 1440) - (num(attr(mar, 'right')) ?? 1440)) / 15
  }
  const content = await convertBlocks(kids(body).filter((c) => local(c) !== 'sectPr'), ctx)
  if (!content.length) content.push({ type: 'paragraph' })

  // Fill in the quoted text of comments.
  const quotes = new Map<string, string>()
  const visit = (n: JSONContent): void => {
    if (n.type === 'text') for (const m of n.marks ?? []) if (m.type === 'comment') quotes.set(m.attrs!.id, (quotes.get(m.attrs!.id) ?? '') + n.text)
    n.content?.forEach(visit)
  }
  content.forEach(visit)
  const comments = Array.from(ctx.comments.values()).map((c) => ({ ...c, quote: (quotes.get(c.id) ?? '').slice(0, 200) }))

  const docStyles: Partial<DocStyles> = {
    bodyFont: ctx.base.font,
    fontSize: ctx.base.size,
    lineHeight: baseP.line ?? 1,
    spaceAfter: baseP.after ?? 0,
    headingFont: h1Run.font ?? theme.major,
    textColor: ctx.base.color
  }
  if (h1Run.color) docStyles.headingColor = h1Run.color
  return { content: { type: 'doc', content }, styles: docStyles, comments, messages: Array.from(ctx.messages) }
}
