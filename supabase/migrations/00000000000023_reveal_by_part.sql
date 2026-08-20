-- Splitting the reveal by game broke the game it was meant to protect.
--
-- Migration 22 made the reveal per-mode, so a row is shown once you have moved
-- *in the game that row belongs to*. Correct for a deck card, where both people
-- do the same thing. Wrong for a card one of them wrote about themselves, which
-- is the whole point of "Do you know me?": the author's answer was a `match`
-- row, the guesser only ever writes a `guess` row, and a per-mode reveal means
-- the guesser can never see what they were guessing at. The feature was dead the
-- moment 22 applied, and the test caught it in the same minute.
--
-- The mistake underneath is a modelling one. A written card's answer is not a
-- this-or-that pick that happens to be lying around — it is that person's move
-- in the guessing game, and it should say so.

-- ── the author plays the same game as the guesser ────────────────────────────

update game_picks g
   set mode = 'guess'
  from couple_cards c
 where c.id = g.card_id
   and g.profile_id = c.author_id
   and g.mode = 'match';

/*
  Which means a `guess` row can now legitimately hold a choice and no guess: the
  author answers, and is not guessing at anything.

  That constraint was there to stop a real attack — write the choice half of a
  guess row, read the partner's row that the reveal hands you, then come back and
  fill in a guess you can no longer get wrong. It was a proxy for the thing that
  actually matters, and the thing that actually matters belongs in the reveal.
  See `i_have_played` below, which closes the same door from the right side.
*/
alter table game_picks drop constraint game_picks_guess_mode_has_a_guess;

-- ── having done your part, whatever your part is ─────────────────────────────

/**
 * Whether the caller has finished their own move on this card, in this game.
 *
 * "Their own move" is not the same thing for both people, which is why this
 * cannot be "is there a row from me".
 *
 *  - In `match`, a row is a pick and a pick is the move.
 *  - In `guess` on an ordinary card, the move is the guess — a row with only a
 *    choice in it is somebody halfway through, and must not open anything.
 *  - In `guess` on a card you wrote, the move is your answer. You are not
 *    guessing; you are the thing being guessed at.
 *
 * Security definer for the reason migration 8 learned the hard way: asking about
 * `game_picks` from inside a policy *on* `game_picks` recurses and Postgres
 * stops it with 42P17, which breaks every read of the table rather than only the
 * interesting ones. It still looks at nothing but the caller's own row, and the
 * uid is still taken inside rather than passed in.
 */
create or replace function i_have_played(p_couple_id uuid, p_card_id text, p_mode text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from game_picks g
    where g.couple_id = p_couple_id
      and g.card_id = p_card_id
      and g.mode = p_mode
      and g.profile_id = (select auth.uid())
      and (
        p_mode <> 'guess'
        or g.guess is not null
        or exists (
          select 1 from couple_cards c
          where c.id = p_card_id
            and c.author_id = (select auth.uid())
        )
      )
  );
$$;

revoke execute on function i_have_played(uuid, text, text) from public;
grant execute on function i_have_played(uuid, text, text) to authenticated;

drop policy "picks reveal only after you have picked" on game_picks;

create policy "picks reveal only after you have played" on game_picks
  as restrictive for select
  using (
    profile_id = (select auth.uid())
    or i_have_played(couple_id, card_id, mode)
  );

drop function if exists i_have_picked(uuid, text, text);

comment on function i_have_played(uuid, text, text) is
  'Replaces i_have_picked. A row is not a move: in a guessing round a row with '
  'only a choice in it is somebody halfway through, and on a card you wrote '
  'your answer is the move even though you never guess.';
