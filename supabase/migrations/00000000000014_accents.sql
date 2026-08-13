-- The palette grew and the constraint did not.
--
-- `profiles.accent_key` has allowed eight keys since migration 1. Somewhere
-- after that `packages/core/src/accents.ts` went to twelve — coral, moss,
-- cobalt and fuchsia were added to fill the gaps in the wheel, because eight
-- swatches leave holes a photo's dominant hue can land in.
--
-- Nothing failed at build time, because the app's list is TypeScript and the
-- database's is a check constraint, and neither knows the other exists. What
-- failed was onboarding, on a real phone: the accent is picked from the photo's
-- hue (or a default when there is no photo), and roughly a third of the time it
-- lands on one of the four keys the database has never heard of. The insert is
-- rejected, and the app says "Could not save that. Check your connection" —
-- which is the one thing that was definitely fine.
--
-- The fix is to make the constraint match the source of truth. The guard
-- against it drifting again is in the leak suite, which now writes every key in
-- ACCENT_KEYS and fails if any is refused — a test the app's own list drives,
-- so adding a thirteenth accent without a migration goes red.

alter table profiles drop constraint if exists profiles_accent_key_check;

alter table profiles add constraint profiles_accent_key_check
  check (accent_key in (
    'rose', 'coral', 'amber', 'citron',
    'moss', 'fern', 'teal', 'sky',
    'cobalt', 'iris', 'orchid', 'fuchsia'
  ));

comment on column profiles.accent_key is
  'One of the twelve swatches in packages/core/src/accents.ts. Stored as a key, '
  'never a hex, so the palette can be retuned without a migration — but adding '
  'or removing a key DOES need one, and the leak suite is what catches it.';
