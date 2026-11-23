import { Extension } from '@tiptap/core'

export type ParagraphStyleId =
  | 'normal'
  | 'no-spacing'
  | 'title'
  | 'subtitle'
  | 'quote'
  | 'intense-quote'
  | 'caption'
  | 'list-paragraph'

export interface ParagraphFormat {
  lineHeight?: number | null
  spaceBefore?: number | null // pt
  spaceAfter?: number | null // pt
  indentLeft?: number | null // pt
  indentRight?: number | null // pt
  firstLine?: number | null // pt, negative = hanging
  styleId?: ParagraphStyleId | null
  keepWithNext?: boolean
  pageBreakBefore?: boolean
  shading?: string | null
  borderStyle?: 'none' | 'box' | 'top' | 'bottom' | 'left' | null
  borderColor?: string | null
  dropCap?: boolean
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphFormat: {
      setParagraphFormat: (attrs: ParagraphFormat) => ReturnType
      setParagraphStyle: (styleId: ParagraphStyleId) => ReturnType
      indent: () => ReturnType
      outdent: () => ReturnType
      setLineSpacing: (value: number) => ReturnType
    }
  }
}

const TYPES = ['paragraph', 'heading']
const num = (v: string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}

export const ParagraphFormatting = Extension.create({
  name: 'paragraphFormat',

  addGlobalAttributes() {
    return [
      {
        types: TYPES,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (el) => {
              const v = el.style.lineHeight
              if (!v) return null
              const n = parseFloat(v)
              return v.endsWith('px') || v.endsWith('pt') ? null : Number.isFinite(n) ? n : null
            },
            renderHTML: (a) => (a.lineHeight ? { style: `line-height: ${a.lineHeight}` } : {})
          },
          spaceBefore: {
            default: null,
            parseHTML: (el) => num(el.getAttribute('data-space-before')),
            renderHTML: (a) =>
              a.spaceBefore !== null && a.spaceBefore !== undefined
                ? { 'data-space-before': a.spaceBefore, style: `padding-top: ${a.spaceBefore}pt` }
                : {}
          },
          spaceAfter: {
            default: null,
            parseHTML: (el) => num(el.getAttribute('data-space-after')),
            renderHTML: (a) =>
              a.spaceAfter !== null && a.spaceAfter !== undefined
                ? { 'data-space-after': a.spaceAfter, style: `margin-bottom: ${a.spaceAfter}pt` }
                : {}
          },
          indentLeft: {
            default: null,
            parseHTML: (el) => num(el.getAttribute('data-indent-left')),
            renderHTML: (a) =>
              a.indentLeft ? { 'data-indent-left': a.indentLeft, style: `margin-left: ${a.indentLeft}pt` } : {}
          },
          indentRight: {
            default: null,
            parseHTML: (el) => num(el.getAttribute('data-indent-right')),
            renderHTML: (a) =>
              a.indentRight ? { 'data-indent-right': a.indentRight, style: `margin-right: ${a.indentRight}pt` } : {}
          },
          firstLine: {
            default: null,
            parseHTML: (el) => num(el.getAttribute('data-first-line')),
            renderHTML: (a) => {
              if (!a.firstLine) return {}
              const v = a.firstLine as number
              // Hanging indent: shift the whole paragraph right and pull the first line back.
              return v < 0
                ? { 'data-first-line': v, style: `text-indent: ${v}pt; padding-left: ${-v}pt` }
                : { 'data-first-line': v, style: `text-indent: ${v}pt` }
            }
          },
          styleId: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-style'),
            renderHTML: (a) => (a.styleId && a.styleId !== 'normal' ? { 'data-style': a.styleId, class: `ps-${a.styleId}` } : {})
          },
          keepWithNext: {
            default: false,
            parseHTML: (el) => el.hasAttribute('data-keep-next'),
            renderHTML: (a) => (a.keepWithNext ? { 'data-keep-next': '' } : {})
          },
          pageBreakBefore: {
            default: false,
            parseHTML: (el) => el.hasAttribute('data-break-before') || el.style.breakBefore === 'page' || el.style.pageBreakBefore === 'always',
            renderHTML: (a) => (a.pageBreakBefore ? { 'data-break-before': '' } : {})
          },
          shading: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-shading'),
            renderHTML: (a) =>
              a.shading ? { 'data-shading': a.shading, style: `background-color: ${a.shading}` } : {}
          },
          borderStyle: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-border'),
            renderHTML: (a) => {
              if (!a.borderStyle || a.borderStyle === 'none') return {}
              const c = a.borderColor || 'currentColor'
              const line = `1px solid ${c}`
              const map: Record<string, string> = {
                box: `border: ${line}; padding: 4pt 6pt`,
                top: `border-top: ${line}; padding-top: 4pt`,
                bottom: `border-bottom: ${line}; padding-bottom: 4pt`,
                left: `border-left: 3px solid ${c}; padding-left: 8pt`
              }
              return { 'data-border': a.borderStyle, style: map[a.borderStyle as string] || '' }
            }
          },
          borderColor: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-border-color'),
            renderHTML: (a) => (a.borderColor ? { 'data-border-color': a.borderColor } : {})
          },
          dropCap: {
            default: false,
            parseHTML: (el) => el.hasAttribute('data-drop-cap'),
            renderHTML: (a) => (a.dropCap ? { 'data-drop-cap': '', class: 'pe-dropcap' } : {})
          }
        }
      }
    ]
  },

  addCommands() {
    const update =
      (fn: (attrs: Record<string, unknown>) => Record<string, unknown>) =>
      ({ tr, state, dispatch }: { tr: import('@tiptap/pm/state').Transaction; state: import('@tiptap/pm/state').EditorState; dispatch?: unknown }) => {
        const { from, to } = state.selection
        let changed = false
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (TYPES.includes(node.type.name)) {
            const next = fn(node.attrs)
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...next })
            changed = true
          }
          return true
        })
        if (changed && dispatch) return true
        return changed
      }
    return {
      setParagraphFormat:
        (attrs) =>
        (props) =>
          update(() => attrs as Record<string, unknown>)(props),
      setLineSpacing:
        (value) =>
        (props) =>
          update(() => ({ lineHeight: value }))(props),
      setParagraphStyle:
        (styleId) =>
        ({ chain }) => {
          if (styleId === 'normal') {
            return chain().setNode('paragraph').setParagraphFormat({ styleId: null }).run()
          }
          return chain().setNode('paragraph').setParagraphFormat({ styleId }).run()
        },
      indent:
        () =>
        (props) => {
          const { editor } = props
          if (editor.isActive('listItem') && editor.can().sinkListItem('listItem'))
            return props.commands.sinkListItem('listItem')
          if (editor.isActive('taskItem') && editor.can().sinkListItem('taskItem'))
            return props.commands.sinkListItem('taskItem')
          if (editor.isActive('listItem') || editor.isActive('taskItem')) return false
          return update((a) => ({ indentLeft: Math.min(((a.indentLeft as number) || 0) + 36, 432) }))(props)
        },
      outdent:
        () =>
        (props) => {
          const { editor } = props
          if (editor.isActive('listItem')) return props.commands.liftListItem('listItem')
          if (editor.isActive('taskItem')) return props.commands.liftListItem('taskItem')
          return update((a) => {
            const v = Math.max(((a.indentLeft as number) || 0) - 36, 0)
            return { indentLeft: v || null }
          })(props)
        }
    }
  }
})
