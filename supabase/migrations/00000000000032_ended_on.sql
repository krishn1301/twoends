-- TwoEnds — a counter that can be put down.
--
-- Every number in this app is derived from an anchor at draw time. That is a
-- deliberate decision and a good one: `started_on` is a date, nothing caches a
-- label, and a widget the launcher has not redrawn since yesterday is still
-- right this morning. See the note on `occasionToday` in `Theme.kt`.
--
-- It also meant the count could never stop. A pair who had ended had exactly
-- two options: watch "161 days together" climb on the home screen every
-- morning, or delete the account — which takes the photographs, the drawings,
-- the recaps and everything either of them ever wrote with it. That is not a
-- choice anybody should be asked to make on that particular week.
--
-- So: one nullable date. While it is null nothing changes anywhere. Once it is
-- set, `timeTogether` counts to that day instead of to now, and `occasionFor`
-- returns nothing at all — no anniversary, no milestone, and above all no
-- monthly, which otherwise arrives twelve times a year to say how long a thing
-- that is over went on for.
--
-- What it deliberately does **not** do is hide, delete or lock anything. Every
-- photograph, capsule, canvas, answer and recap stays exactly where it is and
-- stays readable by both of them. This is a clock being stopped, not an
-- ending being enforced — and unsetting the column starts it again, which is a
-- property worth having on purpose.

alter table couples add column ended_on date;

comment on column couples.ended_on is
  'The day the pair ended, or null. While set, the togetherness counter stops '
  'there and no occasion ever fires again. Nothing is hidden or deleted: every '
  'row either of them made stays readable by both.';

/*
  No policy changes.

  `couples` already has a members-only update policy, so either of them can set
  this and either can clear it — which is right. A date that only one of two
  people could write would be one person deciding, on a shared row, what had
  happened to both of them.
*/
