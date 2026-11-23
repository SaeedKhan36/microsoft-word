import { useEffect, useState, type ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { BubbleMenu } from '@tiptap/react/menus'
import { Bold, Italic, Underline, Highlighter, Link2, MessageSquarePlus, AlignLeft, AlignCenter, AlignRight, Strikethrough, Baseline } from 'lucide-react'
import { useApp } from '@/state/store'
import { newComment } from '@/state/commands'
import { NodeSelection } from '@tiptap/pm/state'

/** Floating mini toolbar shown above selected text (like Word's mini toolbar). */
export function BubbleToolbar({ editor }: { editor: Editor }): ReactNode {
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = (): void => setTick((x) => x + 1)
    editor.on('selectionUpdate', t)
    editor.on('transaction', t)
    return () => {
      editor.off('selectionUpdate', t)
      editor.off('transaction', t)
    }
  }, [editor])

  const btn = (active: boolean, onClick: () => void, icon: ReactNode, title: string, keys?: string): ReactNode => (
    <button className={`rbtn ${active ? 'on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={onClick} data-tip={title} data-tip-keys={keys}>
      {icon}
    </button>
  )
  const style = editor.isActive('heading', { level: 1 })
    ? 'h1'
    : editor.isActive('heading', { level: 2 })
      ? 'h2'
      : editor.isActive('heading', { level: 3 })
        ? 'h3'
        : 'p'

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: 'top', offset: 10 }}
      shouldShow={({ state, from, to }) => {
        if (from === to) return false
        if (state.selection instanceof NodeSelection) return false
        if (useApp.getState().draw.tool !== 'select') return false
        if (useApp.getState().view === 'read') return false
        return state.doc.textBetween(from, to).trim().length > 0
      }}
    >
      <div className="bubble">
        <select
          value={style}
          onChange={(e) => {
            const v = e.target.value
            if (v === 'p') editor.chain().focus().setParagraphStyle('normal').run()
            else editor.chain().focus().setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run()
          }}
          data-tip="Style"
        >
          <option value="p">Normal</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>
        <span className="sep" />
        {btn(editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), <Bold size={15} />, 'Bold', 'Ctrl+B')}
        {btn(editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), <Italic size={15} />, 'Italic', 'Ctrl+I')}
        {btn(editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), <Underline size={15} />, 'Underline', 'Ctrl+U')}
        {btn(editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), <Strikethrough size={15} />, 'Strikethrough')}
        {btn(editor.isActive('highlight'), () => editor.chain().focus().toggleHighlight({ color: '#fff176' }).run(), <Highlighter size={15} />, 'Highlight')}
        {btn(false, () => editor.chain().focus().setColor('#c00000').run(), <Baseline size={15} color="#c00000" />, 'Red text')}
        <span className="sep" />
        {btn(editor.isActive({ textAlign: 'left' }), () => editor.chain().focus().setTextAlign('left').run(), <AlignLeft size={15} />, 'Align left')}
        {btn(editor.isActive({ textAlign: 'center' }), () => editor.chain().focus().setTextAlign('center').run(), <AlignCenter size={15} />, 'Center')}
        {btn(editor.isActive({ textAlign: 'right' }), () => editor.chain().focus().setTextAlign('right').run(), <AlignRight size={15} />, 'Align right')}
        <span className="sep" />
        {btn(editor.isActive('link'), () => useApp.getState().openDialog('link'), <Link2 size={15} />, 'Link', 'Ctrl+K')}
        {btn(false, () => newComment(), <MessageSquarePlus size={15} />, 'New comment', 'Ctrl+Alt+M')}
      </div>
    </BubbleMenu>
  )
}
