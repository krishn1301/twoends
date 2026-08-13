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
| Location        | **Opt-in per person, off by default, foreground-only, city-level** unless both opt into precise. The widget shows distance, never position. All five rules are enforced by triggers and a read policy in migration 13, not by the client.               |
| 18+ packs       | **Built, gated.** Both confirm 18+, both opt in, off by default, never surfaced in widgets or notifications. Store age-rating decision deferred.                                                                                                        |
| Streaks         | **Two missed days a month are forgiven.** Quiet mode pauses streaks with no penalty.                                                                                                                                                                    |
| Design          | **Bento, on true black.** Section titles with "All ›", rails of uniform cards with the next peeking, lowercase eyebrow + serif headline. Structure from candle; colour is ours — every surface is your accent, their accent, or a gradient across both. |
| Language        | **English only, hardcoded.** No i18n layer. Adding one later means touching every component; that cost was accepted knowingly.                                                                                                                          |
| Timeline        | **Bursty.** Every phase must end shippable. This file is the resume point.                                                                                                                                                                              |

## Feature set

**In, and committed** — snaps (daily photo), canvas, anniversary counter,
special-day countdowns, streak, journal with map entries, distance apart, the
shared list, and **Play**: a this-or-that game with the same both-must-move
reveal, plus topic cards to talk about. Plus the spine: pairing, onboarding, the
daily question with a both-must-answer reveal, offline-first, full export, real
delete, and no paywall surface anywhere.

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

**Phase 11 done. Phase 7 is finally closed too: all six widgets have been placed
on a real launcher and drawn with real data.** Phases 0–10 shipped.

### Phase 11 — Play, and four things a person found by using the app

Everything below came from one round of feedback after real use, which is worth
noting on its own: none of it came from a test.

**1. Home's countdown was a fixture.** `useDesignModel` still served
`SAMPLE_COUNTDOWN`, so the tile showed an invented trip and an invented number
of days next to a countdown the couple had actually entered. It read as a bug
because it *was* one, and it had survived five phases because a placeholder that
looks like data never announces itself. The design model has been cut back to
identity and arithmetic — every fixture is gone from it, and the ones that would
be visible cannot come back. The tile now reads Dexie, shows the date under the
title, and opens Dates.

`soonestCountdown` lives in `db/repository.ts` because Home and the widget
snapshot both need "the next one" and the rule has a judgement in it: a
countdown stays current for a day *after* its date. Two copies of that would
drift, and the widget would count down to something the app had moved past.

**2. The shared list could not be typed into.** `Button` carries `w-full` in its
base classes, and `SharedList` added `shrink-0` on top — so in a flex row the
Add button demanded the whole width and refused to give any back, collapsing the
input to nothing. The caret was there and typing worked; you simply could not
see a character of it. Fixed with wrapper divs rather than a competing `w-auto`,
because which of two width utilities wins depends on Tailwind's emit order and
that is not a thing to rely on. **Any `Button` placed in a `flex-row` has this
bug** — it was the only one.

**3. Zoom.** Pinch and double-tap both worked, which is what made the APK feel
like a website — and worse, the rails are sized in `vw`, so a zoomed viewport
re-laid them out and clipped the cards. `user-scalable=no, maximum-scale=1` in
the viewport meta plus `touch-action: manipulation` on `body`. Android's WebView
honours the meta; iOS Safari has ignored it since iOS 10, so iPhone users keep
their accessibility zoom either way. `touch-action` is the half that stops
double-tap, which the meta tag does not cover on Android, and it also removes
the 300ms delay a tile used to wait out.

**4. Play — the fourth tab.** Both reference apps put a games section behind the
paywall; candle's upsell literally reads "unlock all questions, widgets, games".
Ours is the cheapest possible demonstration that this app means what it says.

- **This or that** — 32 two-option cards, in `packages/core/content/cards.json`.
  It is the daily question with the writing removed, so it survives the evening
  when neither of you can compose a paragraph. Nothing reveals until both have
  picked, and that is a **policy**, not a curtain: see
  `supabase/migrations/00000000000016_game.sql`. `i_have_picked` is
  security-definer for the same reason `i_have_answered` had to be — asking
  about `game_picks` from inside a policy *on* `game_picks` recurses (42P17).
- **Talk about** — topic cards that store nothing at all. They are subjects to
  read out on a call, not questions to answer; recording an answer would turn a
  conversation into homework. One button hands a topic to the daily loop.
- `game_picks` goes straight to Supabase rather than through Dexie and the
  outbox, like `asks` and `capsules`. The whole point of a pick is what the
  other person did with it, so a queued pick that reveals nothing is a spinner
  with extra steps.
- **No push on a pick.** The cap is two per person per day and a deck is 32
  cards; one evening of playing would spend both of somebody's notifications and
  silence "they answered".
- The deck order is seeded from the couple id so both phones show the same card
  in the same place.

**Two bugs the device found in Play, neither visible in code review:** picking
made the deck jump to the next card before you saw your own choice light up
(the index followed "first unfinished" and the board had just changed under it —
fixed by pinning the index on pick); and the 2×2 streak widget bottom-aligned
its content, leaving an empty top half that reads as a rendering fault.

### Phase 7 is closed: the widgets are on a home screen

The reason it had never happened is worth keeping. The widgets were registered,
installed and working — and were still reported as *"I am not getting any
options to add widgets"*, because the only route to them was: long-press an
empty part of the home screen, find Widgets, scroll to TwoEnds, press and hold,
drag. Nobody does that for an app they installed ten minutes ago.

`WidgetsPlugin.pin()` now calls `requestPinAppWidget`, and the Widgets rail on
Home is six real buttons instead of four inert pictures. The launcher still
shows its own confirmation — an app that could silently add things to your home
screen would be a worse thing to install — so the honest state after a tap is
"asked", never "added". `canPin()` asks `isRequestPinAppWidgetSupported` first,
because a button that does nothing is worse than no button.

All six were then placed on the S9+ and photographed rendering real data:
`together 1157 days` in the two-accent gradient, `countdown 13 days · Hug`, the
snap centre-cropped under its scrim, `apart 1150 km from Aanya`, the streak with
its week strip, and `aanya drew` with the drawing in her colour.

### The APK on the S9+ has found five real bugs so far

None could have been found from the PWA, and all are recorded as gotchas below.
Briefly: half the accent palette was rejected by a check constraint so a third
of new users could not create a profile at all; the manifest declared no
location permission so `navigator.geolocation` could never succeed in the native
app; a `presence` row survived a "successful" delete; the deck jumped a card on
pick; and a 2×2 widget bottom-aligned itself into looking broken.

### Phase 10 — export and delete

- `packages/core/src/zip.ts` writes the archive by hand. Deflate is *not* in it:
  core may not touch a platform API, so the caller passes in what
  `CompressionStream('deflate-raw')` produced and entries fall back to stored.
  Verified by opening the output with Windows' `Expand-Archive`, which is the
  check the unit tests cannot make.
- **`presence` is never exported.** It is the only table holding a coordinate.
- `ExportPlugin.kt` writes to Downloads via MediaStore, because an `<a download>`
  on a blob URL does nothing at all in an Android WebView.
- Unpair: one asks, the other confirms, either can call it off. Storage is
  deleted **first**, while the policies still match. Afterwards the app asks the
  server what survived and says so if anything did.

### Distance apart — done

The feature exists end to end and its privacy rules are enforced by the
database, not by the client. `pnpm check` green, **100 tests**; `pnpm test:rls`
green, **85 tests**, eight of them new and specifically about location.

What was built:

- `supabase/migrations/00000000000013_location.sql` — `presence.sharing` and
  `presence.wants_precise`, a `before insert or update` trigger that coarsens or
  erases, an `after update` trigger that re-coarsens the *partner's* stored row
  the instant they withdraw consent, and a read policy that stops matching when
  the subject is not sharing.
- `packages/core/src/distance.ts` — haversine, grid coarsening, and the
  **phrasing**. The words live in core because Home, Us and a Kotlin widget all
  have to agree on them, and a second copy in Kotlin would drift.
- `apps/web/src/db/location.ts` + `state/location.ts` — foreground-only reads.
  There is no `watchPosition` anywhere in the repo, deliberately.
- Home: the badge between the two faces is live, plus a distance card in the
  Together rail. Us: the opt-in, the precise negotiation, and the explanation.
- The widget snapshot carries `distanceLabel` / `distanceNote` — two finished
  strings. `distanceKm` was removed; the widget process is never handed a number
  it could turn back into a position.

Verified against the live database in four steps (see the trigger check in
`docs/PRIVACY.md`): one side wanting precise → coarse; both wanting → precise;
partner withdrawing → my row re-coarsened without me opening the app; sharing off
→ `lat`/`lng` null rather than stale.

**The threshold that matters:** coarse readings are never printed as a number
below `COARSE_NOISE_KM` (16 km). Rounding to the 0.1° grid moves each person by
up to ~7.9 km, so two people standing together can compute 15.7 km apart. The app
says "same city" there. The constant is 16 rather than 15 because the test
derives the worst case from `haversineKm` instead of trusting arithmetic in a
comment — and 15 did not clear it.

### Phase 7 — done. All six drawn by a real launcher.

**Test device is the S9+** (`SM-G965F`, Android 10 / API 29, `3811500229057ece`).
The Pixel 9a is no longer in play.

Every drawing decision is now proven rather than assumed: the rounded bitmap
backgrounds, the centre-crop and scrim, the week strip, the two-accent gradient.
`dumpsys appwidget | grep <Name>Receiver` returning **2** is the check — one
line for the provider, one for a bound instance. Six providers with no instances
is what "installed but never drawn" looks like, and it looks identical to
working.

**Most of the intended users are on iPhones and cannot install the APK at all**,
so every feature has to be complete in the PWA. Distance is, Play is, and the
Widgets rail is now gated on `widgetsSupported()` with an honest card in its
place rather than an advert for something the reader cannot reach.

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
- **A TypeScript array and a check constraint do not know about each other.**
  `packages/core` grew to twelve accents; `profiles.accent_key` allowed eight
  until migration 14, so a third of new users had their profile insert rejected
  and were told "Could not save that. Check your connection". Nothing failed at
  build time and nothing could. The leak suite now writes every key in
  `ACCENT_KEYS`, so adding a thirteenth without a migration goes red. **Any
  enum-shaped column duplicated in TypeScript needs a test of this shape.**
- **Capacitor's WebChromeClient can only request permissions the manifest
  declares.** With only `INTERNET` there, `navigator.geolocation` fails silently
  in the APK while working perfectly in a browser — a difference no amount of
  PWA testing reveals. `ACCESS_COARSE_LOCATION` and `ACCESS_FINE_LOCATION` are
  declared; `ACCESS_BACKGROUND_LOCATION` deliberately is not.
- **With the system location toggle off, Android's WebView never calls back at
  all** — it does not report `POSITION_UNAVAILABLE`, it times out. So the honest
  message for a timeout has to mention the switch; "try again" would have failed
  forever. Check with `adb shell settings get secure location_mode`.
- **`presence` is keyed on `profile_id`, so no sweep by `couple_id` sees it.**
  That is how a coordinate survived a delete that reported success. Migration 15
  clears it inside `confirm_unpair`. Anything else keyed per-person rather than
  per-couple needs the same separate treatment.
- **The service worker caches the app inside the Capacitor WebView.** A freshly
  installed APK can run the *previous* web bundle for one launch, which looks
  exactly like an edit that did not take. `am force-stop` and relaunch once
  before concluding anything is broken.
- **`adb exec-out screencap -p > file.png` corrupts the PNG from PowerShell** —
  the redirect adds a BOM and re-encodes. Use `adb shell screencap -p /sdcard/s.png`
  then `adb pull -a`.
- **`supabase db query --linked` swallows `raise notice`.** A `do $$ … $$` block
  that reports its findings with `raise notice` returns `"rows": []` and nothing
  else, which reads exactly like a query that did nothing. To see anything, wrap
  the logic in `create or replace function pg_temp.f() returns table (…)` and
  `return query select …` for each step, then `select * from pg_temp.f();`. This
  is how the location trigger was verified against the live database.
- **The auth rate limit on the free tier is easy to trip.** Running
  `pnpm test:rls` three times in a few minutes gets
  `Request rate limit reached` from `signInWithPassword`, and it surfaces as ten
  unrelated pairing/capsule tests failing in `beforeAll` — nothing to do with the
  policy you just changed. Wait ~3 minutes and re-run, and prefer
  `pnpm exec vitest run --config vitest.rls.config.ts supabase/tests/leak.test.ts`
  to running the whole suite while iterating.
- **`Date.now()` in a hook body fails `react-hooks/purity`.** The rule is right —
  React can render twice and get two answers. Use `useNow(interval)` from
  `state/useNow.ts`, which holds the clock in state and re-anchors to the wall
  clock on each tick.
- **`state/location.ts` deliberately does not import `state/session.ts`.**
  `session.ts` has to call `useLocation.getState().clear()` on sign-out and
  unpair, so the reverse import would be a cycle that resolves differently in the
  production bundle than in dev. That is why `useDistanceReading` takes the
  partner's name as an argument instead of reading it from the session store.
- **The dev loop for the S9+ is `pnpm dev` over LAN** — Vite is configured with
  `host: true`, so the phone loads `http://<laptop-ip>:5173`. Both devices must
  be on the same router.
- **`Button` carries `w-full` in its base classes.** Put one in a `flex-row`
  beside an input and it takes the whole row; add `shrink-0` and it refuses to
  give any back, collapsing the input to zero width. Typing still works and you
  see none of it, which is indistinguishable from a dead field. Wrap both
  children in divs — `min-w-0 flex-1` and `shrink-0` — rather than adding a
  competing `w-auto`, because which width utility wins depends on Tailwind's
  emit order.
- **A fixture that looks like data never announces itself.** `SAMPLE_COUNTDOWN`
  sat on Home for five phases showing an invented trip beside a real one, and
  the only way to notice was to know what you had typed. Every remaining fixture
  is out of `design/model.ts`; what is left is identity and arithmetic. If a
  sample value has to exist on a real screen, it needs to say so on the screen.
- **Chrome for Android honours `user-scalable=no`; iOS Safari has ignored it
  since iOS 10.** So the meta tag fixes the Android WebView and leaves iPhone
  accessibility zoom alone, which is the outcome you want anyway. It does *not*
  stop double-tap zoom on Android — that needs `touch-action: manipulation`,
  which also removes the 300ms click delay. `DrawSurface` sets `touch-action:
none` for itself and must keep doing so.
- **`requestPinAppWidget` is the only way most people will ever get a widget.**
  Six registered providers and a working app still reads as "there are no
  widgets" if the route to them is a long-press on the wallpaper. Guard it with
  `isRequestPinAppWidgetSupported`; the launcher shows its own confirmation, so
  the app can never report more than "asked".
- **`dumpsys appwidget | grep <Name>Receiver` returning 1 means never placed.**
  One line is the provider, two is provider plus a bound instance. A widget that
  has never been bound has never run `provideGlance`, and from the app's side
  that is indistinguishable from one that works.
- **A Glance `Column` with `verticalAlignment = Bottom` is right for a 2×1 strip
  and wrong for a 2×2.** The streak widget bottom-aligned itself into a tall
  black tile with an empty top half, which reads as a rendering fault. Only a
  launcher shows you this.
- **Seeding a canvas by hand needs the exact `Drawing` shape** — `{ version: 1,
  strokes: [{ color, width, points: [{x, y, p}] }] }`. `isDrawing` correctly
  rejects anything else, and the widget then draws its empty state, which looks
  like a broken widget rather than a bad fixture.
- **The service role has no `auth.uid()`,** so any `security definer` function
  that checks `is_member_of` returns nothing when called from a seeding script.
  `game_tally` looks broken that way and is not; test it from a signed-in
  client.

## Open questions

- Does the free Apple Personal Team allow App Groups? Blocks the iOS widget
  approach in Phase 8. Must be verified on the actual Mac, not assumed.
- Whether to publish the 18+ packs at all, and the age rating that implies.
  Irrelevant while distribution is sideloaded APK + PWA.
- **The APK says "This browser cannot do notifications."** Capacitor's WebView
  has no Push API, so the native app cannot register a token and never receives
  a nudge. The widgets cover that need on Android and the PWA does get Web Push
  on iOS 16.4+ once added to the Home Screen — so the design still holds — but
  it means the one platform with widgets is the one with no notifications, which
  is the opposite of what you would guess. Fixing it means a real Capacitor push
  plugin and FCM, which is a Google dependency the project has so far avoided.
