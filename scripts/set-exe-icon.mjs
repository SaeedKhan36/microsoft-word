// Sets the icon and version info of the Windows .exe without Wine (used when building on Linux/macOS).
import fs from 'node:fs'
import path from 'node:path'
import * as ResEdit from 'resedit'
import * as PELibrary from 'pe-library'

const exePath = process.argv[2]
const icoPath = process.argv[3] ?? 'build/icon.ico'
const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version

const exe = PELibrary.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true })
const res = PELibrary.NtExecutableResource.from(exe)
const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath))
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries)
const groupId = groups.length ? groups[0].id : 1
const lang = groups.length ? groups[0].lang : 1033
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, groupId, lang, iconFile.icons.map((i) => i.data))

const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0]
if (vi) {
  const [a, b, c] = version.split('.').map(Number)
  vi.setFileVersion(a, b, c, 0, 1033)
  vi.setProductVersion(a, b, c, 0, 1033)
  vi.setStringValues(
    { lang: 1033, codepage: 1200 },
    { FileDescription: 'Personal Editor', ProductName: 'Personal Editor', CompanyName: 'Personal Editor', OriginalFilename: path.basename(exePath), InternalName: 'Personal Editor', LegalCopyright: 'Personal use' }
  )
  vi.outputToResourceEntries(res.entries)
}
res.outputResource(exe)
fs.writeFileSync(exePath, Buffer.from(exe.generate()))
console.log('icon and version info written to', exePath)
