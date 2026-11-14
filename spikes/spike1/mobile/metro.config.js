const { getDefaultConfig } = require('expo/metro-config')
const withBareKit = require('expo-bare-kit/metro')

// withBareKit packs worker.js (the Bare worklet) whenever Metro bundles the app.
module.exports = withBareKit(getDefaultConfig(__dirname))
