const OUT = '/tmp/claude-1000/-home-saeedkhan--t3-projects-microsoft-word/1c514bb8-c55a-4b73-8afa-eb4d7e619948/scratchpad/out'
const pe = window.__pe
const S = () => pe.useApp.getState()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = (n) => window.pe.dev.shot(n)
const log = {}
const errors = []
window.addEventListener('error', (e) => errors.push(String(e.message)))
S().setSettings({ theme: 'light' })
pe.io.newDocument('blank')
await wait(500)
const ed = pe.activeEditor()
ed.commands.setContent('<h1>Quarterly Review</h1><p>Intro paragraph with a footnote.</p><h2>Numbers</h2><ul><li><p>First bullet</p></li><li><p>Second bullet</p></li></ul><ol><li><p>One</p></li><li><p>Two</p></li></ol><p>Equation follows:</p>')
ed.chain().focus('end').run()
ed.chain().focus().insertBlockMath({ latex: 'E = mc^2' }).run()
ed.chain().focus('end').insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
ed.chain().focus('end').insertContent('<p>After table</p>').run()
ed.chain().focus('end').insertChart(pe.useApp && (await import('/src/lib/chart.ts').catch(() => null))?.sampleChart?.() || { type: 'column', title: 'Sales', labels: ['A','B','C'], series: [{ name: 'S1', values: [3,5,2], color: '#4472c4' }], width: 480, height: 280 }).run()
ed.chain().focus('end').insertInk({ height: 160, strokes: [{ t: 'pen', c: '#1a1a1a', s: 4, p: [20,40,0.5,60,80,0.5,100,40,0.5,140,90,0.5], sim: true }] }).run()
ed.chain().focus('end').insertBox({ variant: 'info' }).run()
// footnote
let fnPos = -1
ed.state.doc.descendants((n, p) => { if (n.type.name === 'paragraph' && n.textContent.startsWith('Intro')) fnPos = p + n.nodeSize - 1; return true })
ed.chain().setTextSelection(fnPos).insertContent({ type: 'footnote', attrs: { id: 'f1', text: 'This is the footnote text.' } }).run()
for (let i = 0; i < 25; i++) ed.chain().focus('end').insertContent('<p>Filler paragraph number ' + i + ' with enough words to wrap onto at least two lines of the page so pagination has real work to do.</p>').run()
// comment
pe.commands.newComment()
// track changes
pe.commands.toggleTrackChanges()
ed.chain().focus('end').insertContent('Tracked insert').run()
await wait(1500)
const doc = S().docs.find((d) => d.id === S().activeId)
log.pages = doc.pagination.pages
log.footnotes = doc.pagination.footnotes.map((f) => f.length)
log.words = doc.stats.words
// scroll to show the page 1/2 boundary
const canvas = document.querySelector('.canvas:not(.hidden-doc)')
canvas.scrollTop = 900
await wait(400)
await shot('f1-boundary')
canvas.scrollTop = 0
await wait(300)
await shot('f2-top')
S().set({ rightPane: 'comments', leftPane: true })
await wait(500)
await shot('f3-panes')
S().set({ rightPane: null, leftPane: false })
// exports
const d = S().docs.find((x) => x.id === S().activeId)
for (const k of ['ped', 'docx', 'pdf', 'html', 'md', 'txt']) {
  try {
    const ok = await pe.io.saveTo(S().docs.find((x) => x.id === d.id), OUT + '/test.' + k, k)
    const st = await window.pe.fs.stat(OUT + '/test.' + k)
    log['export_' + k] = ok + ':' + (st && st.size)
  } catch (e) { log['export_' + k] = 'ERR ' + e.message }
}
// re-open docx and ped
await pe.io.closeDoc(S().activeId).catch(() => {})
for (const k of ['ped', 'docx', 'md']) {
  const id = await pe.io.openPath(OUT + '/test.' + k)
  await wait(900)
  const dd = S().docs.find((x) => x.id === id)
  log['reopen_' + k] = dd ? { pages: dd.pagination.pages, words: dd.stats.words, notice: dd.notice } : 'FAILED'
}
await shot('f4-reopened')
log.errors = errors
log.toasts = S().toasts.map((t) => t.text)
return log
