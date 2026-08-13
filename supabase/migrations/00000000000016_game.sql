-- The game.
--
-- Both reference apps put one behind the paywall. candle's upsell literally
-- reads "unlock all questions, widgets, games", which makes a free one the
-- cheapest possible demonstration that this app means what it says.
--
-- Mechanically it is the daily question with the writing taken out: two people,
-- one card, and nothing revealed until both have chosen. That last rule is the
-- entire feature. A game where you can see their pick before making your own is
-- not a game, it is a quiz you take alone, and it cannot be enforced in the
-- client — anyone with dev tools can read the row the client politely declines
-- to display. So it lives here, in a policy, exactly as `answers` does.

create table game_picks (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references couples on delete cascade,

  /*
    The card, identified by a hash of its own words rather than a foreign key.

    The deck ships inside the app bundle (packages/core/content/cards.json) and
    is deliberately not a table: it is the same thirty cards for everybody, it
    has to be readable with no network, and a `prompts`-shaped table would mean
    a migration every time somebody thinks of a good one. The cost is that
    Postgres cannot check this column against anything, which is acceptable for
    a value the client never lets a person type.
  */
  card_id    text not null check (card_id ~ '^[0-9a-f-]{36}$'),

  profile_id uuid not null references profiles on delete cascade,

  -- 0 is the left-hand option, 1 the right. Stored as a side rather than as the
  -- text, so rewording a card cannot retroactively change what someone chose.
  choice     smallint not null check (choice in (0, 1)),
  created_at timestamptz not null default now(),

  -- One pick per person per card. Changing your mind updates; it does not add a
  -- second row that would make the tally count you twice.
  unique (couple_id, card_id, profile_id)
);

comment on table game_picks is
  'One person''s choice on one this-or-that card. Hidden from the partner until '
  'they have picked too — see the reveal policy below, which is the feature.';

create index game_picks_couple_idx on game_picks (couple_id, card_id);

alter table game_picks enable row level security;

-- The ordinary couple shape, matching the nine tables in migration 2.
create policy "members read" on game_picks
  for select using (is_member_of(couple_id));
create policy "members insert" on game_picks
  for insert with check (is_member_of(couple_id));
create policy "members update" on game_picks
  for update using (is_member_of(couple_id)) with check (is_member_of(couple_id));
create policy "members delete" on game_picks
  for delete using (is_member_of(couple_id));

-- Neither of you may answer for the other, or change what they chose. Without
-- these, "members update" would let one partner quietly make the tally agree.
create policy "only your own pick is yours to make" on game_picks
  as restrictive for insert
  with check (profile_id = (select auth.uid()));

create policy "only your own pick is yours to change" on game_picks
  as restrictive for update
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "only your own pick is yours to withdraw" on game_picks
  as restrictive for delete
  using (profile_id = (select auth.uid()));

/**
 * Whether the caller has already picked on a given card.
 *
 * Security definer, and for the reason migration 8 had to learn the hard way:
 * asking "does a row exist in game_picks written by me?" from inside a policy
 * *on* game_picks re-enters that policy and Postgres stops it with 42P17,
 * infinite recursion — which breaks every read of the table, not just the
 * interesting ones.
 *
 * It only ever looks at the caller's own row, so running it as the owner widens
 * nothing. The uid is taken inside the function rather than passed in, so
 * nobody can ask the question on someone else's behalf.
 */
create function i_have_picked(p_couple_id uuid, p_card_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from game_picks
    where couple_id = p_couple_id
      and card_id = p_card_id
      and profile_id = (select auth.uid())
  );
$$;

revoke execute on function i_have_picked(uuid, text) from public;
grant execute on function i_have_picked(uuid, text) to authenticated;

-- The reveal. Restrictive, so it narrows "members read" rather than widening
-- anything: you always see your own pick, and theirs only once yours exists.
create policy "picks reveal only after you have picked" on game_picks
  as restrictive for select
  using (
    profile_id = (select auth.uid())
    or i_have_picked(couple_id, card_id)
  );

/**
 * How many cards you both picked, and how often you agreed.
 *
 * A count, not content. The app wants to say "eleven of fourteen the same"
 * without walking every row, and doing it in SQL means the number is computed
 * where the reveal rule is — rather than in a client that could be persuaded to
 * count rows it should not have been shown.
 */
create function game_tally(p_couple_id uuid)
returns table (played integer, agreed integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- `finished` rather than `both`: BOTH is a reserved word in Postgres and an
  -- alias of that name fails to parse in a way that points at the wrong line.
  select
    count(*)::integer,
    count(*) filter (where finished.a = finished.b)::integer
  from (
    select
      min(g.choice) filter (where g.profile_id = c.member_a) as a,
      min(g.choice) filter (where g.profile_id = c.member_b) as b
    from game_picks g
    join couples c on c.id = g.couple_id
    where g.couple_id = p_couple_id
      and is_member_of(p_couple_id)
    group by g.card_id, c.member_a, c.member_b
    having count(distinct g.profile_id) = 2
  ) finished;
$$;

revoke execute on function game_tally(uuid) from public;
grant execute on function game_tally(uuid) to authenticated;

-- The partner's device should light up the moment they choose, the same way it
-- does for an answer or a drawing.
alter table game_picks replica identity full;
alter publication supabase_realtime add table game_picks;
