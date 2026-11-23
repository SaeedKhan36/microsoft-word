import { useEffect, useState, type ReactNode } from 'react'
import { ScanText, FolderOpen, ClipboardPaste, Wand2, Image as ImageIcon, PenLine, Type, Sparkles, Cpu, Info } from 'lucide-react'
import { NodeSelection } from '@tiptap/pm/state'
import { Dialog, Seg } from '../ui'
import { useApp, activeEditor } from '@/state/store'
import { bytesToDataUrl, downscaleDataUrl } from '@/lib/images'
import { imageToInk, inkLineImages, recognizeImages, segmentImageLines, type HandwritingEngine, type Progress } from '@/lib/handwriting'
import type { InkStroke } from '@/lib/ink'

type Output = 'text' | 'ink' | 'image'

export function HandwritingDialog({ onClose, source, pos }: { onClose: () => void; source: 'ink' | 'image'; pos?: number }): ReactNode {
  const e = activeEditor()!
  const hasKey = !!useApp((s) => s.settings.aiApiKey)
  const [image, setImage] = useState<string | null>(null)
  const [cleaned, setCleaned] = useState<string | null>(null)
  const [useCleaned, setUseCleaned] = useState(false)
  const [output, setOutput] = useState<Output>('text')
  const [engine, setEngine] = useState<HandwritingEngine>('local')
  const [progress, setProgress] = useState<Progress | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [lineImages, setLineImages] = useState<string[]>([])

  const inkNode = source === 'ink' && pos !== undefined ? e.state.doc.nodeAt(pos) : null

  // Ink → render each written line as an image straight away.
  useEffect(() => {
    if (inkNode?.type.name === 'ink') {
      const imgs = inkLineImages((inkNode.attrs.strokes ?? []) as InkStroke[])
      setLineImages(imgs)
      if (imgs.length) setImage(imgs[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Paste an image with Ctrl+V while the dialog is open.
  useEffect(() => {
    const paste = (ev: ClipboardEvent): void => {
      const f = Array.from(ev.clipboardData?.files ?? []).find((x) => x.type.startsWith('image/'))
      if (!f) return
      ev.preventDefault()
      const r = new FileReader()
      r.onload = () => void load(String(r.result))
      r.readAsDataURL(f)
    }
    window.addEventListener('paste', paste)
    return () => window.removeEventListener('paste', paste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = async (src: string): Promise<void> => {
    setText(null)
    setError('')
    const small = await downscaleDataUrl(src, 2000, 'image/jpeg')
    setImage(small)
    const seg = await segmentImageLines(small)
    setCleaned(seg.cleaned)
    setLineImages(seg.lines)
  }

  const pickFile = async (): Promise<void> => {
    const paths = await window.pe.dialog.open({ title: 'Choose a photo or scan of handwriting', filters: [{ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }] })
    if (!paths[0]) return
    const bytes = await window.pe.fs.read(paths[0])
    const ext = paths[0].split('.').pop()!.toLowerCase()
    await load(bytesToDataUrl(bytes, ext === 'jpg' ? 'image/jpeg' : `image/${ext}`))
  }

  const pasteClipboard = async (): Promise<void> => {
    const d = await window.pe.clipboard.readImage()
    if (d) await load(d)
    else useApp.getState().toast('No picture on the clipboard. Copy a photo first.', 'info')
  }

  const recognize = async (): Promise<void> => {
    setError('')
    setText(null)
    try {
      let inputs: string[]
      if (engine === 'ai') inputs = source === 'ink' ? lineImages : [useCleaned && cleaned ? cleaned : image!]
      else inputs = lineImages.length ? lineImages : [image!]
      const lines = await recognizeImages(inputs, engine, setProgress)
      setText(lines.join('\n'))
    } catch (err) {
      setError((err as Error).message || String(err))
    } finally {
      setProgress(null)
    }
  }

  const insertText = (mode: 'replace' | 'below' | 'cursor'): void => {
    if (text === null) return
    const paras = text
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] }))
    if (!paras.length) return
    if (inkNode && pos !== undefined) {
      if (mode === 'replace') e.chain().focus().insertContentAt({ from: pos, to: pos + inkNode.nodeSize }, paras).run()
      else e.chain().focus().insertContentAt(pos + inkNode.nodeSize, paras).run()
    } else e.chain().focus().insertContent(paras).run()
    onClose()
  }

  const insertImageOrInk = async (): Promise<void> => {
    if (!image) return
    const src = useCleaned && cleaned ? cleaned : image
    if (output === 'image') {
      e.chain().focus().insertImage({ src, alt: 'Handwritten notes', layout: 'center' }).run()
      onClose()
      return
    }
    setProgress({ stage: 'Tracing handwriting into ink…' })
    await new Promise((r) => setTimeout(r, 30))
    const width = Math.min(640, (e.view.dom as HTMLElement).clientWidth - 100)
    const { strokes, height } = await imageToInk(cleaned ?? src, width)
    e.chain().focus().insertInk({ strokes, height }).run()
    setProgress(null)
    onClose()
  }

  const busy = !!progress
  return (
    <Dialog
      title={source === 'ink' ? 'Ink to Text' : 'Handwriting from Image'}
      icon={<ScanText size={20} />}
      onClose={onClose}
      size="xwide"
      footer={
        <>
          <span className="left hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {busy && <span className="spinner" />}
            {progress?.stage}
            {progress?.pct !== undefined ? ` ${Math.round(progress.pct)}%` : ''}
          </span>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          {output === 'text' || source === 'ink' ? (
            text === null ? (
              <button className="btn primary" disabled={!image || busy} onClick={() => void recognize()}>
                <Wand2 size={15} /> Recognize text
              </button>
            ) : (
              <>
                {inkNode && (
                  <button className="btn" onClick={() => insertText('below')}>
                    Insert below drawing
                  </button>
                )}
                <button className="btn primary" onClick={() => insertText(inkNode ? 'replace' : 'cursor')}>
                  {inkNode ? 'Replace drawing with text' : 'Insert text'}
                </button>
              </>
            )
          ) : (
            <button className="btn primary" disabled={!image || busy} onClick={() => void insertImageOrInk()}>
              Insert {output === 'ink' ? 'as ink' : 'picture'}
            </button>
          )}
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 20, minHeight: 360 }}>
        <div className="form">
          {source === 'image' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={() => void pickFile()}>
                <FolderOpen size={15} /> Choose photo…
              </button>
              <button className="btn" onClick={() => void pasteClipboard()}>
                <ClipboardPaste size={15} /> Paste
              </button>
            </div>
          )}
          <div
            className="preview-box"
            style={{ background: '#fff', minHeight: 260, display: 'grid', placeItems: 'center', padding: 8 }}
            onDragOver={(ev) => ev.preventDefault()}
            onDrop={(ev) => {
              ev.preventDefault()
              const f = Array.from(ev.dataTransfer.files).find((x) => x.type.startsWith('image/'))
              if (!f) return
              const r = new FileReader()
              r.onload = () => void load(String(r.result))
              r.readAsDataURL(f)
            }}
          >
            {source === 'ink' ? (
              <div style={{ display: 'grid', gap: 6, width: '100%' }}>
                {lineImages.length ? lineImages.map((l, i) => <img key={i} src={l} style={{ maxWidth: '100%', maxHeight: 70, objectFit: 'contain', border: '1px solid #eee' }} />) : <span className="hint">This drawing has no handwriting yet.</span>}
              </div>
            ) : image ? (
              <img src={useCleaned && cleaned ? cleaned : image} style={{ maxWidth: '100%', maxHeight: 340, objectFit: 'contain' }} />
            ) : (
              <div className="pane-empty">
                <ImageIcon size={30} />
                Choose, paste (Ctrl+V) or drop a photo or scan of handwritten notes.
              </div>
            )}
          </div>
          {source === 'image' && image && (
            <label className="check">
              <input type="checkbox" checked={useCleaned} onChange={(ev) => setUseCleaned(ev.target.checked)} /> Clean up (black & white, removes shadows)
              {lineImages.length > 0 && <span className="hint"> · {lineImages.length} lines detected</span>}
            </label>
          )}
        </div>
        <div className="form">
          {source === 'image' && (
            <div className="field">
              <span className="field-label">What should Personal Editor make from it?</span>
              <div className="tiles" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {(
                  [
                    ['text', <Type key="t" size={18} />, 'Typed text', 'Recognize the words'],
                    ['ink', <PenLine key="i" size={18} />, 'Editable ink', 'Trace into pen strokes'],
                    ['image', <ImageIcon key="p" size={18} />, 'Picture', 'Keep it as a photo']
                  ] as const
                ).map(([id, icon, name, desc]) => (
                  <button key={id} className={`tile ${output === id ? 'on' : ''}`} onClick={() => setOutput(id)}>
                    {icon}
                    <b style={{ fontSize: 13 }}>{name}</b>
                    <span className="hint">{desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {(output === 'text' || source === 'ink') && (
            <>
              <div className="field">
                <span className="field-label">Recognition engine</span>
                <Seg
                  value={engine}
                  onChange={setEngine}
                  options={[
                    { value: 'local', label: <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Cpu size={14} /> On this PC (fast)</span> },
                    { value: 'local-hq', label: <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Cpu size={14} /> On this PC (accurate)</span> },
                    { value: 'ai', label: <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Sparkles size={14} /> AI (most accurate)</span> }
                  ]}
                />
                <span className="hint">
                  {engine === 'local'
                    ? 'Free and offline. The first time, a small model (about 60 MB) is downloaded and kept. Works best on neat handwriting.'
                    : engine === 'local-hq'
                      ? 'Free and offline, slower but more accurate. The first time, a larger model (about 330 MB) is downloaded and kept.'
                    : hasKey
                      ? 'Sends the picture to Claude to read. Handles messy pages best. Costs a fraction of a cent per page with your API key.'
                      : 'Add your Claude API key in File → Options to use AI recognition.'}
                </span>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <span className="field-label">Recognized text {text !== null ? '— check and fix anything that was misread' : ''}</span>
                <textarea className="textarea" style={{ minHeight: 200, flex: 1 }} value={text ?? ''} placeholder={busy ? 'Working…' : 'Press “Recognize text” to read the handwriting.'} onChange={(ev) => setText(ev.target.value)} disabled={text === null} />
              </div>
              {error && <div style={{ color: 'var(--danger)', fontSize: 12.5 }}>{error}</div>}
              <div className="hint" style={{ display: 'flex', gap: 6 }}>
                <Info size={14} style={{ flex: '0 0 auto', marginTop: 1 }} />
                <span>Writing with a pen? Windows' own handwriting panel also works in Personal Editor: tap the text with your pen, or open the touch keyboard and pick the pen icon. It's free and works offline.</span>
              </div>
            </>
          )}
        </div>
      </div>
    </Dialog>
  )
}

export { NodeSelection }
