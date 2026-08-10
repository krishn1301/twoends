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

## Current phase

**Phase 0 — complete.** Ready for Phase 1 (Supabase + the RLS leak suite).

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
- **Phase 7 is still blocked on a JDK.** Installed JDKs are 23 and JRE 8; the
  Android Gradle Plugin supports neither, and there is no Android Studio.
  Install it (it bundles a JBR 21) before starting Phase 7. `adb` alone is
  enough to install and debug, not to build.
- **The dev loop for the S9+ is `pnpm dev` over LAN** — Vite is configured with
  `host: true`, so the phone loads `http://<laptop-ip>:5173`. Both devices must
  be on the same router.

## Open questions

- Does the free Apple Personal Team allow App Groups? Blocks the iOS widget
  approach in Phase 8. Must be verified on the actual Mac, not assumed.
- Whether to publish the 18+ packs at all, and the age rating that implies.
  Irrelevant while distribution is sideloaded APK + PWA.
