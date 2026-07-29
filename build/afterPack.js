// electron-builder afterPack hook.
// We have no Apple Developer cert, so electron-builder skips signing (identity: null).
// macOS on Apple Silicon refuses to launch unsigned arm64 bundles ("damaged"),
// so we apply a deep ad-hoc signature here. This produces a valid sealed bundle
// that runs after the one-time Gatekeeper "unidentified developer" prompt.
const { execFileSync } = require('child_process')
const path = require('path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  console.log(`[afterPack] deep ad-hoc signing ${appPath}`)
  execFileSync('codesign', ['--force', '--deep', '-s', '-', appPath], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' })
  console.log('[afterPack] ad-hoc signature applied and verified')
}
