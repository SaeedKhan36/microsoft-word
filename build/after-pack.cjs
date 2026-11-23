// macOS: give the app an ad-hoc signature after packaging. Apple Silicon Macs refuse to run
// unsigned apps; ad-hoc signing needs no Apple developer account.
const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
  console.log('  • ad-hoc signed', app)
}
