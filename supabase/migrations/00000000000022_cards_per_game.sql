-- Two games, one deck, and they were eating each other.
--
-- `game_picks` has been unique on `(couple_id, card_id, profile_id)` since
-- migration 16, which was exactly right when there was one game. "Do you know
-- me?" made it wrong: it stores its guesses in the same table, so a card played
-- in either game is spent in the other, and the symptom is a card arriving
-- pre-answered with its reveal already gone.
--
-- A card played in two games is two events. It should be two rows.

alter table game_picks drop constraint game_picks_couple_id_card_id_profile_id_key;

alter table game_picks add constraint game_picks_one_per_game
  unique (couple_id, card_id, profile_id, mode);

comment on constraint game_picks_one_per_game on game_picks is
  'One row per person per card *per game*. Changing your mind still updates '
  'rather than adding a second row; playing the same card in the other game is '
  'a different row, because it is a different thing to have done.';

-- ── when they said it ────────────────────────────────────────────────────────

/*
  The deck is finite and now walks one card a day, so eventually it comes round
  again. A repeat that silently showed your old answer would read as the app
  having lost track; a repeat that says "in July you said this" is the most
  interesting thing about the second pass — whether you would still answer the
  same.

  Not a history table. This holds the previous answer and its date, which is the
  only one anybody wants to see, and re-picking overwrites it for the next
  cycle. A full history would be a table nobody reads, kept to support one line
  of copy.
*/
alter table game_picks add column picked_on date not null default current_date;

comment on column game_picks.picked_on is
  'The day this pick was last made. Read only when a card comes round again, to '
  'say what each of them said the time before.';

-- ── which game a written card is for ─────────────────────────────────────────

alter table couple_cards add column kind text not null default 'guess'
  check (kind in ('match', 'guess'));

comment on column couple_cards.kind is
  'guess: a question about the author for their partner to guess, which is what '
  'this table was built for and why the default is this one. match: a this-or-'
  'that both of them answer, which joins the daily deck.';

/*
  A card written in one mood must not reappear after they have turned 18+ back
  off. The shipped adult cards are a separate list for the same reason — nothing
  has to remember to filter — but a written card lives in the same table as the
  rest, so it carries the flag.
*/
alter table couple_cards add column is_adult boolean not null default false;

-- ── the reveal, told which game it is about ──────────────────────────────────

/*
  `i_have_picked` asked "is there a row from me on this card", which stopped
  being the right question the moment one card could hold two rows. Without the
  mode, guessing on a card would open the reveal on the *other* game's pick.

  Still security definer, still looking only at the caller's own row, and the uid
  is still taken inside rather than passed in — see migration 16 for the 42P17
  recursion this shape exists to avoid.
*/
drop policy "picks reveal only after you have picked" on game_picks;
drop function i_have_picked(uuid, text);

create function i_have_picked(p_couple_id uuid, p_card_id text, p_mode text)
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
      and mode = p_mode
      and profile_id = (select auth.uid())
  );
$$;

revoke execute on function i_have_picked(uuid, text, text) from public;
grant execute on function i_have_picked(uuid, text, text) to authenticated;

create policy "picks reveal only after you have picked" on game_picks
  as restrictive for select
  using (
    profile_id = (select auth.uid())
    or i_have_picked(couple_id, card_id, mode)
  );

-- ── the tallies, each counting its own game ──────────────────────────────────

/*
  `game_tally` counted every row on a card, so a guess would have arrived in the
  agreement count as though somebody had picked it — two people "agreeing" on a
  card where one of them was answering a different question entirely.
*/
create or replace function game_tally(p_couple_id uuid)
returns table (played integer, agreed integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
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
      and g.mode = 'match'
      and g.choice is not null
      and is_member_of(p_couple_id)
    group by g.card_id, c.member_a, c.member_b
    having count(distinct g.profile_id) = 2
  ) finished;
$$;

/*
  And `guess_tally` matched a guess against *any* row of the other person's on
  that card. That was already loose and became wrong the moment one card could
  hold two of their rows: a single guess would join both their this-or-that pick
  and their guess-round answer, and be counted twice.

  So exactly one answer of theirs per card, chosen rather than joined —
  preferring the one they gave in a guessing round, falling back to their
  ordinary pick. That fallback is not a nicety: on a card one of them *wrote*
  about themselves, their ordinary pick is the answer key, and it is the only
  row there is.
*/
create or replace function guess_tally(p_couple_id uuid)
returns table (profile_id uuid, asked integer, got_right integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    g.profile_id,
    count(*)::integer,
    count(*) filter (where g.guess = theirs.choice)::integer
  from game_picks g
  join lateral (
    select p.choice
    from game_picks p
    where p.couple_id = g.couple_id
      and p.card_id = g.card_id
      and p.profile_id <> g.profile_id
      and p.choice is not null
    order by (p.mode = 'guess') desc, p.picked_on desc
    limit 1
  ) theirs on true
  where g.couple_id = p_couple_id
    and g.mode = 'guess'
    and g.guess is not null
    and is_member_of(p_couple_id)
  group by g.profile_id;
$$;
