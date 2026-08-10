# Releasing

Stub until Phase 6. Runbooks land as each target becomes real.

## PWA — Phase 6

`pnpm build`, deploy `apps/web/dist/` to Cloudflare Pages. Bump the service
worker version every release or clients pin to stale code.

## Android — Phase 7

**Blocked:** no Android SDK and no compatible JDK on this machine. Installed
JDKs are 23 and JRE 8; the Android Gradle Plugin supports neither. Install
Android Studio first — it bundles a JetBrains Runtime 21 that Gradle can use.

Debug to the S9+: enable Developer Options and USB debugging, confirm the device
appears under `adb devices`, then `pnpm build && npx cap sync android && npx cap
run android`.

Release APK: generate a keystore, **store it outside the repo and back it up in
two places** — losing it means you can never update a Play listing. Then
`./gradlew assembleRelease` and `adb install -r app-release.apk`. Publish on
GitHub Releases with the SHA-256 so people can verify it.

## iOS — Phase 8

Blocked on the MacBook. Free Personal Team: 7-day build expiry, 3 apps per
device, 3 devices. Verify whether App Groups is available before designing the
widget data path.
