-- Turning quiet mode off did not turn it off.
--
-- Reported from the app: "it turned on, the feature worked exactly as intended,
-- but when I tried to turn it off it didn't work." It was not the write, and it
-- was not the reload. Both were correct, and the switch still said On.
--
-- ── the two questions ────────────────────────────────────────────────────────
--
-- A hush is ended by writing `to_date = today` rather than yesterday, on purpose:
-- the day you switched it off was still a day you had asked to be left out of,
-- and closing it behind you would take that morning back from the streak.
--
-- `is_quiet` then answered "is it on?" with `to_date >= p_on`, which for a hush
-- ended today is true. So:
--
--   1. press Turn off  → the row is written, correctly
--   2. reload          → is_quiet still says true, so the button still says On
--   3. press it again  → `endQuiet` filters on `to_date is null` and now matches
--                        nothing at all, so the second press cannot help either
--
-- Stuck until midnight, silently, with the server still refusing to send. The
-- one predicate was being asked two different questions — *is the switch on* and
-- *is this day forgiven* — and only the second one wanted the closing day.
--
-- Running means open. The forgiveness lives in `quietDays`, which still expands
-- a closed period through its last day, so nothing about the streak changes.
--
-- Why the tests did not catch it: both suites close a period on a date that is
-- not the date they then ask about. `supabase/tests/quiet.test.ts` opened on the
-- 20th, closed on the 22nd and asked about the 22nd and 23rd — every combination
-- except the one the app actually performs, which is close today and ask today.

create or replace function is_quiet(p_couple_id uuid, p_on date default current_date)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from quiet_periods
    where couple_id = p_couple_id
      -- Open. A period with a `to_date` has been lifted, including one lifted
      -- today, and the whole point of lifting it is that things start arriving
      -- again now rather than tomorrow.
      and to_date is null
      and from_date <= p_on
  );
$$;

comment on function is_quiet(uuid, date) is
  'Whether the hush is running — open, not merely recent. The day a hush is '
  'lifted stays quiet for the *streak*, via quiet_periods.to_date, and does not '
  'stay quiet for sending. Asking one predicate both questions is what made the '
  'off switch look broken.';
