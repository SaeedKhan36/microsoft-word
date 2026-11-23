const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const logs = []
// Render the word "hello" in a handwriting-like font as a test line image.
const c = document.createElement('canvas'); c.width = 420; c.height = 110
const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 420, 110)
await document.fonts.load('64px Caveat')
ctx.fillStyle = '#000'; ctx.font = '64px Caveat'; ctx.fillText('hello world', 20, 75)
const img = c.toDataURL('image/png')
try {
  const mod = await window.__pe.hw()
  if (!mod) {
    // Production bundle: reach the module through the dialog's code path instead.
    return 'no module path in prod'
  }
  const t0 = Date.now()
  const r = await mod.recognizeImages([img], 'local', (p) => logs.push(p.stage + (p.pct ? ' ' + Math.round(p.pct) : '')))
  return { result: r, ms: Date.now() - t0, stages: logs.slice(-3) }
} catch (e) { return { error: String(e && e.stack || e), stages: logs.slice(-5) } }
