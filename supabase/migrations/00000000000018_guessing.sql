-- "Do you know me?" — answering as the other person.
--
-- The existing game asks what *you* would pick. This one asks what *they* would
-- pick, and then tells you whether you were right. It is the same two-option
-- card and the same both-must-move reveal, with one more thing recorded.
--
-- Deliberately not a new table. `game_picks` already has every hard part solved:
-- card ids derived from the card's own words, the restrictive reveal policy, and
-- `i_have_picked` as a security-definer function to dodge the 42P17 recursion
-- that a policy querying its own table causes. A second table would be a second
-- copy of all of that, and the second copy is the one that gets it wrong.

-- ── what you think they would say ────────────────────────────────────────────

alter table game_picks add column guess smallint check (guess in (0, 1));

comment on column game_picks.guess is
  'What this person thinks their partner would choose. Null in the original '
  'game, where there is nothing to guess.';

/*
  A written card has an author and a guesser, and the guesser has no choice of
  their own to record — the question is about the other person, so "what would
  you pick" is not a question they were asked. So `choice` becomes nullable, and
  a check keeps a row from being empty in both columns at once.
*/
alter table game_picks alter column choice drop not null;

alter table game_picks add constraint game_picks_says_something
  check (choice is not null or guess is not null);

/*
  Which game the row came from, and the reason it exists is subtle enough to be
  worth spelling out.

  The reveal policy below opens as soon as you have *a row*. In the original game
  that is exactly right: a row is a pick, and a pick is you having moved. Once a
  row can hold a guess, "having moved" splits in two — and somebody could write
  the choice half, read the partner's row that the reveal now hands them, and
  come back to fill in a guess they can no longer get wrong.

  Rather than teach row-level security about columns, which it cannot do, a
  guess-mode row is simply not allowed to exist without a guess in it. Then "has
  a row" means "has guessed" again and the existing policy is correct unchanged.
*/
alter table game_picks add column mode text not null default 'match'
  check (mode in ('match', 'guess'));

alter table game_picks add constraint game_picks_guess_mode_has_a_guess
  check (mode = 'match' or guess is not null);

comment on column game_picks.mode is
  'match: the original game, a choice and nothing to guess. guess: a round of '
  '"do you know me?", which cannot be written without a guess — that constraint '
  'is what stops the reveal opening on a half-written row.';

-- ── cards the two of them wrote ──────────────────────────────────────────────

/*
  The deck ships in the bundle and runs out. These do not, and they are the
  better half of the feature anyway: a question written by one person about
  themselves is a love note wearing a quiz.

  There is no answer column here, and that is the design rather than an
  omission. The author's own answer is an ordinary `game_picks` row, so the
  reveal policy already hides it until the other person has guessed. A `truth`
  column on this table would be readable by both members the moment it was
  written — row-level security cannot hide a column — and the game would be over
  before it started.
*/
create table couple_cards (
  -- Derived from the card's own words, exactly as the shipped deck's ids are,
  -- so `game_picks.card_id` does not need to know which of the two it points at.
  id         text primary key check (id ~ '^[0-9a-f-]{36}$'),
  couple_id  uuid not null references couples on delete cascade,
  author_id  uuid not null references profiles on delete cascade,

  -- Optional. Two bare options work ("beach / mountains"); a line above them
  -- makes the card specific, which is the whole point of writing your own.
  body       text check (body is null or length(trim(body)) between 1 and 160),
  option_a   text not null check (length(trim(option_a)) between 1 and 60),
  option_b   text not null check (length(trim(option_b)) between 1 and 60),
  created_at timestamptz not null default now()
);

comment on table couple_cards is
  'A two-option card one partner wrote about themselves for the other to guess. '
  'Holds no answer: the author''s answer is a game_picks row, so the reveal '
  'policy hides it until the guesser has moved.';

create index couple_cards_couple_idx on couple_cards (couple_id, created_at desc);

alter table couple_cards enable row level security;

-- The ordinary couple shape. Both of them read every card; only the author
-- writes or removes their own.
create policy "members read" on couple_cards
  for select using (is_member_of(couple_id));

create policy "members insert" on couple_cards
  for insert with check (is_member_of(couple_id) and author_id = (select auth.uid()));

create policy "authors delete" on couple_cards
  for delete using (is_member_of(couple_id) and author_id = (select auth.uid()));

/*
  No update policy at all, on purpose. Editing a card's words after somebody has
  guessed would silently change what they were asked, and the guess would still
  be sitting there looking like an answer to the new question. Delete and write
  another — which also gives the card a new id, because ids come from the words.
*/

alter table couple_cards replica identity full;
alter publication supabase_realtime add table couple_cards;

-- ── how well each of them knows the other ────────────────────────────────────

/**
 * Per person: how many cards they guessed on, and how many they got right.
 *
 * A guess is right when it equals what the *other* person actually chose. Cards
 * where the other person has not chosen yet are not counted at all — they are
 * waiting, not wrong, and a tally that treated the two the same would tell
 * somebody they had failed a question nobody has answered.
 *
 * Computed here rather than in the client for the same reason `game_tally` is:
 * this is where the reveal rule lives, and a client counting rows is a client
 * that can be persuaded to count rows it was never shown.
 */
create function guess_tally(p_couple_id uuid)
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
  join game_picks theirs
    on theirs.couple_id = g.couple_id
   and theirs.card_id = g.card_id
   and theirs.profile_id <> g.profile_id
  where g.couple_id = p_couple_id
    and g.guess is not null
    and theirs.choice is not null
    and is_member_of(p_couple_id)
  group by g.profile_id;
$$;

revoke execute on function guess_tally(uuid) from public;
grant execute on function guess_tally(uuid) to authenticated;
