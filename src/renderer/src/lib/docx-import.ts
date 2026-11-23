import mammoth from 'mammoth'
import JSZip from 'jszip'
import type { DocMeta, HeaderFooterContent, PageSettings } from './types'
import { twipToMm } from './units'
import { PAPER_SIZES } from './defaults'

export interface DocxImportResult {
  html: string
  page: Partial<PageSettings>
  meta: Partial<DocMeta>
  messages: string[]
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

function attr(el: Element | null | undefined, name: string): string | null {
  if (!el) return null
  return el.getAttributeNS(W, name) ?? el.getAttribute(`w:${name}`)
}

async function readHeaderFooter(zip: JSZip, rels: Document | null, id: string | null): Promise<HeaderFooterContent | null> {
  if (!id || !rels) return null
  const rel = Array.from(rels.getElementsByTagName('Relationship')).find((r) => r.getAttribute('Id') === id)
  const target = rel?.getAttribute('Target')
  if (!target) return null
  const file = zip.file(`word/${target.replace(/^\/?word\//, '')}`)
  if (!file) return null
  const xml = new DOMParser().parseFromString(await file.async('string'), 'application/xml')
  const out: HeaderFooterContent = { left: '', center: '', right: '' }
  for (const p of Array.from(xml.getElementsByTagNameNS(W, 'p'))) {
    let text = ''
    const walker = (node: Element): void => {
      for (const child of Array.from(node.children)) {
        const ln = child.localName
        if (ln === 't') text += child.textContent ?? ''
        else if (ln === 'tab') text += '\t'
        else if (ln === 'instrText') {
          const ins = (child.textContent ?? '').trim().toUpperCase()
          if (ins.startsWith('PAGE')) text += '{page}'
          else if (ins.startsWith('NUMPAGES')) text += '{pages}'
          else if (ins.startsWith('DATE')) text += '{date}'
        } else if (ln === 'fldSimple') {
          const ins = (attr(child, 'instr') ?? '').trim().toUpperCase()
          if (ins.startsWith('PAGE')) text += '{page}'
          else if (ins.startsWith('NUMPAGES')) text += '{pages}'
          else walker(child)
        } else walker(child)
      }
    }
    walker(p)
    if (!text.trim()) continue
    const jc = attr(p.getElementsByTagNameNS(W, 'jc')[0], 'val')
    const parts = text.split('\t').map((s) => s.trim())
    if (parts.length >= 3) {
      out.left = out.left || parts[0]
      out.center = out.center || parts[1]
      out.right = out.right || parts.slice(2).join(' ')
    } else if (jc === 'center') out.center = (out.center ? out.center + ' ' : '') + parts.join(' ')
    else if (jc === 'right' || jc === 'end') out.right = (out.right ? out.right + ' ' : '') + parts.join(' ')
    else out.left = (out.left ? out.left + ' ' : '') + parts.join(' ')
  }
  return out.left || out.center || out.right ? out : null
}

async function readLayout(bytes: Uint8Array): Promise<{ page: Partial<PageSettings>; meta: Partial<DocMeta> }> {
  const page: Partial<PageSettings> = {}
  const meta: Partial<DocMeta> = {}
  try {
    const zip = await JSZip.loadAsync(bytes)
    const docXml = await zip.file('word/document.xml')?.async('string')
    const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string')
    const rels = relsXml ? new DOMParser().parseFromString(relsXml, 'application/xml') : null
    if (docXml) {
      const xml = new DOMParser().parseFromString(docXml, 'application/xml')
      const sects = xml.getElementsByTagNameNS(W, 'sectPr')
      const sect = sects[sects.length - 1]
      if (sect) {
        const sz = sect.getElementsByTagNameNS(W, 'pgSz')[0]
        const mar = sect.getElementsByTagNameNS(W, 'pgMar')[0]
        if (sz) {
          let w = twipToMm(Number(attr(sz, 'w')) || 11906)
          let h = twipToMm(Number(attr(sz, 'h')) || 16838)
          const landscape = attr(sz, 'orient') === 'landscape' || w > h
          if (w > h) [w, h] = [h, w]
          const match = PAPER_SIZES.find((p) => Math.abs(p.w - w) < 2 && Math.abs(p.h - h) < 2)
          page.widthMm = Math.round(w * 10) / 10
          page.heightMm = Math.round(h * 10) / 10
          page.sizeName = match?.name ?? 'Custom'
          page.orientation = landscape ? 'landscape' : 'portrait'
        }
        if (mar) {
          const m = (n: string, d: number): number => Math.round(twipToMm(Number(attr(mar, n)) || d) * 10) / 10
          page.margins = { top: m('top', 1440), bottom: m('bottom', 1440), left: m('left', 1440), right: m('right', 1440) }
          page.headerDistanceMm = m('header', 720)
          page.footerDistanceMm = m('footer', 720)
        }
        page.differentFirstPage = sect.getElementsByTagNameNS(W, 'titlePg').length > 0
        const ref = (tag: string, type: string): string | null => {
          const el = Array.from(sect.getElementsByTagNameNS(W, tag)).find((e) => attr(e, 'type') === type)
          return el ? (el.getAttributeNS(R, 'id') ?? el.getAttribute('r:id')) : null
        }
        const header = await readHeaderFooter(zip, rels, ref('headerReference', 'default'))
        const footer = await readHeaderFooter(zip, rels, ref('footerReference', 'default'))
        if (header) page.header = header
        if (footer) page.footer = footer
        if (page.differentFirstPage) {
          page.firstHeader = (await readHeaderFooter(zip, rels, ref('headerReference', 'first'))) ?? { left: '', center: '', right: '' }
          page.firstFooter = (await readHeaderFooter(zip, rels, ref('footerReference', 'first'))) ?? { left: '', center: '', right: '' }
        }
      }
    }
    const core = await zip.file('docProps/core.xml')?.async('string')
    if (core) {
      const x = new DOMParser().parseFromString(core, 'application/xml')
      const get = (tag: string): string => x.getElementsByTagName(tag)[0]?.textContent?.trim() ?? ''
      meta.title = get('dc:title')
      meta.author = get('dc:creator')
      meta.subject = get('dc:subject')
      meta.keywords = get('cp:keywords')
      meta.description = get('dc:description')
    }
  } catch (err) {
    console.warn('Could not read page layout from .docx', err)
  }
  return { page, meta }
}

interface MammothParagraph {
  type: string
  styleName?: string | null
  alignment?: string | null
}

export async function importDocx(bytes: Uint8Array): Promise<DocxImportResult> {
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const m = mammoth as unknown as {
    convertToHtml: (input: { arrayBuffer: ArrayBuffer }, opts: Record<string, unknown>) => Promise<{ value: string; messages: { type: string; message: string }[] }>
    transforms: { paragraph: (fn: (p: MammothParagraph) => MammothParagraph) => unknown }
  }
  const result = await m.convertToHtml(
    { arrayBuffer: ab },
    {
      styleMap: [
        "p[style-name='Title'] => p.ps-title:fresh",
        "p[style-name='Subtitle'] => p.ps-subtitle:fresh",
        "p[style-name='Quote'] => p.ps-quote:fresh",
        "p[style-name='Intense Quote'] => p.ps-intense-quote:fresh",
        "p[style-name='Caption'] => p.ps-caption:fresh",
        "p[style-name='No Spacing'] => p.ps-no-spacing:fresh",
        "p[style-name='pe-align-center'] => p.pe-align-center:fresh",
        "p[style-name='pe-align-right'] => p.pe-align-right:fresh",
        "p[style-name='pe-align-both'] => p.pe-align-justify:fresh",
        'u => u',
        'strike => s',
        "r[style-name='Strong'] => strong",
        "p[style-name='Code'] => pre:separator('\\n')"
      ],
      transformDocument: m.transforms.paragraph((p) => {
        const plain = !p.styleName || /^(normal|body text|default)/i.test(p.styleName)
        if (plain && p.alignment && ['center', 'right', 'both'].includes(p.alignment)) {
          return { ...p, styleName: `pe-align-${p.alignment}` }
        }
        return p
      })
    }
  )

  const dom = new DOMParser().parseFromString(`<body>${result.value}</body>`, 'text/html')
  dom.querySelectorAll('[class]').forEach((el) => {
    for (const c of Array.from(el.classList)) {
      if (c.startsWith('ps-')) el.setAttribute('data-style', c.slice(3))
      if (c.startsWith('pe-align-')) (el as HTMLElement).style.textAlign = c.slice(9)
    }
  })
  // Footnotes and endnotes → inline footnote nodes.
  for (const kind of ['footnote', 'endnote']) {
    dom.querySelectorAll(`a[href^="#${kind}-"]`).forEach((a) => {
      const id = a.getAttribute('href')!.slice(1)
      const li = dom.getElementById(id)
      if (!li) return
      const clone = li.cloneNode(true) as HTMLElement
      clone.querySelectorAll(`a[href^="#${kind}-ref"]`).forEach((x) => x.remove())
      const text = (clone.textContent ?? '').trim()
      const sup = dom.createElement('sup')
      sup.setAttribute('data-footnote', `f${id.replace(/\W/g, '')}`)
      sup.setAttribute('data-text', text)
      const host = a.closest('sup') ?? a
      host.replaceWith(sup)
    })
    dom.querySelectorAll(`li[id^="${kind}-"]`).forEach((li) => {
      const list = li.parentElement
      li.remove()
      if (list && !list.children.length) list.remove()
    })
  }
  // Images in their own paragraph look best centred.
  dom.querySelectorAll('p > img:only-child').forEach((img) => img.setAttribute('data-layout', 'center'))

  const { page, meta } = await readLayout(bytes)
  const messages = Array.from(new Set(result.messages.filter((x) => x.type === 'warning').map((x) => x.message))).slice(0, 8)
  return { html: dom.body.innerHTML, page, meta, messages }
}
