// Expo config plugin: wire a real release signing config into the generated
// android/app/build.gradle during `expo prebuild`, so we can build a signed
// .aab ourselves (GitHub Actions / any Linux box) with NO EAS dependency.
//
// It reads the keystore + passwords from Gradle project properties, which CI
// supplies via ORG_GRADLE_PROJECT_* env vars (see .github/workflows/
// android-release.yml). Locally, if those properties are absent, the release
// build simply falls back to unsigned — so a dev `expo prebuild` never breaks.
//
// Property names: WYBER_UPLOAD_STORE_FILE / _STORE_PASSWORD / _KEY_ALIAS /
// _KEY_PASSWORD.
const { withAppBuildGradle } = require('@expo/config-plugins');

const MARKER = 'WYBER_UPLOAD_STORE_FILE';

function patchBuildGradle(contents) {
  if (contents.includes(MARKER)) return contents; // idempotent
  let src = contents;

  // 1) Point the RELEASE buildType at signingConfigs.release. Do this BEFORE
  //    adding the release signingConfig block, so the only `release {` in the
  //    file at this point is the buildTypes one (avoids ambiguity). The Expo
  //    template ships `release { … signingConfig signingConfigs.debug … }`.
  src = src.replace(
    /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/,
    '$1signingConfig signingConfigs.release'
  );

  // 2) Add a `release` entry inside signingConfigs { … }. Guarded by
  //    hasProperty so a local prebuild without the CI props still evaluates.
  src = src.replace(
    /signingConfigs\s*\{/,
    `signingConfigs {
        release {
            if (project.hasProperty('${MARKER}')) {
                storeFile file(${MARKER})
                storePassword WYBER_UPLOAD_STORE_PASSWORD
                keyAlias WYBER_UPLOAD_KEY_ALIAS
                keyPassword WYBER_UPLOAD_KEY_PASSWORD
            }
        }`
  );

  return src;
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withReleaseSigning: expected a Groovy build.gradle');
    }
    cfg.modResults.contents = patchBuildGradle(cfg.modResults.contents);
    return cfg;
  });
};
