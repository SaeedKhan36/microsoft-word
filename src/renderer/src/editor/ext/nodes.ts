import { Node, Mark, mergeAttributes, Extension } from '@tiptap/core'
import { uid } from '@/lib/units'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    peNodes: {
      setPageBreak: () => ReturnType
      insertBox: (attrs?: { variant?: string; float?: string; width?: number | null }) => ReturnType
      insertColumns: (count: number, layout?: string) => ReturnType
      insertBookmark: (name: string) => ReturnType
      insertCaption: (label: string, text?: string) => ReturnType
    }
  }
}

/** Hard page break. */
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() {
    return [
      { tag: 'div[data-type="page-break"]' },
      {
        tag: 'div',
        getAttrs: (el) => ((el as HTMLElement).style.pageBreakAfter === 'always' || (el as HTMLElement).style.breakAfter === 'page' ? {} : false)
      },
      {
        tag: 'br',
        getAttrs: (el) => ((el as HTMLElement).style.pageBreakBefore === 'always' ? {} : false)
      }
    ]
  },
  renderHTML() {
    return ['div', { 'data-type': 'page-break', class: 'pe-page-break', contenteditable: 'false' }, ['span', 'Page Break']]
  },
  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ chain }) =>
          chain().insertContent([{ type: 'pageBreak' }, { type: 'paragraph' }]).run()
    }
  },
  addKeyboardShortcuts() {
    return { 'Mod-Enter': () => this.editor.commands.setPageBreak() }
  }
})

/** Text box / callout container. */
export const Box = Node.create({
  name: 'box',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      variant: { default: 'textbox', parseHTML: (el) => el.getAttribute('data-variant') || 'textbox' },
      float: { default: 'none', parseHTML: (el) => el.getAttribute('data-float') || 'none' },
      width: {
        default: null,
        parseHTML: (el) => {
          const w = parseFloat(el.getAttribute('data-width') || '')
          return Number.isFinite(w) ? w : null
        }
      }
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="box"]' }, { tag: 'aside' }]
  },
  renderHTML({ node, HTMLAttributes }) {
    const { variant, float, width } = node.attrs
    const style = width ? `width: ${width}%` : ''
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'box',
        'data-variant': variant,
        'data-float': float,
        'data-width': width ?? '',
        class: `pe-box pe-box-${variant} pe-float-${float}`,
        style
      }),
      0
    ]
  },
  addCommands() {
    return {
      insertBox:
        (attrs = {}) =>
        ({ chain, state }) => {
          const { from, to, empty } = state.selection
          const text = empty ? '' : state.doc.textBetween(from, to, '\n')
          const paragraphs = (text || (attrs.variant === 'textbox' ? 'Type your text here.' : 'Note')).split('\n')
          return chain()
            .insertContentAt(
              { from, to },
              {
                type: 'box',
                attrs: { variant: 'textbox', float: 'none', width: null, ...attrs },
                content: paragraphs.map((t) => ({ type: 'paragraph', content: t ? [{ type: 'text', text: t }] : [] }))
              }
            )
            .run()
        }
    }
  }
})

export const Column = Node.create({
  name: 'column',
  content: 'block+',
  isolating: true,
  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'column', class: 'pe-column' }), 0]
  }
})

export const Columns = Node.create({
  name: 'columns',
  group: 'block',
  content: 'column{2,4}',
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      layout: { default: 'equal', parseHTML: (el) => el.getAttribute('data-layout') || 'equal' }
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="columns"]' }]
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'columns',
        'data-layout': node.attrs.layout,
        'data-count': node.childCount,
        class: `pe-columns pe-columns-${node.attrs.layout}`,
        style: `--cols: ${node.childCount}`
      }),
      0
    ]
  },
  addCommands() {
    return {
      insertColumns:
        (count, layout = 'equal') =>
        ({ chain }) =>
          chain()
            .insertContent({
              type: 'columns',
              attrs: { layout },
              content: Array.from({ length: count }, (_, i) => ({
                type: 'column',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: `Column ${i + 1}` }] }]
              }))
            })
            .run()
    }
  }
})

/** Bookmark anchor (inline, invisible except when formatting marks are shown). */
export const Bookmark = Node.create({
  name: 'bookmark',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { name: { default: '' } }
  },
  parseHTML() {
    return [{ tag: 'span[data-bookmark]', getAttrs: (el) => ({ name: (el as HTMLElement).getAttribute('data-bookmark') }) }]
  },
  renderHTML({ node }) {
    return ['span', { 'data-bookmark': node.attrs.name, id: `bm-${node.attrs.name}`, class: 'pe-bookmark', title: `Bookmark: ${node.attrs.name}` }]
  },
  addCommands() {
    return {
      insertBookmark:
        (name) =>
        ({ chain }) =>
          chain().insertContent({ type: 'bookmark', attrs: { name } }).run()
    }
  }
})

/** Auto-numbered caption label, e.g. "Figure 3". Numbering uses CSS counters per label. */
export const SeqField = Node.create({
  name: 'seqField',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return { label: { default: 'Figure' } }
  },
  parseHTML() {
    return [{ tag: 'span[data-seq]', getAttrs: (el) => ({ label: (el as HTMLElement).getAttribute('data-seq') }) }]
  },
  renderHTML({ node }) {
    const label = String(node.attrs.label)
    return ['span', { 'data-seq': label, class: `pe-seq pe-seq-${label.toLowerCase()}`, contenteditable: 'false' }, label + ' ']
  },
  addCommands() {
    return {
      insertCaption:
        (label, text = '') =>
        ({ chain, state }) => {
          const { $to } = state.selection
          const end = $to.end($to.depth > 0 ? 1 : 0)
          const pos = $to.depth > 0 ? $to.after(1) : end
          return chain()
            .insertContentAt(pos, {
              type: 'paragraph',
              attrs: { styleId: 'caption' },
              content: [
                { type: 'seqField', attrs: { label } },
                ...(text ? [{ type: 'text', text: `: ${text}` }] : [{ type: 'text', text: ': ' }])
              ]
            })
            .run()
        }
    }
  }
})

/** Extra text effects on the textStyle mark: letter spacing, small caps, all caps, shadow. */
export const TextEffects = Extension.create({
  name: 'textEffects',
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          letterSpacing: {
            default: null,
            parseHTML: (el) => el.style.letterSpacing || null,
            renderHTML: (a) => (a.letterSpacing ? { style: `letter-spacing: ${a.letterSpacing}` } : {})
          },
          textCase: {
            default: null,
            parseHTML: (el) => (el.style.fontVariant === 'small-caps' ? 'small-caps' : el.style.textTransform === 'uppercase' ? 'all-caps' : null),
            renderHTML: (a) =>
              a.textCase === 'small-caps'
                ? { style: 'font-variant: small-caps' }
                : a.textCase === 'all-caps'
                  ? { style: 'text-transform: uppercase' }
                  : {}
          },
          textShadow: {
            default: null,
            parseHTML: (el) => el.style.textShadow || null,
            renderHTML: (a) => (a.textShadow ? { style: `text-shadow: ${a.textShadow}` } : {})
          }
        }
      },
      {
        types: ['underline'],
        attributes: {
          underlineStyle: {
            default: null,
            parseHTML: (el) => el.style.textDecorationStyle || null,
            renderHTML: (a) => (a.underlineStyle ? { style: `text-decoration-style: ${a.underlineStyle}` } : {})
          },
          underlineColor: {
            default: null,
            parseHTML: (el) => el.style.textDecorationColor || null,
            renderHTML: (a) => (a.underlineColor ? { style: `text-decoration-color: ${a.underlineColor}` } : {})
          }
        }
      }
    ]
  }
})

/** Table extras: cell shading, vertical alignment and table style presets. */
export const TableExtras = Extension.create({
  name: 'tableExtras',
  addGlobalAttributes() {
    return [
      {
        types: ['tableCell', 'tableHeader'],
        attributes: {
          backgroundColor: {
            default: null,
            parseHTML: (el) => el.style.backgroundColor || el.getAttribute('data-bg') || null,
            renderHTML: (a) => (a.backgroundColor ? { 'data-bg': a.backgroundColor, style: `background-color: ${a.backgroundColor}` } : {})
          },
          verticalAlign: {
            default: null,
            parseHTML: (el) => el.style.verticalAlign || null,
            renderHTML: (a) => (a.verticalAlign ? { style: `vertical-align: ${a.verticalAlign}` } : {})
          }
        }
      },
      {
        types: ['table'],
        attributes: {
          tableStyle: {
            default: 'grid',
            parseHTML: (el) => el.getAttribute('data-table-style') || 'grid',
            renderHTML: (a) => ({ 'data-table-style': a.tableStyle, class: `pe-table-${a.tableStyle}` })
          },
          bandedRows: {
            default: false,
            parseHTML: (el) => el.hasAttribute('data-banded'),
            renderHTML: (a) => (a.bandedRows ? { 'data-banded': '' } : {})
          },
          headerRow: {
            default: true,
            parseHTML: (el) => !el.hasAttribute('data-no-header'),
            renderHTML: (a) => (a.headerRow ? {} : { 'data-no-header': '' })
          }
        }
      }
    ]
  }
})

/** Comment highlight. Multiple comments may overlap, so the mark doesn't exclude itself. */
export const CommentMark = Mark.create({
  name: 'comment',
  excludes: '',
  inclusive: false,
  addAttributes() {
    return { id: { default: null } }
  },
  parseHTML() {
    return [{ tag: 'span[data-comment]', getAttrs: (el) => ({ id: (el as HTMLElement).getAttribute('data-comment') }) }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-comment': HTMLAttributes.id, class: 'pe-comment' }), 0]
  }
})

export const newId = (): string => uid('c')

/** Bullet styles for bulleted lists (disc, circle, square, dash, arrow, check, star). */
export const ListStyles = Extension.create({
  name: 'listStyles',
  addGlobalAttributes() {
    return [
      {
        types: ['bulletList'],
        attributes: {
          bulletStyle: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-bullet'),
            renderHTML: (a) => {
              if (!a.bulletStyle) return {}
              const map: Record<string, string> = {
                disc: 'disc',
                circle: 'circle',
                square: 'square',
                dash: '"– "',
                arrow: '"➤ "',
                check: '"✓ "',
                star: '"★ "',
                diamond: '"◆ "'
              }
              return { 'data-bullet': a.bulletStyle, style: `list-style-type: ${map[a.bulletStyle as string] ?? 'disc'}` }
            }
          }
        }
      }
    ]
  }
})
