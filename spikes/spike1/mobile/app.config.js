// Adds one build setting on top of app.json: on Windows the C++ build
// output goes to a short folder, because its file names are too long for
// Windows' 260-character path limit otherwise.
const { withAppBuildGradle } = require('expo/config-plugins')

module.exports = ({ config }) => {
  if (process.platform !== 'win32') return config
  const staging = (process.env.RANDOZ_CXX_DIR || 'S:/rz/cxx').split('\\').join('/')
  return withAppBuildGradle(config, (gradle) => {
    gradle.modResults.contents = gradle.modResults.contents.replace(
      /^android \{/m,
      `android {\n    externalNativeBuild { cmake { buildStagingDirectory "${staging}" } }`
    )
    return gradle
  })
}
