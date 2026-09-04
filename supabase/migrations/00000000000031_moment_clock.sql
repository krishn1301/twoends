-- TwoEnds — the hour starts when somebody moves.
--
-- Migration 28 gave the moment a twenty-minute window measured from the top of
-- an hour, for both of them. The first day it ran for real it produced nothing:
-- one of them photographed the thing inside the window, the other opened the
-- app an hour later to a card that had already removed itself, and the first
-- watched their own photograph disappear off Home with it. A deadline both
-- people have to be holding their phones to meet is a deadline neither meets.
--
-- So the clock now starts on the *first photograph* and runs for an hour. The
-- hour it opens is still derived from the couple id and the date on both
-- phones, and nothing about that changes.
--
-- What does change is that the second person has to know when the first one
-- went — and cannot. `moment_shots` hides the partner's row until you have one
-- of your own (migration 28), and row-level security cannot expose one column
-- of a hidden row: a policy is a filter over rows, not over fields. There is no
-- arrangement of policies that shows Bob *when* Alice took hers while still
-- hiding *what* she took.
--
-- One function, then, returning one timestamp.

/*
  When today's moment started, or null if it has not.

  `security definer`, so it can see a row the caller's policies hide — which
  means the membership check has to be in the body rather than left to a policy,
  because this is called straight over RPC and there is no policy in the path.
  `is_member_of` is itself security definer and reads `auth.uid()`, which is
  still the caller's inside a definer function.

  What this discloses, to the one other person in the couple, is that somebody
  took today's and when. Never the photograph, never the storage path, and
  deliberately not *which* of them it was: `min(created_at)` collapses both rows
  to one number, so a caller with no shot of their own learns that a clock is
  running and nothing else. The reveal is untouched.
*/
create function moment_started_at(p_couple_id uuid, p_local_date date)
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select min(created_at) from moment_shots
  where couple_id = p_couple_id
    and local_date = p_local_date
    and is_member_of(p_couple_id);
$$;

comment on function moment_started_at(uuid, date) is
  'When the first of today''s two photographs was taken, to whoever is in the '
  'couple. One timestamp and nothing else — the reveal policy still hides the '
  'partner''s row until the caller has one of their own.';
