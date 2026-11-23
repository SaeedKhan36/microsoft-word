import type { ReactNode } from 'react'
import { BookOpenText, FileText, Globe, Focus, Minus, Plus, SpellCheck, FilePenLine, Check, Loader2, AlertCircle, Languages, Target } from 'lucide-react'
import { useApp, useActiveDoc } from '@/state/store'
import { setZoom, toggleFocusMode, toggleTrackChanges } from '@/state/commands'

export function StatusBar(): ReactNode {
  const doc = useActiveDoc()
  const view = useApp((s) => s.view)
  const zoom = useApp((s) => s.zoom)
  const settings = useApp((s) => s.settings)
  const sessionWords = useApp((s) => (doc ? s.sessionStartWords[doc.id] : undefined))
  const set = useApp.getState().set
  if (!doc) return <div className="statusbar" />
  const st = doc.stats
  const goal = settings.wordGoal || 0
  const written = Math.max(0, st.words - (sessionWords ?? st.words))
  const pct = goal ? Math.min(100, (written / goal) * 100) : 0
  return (
    <div className="statusbar">
      <button className="sb-item" onClick={() => useApp.getState().openDialog('goto')} data-tip="Go To" data-tip-text="Jump to a page, heading or bookmark.">
        Page {st.currentPage} of {Math.max(1, doc.pagination.pages)}
      </button>
      <button className="sb-item" onClick={() => useApp.getState().openDialog('wordCount')} data-tip="Word Count">
        {st.selectionWords ? `${st.selectionWords.toLocaleString()} of ${st.words.toLocaleString()} words` : `${st.words.toLocaleString()} word${st.words === 1 ? '' : 's'}`}
      </button>
      <button className="sb-item" onClick={() => set({ rightPane: 'spelling' })} data-tip="Spelling" data-tip-text="Check spelling in this document.">
        <SpellCheck size={14} />
      </button>
      <button className="sb-item" onClick={() => set({ backstage: 'options' })} data-tip="Language">
        <Languages size={14} /> {settings.spellLanguages[0] === 'en-GB' ? 'English (UK)' : settings.spellLanguages[0] === 'en-US' ? 'English (US)' : settings.spellLanguages[0]}
      </button>
      {doc.trackChanges && (
        <button className="sb-item on" onClick={() => toggleTrackChanges()} data-tip="Track Changes is on">
          <FilePenLine size={14} /> Track Changes: On
        </button>
      )}
      {goal > 0 && (
        <button className="sb-item" onClick={() => useApp.getState().openDialog('prompt', { kind: 'goal' })} data-tip="Writing goal" data-tip-text={`${written} of ${goal} words written this session.`}>
          <span className="goal-ring" style={{ '--p': pct } as React.CSSProperties} /> {written}/{goal}
        </button>
      )}
      {goal === 0 && (
        <button className="sb-item" onClick={() => useApp.getState().openDialog('prompt', { kind: 'goal' })} data-tip="Set a writing goal">
          <Target size={14} />
        </button>
      )}
      <span className="sb-item" aria-live="polite">
        {doc.saving === 'saving' ? (
          <>
            <Loader2 size={13} className="spin-icon" /> Saving…
          </>
        ) : doc.saving === 'error' ? (
          <>
            <AlertCircle size={13} color="var(--danger)" /> Not saved
          </>
        ) : doc.dirty ? (
          doc.path ? 'Unsaved changes' : 'Not saved yet'
        ) : doc.lastSavedAt ? (
          <>
            <Check size={13} /> Saved
          </>
        ) : null}
      </span>
      <div className="sb-right">
        <button className="sb-item" onClick={() => toggleFocusMode()} data-tip="Focus" data-tip-keys="F11">
          <Focus size={14} /> Focus
        </button>
        <span className="sb-sep" />
        <button className={`sb-item ${view === 'read' ? 'on' : ''}`} onClick={() => set({ view: 'read' })} data-tip="Read Mode">
          <BookOpenText size={15} />
        </button>
        <button className={`sb-item ${view === 'print' ? 'on' : ''}`} onClick={() => set({ view: 'print' })} data-tip="Print Layout">
          <FileText size={15} />
        </button>
        <button className={`sb-item ${view === 'web' ? 'on' : ''}`} onClick={() => set({ view: 'web' })} data-tip="Web Layout">
          <Globe size={15} />
        </button>
        <span className="sb-sep" />
        <button className="sb-item" onClick={() => setZoom(zoom - 0.1)} aria-label="Zoom out">
          <Minus size={14} />
        </button>
        <input
          className="zoom-slider"
          type="range"
          min={10}
          max={500}
          value={Math.round(zoom * 100)}
          onChange={(e) => setZoom(Number(e.target.value) / 100)}
          aria-label="Zoom"
        />
        <button className="sb-item" onClick={() => setZoom(zoom + 0.1)} aria-label="Zoom in">
          <Plus size={14} />
        </button>
        <button className="sb-item" style={{ minWidth: 46, justifyContent: 'flex-end' }} onClick={() => useApp.getState().openDialog('zoom')} data-tip="Zoom level">
          {Math.round(zoom * 100)}%
        </button>
      </div>
    </div>
  )
}
