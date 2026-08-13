# TwoEnds — project memory

## What this is

A free couple app. Two people, one shared space. No paid tier, ever.

The thesis, in one line: **make it feel like the other person is nearby without
either of them having to open the app.** That is why home-screen widgets are the
core feature and not a bonus. A version of this without widgets is a chat app
with extra steps.

Full spec: `COUPLE_APP_BUILD_PLAN.md` (in the owner's Downloads, not the repo).
This file is the living memory — it wins where the two disagree, because the
plan was written before Phase 0 and this is updated after every phase.

## Decisions locked

| Question        | Answer                                                                                                                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name            | **TwoEnds**. Package id `com.twoends.app` — free to change until a Play listing exists.                                                                                                                                                                 |
| Audience        | **Small circle of friends.** Real pairs, no strangers. No moderation, no abuse reporting, no store review at 1.0.                                                                                                                                       |
| Backend         | **Supabase free tier.**                                                                                                                                                                                                                                 |
| Photo retention | **30 days**, auto-deleted unless either partner taps "keep".                                                                                                                                                                                            |
| Location        | **Opt-in per person, off by default, foreground-only, city-level** unless both opt into precise. The widget shows distance, never position.                                                                                                             |
| 18+ packs       | **Built, gated.** Both confirm 18+, both opt in, off by default, never surfaced in widgets or notifications. Store age-rating decision deferred.                                                                                                        |
| Streaks         | **Two missed days a month are forgiven.** Quiet mode pauses streaks with no penalty.                                                                                                                                                                    |
| Design          | **Bento, on true black.** Section titles with "All ›", rails of uniform cards with the next peeking, lowercase eyebrow + serif headline. Structure from candle; colour is ours — every surface is your accent, their accent, or a gradient across both. |
| Language        | **English only, hardcoded.** No i18n layer. Adding one later means touching every component; that cost was accepted knowingly.                                                                                                                          |
| Timeline        | **Bursty.** Every phase must end shippable. This file is the resume point.                                                                                                                                                                              |

## Feature set

**In, and committed** — snaps (daily photo), canvas, anniversary counter,
special-day countdowns, streak, journal with map entries, distance apart. Plus
the spine: pairing, onboarding, the daily question with a both-must-answer
reveal, offline-first, full export, real delete, and no paywall surface anywhere.

**Out** — thumb kiss (F7 in the plan) is dropped. No `thumb_events` table, no
realtime broadcast channel for it, no haptics adapter, no widget. Supabase
Realtime is still needed for sync, so this does not change Phase 3.

**Android widgets, six, in Phase 7** — snaps · canvas · anniversary counter ·
countdown · streak · distance. Journal is in-app only.

## Stack

React 19 + TypeScript + Vite 8 + Tailwind 4, Dexie local-first, Supabase,
Capacitor 8, Glance for Android widgets, WidgetKit for iOS.

`pnpm check` = typecheck + lint + test. It is the gate; run it before every
commit.

## Rules

- `packages/core` has no platform imports.
- UI reads Dexie, never the network directly.
- No dependency with a paid tier we would need.
- RLS leak test must pass before any merge.
- Two pushes per person per day, hard cap.
- Never upload an original-resolution photo.

## Backend

**Hosted Supabase, no Docker — ever.**

- Project `twoends-dev`, ref `gwsiivjkpvnygklmlebl`, `ap-south-1` (Mumbai), free tier.
- Docker was uninstalled. It was only ever needed for `supabase start`, a local
  copy of the stack; `db push --linked`, `db query --linked` and
  `gen types --linked` all talk straight to the hosted project.
- **Free projects pause after 1 week of inactivity.** With a bursty schedule you
  will hit this. Resuming is one click in the dashboard.
- Considered and rejected: a smaller local database (PocketBase, native
  Postgres). The reason is structural — two phones in two cities means the
  backend must be internet-reachable, so a local database is a dev convenience,
  never the backend. Supabase's free tier _is_ the hosting and costs no local
  disk.

Commands: `pnpm db:push`, `pnpm db:types`, `pnpm test:rls`, `pnpm verify`.
`.env.local` holds the keys and is gitignored.

## Current phase

**Phase 7 — builds, installs, runs. Widgets not yet seen on a launcher.**
Phases 0–6 shipped.

The APK compiles (`BUILD SUCCESSFUL`, 11 MB), installs, and launches. All six
receivers are registered — confirmed with `dumpsys package com.twoends.app`. No
crash in logcat. `pnpm check` green, 81 tests.

**Test device is a Pixel 9a (Android 17), not the S9+.** `62211XEBF1F1F0`.

What is still unproven, and it is the important half: **no widget has been
placed on a home screen**, so nothing has ever called `provideGlance`. Every
drawing decision — the rounded bitmap backgrounds, the centre-crop, the scrim,
the week strip, the two-accent gradient — is untested. There is no adb command
that binds a widget; it has to be done by hand from the launcher.

Blocked on the phone having **no network at all** (Wi-Fi radio on, connected to
nothing, `Active default network: none`), so the app cannot sign in and the
widgets have no data to draw. Connect it to Wi-Fi first.

To finish: connect the Pixel to Wi-Fi, sign in, then long-press the home screen
→ Widgets → TwoEnds, and place all six.

Design decisions worth keeping: widgets read a snapshot the app pushes, never
the network — six background processes holding auth tokens is how a widget gets
uninstalled. Dates are stored as anchors and counted at draw time, so a widget
the launcher has not redrawn in a day is still correct. `allowBackup` is off,
because the snapshot holds a photo and a silent Drive copy would break the
delete promise.

---

**Phase 1 — complete.** (Historical.)

The schema, RLS and storage policies are applied to the live project and the
leak suite is green — **and proven**: a `members read` policy was deliberately
dropped, the suite went red on exactly the right assertion, and it was restored.
A leak suite that has never failed is not known to work.

Done: monorepo, toolchain, `pnpm check` green (18 tests), the Home screen in the
chosen direction, shared primitives promoted into `packages/ui`, docs stubs.
Losing candidates deleted rather than kept.

Design history worth remembering, because it cost two full rounds: the first
three shells were built from numbers, dots and hairline rules and read as a
habit tracker. Both reference apps put a **face, a photograph or a hand-made
mark** in front of you within the first 200px of every screen. That, not the
palette, is what makes a couple app feel like one.

## Reference apps

Both are installed on the S9+ and are the fastest way to check a pattern:

- `com.encore.candleapp` — candle. True black, section rails, serif card
  headlines, emoji as illustration, hard paywall.
- `com.angcosmin.couple` — Couple Love. Purple gradient, avatar pair with a
  dashed line and a distance badge, a 78%-off countdown banner on the home
  screen.

`adb shell monkey -p <package> -c android.intent.category.LAUNCHER 1` to launch,
`adb exec-out screencap -p > shot.png` to capture.

## Gotchas found so far

- **Vite reads `.env.local` from `apps/web`, not the repo root.** The repo keeps
  one at the root so the app and the leak suite share it, so `vite.config.ts`
  sets `envDir` to the root. Without it `import.meta.env.VITE_*` is silently
  undefined and the app dies on a missing-key throw with no hint why.
- **`supabase db execute` does not exist** — it is `supabase db query --linked
--file x.sql`. Useful for ad-hoc policy surgery against the live project.
- **`pnpm test:rls` refuses to run** unless `.env.local` sets
  `SUPABASE_ENV=development`. The suite creates and deletes users; it must never
  point at a project holding a real couple's data.
- **`packages/core/src/database.types.ts` is generated** by `pnpm db:types` and
  is in `.prettierignore`. Reformatting it would produce a diff on every
  regeneration and bury real schema changes.
- **TypeScript is pinned to 6.x, deliberately.** TS 7.0 is `latest` and
  typechecks this repo fine, but `typescript-eslint` 8.66 refuses to load
  against the TS 7 API and `pnpm lint` dies. Revisit when typescript-eslint
  ships TS 7 support (their issue #10940).
- **Corepack cannot install pnpm here** — it writes shims to
  `C:\Program Files\nodejs` and gets EPERM without admin. `npm i -g pnpm` puts
  it in the user prefix instead, which is already on PATH.
- **Tailwind 4 has no `tailwind.config.js`.** Tokens live in the `@theme` block
  in `apps/web/src/styles/theme.css` and Tailwind emits the CSS variables. It
  also tree-shakes unused theme variables, so a token referenced only from
  hand-written CSS will not be emitted unless some utility uses it too.
- **Relative imports carry their `.ts` / `.tsx` extension.** That needs
  `allowImportingTsExtensions` + `emitDeclarationOnly`, both set in
  `tsconfig.base.json`. Nothing here ships compiled JS.
- **A bare CSS custom property cannot transition.** If a token ever needs to
  animate, register it with `@property` first so the browser has a type to
  interpolate. (The abandoned "seam" direction needed this; nothing does today.)
- **No accent can clear 4.5:1 on both a dark and a light ground** — the maths
  forbids it. Every accent in `packages/core/src/accents.ts` therefore has an
  `onDark` and an `onLight` variant. Their contrast targets are staggered on
  purpose: solving all eight to the same 4.5 makes them identically light and
  indistinguishable to a colourblind user.
- **Tailwind does not scan workspace packages.** It auto-detects sources only
  under the app it compiles in, so every utility class used inside
  `packages/ui` was missing from the bundle — tiles rendered with no width, no
  height and no clipping while the app's own classes worked. Fixed by
  `@source "../../../../packages/ui/src"` in `theme.css`. **Any new workspace
  package containing markup needs its own `@source` line**, and the failure is
  silent.
- **`aspect-square` is not a height.** `aspect-ratio` loses to content, so tiles
  with longer copy grew taller than their neighbours and text spilled past the
  rounded corners. Cards in a rail use a fixed `h-44` with an absolutely
  positioned footer.
- **`mix-blend-*` escapes a rounded clip in Chromium.** A grain overlay inside a
  `rounded-full overflow-hidden` avatar painted a black square around every
  avatar on the S9+. Blended children need their own radius, or no blend.
- **Android SDK platform-tools ARE installed**, just not on PATH:
  `C:\Users\Admin\AppData\Local\Android\platform-tools\adb.exe`. The S9+
  (SM-G965F, `star2lte`, 1080x2220 override, density 420) connects over USB.
  `adb reverse tcp:5173 tcp:5173` then `http://localhost:5173` on the phone is
  more reliable than the LAN address, and works regardless of Wi-Fi.
- **The local Android toolchain lives entirely on D:.** SDK at
  `D:\dev\android-sdk`, Gradle caches at `D:\dev\gradle`. Nothing on C:. Every
  build needs these four set, and `GRADLE_USER_HOME` is the one that silently
  eats 2 GB of C: if you forget it:

  ```
  $env:JAVA_HOME='C:\Program Files\Java\jdk-23'
  $env:ANDROID_HOME='D:\dev\android-sdk'
  $env:ANDROID_SDK_ROOT='D:\dev\android-sdk'
  $env:GRADLE_USER_HOME='D:\dev\gradle'
  ```

- **`gradlew` cannot download Gradle on this machine — use
  `D:\dev\gradle-8.14.3\bin\gradle.bat` instead.** `services.gradle.org`
  redirects to `release-assets.githubusercontent.com`, which curl reaches and
  the JDK's HTTP client does not (connect timeout, every time, on both `-all`
  and `-bin`). The distribution was fetched with curl and unzipped by hand. CI
  is unaffected — a runner downloads it fine — so the wrapper stays committed.
- **`sdkmanager` rejects JDK 23 with "Java version 17 or higher is required".**
  Its version check misparses the string; the tool prints its own escape hatch.
  Set `SKIP_JDK_VERSION_CHECK=1` and it runs perfectly on 23. There is no need
  for a second JDK — the whole "install JDK 21" plan was unnecessary.
- **`capacitor.build.gradle` pins Java to 21 and is regenerated by every `cap
  sync`.** It is applied at the *bottom* of `app/build.gradle`, so any
  `sourceCompatibility` set above it loses. Kotlin's `jvmTarget` must therefore
  be 21 too, or the build fails with "Inconsistent JVM-target compatibility".
  This does not affect which phones the APK runs on — D8 rewrites to minSdk.
- **`versionCode (x) as Integer` is a Groovy trap.** It parses as
  `versionCode(x)` followed by a cast of the *return value*, and fails with
  "Value is null" pointing at a line that looks fine. Use `versionCode = ...`.
- **The reified `actionStartActivity<T>()` is in `androidx.glance.action`**, not
  `androidx.glance.appwidget.action` — that package has only the `Intent`
  overload. Importing the wrong one gives "No type arguments expected".
- **The APK is also built in CI, and that path needs no local SDK at all.** `.github/workflows/android.yml` runs on a GitHub runner, which
  ships the JDK and the SDK already. This replaces an earlier note here claiming
  Phase 7 was blocked on installing a JDK; it never was. The sibling `Life.rpg`
  project settled this the same way and is worth reading
  (`D:\Project\Life.rpg\.github\workflows\android-release.yml`). Local Gradle
  would cost ~3 GB and C: had 2.7 GB free.
  `adb` is still needed, and is still not on PATH.
- **`apps/web/android/debug.keystore` is committed, deliberately.** Gradle
  invents a debug key in `~/.android` when none exists, and a CI runner's home
  is new every run — so every build would carry a different signature and
  Android would refuse to install it over the last one. The only way through is
  uninstalling, which wipes the pairing. Its password is `android`, the
  published convention; Play rejects APKs signed with it. The root `.gitignore`
  still blocks `*.keystore` everywhere else, via a single `!` exception.
- **`cap add android` copies the built web bundle into the native project**, and
  ESLint will happily lint minified output — 2,359 errors about `self` being
  undefined, burying every real one. `apps/web/android/` is in the ESLint
  ignores for that reason, and the copied bundle is gitignored.
- **Glance cannot use the app's fonts, and `cornerRadius` needs API 31.**
  RemoteViews only resolve fonts the launcher process can see, so the widgets
  lean on size and weight where the app leans on Fraunces. Rounded corners are
  drawn as bitmaps instead, which also happens to be how the anniversary widget
  gets its two-accent gradient.
- **The Kotlin `kotlin { compilerOptions { } }` block is top-level**, not inside
  `android { }`. Nesting it fails at configuration time with a "method not
  found" that reads as though the Kotlin plugin were missing entirely.
- **The dev loop for the S9+ is `pnpm dev` over LAN** — Vite is configured with
  `host: true`, so the phone loads `http://<laptop-ip>:5173`. Both devices must
  be on the same router.

## Open questions

- Does the free Apple Personal Team allow App Groups? Blocks the iOS widget
  approach in Phase 8. Must be verified on the actual Mac, not assumed.
- Whether to publish the 18+ packs at all, and the age rating that implies.
  Irrelevant while distribution is sideloaded APK + PWA.
