-- Quiet mode, which has been a promise and a column and nothing else.
--
-- The rule was decided before any of this was built: **quiet mode pauses streaks
-- with no penalty**. The arithmetic has existed since Phase 2 — `computeStreak`
-- takes a set of quiet days and steps over them, `isQuiet` and `streakLabel` are
-- written and tested — and none of it was ever reachable, because nothing in the
-- app could turn it on. `couples.quiet_until` has sat there unwritten.
--
-- It has become the more urgent kind of missing since the occasions job started
-- pushing at nine in the morning. That job checks `quiet_until` before it sends,
-- which sounds like an off switch and is not one: there was no way to set it.

-- ── why a period and not a date ──────────────────────────────────────────────

/*
  `quiet_until` alone cannot say which days *were* quiet, only when the current
  hush ends. That is enough to hold a streak while quiet mode is on and not
  enough to keep it afterwards: the moment it lapses, those days become ordinary
  missed days and the streak breaks backwards. Which is precisely the penalty the
  promise says will not happen — arriving late, silently, and looking like a bug
  in the streak rather than a hole in the model.

  So the record is the period, kept. `to_date` null means it is running now.
*/
create table quiet_periods (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references couples on delete cascade,
  from_date  date not null,
  to_date    date,
  created_at timestamptz not null default now(),

  check (to_date is null or to_date >= from_date)
);

comment on table quiet_periods is
  'When the two of them asked for silence. Kept after it ends, because a streak '
  'that survives a quiet week and then breaks the day it lifts has not been '
  'paused, it has been deferred.';

-- One open period at a time. Turning quiet mode on twice is turning it on once,
-- and two overlapping runs would double-count nothing but confuse everything.
create unique index quiet_periods_one_open_idx
  on quiet_periods (couple_id) where to_date is null;

create index quiet_periods_couple_idx on quiet_periods (couple_id, from_date desc);

alter table quiet_periods enable row level security;

-- The ordinary couple shape. Either of them may ask for quiet and either may
-- lift it: this is a thing done to the pair, not to the other person.
create policy "members read" on quiet_periods
  for select using (is_member_of(couple_id));
create policy "members insert" on quiet_periods
  for insert with check (is_member_of(couple_id));
create policy "members update" on quiet_periods
  for update using (is_member_of(couple_id)) with check (is_member_of(couple_id));
create policy "members delete" on quiet_periods
  for delete using (is_member_of(couple_id));

alter table quiet_periods replica identity full;
alter publication supabase_realtime add table quiet_periods;

/**
 * Whether the couple is in a quiet period right now.
 *
 * A function rather than a column, deliberately. `couples.adult_packs_enabled`
 * is derived by a trigger and that is right for a flag that changes when
 * somebody presses something — this one changes because a *date passes*, and
 * nothing fires a trigger at midnight. A derived column would be correct until
 * the first morning nobody touched the app, which is the only morning it
 * matters.
 */
create function is_quiet(p_couple_id uuid, p_on date default current_date)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from quiet_periods
    where couple_id = p_couple_id
      and from_date <= p_on
      and (to_date is null or to_date >= p_on)
  );
$$;

revoke execute on function is_quiet(uuid, date) from public;
grant execute on function is_quiet(uuid, date) to authenticated, service_role;

comment on column couples.quiet_until is
  'Superseded by quiet_periods, which records when a hush began as well as when '
  'it ends. Left in place rather than dropped so an older client still reading '
  'it fails safe — an unwritten null means "not quiet", which is the harmless '
  'answer. Nothing writes it any more.';
