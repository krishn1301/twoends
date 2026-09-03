-- TwoEnds — arrival mode.
--
-- The app assumes the two of them are apart, and for most of the year it is
-- right. When it is wrong it should behave differently rather than show a
-- smaller number: a distance card reading "0 km" is a worse answer than not
-- asking the question at all.
--
-- **Never triggered by GPS.** Location in this app is coarse, opt-in, off by
-- default and can be hours stale — flipping an entire interface on a signal
-- like that is worse than asking, because the failure is silent and the
-- recovery is confusing. A visit starts when one of them says so, or when a
-- countdown they set themselves reaches zero and they confirm it.
--
-- Photographs are not tagged with a visit id. They join by timestamp, which
-- costs one index and means a visit's boundaries can be corrected afterwards
-- without touching a single photo row — a foreign key here would freeze the
-- first guess at when somebody arrived.

create table visits (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references couples on delete cascade,

  started_at  timestamptz not null default now(),
  -- Null while it is happening. There is at most one of those per couple, which
  -- is what the partial unique index below enforces.
  ended_at    timestamptz,

  -- "Pune". Optional and staying optional: asking for it is one field between
  -- somebody and the thing they are trying to record, and a visit with no label
  -- is still a visit.
  place_label text,

  created_at  timestamptz not null default now(),

  check (ended_at is null or ended_at >= started_at)
);

/*
  One open visit at a time.

  The same shape `quiet_periods` uses, and for the same reason: "are we together
  right now" has to be a question with one answer, and two open rows would make
  the together-since counter pick whichever came back first.
*/
create unique index visits_one_open_idx on visits (couple_id) where ended_at is null;

create index visits_couple_idx on visits (couple_id, started_at desc);

alter table visits enable row level security;

create policy "members read their visits"
  on visits for select
  using (is_member_of(couple_id));

create policy "members start a visit"
  on visits for insert
  with check (is_member_of(couple_id));

/*
  Either of them may end it, and either may name the place.

  Not the person who started it: they arrived together and they leave together,
  and a visit only one of them could close would strand the app in the wrong
  state on the morning that person's phone was flat.
*/
create policy "members end a visit"
  on visits for update
  using (is_member_of(couple_id))
  with check (is_member_of(couple_id));

/*
  No delete. A visit that happened, happened — and the closed ones are the
  memories the recap and Dates read. Unpairing takes them with the couple, which
  is the only removal there should be.
*/

comment on table visits is
  'A time the two of them were in the same place. Started by a person or by a '
  'countdown reaching zero, never by GPS. Photos join it by timestamp.';

/**
 * Whether they are together right now.
 *
 * A function rather than a column on `couples`, for the reason migration 24
 * settled about `is_quiet`: a derived column is kept by a trigger, and a
 * trigger fires when somebody presses something. This changes because *a row
 * was opened or closed*, which is a press — but it is also read by policies and
 * by the scheduled function, and one place to ask is worth more than one place
 * to write.
 */
create function is_together(p_couple_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from visits
    where couple_id = p_couple_id
      and ended_at is null
  );
$$;
