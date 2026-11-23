// Builds a ready-to-run Windows zip from dist/win-unpacked (for building on Linux/macOS without Wine):
// sets the exe icon/version info, then zips everything into a "Personal Editor" folder.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import JSZip from 'jszip'

const root = 'dist/win-unpacked'
const exe = path.join(root, 'Personal Editor.exe')
execFileSync(process.execPath, ['scripts/set-exe-icon.mjs', exe], { stdio: 'inherit' })

const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version
const zip = new JSZip()
const folder = zip.folder('Personal Editor')
const walk = (dir, rel = '') => {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const r = rel ? `${rel}/${name}` : name
    if (fs.statSync(full).isDirectory()) walk(full, r)
    else folder.file(r, fs.readFileSync(full), { binary: true })
  }
}
walk(root)
const out = `dist/Personal-Editor-${version}-win-x64.zip`
await new Promise((resolve, reject) =>
  zip
    .generateNodeStream({ type: 'nodebuffer', streamFiles: true, compression: 'DEFLATE', compressionOptions: { level: 6 } })
    .pipe(fs.createWriteStream(out))
    .on('finish', resolve)
    .on('error', reject)
)
console.log('wrote', out, (fs.statSync(out).size / 1e6).toFixed(1), 'MB')
