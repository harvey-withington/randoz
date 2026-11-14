// Build settings that app.json cannot express.
//
// 1. On Windows the C++ build output goes to a short folder, because its
//    file names are too long for Windows' 260-character path limit otherwise.
// 2. Release builds are signed with the key described in
//    ~/.randoz/signing.properties when that file exists (see docs/BUILDING.md).
//    Every build people install must use the same key, or Android refuses to
//    update the app. Without the file, release builds use the debug key.
const fs = require('fs')
const os = require('os')
const path = require('path')
const { withAppBuildGradle } = require('expo/config-plugins')

const slash = (p) => p.split(path.win32.sep).join('/')

function readSigning() {
  const file = path.join(os.homedir(), '.randoz', 'signing.properties')
  if (!fs.existsSync(file)) return null
  const props = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const at = line.indexOf('=')
    if (at > 0) props[line.slice(0, at).trim()] = line.slice(at + 1).trim()
  }
  const complete = props.storeFile && props.storePassword && props.keyAlias && props.keyPassword
  return complete ? props : null
}

module.exports = ({ config }) =>
  withAppBuildGradle(config, (gradle) => {
    let text = gradle.modResults.contents

    if (process.platform === 'win32') {
      const staging = slash(process.env.RANDOZ_CXX_DIR || 'S:/rb/cxx')
      text = text.replace('android {', `android {\n    externalNativeBuild { cmake { buildStagingDirectory "${staging}" } }`)
    }

    const signing = readSigning()
    if (signing) {
      text = text.replace(
        'signingConfigs {',
        `signingConfigs {
        release {
            storeFile file("${slash(signing.storeFile)}")
            storePassword "${signing.storePassword}"
            keyAlias "${signing.keyAlias}"
            keyPassword "${signing.keyPassword}"
        }`
      )
      // The template signs release builds with the debug key: the last
      // mention of it is inside the release build type.
      const debugKey = 'signingConfig signingConfigs.debug'
      const last = text.lastIndexOf(debugKey)
      if (last !== -1) {
        text = text.slice(0, last) + 'signingConfig signingConfigs.release' + text.slice(last + debugKey.length)
      }
    }

    gradle.modResults.contents = text
    return gradle
  })
