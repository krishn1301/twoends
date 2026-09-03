-- TwoEnds — same thing, same time.
--
-- Once a day a prompt opens for both of them at once and there are twenty
-- minutes to answer it. Both photographs stay hidden until both have arrived,
-- which is the reveal rule the daily question has had since migration 8 and is
-- here for the same reason: seeing theirs first changes what you take.
--
-- **There is no row for the moment itself.** The prompt and the hour are
-- derived from the couple id and the date by `momentForDay` in `packages/core`,
-- the same way the daily question is, so both phones agree with nothing passing
-- between them. A table of scheduled moments would be a second source of truth
-- about a thing that is already a pure function, and the first symptom of a
-- disagreement would be one of them photographing the sky while the other is
-- asked about their shoes.
--
-- What is stored is only what was taken.

create table moment_shots (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references couples on delete cascade,
  author_id    uuid not null references profiles on delete cascade,

  -- The couple's own local date, which is what `momentForDay` is keyed on. Not
  -- a timestamp: the moment belongs to a day, and two people in two cities have
  -- to agree about which day that is.
  local_date   date not null,

  -- Which prompt it was, copied at the time. The list in `packages/core` will
  -- grow, and an index into a list that has changed is how a photograph ends up
  -- captioned with somebody else's prompt two years later.
  prompt       text not null,

  storage_path text not null,
  created_at   timestamptz not null default now(),

  -- Same life as a snap, and the same claim by a recap. See migration 25.
  expires_at   timestamptz not null default now() + interval '60 days',
  kept         boolean not null default false,

  -- One each, per day. Re-taking replaces rather than accumulates, which is the
  -- update policy below.
  unique (couple_id, local_date, author_id)
);

create index moment_shots_couple_idx on moment_shots (couple_id, local_date desc);

alter table moment_shots enable row level security;

/*
  Whether I have taken today's.

  `security definer` for the same reason `i_have_answered` had to be: asking
  about `moment_shots` from inside a policy *on* `moment_shots` recurses, and
  Postgres reports it as 42P17 rather than as anything that names the cause.
*/
create function i_have_shot(p_couple_id uuid, p_local_date date)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from moment_shots
    where couple_id = p_couple_id
      and local_date = p_local_date
      and author_id = (select auth.uid())
  );
$$;

/*
  The reveal, as a policy rather than a curtain.

  Your own row is always yours. Theirs becomes readable the moment you have one
  of your own — so the pair arrives together, and neither of you can look first
  by asking the API directly.
*/
create policy "members read their own shot"
  on moment_shots for select
  using (is_member_of(couple_id) and author_id = (select auth.uid()));

create policy "members read theirs once they have taken one"
  on moment_shots for select
  using (is_member_of(couple_id) and i_have_shot(couple_id, local_date));

create policy "members take their own shot"
  on moment_shots for insert
  with check (is_member_of(couple_id) and author_id = (select auth.uid()));

/*
  Retaking, and keeping.

  The insert is scoped to your own row and the update is not, deliberately:
  either partner may keep a moment, exactly as either may keep a snap, because
  the one who took it does not own the memory of it. Replacing the picture is
  still only possible for its author — the unique index gives them one row and
  the insert policy will not let them write into anybody else's.
*/
create policy "members keep a moment"
  on moment_shots for update
  using (is_member_of(couple_id))
  with check (is_member_of(couple_id));

create policy "members delete a moment"
  on moment_shots for delete
  using (is_member_of(couple_id));

comment on table moment_shots is
  'One photograph each, taken inside a twenty-minute window. Neither is '
  'readable until both exist. The prompt and the hour are derived, not stored.';
