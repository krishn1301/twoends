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

| Question        | Answer                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Name            | **TwoEnds**. Package id `com.twoends.app` — free to change until a Play listing exists.                                                          |
| Audience        | **Small circle of friends.** Real pairs, no strangers. No moderation, no abuse reporting, no store review at 1.0.                                |
| Backend         | **Supabase free tier.**                                                                                                                          |
| Photo retention | **30 days**, auto-deleted unless either partner taps "keep".                                                                                     |
| Location        | **Opt-in per person, off by default, foreground-only, city-level** unless both opt into precise. The widget shows distance, never position.      |
| 18+ packs       | **Built, gated.** Both confirm 18+, both opt in, off by default, never surfaced in widgets or notifications. Store age-rating decision deferred. |
| Streaks         | **Two missed days a month are forgiven.** Quiet mode pauses streaks with no penalty.                                                             |
| Design          | **Bento, on warm paper.** Photo-led, varied tile sizes, faces as the anchor. See "Design direction" below.                                       |
| Language        | **English only, hardcoded.** No i18n layer. Adding one later means touching every component; that cost was accepted knowingly.                   |
| Timeline        | **Bursty.** Every phase must end shippable. This file is the resume point.                                                                       |

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

## Design direction — Bento, on warm paper

Decided on the S9+ in Phase 0, after a first round was rejected.

**Why the first round failed, and the rule that came out of it.** The initial
three shells were built from numbers, dots and hairline rules — which is exactly
what a habit tracker is built from, and that is how they read. Every screen in
the reference apps is built from **faces, photographs and hand-made marks**: two
avatars joined by a dashed line with the distance sitting on it, a scribbled
drawing, a snapshot with a caption underneath.

> **Rule: a screen with no face, no photograph and no hand-made mark on it is
> probably wrong.** If a surface is only numbers, ask what human trace belongs
> there before shipping it.

**The direction:**

- Warm paper base (`--color-paper` `#F4EFEA`), not the near-black the whole
  category uses. Accents use their `onLight` variants.
- Bento layout: tiles of varied size, never a uniform grid of equal cards.
- The daily snap is the largest object on the home screen, because it is the
  thing that changed today because of the other person.
- Two avatars anchor the top, joined by a dashed line carrying the distance.
- Fraunces for statements and numbers, Karla for body, JetBrains Mono for
  anything that ticks.
- No emoji as icons. The reference apps lean on emoji heavily; we do not.

Rejected alternatives, for the record: _Letter_ (a page rather than an
interface — warmest, but hardest to keep consistent across twenty more screens)
and _Split_ (two literal columns — strongest concept for the name, but it
hard-codes a structure every later screen must honour or break).

## Current phase

**Phase 0 — closing.** Design decided; primitives not yet promoted to
`packages/ui`, deliberately, pending one more round of reference input.

Done: monorepo, toolchain, `pnpm check` green (18 tests), Bento home shell,
docs stubs, design decision recorded.

Open: review the Cloud Love app's UI for anything worth taking, refine Bento,
then promote its tokens and primitives (`Snapshot`, `Avatar`, `Faces`,
`Scribble`, currently in `apps/web/src/design/parts.tsx`) into `packages/ui`.
Phase 1 starts after that.

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
  hand-written CSS will not exist unless some utility uses it too — that is why
  the shells carry an explicit `bg-ink` / `bg-paper`.
- **Relative imports carry their `.ts` / `.tsx` extension.** That needs
  `allowImportingTsExtensions` + `emitDeclarationOnly`, both set in
  `tsconfig.base.json`. Nothing here ships compiled JS.
- **The seam animates via `@property --seam`.** A bare custom property cannot
  transition; registering it gives the browser a type to interpolate.
- **No accent can clear 4.5:1 on both a dark and a light ground** — the maths
  forbids it. Every accent in `packages/core/src/accents.ts` therefore has an
  `onDark` and an `onLight` variant. Their contrast targets are staggered on
  purpose: solving all eight to the same 4.5 makes them identically light and
  indistinguishable to a colourblind user.
- **Android toolchain is absent and Phase 7 is blocked on it.** No `adb`, no
  `ANDROID_HOME`, no Android Studio. Installed JDKs are 23 and JRE 8; the
  Android Gradle Plugin supports neither. Install Android Studio (it bundles a
  JBR 21) before starting Phase 7.
- **The dev loop for the S9+ is `pnpm dev` over LAN** — Vite is configured with
  `host: true`, so the phone loads `http://<laptop-ip>:5173`. Both devices must
  be on the same router.

## Open questions

- Does the free Apple Personal Team allow App Groups? Blocks the iOS widget
  approach in Phase 8. Must be verified on the actual Mac, not assumed.
- Whether to publish the 18+ packs at all, and the age rating that implies.
  Irrelevant while distribution is sideloaded APK + PWA.
