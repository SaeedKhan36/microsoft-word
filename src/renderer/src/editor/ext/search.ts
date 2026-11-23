import { Extension, type CommandProps } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'

export interface SearchOptions {
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
}

export interface SearchMatch {
  from: number
  to: number
}

export interface SearchStorage {
  query: string
  options: SearchOptions
  matches: SearchMatch[]
  current: number
  listeners: Set<() => void>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    search: {
      setSearch: (query: string, options?: Partial<SearchOptions>) => ReturnType
      clearSearch: () => ReturnType
      findNext: () => ReturnType
      findPrevious: () => ReturnType
      replaceCurrent: (replacement: string) => ReturnType
      replaceAll: (replacement: string) => ReturnType
      gotoMatch: (index: number) => ReturnType
    }
  }
  interface Storage {
    search: SearchStorage
  }
}

const key = new PluginKey<DecorationSet>('peSearch')

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildRegex(query: string, o: SearchOptions): RegExp | null {
  if (!query) return null
  let src = o.regex ? query : escapeRegex(query)
  if (o.wholeWord) src = `(?<![\\p{L}\\p{N}_])(?:${src})(?![\\p{L}\\p{N}_])`
  try {
    return new RegExp(src, `gu${o.caseSensitive ? '' : 'i'}`)
  } catch {
    return null
  }
}

export function findMatches(doc: PMNode, re: RegExp | null): SearchMatch[] {
  if (!re) return []
  const out: SearchMatch[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    // Build the block's text with a position map (inline atoms count as one placeholder char).
    let text = ''
    const map: number[] = []
    node.forEach((child, offset) => {
      const start = pos + 1 + offset
      if (child.isText) {
        const t = child.text || ''
        for (let i = 0; i < t.length; i++) map.push(start + i)
        text += t
      } else {
        map.push(start)
        text += '￼'
      }
    })
    map.push(pos + node.nodeSize - 1)
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      if (m[0].length === 0) {
        re.lastIndex++
        continue
      }
      out.push({ from: map[m.index], to: map[m.index + m[0].length - 1] + 1 })
      if (out.length > 10000) return false
    }
    return false
  })
  return out
}

export const Search = Extension.create<Record<string, never>, SearchStorage>({
  name: 'search',

  addStorage() {
    return {
      query: '',
      options: { caseSensitive: false, wholeWord: false, regex: false },
      matches: [],
      current: -1,
      listeners: new Set()
    }
  },

  addCommands() {
    const notify = (): void => this.storage.listeners.forEach((l) => l())
    const select =
      (index: number) =>
      ({ tr, dispatch, view }: CommandProps): boolean => {
        const m = this.storage.matches[index]
        if (!m) return false
        this.storage.current = index
        if (dispatch) {
          tr.setSelection(TextSelection.create(tr.doc, m.from, m.to)).setMeta(key, 'refresh').scrollIntoView()
          setTimeout(() => {
            const el = view.domAtPos(m.from).node as HTMLElement
            const target = (el.nodeType === 1 ? el : el.parentElement) as HTMLElement | null
            target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
          }, 0)
        }
        notify()
        return true
      }
    return {
      setSearch:
        (query, options) =>
        ({ tr, dispatch, state }) => {
          this.storage.query = query
          this.storage.options = { ...this.storage.options, ...options }
          this.storage.matches = findMatches(state.doc, buildRegex(query, this.storage.options))
          // Start from the first match after the cursor.
          const from = state.selection.from
          const idx = this.storage.matches.findIndex((m) => m.from >= from)
          this.storage.current = this.storage.matches.length ? (idx >= 0 ? idx : 0) : -1
          if (dispatch) tr.setMeta(key, 'refresh').setMeta('addToHistory', false)
          notify()
          return true
        },
      clearSearch:
        () =>
        ({ tr, dispatch }) => {
          this.storage.query = ''
          this.storage.matches = []
          this.storage.current = -1
          if (dispatch) tr.setMeta(key, 'refresh').setMeta('addToHistory', false)
          notify()
          return true
        },
      findNext: () => (props) => {
        const n = this.storage.matches.length
        if (!n) return false
        return select((this.storage.current + 1 + n) % n)(props)
      },
      findPrevious: () => (props) => {
        const n = this.storage.matches.length
        if (!n) return false
        return select((this.storage.current - 1 + n) % n)(props)
      },
      gotoMatch: (index) => (props) => select(index)(props),
      replaceCurrent:
        (replacement) =>
        ({ tr, dispatch, state }) => {
          const m = this.storage.matches[this.storage.current]
          if (!m) return false
          if (dispatch) {
            const marks = state.doc.resolve(m.from).marks()
            if (replacement) tr.replaceWith(m.from, m.to, state.schema.text(replacement, marks))
            else tr.delete(m.from, m.to)
            tr.setMeta(key, 'refresh')
          }
          return true
        },
      replaceAll:
        (replacement) =>
        ({ tr, dispatch, state }) => {
          const matches = findMatches(state.doc, buildRegex(this.storage.query, this.storage.options))
          if (!matches.length) return false
          if (dispatch) {
            for (let i = matches.length - 1; i >= 0; i--) {
              const m = matches[i]
              const marks = state.doc.resolve(m.from).marks()
              if (replacement) tr.replaceWith(m.from, m.to, state.schema.text(replacement, marks))
              else tr.delete(m.from, m.to)
            }
            tr.setMeta(key, 'refresh')
          }
          return true
        }
    }
  },

  addProseMirrorPlugins() {
    const storage = this.storage
    return [
      new Plugin({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old, _o, newState) {
            if (!storage.query) return tr.getMeta(key) ? DecorationSet.empty : old.map(tr.mapping, tr.doc)
            if (tr.docChanged || tr.getMeta(key)) {
              if (tr.docChanged) {
                storage.matches = findMatches(newState.doc, buildRegex(storage.query, storage.options))
                if (storage.current >= storage.matches.length) storage.current = storage.matches.length - 1
                setTimeout(() => storage.listeners.forEach((l) => l()), 0)
              }
              return DecorationSet.create(
                newState.doc,
                storage.matches.map((m, i) =>
                  Decoration.inline(m.from, m.to, { class: i === storage.current ? 'pe-find pe-find-current' : 'pe-find' })
                )
              )
            }
            return old.map(tr.mapping, tr.doc)
          }
        },
        props: {
          decorations(state) {
            return key.getState(state)
          }
        }
      })
    ]
  }
})
