// Expo config plugin: signs the release build with your own upload key when it is provided, otherwise leaves the debug key in place.
// The key is never in the repository. The build reads four environment variables (set from GitHub secrets):
//   GN_UPLOAD_STORE_FILE, GN_UPLOAD_STORE_PASSWORD, GN_UPLOAD_KEY_ALIAS, GN_UPLOAD_KEY_PASSWORD
// Without them (normal test builds) nothing changes, so Google sign-in on test APKs keeps working with the debug key.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARK = '// withReleaseSigning';

module.exports = (config) =>
  withAppBuildGradle(config, (cfg) => {
    let s = cfg.modResults.contents;
    if (s.includes(MARK)) return cfg;
    s = s.replace(
      /signingConfigs \{\s*debug \{/,
      `signingConfigs {\n        ${MARK}\n        release {\n            if (System.getenv('GN_UPLOAD_STORE_FILE')) {\n                storeFile file(System.getenv('GN_UPLOAD_STORE_FILE'))\n                storePassword System.getenv('GN_UPLOAD_STORE_PASSWORD')\n                keyAlias System.getenv('GN_UPLOAD_KEY_ALIAS')\n                keyPassword System.getenv('GN_UPLOAD_KEY_PASSWORD')\n            }\n        }\n        debug {`,
    );
    s = s.replace(
      /release \{\s*\/\/ Caution! In production[^\n]*\n[^\n]*\n\s*signingConfig signingConfigs\.debug/,
      (m) => m.replace('signingConfig signingConfigs.debug', "signingConfig System.getenv('GN_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug"),
    );
    cfg.modResults.contents = s;
    return cfg;
  });
