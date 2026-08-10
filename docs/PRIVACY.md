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
