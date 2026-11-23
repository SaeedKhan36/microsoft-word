import {
  AlignmentType,
  BorderStyle,
  Bookmark as DocxBookmark,
  CommentRangeEnd,
  CommentRangeStart,
  CommentReference,
  DeletedTextRun,
  Document,
  ExternalHyperlink,
  Footer,
  FootnoteReferenceRun,
  Header,
  HeadingLevel,
  ImageRun,
  InsertedTextRun,
  InternalHyperlink,
  LevelFormat,
  LineNumberRestartFormat,
  Packer,
  PageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Tab,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  UnderlineType,
  VerticalAlign,
  WidthType,
  type IParagraphOptions,
  type IRunOptions,
  type ParagraphChild
} from 'docx'
import { Math as DocxMath, latexToMath } from 'docx/math'
import { TextWatermark } from 'docx/watermarks'
import type { JSONContent } from '@tiptap/core'
import type { CommentThread, DocMeta, DocStyles, HeaderFooterContent, PageSettings, Source } from './types'
import { mmToTwip, ptToTwip } from './units'
import { rasterize } from './images'
import { inkToSvg, type InkStroke } from './ink'
import { renderChartSvg, type ChartData } from './chart'
import { formatBibliographyEntry, formatCitation, sortSources } from './citations'
import { svgToDataUrl } from './images'

export interface DocxExportInput {
  content: JSONContent
  page: PageSettings
  styles: DocStyles
  meta: DocMeta
  comments: CommentThread[]
  sources: Source[]
  headingPages: Record<number, number>
  headings: { text: string; level: number; pos: number }[]
  contentWidthPx: number
}

type Block = Paragraph | Table

interface ImageInfo {
  data: Uint8Array
  type: 'png' | 'jpg' | 'gif' | 'bmp'
  w: number
  h: number
}

interface Ctx {
  images: Map<string, ImageInfo>
  footnotes: Record<number, { children: Paragraph[] }>
  footnoteCount: number
  commentIds: Map<string, number>
  openComments: Set<string>
  changeId: number
  listInstance: number
  seq: Record<string, number>
  input: DocxExportInput
  contentTwips: number
}

const FONT_ALIASES: Record<string, string> = { Carlito: 'Calibri' }
const font = (f?: string | null): string | undefined => (f ? (FONT_ALIASES[f] ?? f).replace(/["']/g, '').split(',')[0].trim() : undefined)

function hex(color?: string | null): string | undefined {
  if (!color) return undefined
  const c = color.trim()
  if (c.startsWith('#')) {
    const h = c.slice(1)
    return (h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6)).toUpperCase()
  }
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (m) return [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase()
  return undefined
}

function halfPoints(size?: string | null): number | undefined {
  if (!size) return undefined
  const n = parseFloat(size)
  if (!Number.isFinite(n)) return undefined
  const pt = size.endsWith('px') ? (n * 72) / 96 : n
  return Math.round(pt * 2)
}

const ALIGN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED
}

const UNDERLINE: Record<string, (typeof UnderlineType)[keyof typeof UnderlineType]> = {
  solid: UnderlineType.SINGLE,
  double: UnderlineType.DOUBLE,
  dotted: UnderlineType.DOTTED,
  dashed: UnderlineType.DASH,
  wavy: UnderlineType.WAVE
}

const STYLE_IDS: Record<string, string> = {
  title: 'Title',
  subtitle: 'Subtitle',
  quote: 'Quote',
  'intense-quote': 'IntenseQuote',
  caption: 'Caption',
  'no-spacing': 'NoSpacing'
}

function runOptions(marks: JSONContent['marks'] = []): IRunOptions & { link?: string; ins?: Record<string, unknown>; del?: Record<string, unknown>; comments: string[] } {
  const o: Record<string, unknown> & { comments: string[] } = { comments: [] }
  for (const m of marks) {
    const a = (m.attrs ?? {}) as Record<string, string>
    switch (m.type) {
      case 'bold':
        o.bold = true
        break
      case 'italic':
        o.italics = true
        break
      case 'underline':
        o.underline = { type: UNDERLINE[a.underlineStyle] ?? UnderlineType.SINGLE, color: hex(a.underlineColor) }
        break
      case 'strike':
        o.strike = true
        break
      case 'subscript':
        o.subScript = true
        break
      case 'superscript':
        o.superScript = true
        break
      case 'code':
        o.font = 'Consolas'
        o.shading = { type: ShadingType.CLEAR, color: 'auto', fill: 'F1F3F5' }
        break
      case 'highlight':
        o.shading = { type: ShadingType.CLEAR, color: 'auto', fill: hex(a.color) ?? 'FFF176' }
        break
      case 'textStyle':
        if (a.color) o.color = hex(a.color)
        if (a.fontFamily) o.font = font(a.fontFamily)
        if (a.fontSize) o.size = halfPoints(a.fontSize)
        if (a.backgroundColor) o.shading = { type: ShadingType.CLEAR, color: 'auto', fill: hex(a.backgroundColor) }
        if (a.textCase === 'small-caps') o.smallCaps = true
        if (a.textCase === 'all-caps') o.allCaps = true
        if (a.letterSpacing) {
          const v = parseFloat(a.letterSpacing)
          if (Number.isFinite(v)) o.characterSpacing = Math.round(a.letterSpacing.endsWith('em') ? v * 11 * 20 : v * 15)
        }
        break
      case 'link':
        o.link = a.href
        break
      case 'insertion':
        o.ins = m.attrs
        break
      case 'deletion':
        o.del = m.attrs
        break
      case 'comment':
        if (a.id) o.comments.push(a.id)
        break
    }
  }
  return o as never
}

function textRuns(text: string, opts: IRunOptions): TextRun[] {
  const parts = text.split('\t')
  return parts.map((p, i) => new TextRun({ ...opts, children: i > 0 ? [new Tab(), p] : [p] }))
}

function inlineChildren(nodes: JSONContent[] = [], ctx: Ctx): ParagraphChild[] {
  const out: ParagraphChild[] = []
  const closeComments = (keep: string[]): void => {
    for (const id of Array.from(ctx.openComments)) {
      if (keep.includes(id)) continue
      const n = ctx.commentIds.get(id)
      ctx.openComments.delete(id)
      if (n === undefined) continue
      out.push(new CommentRangeEnd(n))
      out.push(new TextRun({ children: [new CommentReference(n)] }))
    }
  }
  for (const node of nodes) {
    const ro = node.type === 'text' ? runOptions(node.marks) : { comments: [] as string[] }
    closeComments(ro.comments)
    for (const id of ro.comments) {
      if (!ctx.openComments.has(id) && ctx.commentIds.has(id)) {
        ctx.openComments.add(id)
        out.push(new CommentRangeStart(ctx.commentIds.get(id)!))
      }
    }
    switch (node.type) {
      case 'text': {
        const { link, ins, del, comments: _c, ...opts } = runOptions(node.marks)
        void _c
        const text = node.text ?? ''
        if (ins) {
          out.push(new InsertedTextRun({ ...opts, text, id: ctx.changeId++, author: String(ins.author || 'Author'), date: new Date(Number(ins.date) || Date.now()).toISOString() }))
        } else if (del) {
          out.push(new DeletedTextRun({ ...opts, text, id: ctx.changeId++, author: String(del.author || 'Author'), date: new Date(Number(del.date) || Date.now()).toISOString() }))
        } else if (link) {
          if (link.startsWith('#')) {
            out.push(new InternalHyperlink({ anchor: link.slice(1), children: textRuns(text, { ...opts, style: 'Hyperlink' }) }))
          } else {
            out.push(new ExternalHyperlink({ link, children: textRuns(text, { ...opts, style: 'Hyperlink' }) }))
          }
        } else out.push(...textRuns(text, opts))
        break
      }
      case 'hardBreak':
        out.push(new TextRun({ break: 1 }))
        break
      case 'image': {
        const img = ctx.images.get(String(node.attrs?.src))
        if (img) {
          const maxW = ctx.input.contentWidthPx
          let w = Number(node.attrs?.width) || img.w
          let h = (img.h / img.w) * w
          if (w > maxW) {
            h = (h * maxW) / w
            w = maxW
          }
          out.push(new ImageRun({ type: img.type, data: img.data, transformation: { width: Math.round(w), height: Math.round(h) }, altText: { name: 'Picture', description: String(node.attrs?.alt || ''), title: String(node.attrs?.alt || '') } }))
        }
        break
      }
      case 'inlineMath': {
        try {
          out.push(new DocxMath({ children: latexToMath(String(node.attrs?.latex || '')) }))
        } catch {
          out.push(new TextRun({ text: String(node.attrs?.latex || ''), italics: true, font: 'Cambria Math' }))
        }
        break
      }
      case 'footnote': {
        const n = ++ctx.footnoteCount
        ctx.footnotes[n] = { children: [new Paragraph({ children: [new TextRun(String(node.attrs?.text || ''))] })] }
        out.push(new FootnoteReferenceRun(n))
        break
      }
      case 'citation': {
        const s = ctx.input.sources.find((x) => x.id === node.attrs?.sourceId)
        out.push(new TextRun(s ? formatCitation(s, ctx.input.styles.citationStyle, String(node.attrs?.page || '')) : '(Missing source)'))
        break
      }
      case 'seqField': {
        const label = String(node.attrs?.label || 'Figure')
        ctx.seq[label] = (ctx.seq[label] || 0) + 1
        out.push(new TextRun({ text: `${label} ${ctx.seq[label]}`, bold: true }))
        break
      }
      case 'bookmark':
        out.push(new DocxBookmark({ id: String(node.attrs?.name || 'bookmark'), children: [new TextRun('')] }))
        break
      default:
        if (node.content) out.push(...inlineChildren(node.content, ctx))
    }
  }
  return out
}

function paragraphOptions(node: JSONContent): Partial<IParagraphOptions> {
  const a = (node.attrs ?? {}) as Record<string, unknown>
  const o: Record<string, unknown> = {}
  if (a.textAlign && ALIGN[a.textAlign as string]) o.alignment = ALIGN[a.textAlign as string]
  const spacing: Record<string, unknown> = {}
  if (a.spaceBefore !== null && a.spaceBefore !== undefined) spacing.before = ptToTwip(Number(a.spaceBefore))
  if (a.spaceAfter !== null && a.spaceAfter !== undefined) spacing.after = ptToTwip(Number(a.spaceAfter))
  if (a.lineHeight) {
    spacing.line = Math.round(Number(a.lineHeight) * 240)
    spacing.lineRule = 'auto'
  }
  if (Object.keys(spacing).length) o.spacing = spacing
  const indent: Record<string, number> = {}
  if (a.indentLeft) indent.left = ptToTwip(Number(a.indentLeft))
  if (a.indentRight) indent.right = ptToTwip(Number(a.indentRight))
  if (a.firstLine) {
    const v = Number(a.firstLine)
    if (v > 0) indent.firstLine = ptToTwip(v)
    else {
      indent.hanging = ptToTwip(-v)
      indent.left = (indent.left || 0) + ptToTwip(-v)
    }
  }
  if (Object.keys(indent).length) o.indent = indent
  if (a.shading) o.shading = { type: ShadingType.CLEAR, color: 'auto', fill: hex(a.shading as string) }
  if (a.borderStyle && a.borderStyle !== 'none') {
    const b = { style: BorderStyle.SINGLE, size: 6, color: hex(a.borderColor as string) ?? 'auto', space: 4 }
    o.border = a.borderStyle === 'box' ? { top: b, bottom: b, left: b, right: b } : { [a.borderStyle as string]: { ...b, size: a.borderStyle === 'left' ? 18 : 6 } }
  }
  if (a.pageBreakBefore) o.pageBreakBefore = true
  if (a.keepWithNext) o.keepNext = true
  if (a.styleId && STYLE_IDS[a.styleId as string]) o.style = STYLE_IDS[a.styleId as string]
  return o as Partial<IParagraphOptions>
}

function imageCentered(node: JSONContent): boolean {
  return !!node.content?.some((c) => c.type === 'image' && c.attrs?.layout === 'center')
}

function blocks(nodes: JSONContent[] = [], ctx: Ctx, list?: { ref: string; level: number; instance: number }): Block[] {
  const out: Block[] = []
  for (const node of nodes) {
    switch (node.type) {
      case 'paragraph': {
        const opts = paragraphOptions(node) as Record<string, unknown>
        if (imageCentered(node)) opts.alignment = AlignmentType.CENTER
        if (list) Object.assign(opts, { numbering: { reference: list.ref, level: list.level, instance: list.instance } })
        out.push(new Paragraph({ ...opts, children: inlineChildren(node.content, ctx) }))
        break
      }
      case 'heading': {
        const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1))
        const heading = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6][level - 1]
        out.push(new Paragraph({ ...paragraphOptions(node), heading, children: inlineChildren(node.content, ctx) }))
        break
      }
      case 'bulletList':
      case 'orderedList':
      case 'taskList': {
        const ref = node.type === 'orderedList' ? 'pe-numbers' : node.type === 'taskList' ? 'pe-tasks' : 'pe-bullets'
        const instance = list && list.ref === ref ? list.instance : ++ctx.listInstance
        const level = list ? list.level + 1 : 0
        for (const item of node.content ?? []) {
          const checked = item.type === 'taskItem' && item.attrs?.checked
          const children = item.content ?? []
          children.forEach((child, i) => {
            if (child.type === 'paragraph' && i === 0) {
              const opts = paragraphOptions(child)
              const runs = inlineChildren(child.content, ctx)
              if (item.type === 'taskItem') runs.unshift(new TextRun({ text: checked ? '☒ ' : '☐ ', font: 'Segoe UI Symbol' }))
              out.push(
                new Paragraph({
                  ...opts,
                  numbering: item.type === 'taskItem' ? undefined : { reference: ref, level: Math.min(level, 8), instance },
                  indent: item.type === 'taskItem' ? { left: 360 * (level + 1) } : opts.indent,
                  children: runs
                })
              )
            } else if (['bulletList', 'orderedList', 'taskList'].includes(child.type || '')) {
              out.push(...blocks([child], ctx, { ref, level, instance }))
            } else {
              const inner = blocks([child], ctx)
              inner.forEach((b) => out.push(b))
            }
          })
        }
        break
      }
      case 'blockquote': {
        for (const child of node.content ?? []) {
          if (child.type === 'paragraph') {
            out.push(
              new Paragraph({
                ...paragraphOptions(child),
                indent: { left: 720, right: 720 },
                border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'A6A6A6', space: 8 } },
                children: inlineChildren(child.content, ctx)
              })
            )
          } else out.push(...blocks([child], ctx))
        }
        break
      }
      case 'codeBlock': {
        const text = (node.content ?? []).map((c) => c.text ?? '').join('')
        for (const line of text.split('\n')) {
          out.push(
            new Paragraph({
              spacing: { before: 0, after: 0, line: 240 },
              shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F3F4F6' },
              children: [new TextRun({ text: line || ' ', font: 'Consolas', size: 19 })]
            })
          )
        }
        out.push(new Paragraph({ spacing: { after: 120 }, children: [] }))
        break
      }
      case 'horizontalRule':
        out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'BFBFBF', space: 1 } }, children: [] }))
        break
      case 'pageBreak':
        out.push(new Paragraph({ children: [new PageBreak()] }))
        break
      case 'blockMath': {
        const latex = String(node.attrs?.latex || '')
        let child: ParagraphChild
        try {
          child = new DocxMath({ children: latexToMath(latex) })
        } catch {
          child = new TextRun({ text: latex, italics: true, font: 'Cambria Math' })
        }
        out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 120 }, children: [child] }))
        break
      }
      case 'table':
        out.push(tableBlock(node, ctx))
        out.push(new Paragraph({ children: [] }))
        break
      case 'box': {
        const variant = String(node.attrs?.variant || 'textbox')
        const fills: Record<string, string> = { info: 'E8F0FE', warning: 'FFF4E5', success: 'E7F6EC', note: 'F3F0FF', textbox: 'FFFFFF' }
        const borders: Record<string, string> = { info: '4472C4', warning: 'ED7D31', success: '70AD47', note: '7030A0', textbox: '7F7F7F' }
        const b = { style: BorderStyle.SINGLE, size: 8, color: borders[variant] ?? '7F7F7F' }
        out.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    shading: { type: ShadingType.CLEAR, color: 'auto', fill: fills[variant] ?? 'FFFFFF' },
                    borders: { top: b, bottom: b, left: { ...b, size: variant === 'textbox' ? 8 : 24 }, right: b },
                    margins: { top: 120, bottom: 120, left: 160, right: 160 },
                    children: ensureParagraph(blocks(node.content, ctx))
                  })
                ]
              })
            ]
          })
        )
        out.push(new Paragraph({ children: [] }))
        break
      }
      case 'columns': {
        const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
        out.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
            rows: [
              new TableRow({
                children: (node.content ?? []).map(
                  (col) => new TableCell({ margins: { left: 120, right: 120 }, children: ensureParagraph(blocks(col.content, ctx)) })
                )
              })
            ]
          })
        )
        out.push(new Paragraph({ children: [] }))
        break
      }
      case 'ink':
      case 'chart': {
        const key = node.type === 'ink' ? inkKey(node, ctx) : chartKey(node)
        const img = ctx.images.get(key)
        if (img) {
          const w = Math.min(img.w, ctx.input.contentWidthPx)
          out.push(
            new Paragraph({
              alignment: node.type === 'chart' ? AlignmentType.CENTER : undefined,
              children: [new ImageRun({ type: 'png', data: img.data, transformation: { width: Math.round(w), height: Math.round((img.h / img.w) * w) } })]
            })
          )
        }
        break
      }
      case 'tableOfContents': {
        out.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Contents')] }))
        const start = ctx.input.page.pageNumberStart - 1
        for (const h of ctx.input.headings.filter((x) => x.level <= 3)) {
          out.push(
            new Paragraph({
              indent: { left: (h.level - 1) * 240 },
              tabStops: [{ type: TabStopType.RIGHT, position: ctx.contentTwips, leader: 'dot' }],
              children: [new TextRun(h.text), new TextRun({ children: [new Tab(), String((ctx.input.headingPages[h.pos] ?? 0) + 1 + start)] })]
            })
          )
        }
        break
      }
      case 'bibliography': {
        const style = ctx.input.styles.citationStyle
        out.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(style === 'mla' ? 'Works Cited' : 'References')] }))
        sortSources(ctx.input.sources, style).forEach((s, i) =>
          out.push(new Paragraph({ indent: { left: 720, hanging: 720 }, children: [new TextRun(formatBibliographyEntry(s, style, i))] }))
        )
        break
      }
      case 'tableOfFigures':
        break
      default:
        if (node.content) out.push(...blocks(node.content, ctx, list))
    }
  }
  return out
}

function ensureParagraph(b: Block[]): Block[] {
  return b.length ? b : [new Paragraph({ children: [] })]
}

function tableBlock(node: JSONContent, ctx: Ctx): Table {
  const rows = node.content ?? []
  const headerRow = node.attrs?.headerRow !== false
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      (row, ri) =>
        new TableRow({
          tableHeader: ri === 0 && headerRow && row.content?.some((c) => c.type === 'tableHeader'),
          children: (row.content ?? []).map((cell) => {
            const a = (cell.attrs ?? {}) as Record<string, unknown>
            const colwidth = Array.isArray(a.colwidth) ? (a.colwidth as number[]).reduce((s, w) => s + (w || 0), 0) : 0
            const va = a.verticalAlign === 'middle' ? VerticalAlign.CENTER : a.verticalAlign === 'bottom' ? VerticalAlign.BOTTOM : undefined
            const children = ensureParagraph(blocks(cell.content, ctx))
            return new TableCell({
              children:
                cell.type === 'tableHeader'
                  ? children.map((c) => (c instanceof Paragraph ? c : c))
                  : children,
              columnSpan: Number(a.colspan) > 1 ? Number(a.colspan) : undefined,
              rowSpan: Number(a.rowspan) > 1 ? Number(a.rowspan) : undefined,
              width: colwidth ? { size: Math.round(colwidth * 15), type: WidthType.DXA } : undefined,
              verticalAlign: va,
              shading: a.backgroundColor
                ? { type: ShadingType.CLEAR, color: 'auto', fill: hex(a.backgroundColor as string) }
                : cell.type === 'tableHeader'
                  ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F2F2F2' }
                  : undefined,
              margins: { top: 60, bottom: 60, left: 100, right: 100 }
            })
          })
        })
    )
  })
}

function inkKey(node: JSONContent, ctx: Ctx): string {
  return `ink:${ctx.input.contentWidthPx}:${node.attrs?.height}:${JSON.stringify(node.attrs?.strokes ?? []).length}:${JSON.stringify(node.attrs?.strokes ?? []).slice(0, 64)}`
}
function chartKey(node: JSONContent): string {
  return `chart:${JSON.stringify(node.attrs?.data ?? {})}`
}

async function collectImages(content: JSONContent, input: DocxExportInput): Promise<Map<string, ImageInfo>> {
  const map = new Map<string, ImageInfo>()
  const jobs: Promise<void>[] = []
  const fakeCtx = { input } as Ctx
  const visit = (n: JSONContent): void => {
    if (n.type === 'image' && typeof n.attrs?.src === 'string' && !map.has(n.attrs.src)) {
      const src = n.attrs.src as string
      jobs.push(
        (async () => {
          try {
            const m = src.match(/^data:image\/(png|jpe?g|gif|bmp);base64,/)
            if (m) {
              const { loadImage, dataUrlToBytes } = await import('./images')
              const img = await loadImage(src)
              map.set(src, { data: dataUrlToBytes(src).bytes, type: m[1] === 'jpeg' ? 'jpg' : (m[1] as ImageInfo['type']), w: img.naturalWidth, h: img.naturalHeight })
            } else {
              const { loadImage } = await import('./images')
              const img = await loadImage(src)
              const r = await rasterize(src, img.naturalWidth || 400, img.naturalHeight || undefined)
              map.set(src, { data: r.data, type: 'png', w: r.w, h: r.h })
            }
          } catch {
            /* skip broken image */
          }
        })()
      )
    }
    if (n.type === 'ink') {
      const key = inkKey(n, fakeCtx)
      const svg = inkToSvg((n.attrs?.strokes ?? []) as InkStroke[], input.contentWidthPx, Number(n.attrs?.height) || 200, '#ffffff')
      jobs.push(
        rasterize(svgToDataUrl(svg), input.contentWidthPx, Number(n.attrs?.height) || 200, '#ffffff')
          .then((r) => void map.set(key, { data: r.data, type: 'png', w: r.w, h: r.h }))
          .catch(() => undefined)
      )
    }
    if (n.type === 'chart' && n.attrs?.data) {
      const d = n.attrs.data as ChartData
      jobs.push(
        rasterize(svgToDataUrl(renderChartSvg(d)), d.width, d.height, '#ffffff')
          .then((r) => void map.set(chartKey(n), { data: r.data, type: 'png', w: r.w, h: r.h }))
          .catch(() => undefined)
      )
    }
    n.content?.forEach(visit)
  }
  visit(content)
  await Promise.all(jobs)
  return map
}

function headerFooterParagraph(hf: HeaderFooterContent, meta: DocMeta, contentTwips: number, extra: ParagraphChild[] = []): Paragraph {
  const parts = (s: string): (string | ReturnType<typeof String>)[] => {
    const out: string[] = []
    s.split(/(\{page\}|\{pages\}|\{date\}|\{title\}|\{author\})/g).forEach((t) => {
      if (!t) return
      if (t === '{page}') out.push(PageNumber.CURRENT)
      else if (t === '{pages}') out.push(PageNumber.TOTAL_PAGES)
      else if (t === '{date}') out.push(new Date().toLocaleDateString())
      else if (t === '{title}') out.push(meta.title)
      else if (t === '{author}') out.push(meta.author)
      else out.push(t)
    })
    return out
  }
  return new Paragraph({
    tabStops: [
      { type: TabStopType.CENTER, position: Math.round(contentTwips / 2) },
      { type: TabStopType.RIGHT, position: contentTwips }
    ],
    children: [
      ...extra,
      new TextRun({ children: parts(hf.left) as string[] }),
      new TextRun({ children: [new Tab(), ...(parts(hf.center) as string[])] }),
      new TextRun({ children: [new Tab(), ...(parts(hf.right) as string[])] })
    ]
  })
}

const hasHF = (hf: HeaderFooterContent): boolean => !!(hf.left || hf.center || hf.right)

export async function exportDocx(input: DocxExportInput): Promise<Uint8Array> {
  const { page, styles, meta } = input
  const land = page.orientation === 'landscape'
  const widthMm = land ? page.heightMm : page.widthMm
  const contentTwips = mmToTwip(widthMm - page.margins.left - page.margins.right)
  const images = await collectImages(input.content, input)
  const commentIds = new Map<string, number>()
  input.comments.forEach((c, i) => commentIds.set(c.id, i))
  const ctx: Ctx = {
    images,
    footnotes: {},
    footnoteCount: 0,
    commentIds,
    openComments: new Set(),
    changeId: 1,
    listInstance: 0,
    seq: {},
    input,
    contentTwips
  }
  const body = blocks(input.content.content, ctx)
  if (!body.length) body.push(new Paragraph({ children: [] }))

  const watermark = page.watermark
    ? [new TextWatermark({ text: page.watermark.text, color: hex(page.watermark.color) ?? 'C0C0C0', opacity: page.watermark.opacity, layout: page.watermark.diagonal ? 'diagonal' : 'horizontal', font: font(styles.bodyFont) })]
    : []

  const header = hasHF(page.header) || watermark.length ? new Header({ children: [headerFooterParagraph(page.header, meta, contentTwips, watermark)] }) : undefined
  const footer = hasHF(page.footer) ? new Footer({ children: [headerFooterParagraph(page.footer, meta, contentTwips)] }) : undefined
  const firstHeader = page.differentFirstPage ? new Header({ children: [headerFooterParagraph(page.firstHeader, meta, contentTwips, watermark)] }) : undefined
  const firstFooter = page.differentFirstPage ? new Footer({ children: [headerFooterParagraph(page.firstFooter, meta, contentTwips)] }) : undefined

  const bulletChars = ['•', '◦', '▪', '•', '◦', '▪', '•', '◦', '▪']
  const numberFormats = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN]

  const borderStyleMap: Record<string, (typeof BorderStyle)[keyof typeof BorderStyle]> = {
    single: BorderStyle.SINGLE,
    double: BorderStyle.DOUBLE,
    thick: BorderStyle.THICK,
    dashed: BorderStyle.DASHED,
    dotted: BorderStyle.DOTTED
  }
  const pb = page.border.style !== 'none' ? { style: borderStyleMap[page.border.style] ?? BorderStyle.SINGLE, size: page.border.style === 'thick' ? 18 : 6, color: hex(page.border.color) ?? '000000', space: 24 } : null

  const headingRun = { font: font(styles.headingFont), color: hex(styles.headingColor) }
  const doc = new Document({
    creator: meta.author || 'Personal Editor',
    title: meta.title,
    subject: meta.subject,
    keywords: meta.keywords,
    description: meta.description,
    background: page.pageColor ? { color: hex(page.pageColor) } : undefined,
    features: { updateFields: input.content.content?.some((c) => c.type === 'tableOfContents') ?? false },
    styles: {
      default: {
        document: {
          run: { font: font(styles.bodyFont), size: Math.round(styles.fontSize * 2), color: hex(styles.textColor) },
          paragraph: { spacing: { after: ptToTwip(styles.spaceAfter), line: Math.round(styles.lineHeight * 240) } }
        },
        title: { run: { ...headingRun, size: 56 }, paragraph: { spacing: { after: 160 } } },
        heading1: { run: { ...headingRun, size: 32 }, paragraph: { spacing: { before: 360, after: 120 } } },
        heading2: { run: { ...headingRun, size: 26 }, paragraph: { spacing: { before: 240, after: 80 } } },
        heading3: { run: { ...headingRun, size: 24 }, paragraph: { spacing: { before: 200, after: 80 } } },
        heading4: { run: { ...headingRun, size: 22, italics: true } },
        heading5: { run: { ...headingRun, size: 22 } },
        heading6: { run: { ...headingRun, size: 22, italics: true } }
      },
      paragraphStyles: [
        { id: 'Subtitle', name: 'Subtitle', basedOn: 'Normal', run: { size: 30, color: '595959' }, paragraph: { spacing: { after: 160 } } },
        { id: 'Quote', name: 'Quote', basedOn: 'Normal', run: { italics: true, color: '404040' }, paragraph: { alignment: AlignmentType.CENTER, indent: { left: 864, right: 864 } } },
        {
          id: 'IntenseQuote',
          name: 'Intense Quote',
          basedOn: 'Normal',
          run: { italics: true, color: hex(styles.accent) },
          paragraph: { alignment: AlignmentType.CENTER, indent: { left: 864, right: 864 }, border: { top: { style: BorderStyle.SINGLE, size: 4, color: hex(styles.accent) ?? '4472C4', space: 10 }, bottom: { style: BorderStyle.SINGLE, size: 4, color: hex(styles.accent) ?? '4472C4', space: 10 } } }
        },
        { id: 'Caption', name: 'Caption', basedOn: 'Normal', run: { italics: true, size: 18, color: hex(styles.headingColor) }, paragraph: { spacing: { after: 200 } } },
        { id: 'NoSpacing', name: 'No Spacing', basedOn: 'Normal', paragraph: { spacing: { after: 0, line: 240 } } }
      ]
    },
    numbering: {
      config: [
        {
          reference: 'pe-bullets',
          levels: bulletChars.map((c, i) => ({ level: i, format: LevelFormat.BULLET, text: c, alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 + i * 360, hanging: 360 } } } }))
        },
        {
          reference: 'pe-numbers',
          levels: Array.from({ length: 9 }, (_, i) => ({
            level: i,
            format: numberFormats[i % 3],
            text: `%${i + 1}.`,
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720 + i * 360, hanging: 360 } } }
          }))
        },
        {
          reference: 'pe-tasks',
          levels: Array.from({ length: 9 }, (_, i) => ({ level: i, format: LevelFormat.NONE, text: '', alignment: AlignmentType.LEFT }))
        }
      ]
    },
    footnotes: ctx.footnotes,
    comments: {
      children: input.comments.map((c, i) => ({
        id: i,
        author: c.author,
        initials: c.initials,
        date: new Date(c.date),
        children: [new Paragraph({ children: [new TextRun(c.text)] }), ...c.replies.map((r) => new Paragraph({ children: [new TextRun({ text: `${r.author}: `, bold: true }), new TextRun(r.text)] }))]
      }))
    },
    sections: [
      {
        properties: {
          titlePage: page.differentFirstPage,
          page: {
            size: {
              width: mmToTwip(page.widthMm),
              height: mmToTwip(page.heightMm),
              orientation: land ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT
            },
            margin: {
              top: mmToTwip(page.margins.top),
              bottom: mmToTwip(page.margins.bottom),
              left: mmToTwip(page.margins.left),
              right: mmToTwip(page.margins.right),
              header: mmToTwip(page.headerDistanceMm),
              footer: mmToTwip(page.footerDistanceMm)
            },
            pageNumbers: { start: page.pageNumberStart },
            borders: pb ? { pageBorderTop: pb, pageBorderBottom: pb, pageBorderLeft: pb, pageBorderRight: pb } : undefined
          },
          lineNumbers:
            page.lineNumbers !== 'none'
              ? { countBy: 1, restart: page.lineNumbers === 'page' ? LineNumberRestartFormat.NEW_PAGE : LineNumberRestartFormat.CONTINUOUS }
              : undefined
        },
        headers: { default: header, first: firstHeader },
        footers: { default: footer, first: firstFooter },
        children: body
      }
    ]
  })
  const blob = await Packer.toBlob(doc)
  return new Uint8Array(await blob.arrayBuffer())
}
