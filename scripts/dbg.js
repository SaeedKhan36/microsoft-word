const pe = window.__pe
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
console.log('step0', JSON.stringify({ docs: pe.useApp.getState().docs.length, bs: pe.useApp.getState().backstage }))
pe.io.newDocument('blank')
console.log('step1 created')
await wait(300)
console.log('step2', document.querySelectorAll('.pe-doc').length)
await window.pe.dev.shot('d1')
console.log('step3')
return 'ok'
