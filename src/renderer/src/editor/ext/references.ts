import { Node } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/core'
import type { EditorView, NodeView } from '@tiptap/pm/view'
import { useApp } from '@/state/store'
import { uid } from '@/lib/units'
import { formatCitation, formatBibliographyEntry, sortSources } from '@/lib/citations'
import type { Source } from '@/lib/types'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    references: {
      insertFootnote: (text?: string) => ReturnType
      insertTableOfContents: () => ReturnType
      insertCitation: (sourceId: string, page?: string) => ReturnType
      insertBibliography: () => ReturnType
      insertTableOfFigures: (label?: string) => ReturnType
    }
  }
}

// ------------------------------------------------------------------ footnotes

export const Footnote = Node.create({
  name: 'footnote',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      id: { default: null },
      text: { default: '' }
    }
  },
  parseHTML() {
    return [
      {
        tag: 'sup[data-footnote]',
        getAttrs: (el) => ({ id: (el as HTMLElement).getAttribute('data-footnote') || uid('f'), text: (el as HTMLElement).getAttribute('data-text') || '' })
      }
    ]
  },
  renderHTML({ node }) {
    return ['sup', { 'data-footnote': node.attrs.id, 'data-text': node.attrs.text, class: 'pe-fn pe-inline-atom', title: node.attrs.text }]
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('sup')
      dom.className = 'pe-fn pe-inline-atom'
      dom.setAttribute('data-footnote', node.attrs.id)
      dom.title = node.attrs.text || 'Empty footnote — click to edit'
      dom.addEventListener('click', () => useApp.getState().openDialog('footnote', { id: node.attrs.id }))
      return {
        dom,
        update(n: PMNode) {
          if (n.type.name !== 'footnote') return false
          dom.title = n.attrs.text || 'Empty footnote — click to edit'
          dom.setAttribute('data-footnote', n.attrs.id)
          return true
        }
      }
    }
  },
  addCommands() {
    return {
      insertFootnote:
        (text = '') =>
        ({ chain }) => {
          const id = uid('f')
          const ok = chain().insertContent({ type: 'footnote', attrs: { id, text } }).run()
          if (ok && !text) setTimeout(() => useApp.getState().openDialog('footnote', { id, isNew: true }), 0)
          return ok
        }
    }
  },
  addKeyboardShortcuts() {
    return { 'Mod-Alt-f': () => this.editor.commands.insertFootnote() }
  }
})

export function updateFootnote(editor: Editor, id: string, text: string): void {
  const { state } = editor
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'footnote' && node.attrs.id === id) {
      editor.view.dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, text }))
      return false
    }
    return true
  })
}

export function removeFootnote(editor: Editor, id: string): void {
  const { state } = editor
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'footnote' && node.attrs.id === id) {
      editor.view.dispatch(state.tr.delete(pos, pos + node.nodeSize))
      return false
    }
    return true
  })
}

export function findFootnote(editor: Editor, id: string): { text: string; pos: number } | null {
  let out: { text: string; pos: number } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (out) return false
    if (node.type.name === 'footnote' && node.attrs.id === id) out = { text: node.attrs.text, pos }
    return true
  })
  return out
}

// ------------------------------------------------------------------ table of contents

export interface HeadingEntry {
  level: number
  text: string
  pos: number
}

export function collectHeadings(doc: PMNode): HeadingEntry[] {
  const out: HeadingEntry[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      out.push({ level: node.attrs.level, text: node.textContent, pos })
      return false
    }
    return node.type.name !== 'tableOfContents'
  })
  return out
}

function scrollToPos(view: EditorView, pos: number): void {
  const dom = view.nodeDOM(pos) as HTMLElement | null
  dom?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

class TocView implements NodeView {
  dom: HTMLElement
  private body: HTMLElement
  private off: () => void

  constructor(
    private node: PMNode,
    private editor: Editor
  ) {
    this.dom = document.createElement('div')
    this.dom.className = 'pe-toc'
    this.dom.contentEditable = 'false'
    const head = document.createElement('div')
    head.className = 'pe-toc-title'
    head.textContent = 'Contents'
    this.body = document.createElement('div')
    this.body.className = 'pe-toc-body'
    this.dom.append(head, this.body)
    const rerender = (): void => this.render()
    editor.on('update', rerender)
    const listener = (): void => this.render()
    editor.storage.pagination?.listeners.add(listener)
    this.off = () => {
      editor.off('update', rerender)
      editor.storage.pagination?.listeners.delete(listener)
    }
    this.render()
  }

  render(): void {
    const headings = collectHeadings(this.editor.state.doc).filter((h) => h.level <= (this.node.attrs.depth || 3))
    const pages = this.editor.storage.pagination?.result.headingPages ?? {}
    const start = (useApp.getState().docs.find((d) => d.id === useApp.getState().activeId)?.page.pageNumberStart ?? 1) - 1
    this.body.innerHTML = ''
    if (!headings.length) {
      const empty = document.createElement('div')
      empty.className = 'pe-toc-empty'
      empty.textContent = 'No headings yet. Apply Heading styles to your titles and they will appear here.'
      this.body.appendChild(empty)
      return
    }
    for (const h of headings) {
      const row = document.createElement('div')
      row.className = `pe-toc-row pe-toc-l${h.level}`
      const t = document.createElement('span')
      t.className = 'pe-toc-text'
      t.textContent = h.text || '(untitled)'
      const dots = document.createElement('span')
      dots.className = 'pe-toc-dots'
      const n = document.createElement('span')
      n.className = 'pe-toc-num'
      n.textContent = String((pages[h.pos] ?? 0) + 1 + start)
      row.append(t, dots, n)
      row.addEventListener('click', () => scrollToPos(this.editor.view, h.pos))
      this.body.appendChild(row)
    }
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.render()
    return true
  }
  ignoreMutation(): boolean {
    return true
  }
  destroy(): void {
    this.off()
  }
}

export const TableOfContents = Node.create({
  name: 'tableOfContents',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    return { depth: { default: 3 } }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="toc"]' }]
  },
  renderHTML({ node }) {
    return ['div', { 'data-type': 'toc', 'data-depth': node.attrs.depth, class: 'pe-toc' }]
  },
  addNodeView() {
    return ({ node, editor }) => new TocView(node, editor)
  },
  addCommands() {
    return {
      insertTableOfContents:
        () =>
        ({ chain }) =>
          chain().insertContent([{ type: 'tableOfContents' }, { type: 'paragraph' }]).run()
    }
  }
})

// ------------------------------------------------------------------ citations & bibliography

function activeSources(): { sources: Source[]; style: string } {
  const st = useApp.getState()
  const doc = st.docs.find((d) => d.id === st.activeId)
  return { sources: doc?.sources ?? [], style: doc?.styles.citationStyle ?? 'apa' }
}

export const Citation = Node.create({
  name: 'citation',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { sourceId: { default: '' }, page: { default: '' } }
  },
  parseHTML() {
    return [
      {
        tag: 'span[data-citation]',
        getAttrs: (el) => ({ sourceId: (el as HTMLElement).getAttribute('data-citation'), page: (el as HTMLElement).getAttribute('data-page') || '' })
      }
    ]
  },
  renderHTML({ node }) {
    const { sources, style } = activeSources()
    const s = sources.find((x) => x.id === node.attrs.sourceId)
    return [
      'span',
      { 'data-citation': node.attrs.sourceId, 'data-page': node.attrs.page, class: 'pe-citation' },
      s ? formatCitation(s, style, node.attrs.page) : '(Missing source)'
    ]
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span')
      dom.className = 'pe-citation pe-inline-atom'
      let current = node
      const render = (): void => {
        const { sources, style } = activeSources()
        const s = sources.find((x) => x.id === current.attrs.sourceId)
        dom.textContent = s ? formatCitation(s, style, current.attrs.page) : '(Missing source)'
      }
      render()
      const unsub = useApp.subscribe((st, prev) => {
        const a = st.docs.find((d) => d.id === st.activeId)
        const b = prev.docs.find((d) => d.id === prev.activeId)
        if (a?.sources !== b?.sources || a?.styles.citationStyle !== b?.styles.citationStyle) render()
      })
      return {
        dom,
        update(n: PMNode) {
          if (n.type.name !== 'citation') return false
          current = n
          render()
          return true
        },
        destroy: unsub
      }
    }
  },
  addCommands() {
    return {
      insertCitation:
        (sourceId, page = '') =>
        ({ chain }) =>
          chain().insertContent({ type: 'citation', attrs: { sourceId, page } }).run()
    }
  }
})

export const Bibliography = Node.create({
  name: 'bibliography',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: 'div[data-type="bibliography"]' }]
  },
  renderHTML() {
    const { sources, style } = activeSources()
    return [
      'div',
      { 'data-type': 'bibliography', class: 'pe-bibliography' },
      ['div', { class: 'pe-bib-title' }, style === 'mla' ? 'Works Cited' : 'References'],
      ...sortSources(sources, style).map((s, i) => ['p', { class: 'pe-bib-entry' }, formatBibliographyEntry(s, style, i)])
    ] as unknown as import('@tiptap/pm/model').DOMOutputSpec
  },
  addNodeView() {
    return () => {
      const dom = document.createElement('div')
      dom.className = 'pe-bibliography'
      dom.contentEditable = 'false'
      const render = (): void => {
        const { sources, style } = activeSources()
        dom.innerHTML = ''
        const t = document.createElement('div')
        t.className = 'pe-bib-title'
        t.textContent = style === 'mla' ? 'Works Cited' : 'References'
        dom.appendChild(t)
        if (!sources.length) {
          const e = document.createElement('p')
          e.className = 'pe-bib-empty'
          e.textContent = 'No sources yet. Add sources with References → Manage Sources.'
          dom.appendChild(e)
        }
        sortSources(sources, style).forEach((s, i) => {
          const p = document.createElement('p')
          p.className = 'pe-bib-entry'
          p.innerHTML = formatBibliographyEntry(s, style, i, true)
          dom.appendChild(p)
        })
      }
      render()
      const unsub = useApp.subscribe((st, prev) => {
        const a = st.docs.find((d) => d.id === st.activeId)
        const b = prev.docs.find((d) => d.id === prev.activeId)
        if (a?.sources !== b?.sources || a?.styles.citationStyle !== b?.styles.citationStyle) render()
      })
      return { dom, destroy: unsub, ignoreMutation: () => true }
    }
  },
  addCommands() {
    return {
      insertBibliography:
        () =>
        ({ chain }) =>
          chain().insertContent([{ type: 'bibliography' }, { type: 'paragraph' }]).run()
    }
  }
})

/** Table of figures: lists every caption with a given label. */
export const TableOfFigures = Node.create({
  name: 'tableOfFigures',
  group: 'block',
  atom: true,
  addAttributes() {
    return { label: { default: 'Figure' } }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="tof"]' }]
  },
  renderHTML({ node }) {
    return ['div', { 'data-type': 'tof', 'data-label': node.attrs.label, class: 'pe-toc pe-tof' }]
  },
  addNodeView() {
    return ({ node, editor }) => {
      const dom = document.createElement('div')
      dom.className = 'pe-toc pe-tof'
      dom.contentEditable = 'false'
      const render = (): void => {
        dom.innerHTML = ''
        const label = String(node.attrs.label)
        const title = document.createElement('div')
        title.className = 'pe-toc-title'
        title.textContent = `Table of ${label === 'Figure' ? 'Figures' : label + 's'}`
        dom.appendChild(title)
        const pages = editor.storage.pagination?.result.pageStarts ?? [0]
        let n = 0
        editor.state.doc.descendants((child, pos) => {
          if (child.type.name !== 'paragraph') return true
          let has = false
          child.forEach((c) => {
            if (c.type.name === 'seqField' && c.attrs.label === label) has = true
          })
          if (has) {
            n++
            let page = 0
            for (let i = 0; i < pages.length; i++) if (pages[i] <= pos) page = i
            const row = document.createElement('div')
            row.className = 'pe-toc-row pe-toc-l2'
            row.innerHTML = `<span class="pe-toc-text"></span><span class="pe-toc-dots"></span><span class="pe-toc-num">${page + 1}</span>`
            ;(row.firstChild as HTMLElement).textContent = `${label} ${n}${child.textContent.replace(/^\s*\S+\s*/, '').replace(/^/, '')}`
            dom.appendChild(row)
          }
          return false
        })
        if (!n) {
          const e = document.createElement('div')
          e.className = 'pe-toc-empty'
          e.textContent = `No ${label.toLowerCase()} captions yet. Use References → Insert Caption.`
          dom.appendChild(e)
        }
      }
      render()
      editor.on('update', render)
      return { dom, destroy: () => editor.off('update', render), ignoreMutation: () => true }
    }
  },
  addCommands() {
    return {
      insertTableOfFigures:
        (label = 'Figure') =>
        ({ chain }) =>
          chain().insertContent([{ type: 'tableOfFigures', attrs: { label } }, { type: 'paragraph' }]).run()
    }
  }
})
