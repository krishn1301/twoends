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
| Photo retention | **60 days**, and nothing sweeps them yet. Either partner may tap "keep" to opt one out for good.                                                                                                                                                        |
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

Commands: `pnpm db:push`, `pnpm db:types`, `pnpm test:rls`, `pnpm verify`,
`pnpm sweep:dev`.
`.env.local` holds the keys and is gitignored.

## Current phase

**Phases 16–18 built from `TWOENDS_FEATURES_SPEC.md`. Phase 15 and everything
before it shipped and confirmed on a paired device.**

### Phases 16–18 — retention, the monthly recap, voice notes

Built in one sitting from a written spec, in the order it gives.

- **Nothing has ever swept a photo**, which changed what phase one was. The
  schema comment says "swept by a scheduled Edge Function" and no such function
  was ever written. So the 30→60 day change (migration 25) is not a rescue, and
  the sweeper stays deliberately unbuilt: one snap a day is ~110MB a year
  against a 1GB tier. **Us → Storage** prints the number so it is noticed from
  inside the app.
- **A recap is a live view over a date range**, not a document. `recaps`
  (migration 26) stores the window and nothing else, and generating one marks
  every photo it used `kept` — which is the whole retention story finished.
- **The fold-forward rule deadlocks if you only ask about the earliest
  uncovered month.** A quiet first month is never worth a page on its own, so
  nothing is written, so the period never closes, so nothing is ever written —
  no recap, ever. `pendingWindows` offers every uncovered anniversary, all
  reaching back to the same day, and the caller takes the first that is fat
  enough. Caught by reasoning about the real couple's April before it shipped.
- **The recap's "insight" is allowed to say nothing.** Word overlap with a stop
  list, and under three days or a spread below 0.15 it makes no claim at all —
  the longest thing somebody actually wrote stands instead.
- **Save as image is hand-drawn on a canvas, not `html2canvas`.** That library
  reimplements CSS, and this app is `color-mix(in oklab, …)`, backdrop filters
  and layered gradients — the parts most worth keeping are the parts it gets
  wrong. No dependency was added for any of this.
- **Voice notes get their own table and bucket** (migration 27) rather than a
  `kind` column on `photos`. Reusing photos would have given retention and
  keeping for free and left a table called `photos` holding audio.
- **The 30-second cap is the feature, not a storage decision.** A 30s Opus clip
  is ~40KB. The cap is what makes them get sent.
- **The shared moment has no schedule table.** `momentForDay` derives the
  prompt _and_ the hour from the couple id and the date, the way `promptForDay`
  derives the question, so both phones agree with nothing passing between them.
  Two draws from one hash, not two hashes — otherwise every couple with the
  same prompt also opens at the same minute. The hours are 10–21 and there is a
  test walking a whole year to prove nobody is asked to photograph their shoes
  at three in the morning.
- **The reveal is a policy, and its positive control needs both sides seeded.**
  `moment_shots` hides the partner's row until you have one of your own —
  `i_have_shot` is `security definer` for the same 42P17 reason `i_have_answered`
  was. Seeding only one side made the leak suite's "a member can read this
  table" control fail, which looks exactly like a broken read policy and is the
  feature working. Same trap the sealed capsules had.
- **The moment's push cannot be late.** The window is twenty minutes, so a
  notification an hour after it opens is about something already gone. It is
  gated on the moment's own hour inside `occasions` rather than given a second
  cron, so two pushes never arrive on one morning.

**Phase 15 built. Phases 0–14 shipped and confirmed on a paired device.**

### Phase 15 — two looks, one switch

`TWOENDS_VISUAL_CHANGES.md` is a fifteen-item review of the live app, measured
rather than felt: the elevation tokens describe one visible plane (void →
surface is **1.13:1**), the accent is doing two jobs at once so "my colour" and
"the app's colour" are the same colour, and every empty state is a button, a
grey sentence and four hundred pixels of black.

All fifteen are built, and **all fifteen are behind a switch**, because the ask
that came with them was that the original had to still be there.
`apps/web/src/design/version.ts` holds it; the row is **Us → Look**;
`?design=classic` does the same and sticks. With `data-design` absent the app is
what shipped, token for token.

- **Item 1 was built and then reverted, which is the most useful thing the
  phase learned.** `DesignModel.chrome` made the interface a fixed warm bone so
  `myAccent` / `theirAccent` could mean authorship and nothing else. The
  argument is sound and the result was not: picking your colour on the first
  screen and watching the whole app become it is the most personal minute in
  the app, and a rule about what an accent may mean is not worth losing it.
  `chrome` still exists and now returns the person's own accent in both looks —
  kept as a named thing because the two jobs really are two jobs and a call
  site that means _interface_ should say so.
- **The lift was too far before it was right.** `void -> surface` went 1.13 →
  1.60 → **1.37**. At 1.13 a card was invisible against the page; at 1.60 it was
  pale enough that text on it read as washed out on a real phone. The test
  bounds it on _both_ sides now, because this one has been wrong in both
  directions.
- **Items 2 and 15 are pure CSS** and cost no TypeScript at all — the utilities
  already point at the variables, so redefining the tokens under
  `[data-design='v2']` carries every screen. The two elevation steps are
  deliberately lopsided (1.60 off the page, 1.22 between the surfaces): opening
  the second as wide puts `ash` under 4.5:1 on the lightest ground it sits on.
- **Item 4 is a scrim, not a table of per-accent label colours.** The ground can
  be a gradient across two accents, so there is no single colour to measure
  against; a scrim is one rule that cannot be wrong for a particular pair.
  White on citron goes from **2.03:1** to about **7:1**.
- **Item 7's reveal comes before the email ask, and does not replace it.**
  Moving the ask to "later, some quieter time" moves it to _never_ for anybody
  who does not go looking, and an anonymous account with no address is one
  cleared browser away from gone. The moment is no longer spent on a form; the
  form is what is waiting after it.
- The review's eight taste decisions are still Krishn's. What is built is one
  answer to each, and each is a constant or a branch away from another.

Verified in Chrome on a fresh pair (Ravi + Meera, two origins so the two
sessions do not share `localStorage`): the split accent, the lifted surfaces,
the seven-day strip, the three-zone distance card, the ghosted empty states, the
symmetrical Play reveal, the pairing monogram, and the switch flipping the whole
app back to the original in place. `pnpm check` green, **288 tests**.

### Phase 14 — the 18+ switch, a game about knowing each other, and comments

- **The 18+ packs are reachable.** Six prompts and a topic pack had shipped in
  every bundle since the first prompt file and been served to nobody:
  `adultEnabled` was a parameter with a default of `false` that no caller ever
  set. Consent lives on the person now — `profiles.adult_opt_in_at`, written only
  by its owner, because `update own profile` is scoped to `id = auth.uid()`.
  `couples.adult_packs_enabled` stays, derived by a trigger, and is what the app
  gates on: one value read from one row by both phones.
- **“Do you know me?”** — a third mode in Play. Five cards, you answer _as_ the
  other person, and the reveal shows both directions at once. One nullable column
  on `game_picks` rather than a new table, plus `couple_cards` for ones they
  wrote. A written card holds **no answer**: the author's answer is an ordinary
  pick, so the existing reveal policy hides it until the other person guesses.
- **Comments on snaps.** A photo used to arrive with nothing to do about it, so
  the reply happened on WhatsApp. Deliberately _not_ a both-must-move reveal, and
  cascaded from `photos` so nothing outlives the picture it is about.

`pnpm check` green, **219 tests**. RLS: 8 for the opt-in, 12 for the game, 8 for
comments, all against the live project.

### Phase 13 — a dedication, and things to find

The app was built for one person and nothing in it said so. Three registers,
kept apart deliberately, because confusing them is the only way this goes wrong:
a **dedication everyone sees** (`K for S`), **eggs anyone can find** that are
personalised to whoever finds them, and **one line only she ever sees**.

- `packages/core/src/occasions.ts` — what today is. Precedence **anniversary →
  birthday → milestone → minute**, decided rather than inherited from `if` order,
  because this couple has three occasions inside four days every April. 365 and
  730 were removed from `MILESTONES` rather than resolved against the
  anniversary: a rule that cannot fire twice beats a rule about which one wins.
- **The clock egg.** Hour = month, minute = day, _and_ the reverse when the day
  is 23 or less. Month-as-hour is the reading that always exists but is always
  before midday; for this couple that is 04:16, which nobody is awake for. The
  second reading is the one they will catch.
- `packages/core/content/dedication.json` — every non-UI word, in one file. A
  string still reading `TODO` makes its card **not appear**, rather than appear
  empty; `occasionCopy()` returns null. The eight drafts in there are written to
  be replaced and nothing else has to change when they are.
- `apps/web/src/lib/gestures.ts` — the app's first gestures. Five taps on the
  wordmark opens the colophon, holding the anniversary counter switches it to
  hours, and a thumb on each face slides them into the app's own mark.
- `apps/web/src/screens/Colophon.tsx` — the six promises from `docs/PRIVACY.md`,
  written fresh for a reader rather than a maintainer. An app that makes those
  promises only in a repo is making them to developers.
- The invisible ones: a `tEXt` chunk in every generated PNG, a comment in
  `index.html`, and a line in the export README.

**Two bugs the design caught before the code existed, both invisible in review:**

1. **A per-reader prompt pack desynchronises the two phones.** The daily question
   is `promptForDay(couple id, date, list)`, so the _list_ has to be identical on
   both handsets. Gating her questions on `isHer(myProfileId)` — the obvious way
   to write it — would have given the two of them different questions on the same
   morning, with no error anywhere and no answer ever unlocking the other. It is
   gated on the _couple_ (`isHerCouple(member_a, member_b)`) for that reason.
2. **An unseeded prompt cannot be answered at all.** `prompt_days.prompt_id` is
   `references prompts on delete restrict`, and the private pack is deliberately
   never seeded — `scripts/seed-prompts.mjs` writes a null `couple_id`, which
   migration 11 makes readable by every signed-in user. So `submitAnswer` now
   creates the row couple-scoped first. The policy does the work the hash only
   pretends to.

### Phase 11 — Play, and four things a person found by using the app

Everything below came from one round of feedback after real use, which is worth
noting on its own: none of it came from a test.

**1. Home's countdown was a fixture.** `useDesignModel` still served
`SAMPLE_COUNTDOWN`, so the tile showed an invented trip and an invented number
of days next to a countdown the couple had actually entered. It read as a bug
because it _was_ one, and it had survived five phases because a placeholder that
looks like data never announces itself. The design model has been cut back to
identity and arithmetic — every fixture is gone from it, and the ones that would
be visible cannot come back. The tile now reads Dexie, shows the date under the
title, and opens Dates.

`soonestCountdown` lives in `db/repository.ts` because Home and the widget
snapshot both need "the next one" and the rule has a judgement in it: a
countdown stays current for a day _after_ its date. Two copies of that would
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
  about `game_picks` from inside a policy _on_ `game_picks` recurses (42P17).
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
installed and working — and were still reported as _"I am not getting any
options to add widgets"_, because the only route to them was: long-press an
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

- `packages/core/src/zip.ts` writes the archive by hand. Deflate is _not_ in it:
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
  erases, an `after update` trigger that re-coarsens the _partner's_ stored row
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
sync`.** It is applied at the _bottom_ of `app/build.gradle`, so any
  `sourceCompatibility` set above it loses. Kotlin's `jvmTarget` must therefore
  be 21 too, or the build fails with "Inconsistent JVM-target compatibility".
  This does not affect which phones the APK runs on — D8 rewrites to minSdk.
- **`versionCode (x) as Integer` is a Groovy trap.** It parses as
  `versionCode(x)` followed by a cast of the _return value_, and fails with
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
  installed APK can run the _previous_ web bundle for one launch, which looks
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
- **The auth rate limit on the free tier is easy to trip, and it recovers more
  slowly than you expect.** A full `pnpm test:rls` creates about forty users;
  run it three times in a few minutes and `signInWithPassword` starts returning
  `Request rate limit reached`. It surfaces as a pile of unrelated
  pairing/capsule tests failing in `beforeAll` — nothing to do with the policy
  you just changed, and the giveaway is that the failure is always in
  `helpers.ts:72`.

  Three minutes is enough after one extra run and **not** enough after four:
  budget ten. **`pnpm test:rls <file>` takes a path** and forwards it to vitest
  (`scripts/rls.mjs` passes `process.argv.slice(2)` through), so re-run only the
  file that failed rather than spending another forty sign-ins to learn nothing.
  Calling vitest directly does not work — the env vars come from that script.

  A green _suite_ assembled from separate green _files_ is a legitimate result
  here. What is not legitimate is reading a rate-limit failure as a pass.

- **A sign-in link's destination lived in a dashboard field, not in this repo.**
  Neither `signInWithOtp` nor `updateUser` passed `emailRedirectTo`, so every
  link in every inbox went wherever Supabase's **Site URL** pointed. When that is
  wrong the symptom is a GitHub Pages _"There isn't a GitHub Pages site here"_ —
  the bare `krishn1301.github.io` with no `/twoends/` — and there is no commit,
  test or error message anywhere to grep for. It reads as "the email is broken".
  Both calls now pass `signInReturnUrl()` (`lib/supabase.ts`), built from
  `window.location.origin + import.meta.env.BASE_URL`, so the page says where it
  is and the dashboard field stops mattering. **Every origin used this way must
  also be in the project's Redirect URLs allow list** — a disallowed one is
  silently ignored and falls back to the Site URL, which is the same bug wearing
  a config that looks right. Verified: allow-listed origins come back exactly,
  `https://example.com/evil` falls back.
  **On iOS the URL bar shows only the host**, so a screenshot of the failure
  cannot tell you whether the path was there. The 404 _body_ can: GitHub's
  "isn't a GitHub Pages site here" means no repo at that path at all, whereas a
  missing path _under_ `/twoends/` serves the deployed `404.html`, which is a
  copy of `index.html` and therefore renders the app.
- **`shouldCreateUser: true` on the sign-in screen made typos into new accounts.**
  The screen's own first line is "signing back in to an account you already
  have", and it then silently built a fresh empty one for anybody who mistyped.
  Four accounts in the live project were that: the owner's own differed from his
  real one by a leading `1`, a friend never got past it, and one couple redid the
  entire onboarding four minutes later. A new account is indistinguishable from a
  successful sign-in until you notice your partner is gone. It is `false` now, and
  "Signups not allowed for otp" is humanised into a sentence that says _check the
  address letter by letter_. Nobody needs it — first open is anonymous and
  `SaveAccount` attaches the address later.
- **`pnpm wipe:dev` is gone; it is `pnpm sweep:dev` now.** The old one deleted
  every user and every storage object, guarded only by `SUPABASE_ENV=development`
  — which is permanently set because `pnpm test:rls` refuses to run without it.
  That was correct when the project held fixtures and lethal once it held three
  real couples, and _nothing about the script changed; only the data did_. The
  rule is inverted now: `sweep:dev` deletes only what it can prove testing made
  (`@twoends.test` users, and anonymous accounts with no profile and no couple),
  prints everyone it spares and why, dry-runs unless given `--commit`, and aborts
  if the classification would take a couple with it. The decision lives in
  `scripts/lib/sweep.mjs` **with tests**, because a rule about which live rows to
  destroy should not be checkable only by running it. `wipe:dev` still exists and
  refuses, so the remembered command explains itself rather than vanishing.
- **`profiles.id references auth.users on delete cascade` and `couples.member_a
references profiles on delete cascade`**, so deleting one anonymous auth user
  can take a whole couple row and everything keyed to its `couple_id` with it —
  including a _paired_ partner who has an email and did nothing wrong. `member_b`
  is `on delete set null` and merely empties the slot. Any account sweep has to
  print the couples it is about to destroy before it runs, and an "anonymous means
  disposable" rule is wrong: one anonymous account here is the `member_a` of a
  real couple, and another pair's 15 canvases and photos sit entirely in accounts
  with no email attached.
- **The widgets say it too, and that half needs no server.** `occasionToday` in
  `Theme.kt` works the day out from the anchors at draw time, so it is right on a
  morning nobody opened the app — which a label written into the snapshot at push
  time could never be. It is a **second copy of the rule in `occasions.ts`**, a
  Kotlin one, because a widget cannot run TypeScript.
  `packages/core/test/widget-occasions.test.ts` reads `Theme.kt` and fails if the
  milestone lists or the precedence order drift apart. Nobody would notice
  otherwise: both copies keep working and the only symptom is a home screen
  disagreeing with the app about day 1000, once, years from now.
- **Birthdays cross into the widget process as dates, not as a phrase** — the
  opposite of the distance rule, deliberately. Distance crosses as finished
  strings because a coordinate is dangerous and the rounding has one home. A
  birthday is a fixed date and the whole point is being right without a redraw.
- **A PostgREST query for a column that does not exist returns null, not an
  error you will see** — unless you read `error`. This has now happened twice in
  this project and cost an hour both times: once selecting `couple_id` from
  `profiles` (membership lives on `couples`), which made every user look
  profile-less, and once selecting `created_at` from `push_tokens` (it is
  `updated_at`), which made four registered devices look like zero and produced a
  confident, wrong statement about who could receive a notification. **Any
  throwaway probe script must print `error`.** A silent empty result reads
  exactly like a true empty result.
- **The monthly anniversary fires on the same day every month**, last in the
  precedence so it never displaces a birthday, a milestone or the year itself.
  It knowingly softens the sparseness argument the rest of `occasions.ts` makes:
  twelve a year against the “one interruption in the first year, not eleven” that
  cut the milestone list. A month is a unit people already count in; a hundred
  days is not. **A month too short to contain their day lands on its last** —
  skipping would quietly give a couple who started on the 31st seven a year
  instead of twelve, with nothing on screen to explain the gap.
- **Three tables shipped without leak-suite coverage before this was caught.**
  `couple_cards`, `snap_comments` and `quiet_periods` each had their own RLS
  tests and none was in `COUPLE_TABLES`, so none was in the universal sweep —
  the one that checks every couple-scoped table returns nothing to a stranger
  and refuses their writes. `leak.test.ts` has a test comparing that list
  against the API's own catalogue, and it is the thing that found it. **Adding a
  couple-scoped table means adding it to `COUPLE_TABLES` in the same commit.**
- **This or that was a deck you could finish.** 32 cards walked with Back/Next,
  one evening, and a tally that never grew again — in an app whose whole premise
  is that you come back tomorrow. It is one card a day now, via `cardForDay`,
  which is `promptForDay`'s shape: a seeded shuffle keyed on the couple id, an
  index from the date, and a modulo that brings it round. 48 ordinary cards and
  26 adult ones, plus anything they write.
- **Coming round again is a feature, not a fallback.** `cardForDay` returns a
  `cycle`, and on the second pass the card carries what each of them said the
  first time — `game_picks.picked_on`. It reveals nothing new: a repeat can only
  show a pick whose reveal was spent weeks ago.
- **The two card games were eating one deck.** `game_picks` was unique on
  `(couple, card, profile)` with no notion of _which game_, so a card played in
  This or that was spent for Know me? and the reverse. `mode` is in the key now,
  which means the board has to be **two maps** — folding both games into one
  entry per card let a guess silently overwrite a pick.
- **Splitting the reveal by game broke the game it protected, for ten minutes.**
  A written card's answer was a `match` row and its guesser only ever writes a
  `guess` row, so a per-mode reveal meant the guesser could never see the
  answer. The modelling was wrong: answering a card you wrote _is_ your move in
  the guessing game. `i_have_played` replaces `i_have_picked` and asks whether
  you finished **your own part**, which differs by person — a guess for the
  guesser, an answer for the author. That also let the half-written-row
  constraint go: it was a proxy, and the reveal is where the rule belonged.
- **Turning the 18+ packs on unlocked almost nothing you could see.** It added
  six prompts to the daily rotation — invisible — and one topic pack, leaving both
  card games untouched. There are twelve gated this-or-that cards now, in a
  **separate `thisOrThatAdult` list rather than a flag per card**, so no export or
  query has to remember to filter them out, and a test asserts none of their ids
  appear in the open deck. **Adding cards reshuffles the deck** — the order is a
  seeded shuffle of whatever list it is handed — but nothing is lost, because a
  pick is stored against the card's own id.
- **The 18+ switch lived only in Us, which is the wrong place to look for it.**
  Play names it once, at the bottom, and says plainly when it is on. A switch
  whose effect you cannot see is one people turn on twice and stop trusting.
- **Quiet mode exists now, and it needed a table rather than a date.**
  `couples.quiet_until` can say when a hush _ends_ and not which days were
  inside it — so the streak holds while quiet mode is on and breaks the morning
  it lifts, which is the penalty the promise rules out, arriving late and looking
  like a bug in the streak. `quiet_periods` keeps `from_date`/`to_date` forever,
  one open period at a time by unique index, and `quietDays()` expands them into
  the set `computeStreak` has accepted since Phase 2 and had never once been
  given.
- **Turning quiet mode off did not turn it off, and the tests stepped around
  it.** A hush is closed by writing `to_date = today` — deliberately, so the
  streak still excuses the day you came back. `is_quiet` then answered "is it
  on?" with `to_date >= p_on`, which for a hush ended today is _true_: the write
  landed, the reload came back, and the switch still said On. The second press
  could not help either, because `endQuiet` filters on `to_date is null` and from
  then on matched no rows at all. Stuck until midnight, with the server still
  refusing to send. **One predicate was being asked two different questions** —
  _is the switch on_ and _is this day forgiven_ — and only the second one wanted
  the closing day. Running means `to_date is null`; forgiveness stays in
  `quietDays`. Migration 24.
  Both suites missed it by closing a period on one date and asking about
  another — the RLS one opened on the 20th, closed on the 22nd and asserted the
  22nd and 23rd, every combination except the one the app performs, which is
  **close today and ask today**. A test for a toggle has to press it twice.
- **`toggleQuiet` threw away what the write returned**, which is the other half
  of why this arrived as "it doesn't work" rather than as an error. A refused
  write and a successful one looked identical from the screen: the button simply
  went on saying what it had said before. Any handler that flips a switch and
  discards its result can only ever fail this way.
- **The document must never scroll; the screen inside it does.** A tab bar
  anchored to the bottom sat in a different place on every screen of an iPhone
  PWA and never moved on Android. It took four attempts because three of them
  were about the bar. Measured on the device: 45 CSS px above the bottom edge on
  an empty Dates and 81 px on a Dates with one row — same screen, same session,
  a minute apart, differing only in page height. The readout in Us said
  `scale 1.000` and `overflow 0`, which killed both the zoom theory and the
  page-wider-than-the-screen theory and left the only thing that was actually
  moving: `window.innerHeight`, which iOS re-measures when the document's
  scrollability changes and which reports **797 on an 844pt iPhone 13**. No
  value of `bottom` fixes that, because `bottom` is not the part that is wrong.
  `#root` is `position: fixed; inset: 0` now, one `.screen` scrolls inside it,
  and the bar is `absolute` against the shell. Verified in Chrome: scrolling the
  screen 1200px leaves the bar's bottom edge at exactly `innerHeight`, and
  `document.scrollTop` never leaves 0. **Anything anchored to a viewport edge on
  iOS is anchored to a number that moves** unless the document cannot scroll.
- **Diagnostics beat reasoning from screenshots.** Three of those four attempts
  were plausible readings of a picture and all three were wrong. The fix came
  from six numbers — layout size, visual size, scale, sideways overflow,
  safe-area inset, dpr — printed in **Us → This screen** by
  `components/Viewport.tsx`. It is on a settings screen rather than the
  colophon, which is a page of promises and no place for a table of pixels.
  A two-person app with no analytics has no other way to learn anything about
  the devices it runs on.
- **`input[type='date']` on iOS carries an intrinsic minimum width** and ignores
  `width: 100%` when its content is wider, so a date field can hang off the edge
  of the screen. `appearance: none` plus `min-width: 0` on every input, and
  `html { overflow-x: hidden }` as the guard for the next one. This was _not_
  the tab-bar bug — the readout proved the page was never wider than the screen
  — but it is a real overflow and it is fixed.
- **The Snaps feed is short on purpose, and it is `limit = 12` in
  `recentSnaps`.** It was briefly paginated — "only 12 days ago ones are there,
  rest all disappear" is a reasonable reading from inside the app, and the
  pagination worked — and then reverted, because the shortness is the design:
  the monthly recap is where a month is seen whole, and a feed that already
  shows everything gives the recap nothing to be. Anticipation is the feature.
  **It is twelve rows, not twelve days** — three snaps in one day spends three
  of them — and nothing is deleted either way, so the recap can always reach
  back for them.
- **Nothing has ever swept a photo.** Migration 1's comment says "swept by a
  scheduled Edge Function" and no such function was ever written — the only
  `pg_cron` job in the project belongs to `occasions`. So `expires_at` is a
  promise the UI counts down to and nothing enforces, no photograph has been
  lost, and there is no backlog of gaps for a recap to fall into. Migration 25
  raised the life to **60 days** and deliberately did _not_ build the sweeper:
  a couple sending one snap a day makes about 110MB a year against a 1GB tier,
  so it is years from mattering, and **Us → Storage** now says the number so it
  is noticed from inside the app rather than from a dashboard.
- **`theme.css` sets `button, a, [role='button'] { min-height: 44px }` as plain
  CSS, and it lands after the utilities.** So on a `<button>`, `min-h-full`
  loses at equal specificity and a full-screen takeover renders in a 44px strip
  at the top of the page. It is not a Tailwind bug and it does not show up in a
  typecheck or a test — only in a browser. Anything full-bleed built on a button
  needs `fixed inset-0`, which the pairing reveal now uses.
- **A row of seven fixed-width circles fits a 360px handset and not a 320px
  one.** The streak tile is `44vw`, so a diameter chosen against one phone
  overflows the other — and the failure mode is the same broken calendar row
  that made the four-column grid wrong in the first place. `grid-cols-7` with
  `aspect-square w-full` shares the width instead. `aspect-square` is only a
  hint when the content is taller than the box, and one 8px letter never is.
- **A number in a comment is a claim nothing checks.** `theme.css` states its
  contrast ratios in prose, which is how the flat elevation was found — by
  measuring rather than looking. `apps/web/test/theme.test.ts` parses the
  stylesheet and asserts them, and it pins the six _shipped_ token values as
  well, because the promise made with a look switch is that the original is
  still exactly the original. It needs Node types, so it lives in
  `apps/web/test/` under its own `tsconfig.test.json` — the app itself has no
  Node types and must not.

- **`is_quiet()` is a function, not a derived column.** `adult_packs_enabled` is
  a column kept by a trigger, and that is right for a flag that changes when
  somebody presses something. This one changes because _a date passes_, and
  nothing fires a trigger at midnight — a derived column would be correct until
  the first morning nobody opened the app, which is the only morning it matters.
- **Both edge functions guarded on a column nothing could write.** `notify` and
  `occasions` checked `couples.quiet_until` before sending, which reads as an off
  switch and was not one. They ask `is_quiet` now, and `occasions` asks it with
  the couple's own local date and only after the hour gate — it is a round trip
  per couple, and the gate discards twenty-three hours in twenty-four.
- **The app now wishes them without being opened.** `supabase/functions/occasions`
  runs hourly via `pg_cron` + `pg_net`, acts on a couple only when it is 09:00
  _where they live_, and pushes the anniversary, either birthday and the day
  milestones. **It imports `occasionFor` from `packages/core` rather than
  restating it** — the CLI follows the relative import and uploads the whole
  package, which works only because core has no platform imports. That rule was
  written in Phase 0 for unrelated reasons and this is what it bought.
- **A scheduled function that can only be tested by firing for real will fire for
  real by accident.** A test invocation dated on a birthday put a genuine push on
  a genuine phone — and logged it, which would have silenced the true one a year
  later, because occasion pushes are once per person per key forever. It takes
  `dryRun` now, defaulted to true whenever a clock override is given, and the log
  row was deleted. `at` alone can no longer reach a device.
- **`Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` inside a function is not
  necessarily the key in `.env.local`**, so comparing a caller's bearer token
  against it fails in a way that reads as a broken caller. The scheduler carries
  `OCCASIONS_SECRET` instead — set with `supabase secrets set`, stored for cron in
  Vault as `occasions_secret`, and never in a committed file. A scheduler that
  only has to say “run” should not hold a key that reads every row.
- **The CI signature check tested for a signature Android stopped writing.** It
  grepped `META-INF` for a `.RSA`/`.EC`/`.DSA` file and called their absence “no
  signature block” — those are _v1_ JAR signatures, and AGP stops emitting them
  once minSdk is 24 or higher, because v2 signs the whole archive and lives in
  the APK Signing Block rather than in a zip entry. Ask `apksigner verify`. The
  fault sat there unseen because the step before it — missing repository secrets
  — failed in eight seconds on every run, so it had never once executed. **The
  APK workflow needs `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and
  `VITE_VAPID_PUBLIC_KEY` as Actions secrets**; all three are public by design.
- **A reveal that opens on “you have a row” breaks the moment a row can hold two
  things.** In the guessing game somebody could write the choice half, read the
  partner's row the reveal now hands them, and come back to fill in a guess they
  could no longer get wrong. Row-level security cannot see columns, so instead a
  `mode = 'guess'` row is not allowed to exist without a guess in it — then “has a
  row” means “has guessed” again and the policy is correct unchanged.
- **Row-level security cannot hide a column.** A `truth` column on `couple_cards`
  would be readable by both members the instant it was written. The author's
  answer is an ordinary `game_picks` row instead, which the reveal policy already
  protects. Any “secret field on a shared row” idea has this shape.
- **Not every feature wants the both-must-move reveal**, and copying it from the
  nearest migration is the easy mistake. Answers, picks and guesses hide because
  seeing theirs first would change what you write. A comment on a photo has
  nothing to change, so it appears immediately — and there is a test asserting
  that, so nobody “fixes” it later.
- **Anything attached to a photo must cascade from it.** Photos carry
  `expires_at` and are swept after thirty days; a comment left behind would
  survive a deletion the app reported as done.
- **The occasions are so sparse that you cannot read them in place.** The next
  one for the couple this was built for is _five months away_ — day 100 passed in
  July — and the one thing you must not do to check the words is move the date
  they are checked against, which tests the edit. `pnpm occasions` imports
  `occasions.ts` and `dedication.ts` themselves and walks the calendar forwards,
  printing what fires, when, and with which sentence. Takes a start date and two
  birthdays as arguments for any other couple. The clock egg is the one thing
  visible today: 04:16 and 16:04.
- **All four real birthdays are stored**, so the birthday occasion has data. It
  was collected at onboarding and used for nothing until now, and it would have
  been easy to build the feature on a column that was always null.
- **Anything after an `mt-auto` block is off the bottom of the screen.** The
  dedication on the pre-pairing screen was placed under the button group, which
  carries `mt-auto` — so the group was pushed to the bottom and the line after it
  went past the edge of a view that does not scroll. It rendered, it was in the
  DOM, and nobody could ever see it. Put it _inside_ the pinned block.
- **A fresh APK install mints an anonymous account before anybody does anything.**
  Five of the eleven accounts in the dev project were that — no profile, no
  couple, one per install. Harmless, but it means “delete the abandoned anonymous
  accounts” is a recurring chore rather than a one-off, and that a sweep must key
  on ids rather than on “anonymous with no partner”, which also matches a real
  person halfway through onboarding.
- **A long press on text is a text selection**, unless something refuses it.
  `select-none` alone was not enough on the S9+: Android's WebView also needs
  `-webkit-user-select` and `-webkit-touch-callout`, and without the second one
  a hold on the anniversary counter raised the selection handles over the top
  of the thing it was meant to reveal. The handlers also have to cover the
  whole card — `absolute inset-0` inside the `Tile`, not a block sized to the
  numbers, or most of the card is dead to the gesture.
- **A reveal tied to how long you hold is a thing you have to keep doing.** The
  monogram was visible for exactly as long as both faces were held, so it never
  became a moment. It is a one-shot splash now, started by the press and ended
  by its own animation — driven by a nonce with `key` on the element, because a
  boolean cannot restart an animation that is already finished.
- **Animation events bubble.** `onAnimationEnd` on a wrapper fires for its
  children too, so the inner element finishing a frame early tore down the
  backdrop mid-fade. Compare `e.target` with `e.currentTarget`. Clearing on the
  event rather than on a `setTimeout` is also what keeps the JavaScript and the
  CSS from drifting apart the next time either duration is touched.
- **A hidden gesture must not change the element it is on.** `Tile` renders an
  `<article>` unless given `onClick`, and giving it one to hold the anniversary
  counter would announce it to a screen reader as actionable and give it a focus
  ring — the exact opposite of hidden, and a promise to a keyboard user that a
  keyboard cannot keep. The handlers in `lib/gestures.ts` go on an inner `div`
  instead and the markup is unchanged.
- **A `tEXt` chunk goes between `IHDR` and `IEND` and must be Latin-1.** Every
  other string in this project has an em dash or a curly apostrophe in it, and
  `Buffer.from(s, 'latin1')` truncates each one to a byte of nonsense rather than
  failing — producing a file that still opens and still says the wrong thing.
  `scripts/lib/png.mjs` folds them down instead. The range starts at 0x20, not
  0x00: a stray NUL is read as the end of the keyword and splits one chunk into a
  different, wrong one.
- **`eslint` rejects `\u0000` inside a regex literal** (`no-control-regex`), which
  is how the Latin-1 filter above ended up starting at 0x20. That turned out to
  be the correct range anyway, but the lint error is what forced the question.
- **`localStorage` failure has no single right default.** `emailOffered()` treats
  it as _already asked_, because the cost of being wrong is nagging on every
  launch. `seenToday()` treats it as _not yet seen_, because missing your first
  anniversary is worse than being shown it twice. Two files, opposite defaults,
  both deliberate — there is a test asserting the second one so nobody
  “fixes” it into matching the first.
- **A clip-path id is global to the document, not to the component.** Two
  `Monogram`s render at once — one under Sign out and one on the colophon it
  opens — and both would use the first one's clip. `useId()`.
- **The real profile ids had leaked into `src/dedication.test.ts`**, one file away
  from the module whose whole purpose is keeping them out of the source. They now
  live only in `test/dedication-source.test.ts`, which says why it is allowed to
  hold them and asserts the hash really is her and really is not him — without
  that, one mistyped character closes the private layer silently and forever.
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
  accessibility zoom alone, which is the outcome you want anyway. It does _not_
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
