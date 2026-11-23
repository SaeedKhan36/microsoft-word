import type { ReactNode } from 'react'
import { Save, Undo2, Redo2, Plus, X, Search, FileText, Printer, ChevronDown } from 'lucide-react'
import { useApp } from '@/state/store'
import { Logo, useActiveEditor, Dropdown, MenuList } from './ui'
import * as io from '@/lib/io'

export function TitleBar(): ReactNode {
  const docs = useApp((s) => s.docs)
  const activeId = useApp((s) => s.activeId)
  const platform = useApp((s) => s.platform)
  const editor = useActiveEditor()
  const set = useApp.getState().set
  return (
    <div className={`titlebar ${platform === 'darwin' ? 'mac' : ''}`}>
      {platform !== 'darwin' && <Logo className="tb-logo" />}
      <div className="tb-qat">
        <button className="tb-btn" disabled={!activeId} onClick={() => activeId && void io.saveDoc(activeId)} data-tip="Save" data-tip-keys="Ctrl+S">
          <Save size={16} />
        </button>
        <button className="tb-btn" disabled={!editor?.can().undo()} onMouseDown={(e) => e.preventDefault()} onClick={() => editor?.chain().focus().undo().run()} data-tip="Undo" data-tip-keys="Ctrl+Z">
          <Undo2 size={16} />
        </button>
        <button className="tb-btn" disabled={!editor?.can().redo()} onMouseDown={(e) => e.preventDefault()} onClick={() => editor?.chain().focus().redo().run()} data-tip="Redo" data-tip-keys="Ctrl+Y">
          <Redo2 size={16} />
        </button>
        <Dropdown
          trigger={({ toggle, ref }) => (
            <button ref={ref as never} className="tb-btn" style={{ minWidth: 18, padding: 0 }} onClick={toggle} data-tip="Customize Quick Access">
              <ChevronDown size={13} />
            </button>
          )}
        >
          {(close) => (
            <MenuList
              close={close}
              items={[
                { label: 'New', icon: <FileText size={16} />, shortcut: 'Ctrl+N', onClick: () => io.newDocument() },
                { label: 'Open…', shortcut: 'Ctrl+O', onClick: () => void io.openFileDialog() },
                { label: 'Print…', icon: <Printer size={16} />, shortcut: 'Ctrl+P', disabled: !activeId, onClick: () => set({ backstage: 'print' }) },
                { label: 'Export PDF…', disabled: !activeId, onClick: () => activeId && void io.exportAs(activeId, 'pdf') }
              ]}
            />
          )}
        </Dropdown>
      </div>
      <div className="doc-tabs" role="tablist">
        {docs.map((d) => (
          <div
            key={d.id}
            role="tab"
            aria-selected={d.id === activeId}
            className={`doc-tab ${d.id === activeId ? 'active' : ''}`}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault()
                void io.closeDoc(d.id)
              }
            }}
            onClick={() => set({ activeId: d.id, backstage: null })}
            data-tip={d.path ?? d.title}
          >
            <FileText size={14} className="doc-tab-icon" />
            <span className="doc-tab-title">{d.title}</span>
            {d.dirty && <span className="doc-tab-dirty" aria-label="Unsaved changes" />}
            <button
              className="doc-tab-close"
              onClick={(e) => {
                e.stopPropagation()
                void io.closeDoc(d.id)
              }}
              aria-label={`Close ${d.title}`}
            >
              <X size={13} />
            </button>
          </div>
        ))}
        <button className="tb-btn doc-tab-new" onClick={() => io.newDocument()} data-tip="New document" data-tip-keys="Ctrl+N">
          <Plus size={16} />
        </button>
      </div>
      <div className="drag" />
      <button className="tb-search" onClick={() => set({ palette: true })} data-tip="Search for commands, help and more" data-tip-keys="Alt+Q">
        <Search size={14} />
        <span>Search commands</span>
        <kbd>Alt+Q</kbd>
      </button>
      <div className="tb-spacer-controls" />
    </div>
  )
}
