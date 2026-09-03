-- TwoEnds — the monthly recap.
--
-- A recap is a **live view over a date range**, not a document. This table
-- stores the range and nothing else: no titles, no captions, no copy of a
-- photograph. The page queries the same tables it always did, so a recap opened
-- in five years is as correct as the day it was made — which is only true
-- because nothing sweeps a photo (migration 25) and because the generator marks
-- everything it used `kept`.
--
-- Why the window is stored rather than derived from `month`. A month that
-- produced almost nothing is not worth a page, and the rule is that its content
-- rolls into the next one rather than being skipped. That is implemented by the
-- period simply never closing: the next window starts the day after the last
-- one *ended*, so a thin June leaves July covering two months. Nothing records
-- that a month was given up on, because a second source of truth about which
-- months exist is exactly how two of them would end up disagreeing.

create table recaps (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references couples on delete cascade,

  -- The month it is *called*, as the first of that month. What somebody opening
  -- it in a year would name it.
  month      date not null,

  -- What it actually covers, inclusive at both ends. `to_date` is the monthly
  -- anniversary; `from_date` is the day after the previous recap ended, or the
  -- day they started.
  from_date  date not null,
  to_date    date not null,

  created_at timestamptz not null default now(),

  -- One per couple per month. The generator runs from two places — the app when
  -- somebody opens it, and the scheduled function that sends the push — and
  -- they are allowed to race. This is what makes the loser harmless.
  unique (couple_id, month),

  check (to_date >= from_date)
);

create index recaps_couple_idx on recaps (couple_id, to_date desc);

alter table recaps enable row level security;

create policy "members read their recaps"
  on recaps for select
  using (is_member_of(couple_id));

/*
  Members may create one.

  The scheduled function could be the only writer, and then a couple whose cron
  missed an hour would have no recap and no way to get one. The app generates it
  on open instead and the function is a convenience on top — which is the same
  shape as everything else here: the client can always do the thing, and the
  scheduler only saves somebody from having to.
*/
create policy "members create their recaps"
  on recaps for insert
  with check (is_member_of(couple_id));

/*
  No update and no delete, deliberately.

  A recap is a record that a period happened. Editing its range would silently
  change what an old page shows, and deleting one would make the next window
  swallow a month that had already been read. Unpairing takes them with the
  couple, which is the only removal that should exist.
*/

comment on table recaps is
  'One row per month recapped. Holds the window and nothing else: the page is a '
  'live view over photos, canvases, answers and capsules in that range.';
