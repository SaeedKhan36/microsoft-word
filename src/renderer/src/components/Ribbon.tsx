import { useEffect, type ReactNode } from 'react'
import { ChevronUp, ChevronDown, MessageSquare, PencilLine, Eye, FilePenLine, Rows2, PanelTopClose } from 'lucide-react'
import { NodeSelection } from '@tiptap/pm/state'
import { useApp, activeDoc } from '@/state/store'
import { useActiveEditor, Dropdown, MenuList } from './ui'
import { HomeTab } from './ribbon/HomeTab'
import { InsertTab, DrawTab, DesignTab, LayoutTab } from './ribbon/InsertTabs'
import { ReferencesTab, ReviewTab, ViewTab, TableTab, PictureTab, HeaderFooterTab } from './ribbon/ReviewTabs'
import { toggleTrackChanges } from '@/state/commands'

const TABS = [
  { id: 'home', label: 'Home' },
  { id: 'insert', label: 'Insert' },
  { id: 'draw', label: 'Draw' },
  { id: 'design', label: 'Design' },
  { id: 'layout', label: 'Layout' },
  { id: 'references', label: 'References' },
  { id: 'review', label: 'Review' },
  { id: 'view', label: 'View' }
]

export function Ribbon(): ReactNode {
  const tab = useApp((s) => s.ribbonTab)
  const mode = useApp((s) => s.settings.ribbonMode)
  const collapsed = useApp((s) => s.ribbonCollapsed)
  const editingHF = useApp((s) => s.editingHeaderFooter)
  const editor = useActiveEditor()
  const doc = activeDoc()
  const rightPane = useApp((s) => s.rightPane)
  const set = useApp.getState().set

  const inTable = !!editor?.isActive('table')
  const sel = editor?.state.selection
  const imageSelected = !!(sel instanceof NodeSelection && sel.node.type.name === 'image')

  // Leave a contextual tab when its context disappears.
  useEffect(() => {
    if (tab === 'table' && !inTable) set({ ribbonTab: 'home' })
    if (tab === 'picture' && !imageSelected) set({ ribbonTab: 'home' })
    if (tab === 'headerFooter' && !editingHF) set({ ribbonTab: 'home' })
  }, [tab, inTable, imageSelected, editingHF, set])

  const contextual = [
    ...(editingHF ? [{ id: 'headerFooter', label: 'Header & Footer', color: '#0a7c86' }] : []),
    ...(inTable ? [{ id: 'table', label: 'Table', color: '#7c3aed' }] : []),
    ...(imageSelected ? [{ id: 'picture', label: 'Picture Format', color: '#c2410c' }] : [])
  ]

  const editingMode = doc?.readOnly ? 'viewing' : doc?.trackChanges ? 'reviewing' : 'editing'

  let body: ReactNode = null
  if (editor && doc) {
    switch (tab) {
      case 'home':
        body = <HomeTab editor={editor} />
        break
      case 'insert':
        body = <InsertTab editor={editor} />
        break
      case 'draw':
        body = <DrawTab editor={editor} />
        break
      case 'design':
        body = <DesignTab />
        break
      case 'layout':
        body = <LayoutTab editor={editor} />
        break
      case 'references':
        body = <ReferencesTab editor={editor} />
        break
      case 'review':
        body = <ReviewTab editor={editor} />
        break
      case 'view':
        body = <ViewTab />
        break
      case 'table':
        body = inTable ? <TableTab editor={editor} /> : null
        break
      case 'picture':
        body = <PictureTab editor={editor} />
        break
      case 'headerFooter':
        body = <HeaderFooterTab />
        break
    }
  }

  return (
    <div className={`ribbon ${mode === 'simplified' ? 'simplified' : ''} ${collapsed ? 'collapsed' : ''}`}>
      <div className="ribbon-tabs" onDoubleClick={(e) => (e.target as HTMLElement).classList.contains('ribbon-tab') && set({ ribbonCollapsed: !collapsed })}>
        <button className="ribbon-tab file" onClick={() => set({ backstage: 'home' })}>
          File
        </button>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`ribbon-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => set({ ribbonTab: t.id, ribbonCollapsed: tab === t.id ? collapsed : false })}
            disabled={!doc}
          >
            {t.label}
          </button>
        ))}
        {contextual.length > 0 && <span className="ribbon-tab-sep" />}
        {contextual.map((t) => (
          <button
            key={t.id}
            className={`ribbon-tab contextual ${tab === t.id ? 'active' : ''}`}
            style={{ '--ctx': t.color } as React.CSSProperties}
            onClick={() => set({ ribbonTab: t.id, ribbonCollapsed: false })}
          >
            {t.label}
          </button>
        ))}
        <div className="ribbon-tabs-right">
          {doc && (
            <button className="mode-pill" onClick={() => set({ rightPane: rightPane === 'comments' ? null : 'comments' })} data-tip="Comments">
              <MessageSquare size={14} /> Comments{doc.comments.length ? ` (${doc.comments.filter((c) => !c.resolved).length})` : ''}
            </button>
          )}
          {doc && (
            <Dropdown
              placement="bottom-end"
              trigger={({ toggle, ref }) => (
                <button ref={ref as never} className={`mode-pill ${editingMode}`} onClick={toggle} data-tip="Editing mode" data-tip-text="Switch between editing, reviewing (track changes) and viewing.">
                  {editingMode === 'editing' ? <PencilLine size={14} /> : editingMode === 'reviewing' ? <FilePenLine size={14} /> : <Eye size={14} />}
                  {editingMode[0].toUpperCase() + editingMode.slice(1)}
                  <ChevronDown size={12} />
                </button>
              )}
            >
              {(close) => (
                <MenuList
                  close={close}
                  items={[
                    {
                      label: 'Editing — edit the document directly',
                      icon: <PencilLine size={16} />,
                      checked: editingMode === 'editing',
                      onClick: () => {
                        useApp.getState().updateDoc(doc.id, { readOnly: false })
                        if (doc.trackChanges) toggleTrackChanges()
                      }
                    },
                    {
                      label: 'Reviewing — edits become tracked changes',
                      icon: <FilePenLine size={16} />,
                      checked: editingMode === 'reviewing',
                      onClick: () => {
                        useApp.getState().updateDoc(doc.id, { readOnly: false })
                        if (!doc.trackChanges) toggleTrackChanges()
                      }
                    },
                    {
                      label: 'Viewing — read without changing anything',
                      icon: <Eye size={16} />,
                      checked: editingMode === 'viewing',
                      onClick: () => useApp.getState().updateDoc(doc.id, { readOnly: true })
                    }
                  ]}
                />
              )}
            </Dropdown>
          )}
          <Dropdown
            placement="bottom-end"
            trigger={({ toggle, ref }) => (
              <button ref={ref as never} className="tb-btn" onClick={toggle} data-tip="Ribbon display options">
                {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </button>
            )}
          >
            {(close) => (
              <MenuList
                close={close}
                items={[
                  { label: 'Full ribbon', icon: <Rows2 size={16} />, checked: mode === 'full' && !collapsed, onClick: () => { useApp.getState().setSettings({ ribbonMode: 'full' }); set({ ribbonCollapsed: false }) } },
                  { label: 'Simplified ribbon', icon: <Rows2 size={16} />, checked: mode === 'simplified' && !collapsed, onClick: () => { useApp.getState().setSettings({ ribbonMode: 'simplified' }); set({ ribbonCollapsed: false }) } },
                  { label: 'Show tabs only', icon: <PanelTopClose size={16} />, checked: collapsed, onClick: () => set({ ribbonCollapsed: true }) }
                ]}
              />
            )}
          </Dropdown>
        </div>
      </div>
      <div className="ribbon-body">{body}</div>
    </div>
  )
}
