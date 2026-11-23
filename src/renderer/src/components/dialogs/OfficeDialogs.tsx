import { useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { activeDoc, activeEditor, useApp } from '@/state/store'
import { allCommands } from '@/state/commands'
import { defaultPage } from '@/lib/defaults'
import { Dialog } from '../ui'

type Props = { onClose: () => void }

export function MailMerge({ onClose }: Props) {
  const [letter, setLetter] = useState(() => activeEditor()?.getText({ blockSeparator: '\n' }).trim() || 'Dear {{Name}},')
  const [data, setData] = useState('')
  const [index, setIndex] = useState(0)
  const [header, ...lines] = data.replace(/\r\n?/g, '\n').split('\n').filter(line => line.trim())
  const fields = (header || '').split('\t').map(field => field.trim())
  const rows = lines.map(line => line.split('\t'))
  const tokens = Array.from(letter.matchAll(/\{\{([^{}]+)\}\}/g), match => match[1].trim())
  const missing = tokens.find(token => !fields.includes(token))
  let error = ''
  if (!rows.length) error = 'Paste a header row and at least one recipient.'
  else if (fields.some(field => !field) || new Set(fields).size !== fields.length) error = 'Give each column a unique, nonempty heading.'
  else if (rows.some(row => row.length !== fields.length)) error = 'Each recipient needs the same number of columns as the header.'
  else if (!tokens.length) error = 'Add a field such as {{Name}} to the letter.'
  else if (missing) error = 'Missing recipient column: ' + missing
  const render = (row: string[]) => letter.replace(/\{\{([^{}]+)\}\}/g, (_, name: string) => row[fields.indexOf(name.trim())])
  function finish() {
    const doc = activeDoc()
    if (error || !doc) return
    const content: JSONContent[] = []
    for (const row of rows) {
      if (content.length) content.push({ type: 'pageBreak' })
      for (const line of render(row).split('\n')) {
        content.push({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] })
      }
    }
    useApp.getState().addDoc({ title: doc.title + ' — letters', dirty: true, page: doc.page, styles: doc.styles, initial: { json: { type: 'doc', content } } })
    onClose()
  }
  return <Dialog title="Mail Merge" onClose={onClose} size="wide" footer={<button className="btn primary" disabled={!!error} onClick={finish}>Create merged document</button>}>
    <label>Plain-text letter <textarea rows={5} style={{ width: '100%' }} value={letter} onChange={e => setLetter(e.target.value)} /></label>
    <label>Recipients · paste cells from a spreadsheet, including column headings
      <textarea rows={4} style={{ width: '100%' }} value={data} placeholder={'Name\tCity\nSam\tMumbai'} onChange={e => { setData(e.target.value); setIndex(0) }} />
    </label>
    {error ? <p role="status">{error}</p> : <>
      <label>Preview recipient <select value={index} onChange={e => setIndex(Number(e.target.value))}>{rows.map((row, i) => <option key={i} value={i}>{i + 1}. {row[0]}</option>)}</select></label>
      <p style={{ whiteSpace: 'pre-wrap' }}>{render(rows[index])}</p>
    </>}
  </Dialog>
}

export function Shortcuts({ onClose }: Props) {
  const [query, setQuery] = useState('')
  const commands = allCommands().filter(c => c.keys && (c.label + ' ' + c.keys).toLowerCase().includes(query.toLowerCase()))
  return <Dialog title="Keyboard Shortcuts" onClose={onClose}>
    <input autoFocus aria-label="Search shortcuts" placeholder="Search commands or keys" value={query} onChange={e => setQuery(e.target.value)} />
    {commands.map(c => <p key={c.id}><kbd>{c.keys}</kbd> · {c.label}</p>)}
    {!commands.length && <p>No matching shortcuts.</p>}
  </Dialog>
}

export function Accessibility({ onClose }: Props) {
  const editor = activeEditor()
  const issues: { pos: number; label: string }[] = []
  let lastLevel = 0
  editor?.state.doc.descendants((node, pos) => {
    if (node.type.name === 'image' && !String(node.attrs.alt || '').trim()) issues.push({ pos, label: 'Picture has no alternative text' })
    if (node.type.name === 'heading') {
      if (node.attrs.level > lastLevel + 1) issues.push({ pos, label: 'Skipped heading level · ' + node.textContent })
      lastLevel = node.attrs.level
    }
  })
  return <Dialog title="Check Accessibility" onClose={onClose}>
    {issues.length === 0 && <p>Image descriptions and heading levels passed.</p>}
    {issues.map(issue => <p key={issue.pos}><button className="btn" onClick={() => {
      onClose()
      if (!editor) return
      const chain = editor.chain().focus()
      if (editor.state.doc.nodeAt(issue.pos)?.type.name === 'image') chain.setNodeSelection(issue.pos).run()
      else chain.setTextSelection(issue.pos + 1).run()
      editor.commands.scrollIntoView()
    }}>{issue.label}</button></p>)}
  </Dialog>
}


export function AddressDocument({ labels, onClose }: Props & { labels: boolean }) {
  const [address, setAddress] = useState('')
  const title = labels ? 'Address Labels' : 'Envelope'
  const addresses = labels ? address.trim().split(/\n\s*\n/) : [address.trim()]
  function create() {
    const page = defaultPage()
    page.orientation = 'landscape'
    page.sizeName = labels ? 'Shipping label' : 'DL envelope'
    page.widthMm = labels ? 101.6 : 110
    page.heightMm = labels ? 152.4 : 220
    page.margins = labels
      ? { left: 8, right: 8, top: 12, bottom: 8 }
      : { left: 80, right: 12, top: 42, bottom: 10 }
    const content: JSONContent[] = []
    for (const entry of addresses) {
      if (content.length) content.push({ type: 'pageBreak' })
      for (const line of entry.split('\n')) content.push({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] })
    }
    useApp.getState().addDoc({ title, page, dirty: true, initial: { json: { type: 'doc', content } } })
    onClose()
  }
  return <Dialog title={title} onClose={onClose} footer={<button className="btn primary" disabled={!address.trim()} onClick={create}>Create document</button>}>
    <label>{labels ? 'Addresses · separate each 6 × 4 inch label with a blank line' : 'Delivery address · DL envelope (220 × 110 mm)'}
      <textarea autoFocus rows={7} style={{ width: '100%' }} value={address} onChange={e => setAddress(e.target.value)} />
    </label>
  </Dialog>
}
