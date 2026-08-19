#!/usr/bin/env node
/**
 * Deliberately does nothing, and says why.
 *
 * This used to empty the development project: every user, every storage object,
 * guarded only by `SUPABASE_ENV=development` — which is permanently set, because
 * `pnpm test:rls` refuses to run without it. That was written when the project
 * held nothing but fixtures, and it was correct then.
 *
 * The project now holds three real couples. Nothing about the script changed;
 * only the data did, which is the whole problem with a destructive command whose
 * safety comes from a fact nobody restates. Running it from memory would have
 * deleted four months of one relationship and fifteen canvases of another.
 *
 * It is kept rather than removed so that typing the remembered command gets an
 * explanation instead of "command not found" — or, worse, instead of somebody
 * reaching for `supabase db reset` because the tool they wanted disappeared.
 */
console.error(`
wipe:dev is gone, on purpose.

It deleted every user in the project. That was fine when the project held
fixtures; it now holds three real couples, and the only thing standing between
the command and them was a flag that is permanently on.

What you probably want:

  pnpm sweep:dev            what testing left behind, listed, nothing changed
  pnpm sweep:dev --commit   remove it

That deletes only accounts it can prove were made by testing -- the leak suite's
@twoends.test users, and the empty anonymous ones a fresh APK install mints
before anybody types a name. Everything else is printed and left alone.

If you genuinely want an empty project, make a new one. It is free and it takes
a minute, and it cannot be confused with this one.
`);
process.exit(1);
