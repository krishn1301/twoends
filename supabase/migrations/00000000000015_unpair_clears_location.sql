-- Unpairing must erase the coordinates too.
--
-- Found by running the real delete on a real phone and then counting rows,
-- rather than by reading the code: everything couple-scoped was gone, and a
-- `presence` row was still there holding a position.
--
-- The cause is a keying detail that looks harmless. `presence` is keyed on
-- `profile_id`, so it cascades from `profiles` — and unpairing deletes the
-- couple, not the people. Both accounts survive on purpose, and their location
-- rows survived with them.
--
-- It is not a leak: the partner-read policy added in migration 13 requires a
-- `couples` row to match, and there no longer is one, so nobody but the owner
-- can read it. But it is still wrong, for a reason that has nothing to do with
-- access control and everything to do with keeping one promise consistent with
-- another: switching *sharing* off erases the coordinate, and unpairing is a
-- much stronger act than switching sharing off. A weaker action clearing more
-- state than a stronger one is the kind of inconsistency that turns a privacy
-- guarantee into a thing people have to check.
--
-- This has to live in the function rather than in the client. Once the couple
-- row is deleted the app can no longer work out who the partner was, and the
-- partner's own phone may not be opened for weeks.

create or replace function confirm_unpair()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_couple couples%rowtype;
begin
  select * into v_couple from couples
   where (member_a = v_uid or member_b = v_uid)
     and unpair_requested_by is not null;

  if not found then
    raise exception 'no_unpair_requested' using errcode = 'P0001';
  end if;

  if v_couple.unpair_requested_by = v_uid then
    raise exception 'partner_must_confirm' using errcode = 'P0001';
  end if;

  /*
    Before the delete, while both members are still known.

    `sharing = false` rather than a delete of the row: the before-trigger from
    migration 13 is what nulls the coordinate, and routing through it means
    there is one piece of code that decides what "not sharing" stores. It also
    keeps `wants_precise` — a preference, not a position — so pairing with the
    same person again does not silently downgrade an agreement they had.
  */
  update presence
     set sharing = false
   where profile_id in (v_couple.member_a, v_couple.member_b);

  delete from couples where id = v_couple.id;
end;
$$;

comment on function confirm_unpair is
  'Deletes the shared life, callable only by the partner who did not ask. '
  'Clears both members'' location sharing first, because presence is keyed on '
  'profile_id and would otherwise outlive the couple it was shared with.';
