# Building the Android `.aab` ourselves (no EAS)

This repo builds a **signed Android App Bundle** on GitHub's free Linux runners —
no Expo EAS account or spend required. Under the hood it's exactly what EAS runs:
`expo prebuild` (generate the native `android/` project) → `./gradlew bundleRelease`.

- Workflow: [`.github/workflows/android-release.yml`](../.github/workflows/android-release.yml)
- Signing wired in by: [`plugins/withReleaseSigning.js`](../plugins/withReleaseSigning.js)

---

## One-time setup

### 1. Put this repo on GitHub
It has no remote yet. Create an **empty** repo under the org, then:
```bash
cd wyberai-mobile
git remote add origin https://github.com/<org>/wyberai-mobile.git
git push -u origin master
```
(GitHub Actions only runs once the code is on GitHub.)

### 2. Create an upload keystore (once — then guard it forever)
```bash
keytool -genkeypair -v \
  -keystore wyberai-upload.jks \
  -alias wyberai-upload \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storetype JKS
```
It asks for a **store password**, a **key password**, and your org details.

> ⚠️ **Back this file up somewhere safe (password manager / secure vault).**
> With Google Play App Signing, a lost *upload* key can be reset via Play support,
> but you never want to be in that spot. Do **not** commit it to git.

### 3. Add four GitHub secrets
Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | output of `base64 -w0 wyberai-upload.jks` (macOS: `base64 -i wyberai-upload.jks`) |
| `ANDROID_KEYSTORE_PASSWORD` | the store password from step 2 |
| `ANDROID_KEY_ALIAS` | `wyberai-upload` |
| `ANDROID_KEY_PASSWORD` | the key password from step 2 |

---

## Building an `.aab`

1. GitHub → **Actions** tab → **Android Release (.aab)** → **Run workflow**.
2. Wait ~20–40 min (first run is slowest; New Architecture C++ codegen compiles).
3. Open the finished run → **Artifacts** → download **`wyberai-android-aab`**.

The version code auto-increments (`eas.json`/Gradle handle this isn't used here —
version comes from `app.json` `version` + Gradle `versionCode`; bump `app.json`
`version` for user-visible releases and Gradle `versionCode` for each upload).

---

## Uploading to Google Play

1. [Play Console](https://play.google.com/console) → your app (create it if first time,
   package `com.wyberai.app`).
2. **Release → Production** (or an internal/closed testing track first) → **Create new release**.
3. Upload the `.aab`. On first upload, opt into **Play App Signing** (recommended —
   Google holds the app signing key; your keystore above is just the *upload* key).
4. Complete the required once-per-app items: **store listing** (title, description,
   screenshots, feature graphic), **privacy policy URL**, **Data safety** form,
   **content rating** questionnaire, **target audience**.
5. Roll out → Google review (hours to a few days).

> iOS is intentionally skipped for now (no value in Apple's \$99/yr without IAP).
> When that changes, note iOS `.ipa` builds require a **macOS** runner
> (`macos-latest`) — Android only needs Linux.

---

## Local build (optional, no CI)
Same result on any Linux/macOS machine with Android SDK + JDK 17:
```bash
npm ci
npx expo prebuild --platform android --no-install
cd android
./gradlew :app:bundleRelease \
  -PWYBER_UPLOAD_STORE_FILE=/abs/path/wyberai-upload.jks \
  -PWYBER_UPLOAD_STORE_PASSWORD=... \
  -PWYBER_UPLOAD_KEY_ALIAS=wyberai-upload \
  -PWYBER_UPLOAD_KEY_PASSWORD=...
# → android/app/build/outputs/bundle/release/app-release.aab
```
Without the `-P` props the release build still runs but produces an **unsigned**
bundle (fine for inspecting; not uploadable).
