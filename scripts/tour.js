const pe = window.__pe
const S = () => pe.useApp.getState()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = (n) => window.pe.dev.shot(n)
const errors = []
window.addEventListener('error', (e) => errors.push(String(e.message)))
S().setSettings({ theme: 'light' })
pe.io.newDocument('report')
await wait(1200)
const ed = pe.activeEditor()
for (const t of ['insert', 'draw', 'design', 'layout', 'references', 'review', 'view']) {
  S().set({ ribbonTab: t })
  await wait(250)
  await shot('t-' + t)
}
S().set({ ribbonTab: 'home' })
// table context
ed.chain().focus('end').insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
await wait(300)
S().set({ ribbonTab: 'table' })
await wait(250)
await shot('t-table')
for (const d of ['font', 'paragraph', 'pageSetup', 'equation', 'chart', 'symbol', 'shapes', 'icons', 'handwriting', 'wordCount', 'sources', 'watermark']) {
  S().openDialog(d, d === 'equation' ? { mode: 'block' } : undefined)
  await wait(350)
  await shot('d-' + d)
  S().closeDialog()
  await wait(100)
}
for (const b of ['new', 'open', 'info', 'saveas', 'export', 'options', 'about']) {
  S().set({ backstage: b })
  await wait(350)
  await shot('b-' + b)
}
S().set({ backstage: null, palette: true })
await wait(300)
await shot('p-palette')
S().set({ palette: false, view: 'read' })
await wait(500)
await shot('v-read')
S().set({ view: 'web' })
await wait(500)
await shot('v-web')
S().set({ view: 'print', editingHeaderFooter: true, ribbonTab: 'headerFooter' })
await wait(500)
await shot('v-hf')
return { errors }
