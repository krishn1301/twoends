# TwoEnds

A private, two-person app for couples. Everything the paid apps in this space
gate behind a subscription is free here, permanently.

**Status: in development.** Phases 0–2 are done — the schema and its security
boundary, email sign-in, onboarding, and pairing. The daily loop, offline sync
and the home-screen widgets are not built yet.

## The one job

Make it feel like the other person is nearby, without either of them having to
open the app.

That is why home-screen widgets are the core feature rather than a bonus. A
version of this without widgets is a chat app with extra steps.

## Principles

- **Free means free.** No tier, no unlock, no "pro" badge, no ads, no upsell
  surface anywhere in the UI.
- **Two people, one pair.** No feeds, no discovery, no other users. There is no
  social graph and there never will be.
- **Offline first.** Every screen renders from local data. The network is an
  enhancement.
- **The data belongs to them.** Full export, and a delete that actually deletes.
- **Zero-to-low running cost**, because there is no revenue. Every feature is
  costed before it is built.

## Security

A couple app that leaks between couples is not a bug, it is the end of the
project. So:

- Row-level security on every table, built from one predicate — are you one of
  the two members of this couple?
- Storage is three private buckets, secured by the same predicate. Never a
  public bucket.
- A migration-time guard fails the deploy if any table has RLS switched off.
- `supabase/tests/` holds a leak suite: three users, two couples, asserting that
  a stranger reads zero rows and cannot write to any table or bucket. Every
  "they see nothing" assertion is paired with a "the partner sees it" one, so
  the suite cannot pass against an empty database.

The suite runs before every merge, and it has been made to fail on purpose to
prove it works.

## Stack

React 19 · TypeScript · Vite 8 · Tailwind 4 · Supabase · Dexie (local-first) ·
Capacitor for the Android and iOS shells · Kotlin/Glance and WidgetKit for the
widgets.

No Docker anywhere, at any phase.

## Running it

```bash
pnpm install
cp .env.example .env.local     # then fill in from your Supabase project
pnpm dev
```

| Command         | Does                                              |
| --------------- | ------------------------------------------------- |
| `pnpm check`    | typecheck, lint, unit tests — the gate            |
| `pnpm test:rls` | the cross-couple leak suite, against the database |
| `pnpm verify`   | both of the above                                 |
| `pnpm db:push`  | apply migrations                                  |
| `pnpm db:types` | regenerate types from the live schema             |
| `pnpm devlink`  | print a sign-in code without sending email        |
| `pnpm deploy`   | build and publish to GitHub Pages                 |

## Self-hosting

Point it at your own Supabase project and it is yours: apply
`supabase/migrations/` in order, fill in `.env.local`, and build. Nothing here
phones home, there is no analytics SDK, and the only third party is the database
you chose. See `docs/SELFHOST.md`.

## Licence

Not yet chosen.
