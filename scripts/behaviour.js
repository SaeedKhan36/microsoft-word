const pe = window.__pe
const S = () => pe.useApp.getState()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = {}
const errors = []
window.addEventListener('error', (e) => errors.push(String(e.message)))
pe.io.newDocument('blank')
await wait(600)
const ed = pe.activeEditor()
ed.commands.setContent('<p>The quick brown fox jumps over the lazy dog.</p><p>Second paragraph here.</p>')
await wait(200)
out.dirtyAfterSet = S().docs[0].dirty
// track changes: delete "quick " and insert text
pe.commands.toggleTrackChanges()
ed.chain().setTextSelection({ from: 5, to: 11 }).deleteSelection().run()
ed.chain().setTextSelection(1).insertContent('NEW ').run()
await wait(100)
const changes = []
ed.state.doc.descendants((n) => { if (n.isText) for (const m of n.marks) if (m.type.name === 'insertion' || m.type.name === 'deletion') changes.push(m.type.name + ':' + n.text); return true })
out.changes = changes
out.textWithTracked = ed.state.doc.textContent
ed.commands.acceptAllChanges()
out.afterAccept = ed.state.doc.firstChild.textContent
pe.commands.toggleTrackChanges()
// find & replace
ed.commands.setSearch('paragraph')
out.matches = ed.storage.search.matches.length
ed.commands.replaceAll('PARA')
out.afterReplace = ed.state.doc.lastChild.textContent
ed.commands.clearSearch()
// comment on a selection
ed.chain().setTextSelection({ from: 2, to: 8 }).run()
pe.commands.newComment()
out.comments = S().docs[0].comments.length
// undo
ed.commands.undo()
out.afterUndo = ed.state.doc.lastChild.textContent
// change case
ed.chain().setTextSelection({ from: 1, to: 10 }).run()
pe.commands.changeCase('upper')
out.upper = ed.state.doc.firstChild.textContent.slice(0, 12)
// paragraph format + indent
ed.chain().setTextSelection(3).indent().run()
out.indent = ed.getAttributes('paragraph').indentLeft
// page break → 2 pages
ed.chain().focus('end').setPageBreak().insertContent('Page two').run()
await wait(800)
out.pagesAfterBreak = S().docs[0].pagination.pages
// headings + toc page numbers
ed.chain().focus('end').insertContent('<h1>Chapter Two</h1><p>text</p>').run()
ed.chain().setTextSelection(1).insertTableOfContents().run()
await wait(900)
out.toc = Array.from(document.querySelectorAll('.pe-toc-row')).map((r) => r.textContent)
// ink to shape: draw a rough circle
const pts = []
for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2; pts.push(100 + 50 * Math.cos(a) + Math.random() * 4, 100 + 40 * Math.sin(a) + Math.random() * 4, 0.5) }
ed.chain().focus('end').insertInk({ strokes: [{ t: 'pen', c: '#000', s: 4, p: pts }] }).run()
let inkPos = -1
ed.state.doc.descendants((n, p) => { if (n.type.name === 'ink') inkPos = p; return true })
ed.commands.setNodeSelection(inkPos)
const { beautifySelectedInk } = await import('/src/editor/ext/ink.ts').catch(() => ({}))
out.inkSelected = ed.state.selection.node?.type.name
out.errors = errors
out.dirty = S().docs[0].dirty
await window.pe.dev.shot('beh')
return out
