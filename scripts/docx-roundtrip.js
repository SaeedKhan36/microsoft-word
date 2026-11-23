const IN = '/tmp/claude-1000/-home-saeedkhan--t3-projects-microsoft-word/1c514bb8-c55a-4b73-8afa-eb4d7e619948/scratchpad/docx-in', OUT = '/tmp/claude-1000/-home-saeedkhan--t3-projects-microsoft-word/1c514bb8-c55a-4b73-8afa-eb4d7e619948/scratchpad/docx-out'
const pe = window.__pe
const S = () => pe.useApp.getState()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
S().setSettings({ theme: 'light' })
const res = {}
for (const name of ['business', 'calibre-demo']) {
  const id = await pe.io.openPath(IN + '/' + name + '.docx')
  await wait(2500)
  const d = S().docs.find((x) => x.id === id)
  res[name] = { pages: d.pagination.pages, words: d.stats.words, notice: d.notice, page: d.page.sizeName + ' ' + d.page.orientation, header: d.page.header, footer: d.page.footer }
  const canvas = document.querySelector('.canvas:not(.hidden-doc)')
  canvas.scrollTop = 0
  await wait(300)
  await window.pe.dev.shot('rt-' + name + '-1')
  for (const k of ['pdf', 'docx']) {
    const ok = await pe.io.saveTo(S().docs.find((x) => x.id === id), OUT + '/' + name + '.' + k, k)
    res[name]['out_' + k] = ok
  }
}
// Second round: open the Word file this app exported, and print it again.
const id2 = await pe.io.openPath(OUT + '/business.docx')
await wait(2500)
await pe.io.saveTo(S().docs.find((x) => x.id === id2), OUT + '/business-reexported.pdf', 'pdf')
res.reopenedExport = { pages: S().docs.find((x) => x.id === id2).pagination.pages }
return res
