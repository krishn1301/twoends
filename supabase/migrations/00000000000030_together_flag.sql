-- TwoEnds — "are we together" as one value in one row.
--
-- Migration 29 added `is_together(couple_id)`, which is the right shape for a
-- policy or a scheduled function to ask. It is the wrong shape for the daily
-- question, and the difference matters enough to be worth a second object.
--
-- The daily question is `promptForDay(couple id, date, thisList)`, so the two
-- phones only agree while they build the *same list*. While they are together
-- the distance pack is dropped from it. If each phone worked that out for
-- itself — by calling `is_together`, or by loading the open visit — then for as
-- long as one had loaded the visit and the other had not, they would derive
-- different questions on the same morning, with no error anywhere and no answer
-- ever unlocking the other.
--
-- That is not hypothetical: it is exactly the bug the private prompt pack had
-- in Phase 13, found in design rather than in code, and the fix was the same
-- one — gate on the *couple*, from a single value both devices read out of a
-- single row. `adult_packs_enabled` exists for this reason too.

alter table couples
  add column together boolean not null default false;

comment on column couples.together is
  'True while a visit is open. Derived by a trigger, never written by the app — '
  'the same rule adult_packs_enabled follows, and for the same reason: both '
  'phones must build the daily question from one value in one row.';

create or replace function sync_together()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_couple uuid;
begin
  -- Deleting a visit is not allowed by policy, but a cascade from `couples`
  -- reaches here and `old` is the only row there is.
  v_couple := coalesce(new.couple_id, old.couple_id);

  update couples
     set together = exists (
       select 1 from visits
       where couple_id = v_couple
         and ended_at is null
     )
   where id = v_couple;

  return null;
end;
$$;

/*
  After, and for every operation.

  `after` because the row has to be in place before the exists() is asked, and
  all three because a visit can appear (started), close (ended) or vanish (the
  couple was deleted) — and the second of those is the one that actually
  matters. A trigger that only fired on insert would leave the app in arrival
  mode forever after the first visit ended.
*/
create trigger visits_sync_together
  after insert or update or delete on visits
  for each row execute function sync_together();

-- Anything already open when this landed. There should be none, and a backfill
-- that does nothing is cheaper than finding out it was needed in a month.
update couples c
   set together = exists (
     select 1 from visits v where v.couple_id = c.id and v.ended_at is null
   );
