import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { create } from 'zustand'
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion'
import type { Editor, Range } from '@tiptap/core'

const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72]

export function currentFontSize(editor: Editor): number {
  const v = editor.getAttributes('textStyle').fontSize as string | undefined
  if (v) {
    const n = parseFloat(v)
    if (v.endsWith('px')) return Math.round((n * 72) / 96)
    return n
  }
  return 0
}

export function stepFontSize(editor: Editor, dir: 1 | -1, base: number): boolean {
  const cur = currentFontSize(editor) || base
  let next = cur
  if (dir > 0) next = SIZES.find((s) => s > cur) ?? Math.min(cur + 12, 1638)
  else next = [...SIZES].reverse().find((s) => s < cur) ?? Math.max(1, cur - 1)
  return editor.chain().focus().setFontSize(`${next}pt`).run()
}

/** Word-compatible keyboard shortcuts. */
export const WordKeymap = Extension.create<{ baseFontSize: () => number }>({
  name: 'wordKeymap',
  addOptions() {
    return { baseFontSize: () => 11 }
  },
  addKeyboardShortcuts() {
    const e = this.editor
    return {
      'Mod-l': () => e.chain().focus().setTextAlign('left').run(),
      'Mod-e': () => e.chain().focus().setTextAlign('center').run(),
      'Mod-r': () => e.chain().focus().setTextAlign('right').run(),
      'Mod-j': () => e.chain().focus().setTextAlign('justify').run(),
      'Mod-Shift->': () => stepFontSize(e, 1, this.options.baseFontSize()),
      'Mod-Shift-<': () => stepFontSize(e, -1, this.options.baseFontSize()),
      'Mod-Shift-.': () => stepFontSize(e, 1, this.options.baseFontSize()),
      'Mod-Shift-,': () => stepFontSize(e, -1, this.options.baseFontSize()),
      'Mod-]': () => {
        const cur = currentFontSize(e) || this.options.baseFontSize()
        return e.chain().focus().setFontSize(`${cur + 1}pt`).run()
      },
      'Mod-[': () => {
        const cur = currentFontSize(e) || this.options.baseFontSize()
        return e.chain().focus().setFontSize(`${Math.max(1, cur - 1)}pt`).run()
      },
      'Mod-=': () => e.chain().focus().toggleSubscript().run(),
      'Mod-Shift-=': () => e.chain().focus().toggleSuperscript().run(),
      'Mod-Shift-+': () => e.chain().focus().toggleSuperscript().run(),
      'Mod-Space': () => e.chain().focus().unsetAllMarks().run(),
      'Mod-1': () => e.chain().focus().setLineSpacing(1).run(),
      'Mod-2': () => e.chain().focus().setLineSpacing(2).run(),
      'Mod-5': () => e.chain().focus().setLineSpacing(1.5).run(),
      'Mod-m': () => e.chain().focus().indent().run(),
      'Mod-Shift-m': () => e.chain().focus().outdent().run(),
      'Mod-Shift-n': () => e.chain().focus().setParagraphStyle('normal').run(),
      'Mod-Alt-1': () => e.chain().focus().toggleHeading({ level: 1 }).run(),
      'Mod-Alt-2': () => e.chain().focus().toggleHeading({ level: 2 }).run(),
      'Mod-Alt-3': () => e.chain().focus().toggleHeading({ level: 3 }).run(),
      'Mod-Shift-l': () => e.chain().focus().toggleBulletList().run(),
      'Mod-Shift-d': () => e.chain().focus().toggleUnderline().updateAttributes('underline', { underlineStyle: 'double' }).run(),
      Tab: () => {
        if (e.isActive('listItem') || e.isActive('taskItem')) return e.commands.indent()
        if (e.isActive('table')) return false
        if (e.isActive('codeBlock')) return e.commands.insertContent('  ')
        return e.commands.insertContent('\t')
      },
      'Shift-Tab': () => {
        if (e.isActive('listItem') || e.isActive('taskItem')) return e.commands.outdent()
        return false
      }
    }
  }
})

// ------------------------------------------------------------------ slash menu

export interface SlashItem {
  id: string
  title: string
  hint: string
  icon: string
  keywords: string
  run: (editor: Editor, range: Range) => void
}

interface SlashState {
  open: boolean
  items: SlashItem[]
  index: number
  rect: DOMRect | null
  command: ((item: SlashItem) => void) | null
}

export const useSlash = create<SlashState>(() => ({ open: false, items: [], index: 0, rect: null, command: null }))

export const SlashCommands = Extension.create<{ items: (q: string) => SlashItem[] }>({
  name: 'slashCommands',
  addOptions() {
    return { items: () => [] }
  },
  addProseMirrorPlugins() {
    const itemsFn = this.options.items
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        allowSpaces: false,
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from)
          const before = $from.parent.textBetween(0, $from.parentOffset, '\n', '￼')
          return before.trim() === '' && !$from.parent.type.spec.code
        },
        items: ({ query }) => itemsFn(query).slice(0, 24),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => {
          const sync = (p: SuggestionProps<SlashItem, SlashItem>): void => {
            useSlash.setState({
              open: true,
              items: p.items,
              rect: p.clientRect?.() ?? null,
              command: (item) => p.command(item)
            })
            if (useSlash.getState().index >= p.items.length) useSlash.setState({ index: 0 })
          }
          return {
            onStart: (p) => {
              useSlash.setState({ index: 0 })
              sync(p)
            },
            onUpdate: sync,
            onKeyDown: ({ event }) => {
              const st = useSlash.getState()
              if (!st.open || !st.items.length) return false
              if (event.key === 'ArrowDown') {
                useSlash.setState({ index: (st.index + 1) % st.items.length })
                return true
              }
              if (event.key === 'ArrowUp') {
                useSlash.setState({ index: (st.index - 1 + st.items.length) % st.items.length })
                return true
              }
              if (event.key === 'Enter' || event.key === 'Tab') {
                const item = st.items[st.index]
                if (item && st.command) st.command(item)
                return true
              }
              if (event.key === 'Escape') {
                useSlash.setState({ open: false })
                return true
              }
              return false
            },
            onExit: () => useSlash.setState({ open: false, items: [], command: null })
          }
        }
      })
    ]
  }
})

/** Ctrl+click opens links; plain click just places the cursor (like Word). */
export const LinkClick = Extension.create<{ open: (href: string) => void }>({
  name: 'linkClick',
  addOptions() {
    return { open: () => undefined }
  },
  addProseMirrorPlugins() {
    const open = this.options.open
    return [
      new Plugin({
        props: {
          handleClick(_view, _pos, event) {
            const a = (event.target as HTMLElement)?.closest?.('a[href]') as HTMLAnchorElement | null
            if (!a) return false
            if (event.ctrlKey || event.metaKey) {
              const href = a.getAttribute('href') || ''
              if (href.startsWith('#')) {
                document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              } else open(href)
              return true
            }
            return false
          }
        }
      })
    ]
  }
})
