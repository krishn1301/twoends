# Privacy and threat model

## The threat we actually design against

Not a hacker. **A partner with physical access to the other's unlocked phone.**

That is the realistic adversary for an app like this, and it is the one most
couple apps quietly arm. Every design decision below follows from it.

The app must never become a surveillance tool:

- No read receipts on location.
- No "last opened at".
- No silent tracking of any kind.
- Nothing that answers "where were you at 9pm" better than asking would.

## Location

- **Off by default.** Opt-in per person, and each side can revoke instantly
  without telling the other first.
- **Foreground only.** No background location.
- **City-level precision** unless _both_ partners opt into precise.
- A **persistent indicator** whenever sharing is on.
- Widgets show **distance, never position** — a lock screen is readable by a
  third person standing next to you.

### How each of those is enforced — built in Phase 9

None of the five rules above is implemented as a client-side check, because a
client is the layer an attacker replaces. They live in
`supabase/migrations/00000000000013_location.sql`, in a `before insert or update`
trigger and one read policy:

| Rule                                   | Where it actually lives                                                                                                                                               |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Off by default                         | `presence.sharing boolean not null default false`, and no coordinate is stored while it is false.                                                                       |
| Revocable instantly, without warning   | Turning it off **erases** `lat`/`lng` rather than freezing them, and the partner-read policy stops matching the row entirely.                                            |
| Foreground only                        | `apps/web/src/db/location.ts` never calls `watchPosition`, and nothing schedules a read. The only caller is the foreground effect in `Home`.                            |
| City-level unless both agree           | The trigger rounds to a 0.1° grid (~11 km) and forces `precision = 'coarse'` unless **both** rows have `wants_precise`. It degrades rather than rejects — see below.     |
| Distance, never position               | The Android widget snapshot carries two finished strings, not a coordinate and not a kilometre figure. `packages/core/src/distance.ts` is the only thing that computes. |

Three details worth stating, because each one is a place this could have been
subtly wrong:

- **Consent is mutual and takes effect immediately in both directions.** When one
  partner withdraws `wants_precise`, a second trigger re-coarsens the *other*
  person's already-stored row on the spot. Waiting for their next foreground
  would leave a precise coordinate readable after consent for it was withdrawn.
- **The trigger degrades instead of raising.** If it rejected the write, one
  partner turning precise off would start failing the other's updates, and their
  position would silently freeze at its last value — which looks identical to a
  current one, and is the worst outcome available.
- **A coarse reading is never printed as a number.** Rounding to the grid moves
  each person by up to ~7.9 km, so two people standing together can compute up
  to 15.7 km apart. Below `COARSE_NOISE_KM` the app says "same city", which is
  the most the data honestly supports.

All eight of these behaviours are asserted by the leak suite against a real
hosted Postgres, under "location is opt-in, coarse, and erased when switched
off" — including that a *partner*, not merely a stranger, cannot switch sharing
on for someone else.

## Data

- Every table has row-level security on, scoped to the couple. A third user must
  read zero rows and fail every write. The Phase 1 leak suite asserts this on
  every table and bucket and runs in CI on every push.
- All storage buckets are private and reached only through short-lived signed
  URLs. Never a public bucket.
- **Unpair means delete.** Both sides confirm, shared rows are deleted, storage
  objects are deleted, the local Dexie database is wiped — then a query verifies
  nothing survived.
- **Full export**, one tap, a ZIP of JSON plus original-quality media. The data
  belongs to the couple.
- **Two things are hidden from your own partner until you have moved**: their
  answer to the daily question, and their pick in the this-or-that game. Both
  are enforced by a restrictive `select` policy — `answers` since migration 8,
  `game_picks` since 16 — because a client that receives the row and declines to
  render it has drawn a curtain, and anyone with dev tools can walk round a
  curtain. Nothing about the hidden row reaches the device: not the value, not
  its length, not the fact that it exists.

## Third parties

- **No analytics SDK.** If product signal is ever needed, self-host Plausible or
  count nothing.
- Fonts are self-hosted. The app makes no request to a third party to render its
  own text.
- The only network dependency is Supabase, and self-hosting it is documented.

## 18+ content

Both partners confirm 18+, both explicitly opt in, off by default, one tap to
turn off. These packs are never surfaced in a preview, a widget, or a
notification — the lock-screen threat above is exactly why.

## Notifications

Nudge, never nag. Hard cap of **two pushes per day per person**. Every type
individually switchable. Quiet mode silences all of them. A relationship app
that pushes guilt is a product failure.
