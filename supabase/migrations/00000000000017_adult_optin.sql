-- The 18+ switch.
--
-- The packs have existed since the first prompt file and have never been
-- reachable: `promptsFor` and `topicPacksFor` both take an `adultEnabled` flag,
-- every caller leaves it at its default of false, and nothing has ever read
-- `couples.adult_packs_enabled`. Six prompts and a topic pack have been shipping
-- to every device and serving to nobody. `Play.tsx` said so in a comment, on
-- purpose, because inventing a toggle would have been a way of making the
-- age-rating decision by accident rather than deciding it.
--
-- The locked rule is: both confirm 18+, both opt in, off by default, and never
-- surfaced in widgets or notifications.
--
-- **Two of those four clauses were already true and needed no code.** The push
-- function holds five fixed title/body pairs and structurally cannot be handed a
-- body by its caller, and the widget snapshot carries labels, counts and images
-- and no question text at all. Adding guards there would have implied a risk
-- that does not exist; there are tests instead.

-- ── consent belongs to a person, not to a pair ───────────────────────────────

-- `couples.adult_packs_enabled` is one boolean shared by two people, and one
-- boolean cannot record that two people each agreed. It also cannot express the
-- thing that matters most here — that either of them may stop, alone, at once.
alter table profiles add column adult_opt_in_at timestamptz;

comment on column profiles.adult_opt_in_at is
  'Null means off, which is the default and the state every account starts in. '
  'Non-null is one person saying both "I am 18 or over" and "I want these", '
  'which the interface asks as a single sentence because they are one decision. '
  'Only ever written by its owner: the "update own profile" policy in migration '
  '2 is scoped to id = auth.uid(), so nobody can opt in on their partner''s '
  'behalf, and that policy is what makes this column mean consent rather than '
  'preference.';

-- ── the derived flag ─────────────────────────────────────────────────────────

/**
 * Whether both halves of a couple have opted in.
 *
 * Security definer because it is called from triggers that must see both
 * profiles regardless of who is writing — a person opting in updates a row on
 * *their* profile, and the answer depends on a row they may read but the trigger
 * should not have to prove it can.
 */
create function adult_enabled_for(p_couple_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select a.adult_opt_in_at is not null and b.adult_opt_in_at is not null
      from couples c
      join profiles a on a.id = c.member_a
      join profiles b on b.id = c.member_b
      where c.id = p_couple_id
    ),
    -- A couple with an empty second slot cannot have two people agreeing to
    -- anything. Null-coalesced rather than left null so the column is never
    -- three-valued.
    false
  );
$$;

revoke execute on function adult_enabled_for(uuid) from public;
grant execute on function adult_enabled_for(uuid) to authenticated;

/**
 * Keep `couples.adult_packs_enabled` equal to "both of them said yes".
 *
 * The column stays because it is the one place a server-side reader — the push
 * function, a future export, anything that is not the app — can ask the question
 * without joining two profiles and getting the rule subtly wrong. It is derived
 * now rather than authoritative, and the comment below says so, because a column
 * that looks writable and is overwritten by a trigger is a trap.
 *
 * Runs on the profile because that is where the decision is made, and on the
 * couple because a pairing can complete after somebody has already opted in.
 */
create function sync_adult_packs()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'profiles' then
    update couples
       set adult_packs_enabled = adult_enabled_for(id)
     where member_a = new.id or member_b = new.id;
  else
    update couples
       set adult_packs_enabled = adult_enabled_for(new.id)
     where id = new.id;
  end if;

  return new;
end;
$$;

create trigger profiles_sync_adult_packs
  after insert or update of adult_opt_in_at on profiles
  for each row execute function sync_adult_packs();

create trigger couples_sync_adult_packs
  after insert or update of member_b on couples
  for each row execute function sync_adult_packs();

comment on column couples.adult_packs_enabled is
  'Derived. Equal to both members having a non-null profiles.adult_opt_in_at, '
  'maintained by sync_adult_packs(). Do not write it directly — a trigger will '
  'overwrite whatever you put here the next time either person touches their '
  'own opt-in, and the value in between would be a lie.';

-- Backfill, so the column is true of the data rather than only of what happens
-- next. Every existing couple lands on false, which is correct: nobody has opted
-- in and off is the default.
update couples set adult_packs_enabled = adult_enabled_for(id);
