import TurndownService from 'turndown'
// @ts-expect-error no types published for this plugin
import { gfm } from 'turndown-plugin-gfm'
import { marked } from 'marked'
import type { DocStyles } from './types'

export function htmlToMarkdown(html: string): string {
  // Math, footnotes, drawings and page breaks have no text, so turndown treats them as "blank"
  // nodes and skips its normal rules for them. Handle them here instead.
  const special = (node: HTMLElement): string | null => {
    const type = node.getAttribute?.('data-type')
    if (type === 'block-math') return `\n\n$$\n${node.getAttribute('data-latex') ?? ''}\n$$\n\n`
    if (type === 'inline-math') return `$${node.getAttribute('data-latex') ?? ''}$`
    if (type === 'page-break') return '\n\n---\n\n'
    if (type === 'ink') return '\n\n*[drawing]*\n\n'
    if (node.nodeName === 'SUP' && node.hasAttribute('data-footnote')) return `[^${node.getAttribute('data-footnote')}]`
    return null
  }
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    blankReplacement: (_content, node) => special(node as HTMLElement) ?? ((node as { isBlock?: boolean }).isBlock ? '\n\n' : '')
  })
  const notes: string[] = []
  new DOMParser()
    .parseFromString(html, 'text/html')
    .querySelectorAll('sup[data-footnote]')
    .forEach((n) => notes.push(`[^${n.getAttribute('data-footnote')}]: ${n.getAttribute('data-text') ?? ''}`))
  td.use(gfm)
  td.addRule('pageBreak', { filter: (n) => (n as HTMLElement).getAttribute?.('data-type') === 'page-break', replacement: () => '\n\n---\n\n' })
  td.addRule('footnote', {
    filter: (n) => n.nodeName === 'SUP' && (n as HTMLElement).hasAttribute('data-footnote'),
    replacement: (_c, n) => `[^${(n as HTMLElement).getAttribute('data-footnote') ?? ''}]`
  })
  td.addRule('mathInline', {
    filter: (n) => (n as HTMLElement).getAttribute?.('data-type') === 'inline-math',
    replacement: (_c, n) => `$${(n as HTMLElement).getAttribute('data-latex') ?? ''}$`
  })
  td.addRule('mathBlock', {
    filter: (n) => (n as HTMLElement).getAttribute?.('data-type') === 'block-math',
    replacement: (_c, n) => `\n\n$$\n${(n as HTMLElement).getAttribute('data-latex') ?? ''}\n$$\n\n`
  })
  td.addRule('strike', { filter: ['s', 'del', 'strike'] as never, replacement: (c) => `~~${c}~~` })
  td.addRule('ink', { filter: (n) => (n as HTMLElement).getAttribute?.('data-type') === 'ink', replacement: () => '\n\n*[drawing]*\n\n' })
  const body = td.turndown(html).replace(/\n{3,}/g, '\n\n').trim()
  return body + (notes.length ? `\n\n${notes.join('\n')}` : '') + '\n'
}

export function markdownToHtml(md: string): string {
  // Convert $$...$$ and $...$ into math nodes the editor understands.
  // Footnotes: [^id] references with "[^id]: text" definitions.
  const notes = new Map<string, string>()
  const withoutDefs = md.replace(/^\[\^([^\]]+)\]:[ \t]*(.*)$/gm, (_m, id, text) => {
    notes.set(id, text)
    return ''
  })
  const withNotes = withoutDefs.replace(/\[\^([^\]]+)\]/g, (m, id) =>
    notes.has(id) ? `<sup data-footnote="f${escapeAttr(id)}" data-text="${escapeAttr(notes.get(id)!)}"></sup>` : m
  )
  const withMath = withNotes
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex) => `<div data-type="block-math" data-latex="${escapeAttr(tex.trim())}"></div>`)
    .replace(/(^|[^\\$])\$([^$\n]+?)\$/g, (_m, pre, tex) => `${pre}<span data-type="inline-math" data-latex="${escapeAttr(tex.trim())}"></span>`)
  return marked.parse(withMath, { gfm: true, breaks: false, async: false }) as string
}

export function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n/)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('')
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;')
}

export function standaloneHtml(title: string, body: string, styles: DocStyles): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Personal Editor">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css">
<style>
  body { font-family: '${styles.bodyFont}', Calibri, Carlito, 'Segoe UI', sans-serif; font-size: ${styles.fontSize}pt; line-height: ${styles.lineHeight + 0.2}; color: ${styles.textColor}; max-width: 46rem; margin: 3rem auto; padding: 0 1.25rem; }
  h1, h2, h3, h4, h5, h6 { font-family: '${styles.headingFont}', sans-serif; color: ${styles.headingColor}; line-height: 1.25; }
  p { margin: 0 0 ${styles.spaceAfter}pt; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  td, th { border: 1px solid #bbb; padding: 6px 10px; vertical-align: top; }
  th { background: #f2f2f2; }
  blockquote { border-left: 3px solid #bbb; margin: 1em 0; padding: .25em 1em; color: #444; }
  pre { background: #f5f6f8; padding: 12px 14px; border-radius: 6px; overflow: auto; }
  code { font-family: Consolas, 'JetBrains Mono', monospace; }
  ins { background: #e6ffed; text-decoration: none; } del { background: #ffeef0; }
  .ps-title { font-size: 28pt; } .ps-subtitle { font-size: 15pt; color: #595959; }
  [data-type="page-break"] { break-after: page; } [data-type="page-break"] span { display: none; }
  .pe-box { border: 1px solid #999; border-radius: 6px; padding: 10px 14px; margin: 1em 0; }
  .pe-columns { display: grid; grid-template-columns: repeat(var(--cols, 2), 1fr); gap: 24px; }
  sup[data-footnote]::after { content: '*'; }
</style>
</head>
<body>
${body}
</body>
</html>
`
}
