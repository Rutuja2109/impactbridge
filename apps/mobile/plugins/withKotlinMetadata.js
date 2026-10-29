// Expo config plugin: lets every Kotlin module read libraries built with a newer Kotlin than Expo SDK 58 ships.
// Firebase Auth for Android 25 (pulled in by @react-native-firebase/auth) is compiled with a newer Kotlin metadata version, and
// without this the build stops with "Module was compiled with an incompatible version of Kotlin".
const { withProjectBuildGradle } = require('expo/config-plugins');

const MARK = '// withKotlinMetadata';
const SNIPPET = `
${MARK}
allprojects {
  tasks.configureEach { task ->
    if (task.name.startsWith('compile') && task.name.endsWith('Kotlin') && task.hasProperty('compilerOptions')) {
      task.compilerOptions.freeCompilerArgs.add('-Xskip-metadata-version-check')
    }
  }
}
`;

module.exports = (config) =>
  withProjectBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARK)) cfg.modResults.contents += SNIPPET;
    return cfg;
  });
