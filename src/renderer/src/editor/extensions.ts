import type { AnyExtension, Editor, Range } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TextStyleKit } from '@tiptap/extension-text-style'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import Typography from '@tiptap/extension-typography'
import { TableKit } from '@tiptap/extension-table'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { Mathematics } from '@tiptap/extension-mathematics'
import { ParagraphFormatting } from './ext/paragraph-format'
import { Pagination } from './ext/pagination'
import { TrackChanges, Insertion, Deletion } from './ext/track-changes'
import { Search } from './ext/search'
import { PageBreak, Box, Columns, Column, Bookmark, SeqField, TextEffects, TableExtras, CommentMark, ListStyles } from './ext/nodes'
import { PeImage } from './ext/image'
import { Ink } from './ext/ink'
import { Footnote, TableOfContents, Citation, Bibliography, TableOfFigures } from './ext/references'
import { Chart } from './ext/chart'
import { WordKeymap, SlashCommands, LinkClick, type SlashItem } from './ext/keymap'
import { useApp } from '@/state/store'
import { sampleChart } from '@/lib/chart'

function item(id: string, title: string, hint: string, icon: string, keywords: string, action: (e: Editor) => void): SlashItem {
  return {
    id,
    title,
    hint,
    icon,
    keywords,
    run: (editor: Editor, range: Range) => {
      editor.chain().focus().deleteRange(range).run()
      action(editor)
    }
  }
}

export const SLASH_ITEMS: SlashItem[] = [
  item('p', 'Text', 'Plain paragraph', 'Pilcrow', 'paragraph normal body', (e) => e.chain().focus().setParagraphStyle('normal').run()),
  item('h1', 'Heading 1', 'Big section heading', 'Heading1', 'title h1', (e) => e.chain().focus().toggleHeading({ level: 1 }).run()),
  item('h2', 'Heading 2', 'Medium section heading', 'Heading2', 'subtitle h2', (e) => e.chain().focus().toggleHeading({ level: 2 }).run()),
  item('h3', 'Heading 3', 'Small section heading', 'Heading3', 'h3', (e) => e.chain().focus().toggleHeading({ level: 3 }).run()),
  item('title', 'Title', 'Document title style', 'Type', 'title big', (e) => e.chain().focus().setParagraphStyle('title').run()),
  item('ul', 'Bulleted list', 'Simple bullet list', 'List', 'bullet unordered', (e) => e.chain().focus().toggleBulletList().run()),
  item('ol', 'Numbered list', 'List with numbers', 'ListOrdered', 'number ordered', (e) => e.chain().focus().toggleOrderedList().run()),
  item('todo', 'Checklist', 'Track tasks with checkboxes', 'ListChecks', 'todo task check', (e) => e.chain().focus().toggleTaskList().run()),
  item('table', 'Table', '3 × 3 table', 'Table', 'grid', (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()),
  item('image', 'Picture', 'Insert an image from your PC', 'Image', 'photo picture', () => useApp.getState().openDialog('insertPicture')),
  item('quote', 'Quote', 'Highlighted quotation', 'Quote', 'blockquote citation', (e) => e.chain().focus().toggleBlockquote().run()),
  item('callout', 'Callout', 'Note or tip box', 'MessageSquareQuote', 'note info tip warning box', (e) => e.chain().focus().insertBox({ variant: 'info' }).run()),
  item('textbox', 'Text box', 'Bordered box of text', 'SquareDashed', 'box frame', (e) => e.chain().focus().insertBox({ variant: 'textbox' }).run()),
  item('code', 'Code block', 'Monospace code', 'Code2', 'code snippet programming', (e) => e.chain().focus().toggleCodeBlock().run()),
  item('hr', 'Divider', 'Horizontal line', 'Minus', 'line rule separator', (e) => e.chain().focus().setHorizontalRule().run()),
  item('pagebreak', 'Page break', 'Start a new page', 'FileDown', 'break new page', (e) => e.chain().focus().setPageBreak().run()),
  item('cols', 'Two columns', 'Side-by-side columns', 'Columns2', 'columns layout', (e) => e.chain().focus().insertColumns(2).run()),
  item('eq', 'Equation', 'Math with LaTeX', 'Sigma', 'math formula latex', () => useApp.getState().openDialog('equation', { mode: 'block' })),
  item('ink', 'Drawing', 'Write or draw with a pen', 'PenLine', 'ink draw handwriting sketch', (e) => {
    e.chain().focus().insertInk().run()
    const s = useApp.getState()
    s.set({ draw: { ...s.draw, tool: 'pen' }, ribbonTab: 'draw' })
  }),
  item('chart', 'Chart', 'Column, line or pie chart', 'BarChart3', 'graph chart data', (e) => e.chain().focus().insertChart(sampleChart()).run()),
  item('toc', 'Table of contents', 'Auto-updating contents', 'ListTree', 'toc contents index', (e) => e.chain().focus().insertTableOfContents().run()),
  item('footnote', 'Footnote', 'Note at the bottom of the page', 'Superscript', 'footnote note reference', (e) => e.chain().focus().insertFootnote().run()),
  item('date', 'Date', "Today's date", 'CalendarDays', 'date today time', (e) =>
    e.chain().focus().insertContent(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })).run()
  ),
  item('symbol', 'Symbol', 'Special characters', 'Omega', 'symbol character emoji', () => useApp.getState().openDialog('symbol'))
]

export function filterSlash(q: string): SlashItem[] {
  const query = q.toLowerCase().trim()
  if (!query) return SLASH_ITEMS
  return SLASH_ITEMS.filter((i) => i.title.toLowerCase().includes(query) || i.keywords.includes(query))
}

export function buildExtensions(opts: { baseFontSize: () => number; placeholder?: string }): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: { openOnClick: false, autolink: true, linkOnPaste: true, HTMLAttributes: { rel: 'noopener noreferrer', target: null } },
      undoRedo: { depth: 500, newGroupDelay: 600 },
      dropcursor: { color: 'var(--accent)', width: 2 }
    }),
    TextStyleKit.configure({ lineHeight: false }),
    TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
    Highlight.configure({ multicolor: true }),
    Subscript,
    Superscript,
    Typography.configure({ oneHalf: false, oneQuarter: false, threeQuarters: false }),
    TableKit.configure({ table: { resizable: true, cellMinWidth: 36, lastColumnResizable: true } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({
      placeholder: ({ editor, node }) =>
        editor.state.doc.childCount === 1 && node.type.name === 'paragraph' ? (opts.placeholder ?? 'Start writing, or type / to insert anything…') : '',
      showOnlyCurrent: true
    }),
    Mathematics.configure({
      katexOptions: { throwOnError: false },
      inlineOptions: {
        onClick: (node, pos) => useApp.getState().openDialog('equation', { mode: 'inline', latex: node.attrs.latex, pos })
      },
      blockOptions: {
        onClick: (node, pos) => useApp.getState().openDialog('equation', { mode: 'block', latex: node.attrs.latex, pos })
      }
    }),
    ParagraphFormatting,
    Pagination,
    TrackChanges,
    Insertion,
    Deletion,
    Search,
    PageBreak,
    Box,
    Columns,
    Column,
    Bookmark,
    SeqField,
    TextEffects,
    TableExtras,
    ListStyles,
    CommentMark,
    PeImage,
    Ink,
    Footnote,
    TableOfContents,
    Citation,
    Bibliography,
    TableOfFigures,
    Chart,
    WordKeymap.configure({ baseFontSize: opts.baseFontSize }),
    SlashCommands.configure({ items: filterSlash }),
    LinkClick.configure({ open: (href) => void window.pe.shell.openExternal(href) })
  ]
}
