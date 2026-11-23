/**
 * Track changes. While enabled, typed text gets an `insertion` mark and deleted text is
 * kept in place with a `deletion` mark (shown struck through) until accepted or rejected.
 */
import { Extension, Mark, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { ReplaceStep } from '@tiptap/pm/transform'
import type { Node as PMNode, MarkType, Slice } from '@tiptap/pm/model'
import { uid } from '@/lib/units'

export interface TrackChangesStorage {
  enabled: boolean
  author: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    trackChanges: {
      setTrackChanges: (on: boolean) => ReturnType
      toggleTrackChanges: () => ReturnType
      acceptAllChanges: () => ReturnType
      rejectAllChanges: () => ReturnType
      acceptChangeAt: (pos?: number) => ReturnType
      rejectChangeAt: (pos?: number) => ReturnType
      acceptChange: (id: string) => ReturnType
      rejectChange: (id: string) => ReturnType
    }
  }
  interface Storage {
    trackChanges: TrackChangesStorage
  }
}

const SKIP = 'pe-track-skip'

const changeAttrs = {
  id: { default: null },
  author: { default: '' },
  date: { default: 0 }
}

export const Insertion = Mark.create({
  name: 'insertion',
  inclusive: false,
  excludes: 'deletion',
  addAttributes() {
    return changeAttrs
  },
  parseHTML() {
    return [
      {
        tag: 'ins',
        getAttrs: (el) => ({
          id: (el as HTMLElement).getAttribute('data-id') || uid('t'),
          author: (el as HTMLElement).getAttribute('data-author') || '',
          date: Number((el as HTMLElement).getAttribute('data-date')) || 0
        })
      }
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'ins',
      mergeAttributes({
        'data-id': HTMLAttributes.id,
        'data-author': HTMLAttributes.author,
        'data-date': HTMLAttributes.date,
        class: 'pe-ins',
        title: `Inserted by ${HTMLAttributes.author || 'someone'}`
      }),
      0
    ]
  }
})

export const Deletion = Mark.create({
  name: 'deletion',
  inclusive: false,
  excludes: 'insertion',
  addAttributes() {
    return changeAttrs
  },
  parseHTML() {
    return [
      {
        tag: 'del',
        getAttrs: (el) => ({
          id: (el as HTMLElement).getAttribute('data-id') || uid('t'),
          author: (el as HTMLElement).getAttribute('data-author') || '',
          date: Number((el as HTMLElement).getAttribute('data-date')) || 0
        })
      }
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'del',
      mergeAttributes({
        'data-id': HTMLAttributes.id,
        'data-author': HTMLAttributes.author,
        'data-date': HTMLAttributes.date,
        class: 'pe-del',
        title: `Deleted by ${HTMLAttributes.author || 'someone'}`
      }),
      0
    ]
  }
})

export interface ChangeInfo {
  id: string
  type: 'insertion' | 'deletion'
  author: string
  date: number
  from: number
  to: number
  text: string
}

/** Collect contiguous tracked changes in the document. */
export function collectChanges(doc: PMNode): ChangeInfo[] {
  const out: ChangeInfo[] = []
  doc.descendants((node, pos) => {
    if (!node.isText) return true
    for (const m of node.marks) {
      if (m.type.name !== 'insertion' && m.type.name !== 'deletion') continue
      const last = out[out.length - 1]
      if (last && last.id === m.attrs.id && last.type === m.type.name && last.to === pos) {
        last.to = pos + node.nodeSize
        last.text += node.text
      } else {
        out.push({
          id: m.attrs.id,
          type: m.type.name as ChangeInfo['type'],
          author: m.attrs.author,
          date: m.attrs.date,
          from: pos,
          to: pos + node.nodeSize,
          text: node.text || ''
        })
      }
    }
    return false
  })
  return out
}

function rangesWithMark(doc: PMNode, type: MarkType, filter?: (attrs: Record<string, unknown>) => boolean): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = []
  doc.descendants((node, pos) => {
    if (!node.isText) return true
    const m = node.marks.find((mk) => mk.type === type && (!filter || filter(mk.attrs)))
    if (m) {
      const last = out[out.length - 1]
      if (last && last.to === pos) last.to = pos + node.nodeSize
      else out.push({ from: pos, to: pos + node.nodeSize })
    }
    return false
  })
  return out
}

function resolveChanges(tr: Transaction, accept: boolean, filter?: (attrs: Record<string, unknown>) => boolean): void {
  const schema = tr.doc.type.schema
  const ins = schema.marks.insertion
  const del = schema.marks.deletion
  const removeType = accept ? del : ins // text with this mark gets deleted
  const keepType = accept ? ins : del // this mark gets removed, text kept
  const toDelete = rangesWithMark(tr.doc, removeType, filter)
  for (let i = toDelete.length - 1; i >= 0; i--) tr.delete(toDelete[i].from, toDelete[i].to)
  const toKeep = rangesWithMark(tr.doc, keepType, filter)
  for (const r of toKeep) {
    tr.doc.nodesBetween(r.from, r.to, (node, pos) => {
      if (!node.isText) return true
      const m = node.marks.find((mk) => mk.type === keepType && (!filter || filter(mk.attrs)))
      if (m) tr.removeMark(Math.max(pos, r.from), Math.min(pos + node.nodeSize, r.to), m)
      return false
    })
  }
  tr.setMeta(SKIP, true)
}

function idsAt(state: EditorState, pos?: number): Set<string> {
  const ids = new Set<string>()
  const from = pos ?? state.selection.from
  const to = pos ?? state.selection.to
  const scanFrom = Math.max(0, from - 1)
  const scanTo = Math.min(state.doc.content.size, Math.max(to, from + 1))
  state.doc.nodesBetween(scanFrom, scanTo, (node) => {
    if (node.isText) {
      for (const m of node.marks) if (m.type.name === 'insertion' || m.type.name === 'deletion') ids.add(m.attrs.id)
    }
    return true
  })
  return ids
}

const trackKey = new PluginKey('peTrackChanges')

function sliceHasText(slice: Slice): boolean {
  let has = false
  slice.content.descendants((n) => {
    if (n.isText || (n.isInline && n.isAtom)) has = true
    return !has
  })
  return has
}

export const TrackChanges = Extension.create<Record<string, never>, TrackChangesStorage>({
  name: 'trackChanges',

  addStorage() {
    return { enabled: false, author: 'Me' }
  },

  addCommands() {
    return {
      setTrackChanges:
        (on) =>
        ({ tr }) => {
          this.storage.enabled = on
          tr.setMeta('pe-track-toggle', on)
          return true
        },
      toggleTrackChanges:
        () =>
        ({ commands }) =>
          commands.setTrackChanges(!this.storage.enabled),
      acceptAllChanges:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) resolveChanges(tr, true)
          return true
        },
      rejectAllChanges:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) resolveChanges(tr, false)
          return true
        },
      acceptChangeAt:
        (pos) =>
        ({ tr, state, dispatch }) => {
          const ids = idsAt(state, pos)
          if (!ids.size) return false
          if (dispatch) resolveChanges(tr, true, (a) => ids.has(a.id as string))
          return true
        },
      rejectChangeAt:
        (pos) =>
        ({ tr, state, dispatch }) => {
          const ids = idsAt(state, pos)
          if (!ids.size) return false
          if (dispatch) resolveChanges(tr, false, (a) => ids.has(a.id as string))
          return true
        },
      acceptChange:
        (id) =>
        ({ tr, dispatch }) => {
          if (dispatch) resolveChanges(tr, true, (a) => a.id === id)
          return true
        },
      rejectChange:
        (id) =>
        ({ tr, dispatch }) => {
          if (dispatch) resolveChanges(tr, false, (a) => a.id === id)
          return true
        }
    }
  },

  addProseMirrorPlugins() {
    const storage = this.storage
    return [
      new Plugin({
        key: trackKey,
        appendTransaction(trs, oldState, newState) {
          if (!storage.enabled) return null
          const relevant = trs.filter(
            (t) =>
              t.docChanged &&
              !t.getMeta(SKIP) &&
              !t.getMeta('history$') &&
              !t.getMeta('pe-pagination') &&
              !t.getMeta('pe-no-track') &&
              t.getMeta('addToHistory') !== false
          )
          if (!relevant.length || relevant.length !== trs.filter((t) => t.docChanged).length) return null

          const schema = newState.schema
          const insType = schema.marks.insertion
          const delType = schema.marks.deletion
          if (!insType || !delType) return null

          interface Op {
            insFrom: number
            insTo: number
            delSlice: Slice | null
            delAt: number
          }
          const ops: Op[] = []
          // Map positions of each step forward to the final document.
          for (let ti = 0; ti < trs.length; ti++) {
            const t = trs[ti]
            if (!t.docChanged) continue
            for (let si = 0; si < t.steps.length; si++) {
              const step = t.steps[si]
              if (!(step instanceof ReplaceStep)) continue
              const before = t.docs[si]
              const s = step as unknown as { from: number; to: number; slice: Slice }
              const deleted = s.to > s.from ? before.slice(s.from, s.to) : null
              // Mapping from after this step to the end of all transactions.
              const map = (pos: number, assoc: number): number => {
                let p = t.mapping.slice(si + 1).map(pos, assoc)
                for (let tj = ti + 1; tj < trs.length; tj++) p = trs[tj].mapping.map(p, assoc)
                return p
              }
              const insFrom = map(s.from, -1)
              const insTo = map(s.from + s.slice.size, 1)
              ops.push({
                insFrom,
                insTo,
                delSlice: deleted && sliceHasText(deleted) ? deleted : null,
                delAt: insFrom
              })
            }
          }
          if (!ops.length) return null

          const tr = newState.tr
          const now = Date.now()
          const author = storage.author
          let selectionTarget: number | null = null
          const oldSel = oldState.selection

          for (const op of ops) {
            const id = uid('t')
            const insFrom = tr.mapping.map(op.insFrom, -1)
            const insTo = tr.mapping.map(op.insTo, 1)
            if (insTo > insFrom) {
              // Text the user typed is marked as an insertion (unless it was already a tracked deletion being restored).
              tr.removeMark(insFrom, insTo, delType)
              tr.addMark(insFrom, insTo, insType.create({ id, author, date: now }))
            }
            if (op.delSlice) {
              const at = tr.mapping.map(op.delAt, -1)
              const sizeBefore = tr.doc.content.size
              tr.replace(at, at, op.delSlice)
              const len = tr.doc.content.size - sizeBefore
              // Text that was our own pending insertion is truly removed; everything else is marked deleted.
              const ownInserted: { from: number; to: number }[] = []
              tr.doc.nodesBetween(at, at + len, (node, pos) => {
                if (node.isText && node.marks.some((m) => m.type === insType)) {
                  ownInserted.push({ from: Math.max(pos, at), to: Math.min(pos + node.nodeSize, at + len) })
                }
                return true
              })
              tr.addMark(at, at + len, delType.create({ id: uid('t'), author, date: now }))
              let removed = 0
              for (let i = ownInserted.length - 1; i >= 0; i--) {
                tr.delete(ownInserted[i].from, ownInserted[i].to)
                removed += ownInserted[i].to - ownInserted[i].from
              }
              const finalLen = len - removed
              if (insTo <= insFrom) {
                // Pure deletion: Backspace leaves the cursor before the deleted text, Delete after it.
                const forward = oldSel.empty && oldSel.from === op.delAt
                selectionTarget = forward ? at + finalLen : at
              }
            }
          }
          if (selectionTarget !== null) {
            const pos = Math.max(0, Math.min(selectionTarget, tr.doc.content.size))
            tr.setSelection(TextSelection.near(tr.doc.resolve(pos)))
          }
          tr.setMeta(SKIP, true)
          return tr.docChanged ? tr : null
        }
      })
    ]
  }
})
