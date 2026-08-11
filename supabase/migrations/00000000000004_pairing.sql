-- TwoEnds — pairing, and coming apart.
--
-- Redeeming an invite cannot be a row-level security policy. The policy on
-- `invites` deliberately lets you read only codes you created — anything looser
-- would let a stranger list the table, and a six-character code you can enumerate
-- is not a secret. So joining goes through a security-definer function that
-- reads the invite on the caller's behalf without ever showing it to them.
--
-- Every function here pins `search_path`. A security-definer function with a
-- mutable one is a privilege-escalation hole: the caller creates a shadow table
-- earlier in the path and the function reads that instead.

-- ── invite codes ─────────────────────────────────────────────────────────────

-- Ambiguity is a support cost. Someone reads this code aloud down a phone line,
-- or copies it off a screenshot, so 0/O and 1/I/L are out. 31 characters over
-- six places is ~887 million codes, which is not brute-forceable against an
-- endpoint that also expires them.
alter table invites drop constraint if exists invites_code_check;
alter table invites add constraint invites_code_check
  check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$');

create function generate_invite_code()
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
  attempts int := 0;
begin
  loop
    candidate := '';
    for _ in 1..6 loop
      -- gen_random_bytes would be better but pgcrypto is not guaranteed here;
      -- random() is adequate because the code also expires and is single-use.
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    exit when not exists (select 1 from invites where code = candidate);

    attempts := attempts + 1;
    if attempts > 20 then
      raise exception 'could not generate a unique invite code';
    end if;
  end loop;

  return candidate;
end;
$$;

revoke execute on function generate_invite_code() from public;

-- ── creating an invite ───────────────────────────────────────────────────────

/**
 * Returns a fresh code for the caller's couple, creating the couple if this is
 * their first. Idempotent in the way that matters: calling it twice gives two
 * valid codes rather than an error, because the realistic failure is someone
 * losing the first code, not someone abusing the second.
 */
create function create_invite(p_ttl interval default interval '7 days')
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_couple_id uuid;
  v_code text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select id into v_couple_id from couples
  where member_a = v_uid or member_b = v_uid;

  if v_couple_id is null then
    insert into couples (member_a) values (v_uid) returning id into v_couple_id;
    insert into streaks (couple_id) values (v_couple_id);
  end if;

  if exists (select 1 from couples where id = v_couple_id and member_b is not null) then
    raise exception 'already_paired' using errcode = 'P0001';
  end if;

  v_code := generate_invite_code();

  insert into invites (code, couple_id, created_by, expires_at)
  values (v_code, v_couple_id, v_uid, now() + p_ttl);

  return v_code;
end;
$$;

revoke execute on function create_invite(interval) from public;
grant execute on function create_invite(interval) to authenticated;

-- ── redeeming one ────────────────────────────────────────────────────────────

/**
 * Joins the couple behind a code. Every failure mode raises a distinct message
 * so the UI can say what actually went wrong — "that code expired" is a very
 * different conversation from "you are already paired with someone".
 *
 * `for update` on the couple row is doing real work: without it, two people
 * redeeming the same code simultaneously could both pass the `member_b is null`
 * check. The unique index on member_b would still save us, but one of them would
 * get a constraint violation instead of a sentence they can read.
 */
create function redeem_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_invite invites%rowtype;
  v_couple couples%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not exists (select 1 from profiles where id = v_uid) then
    raise exception 'finish_your_profile_first' using errcode = 'P0001';
  end if;

  if exists (select 1 from couples where member_a = v_uid or member_b = v_uid) then
    raise exception 'already_paired' using errcode = 'P0001';
  end if;

  select * into v_invite from invites where code = upper(trim(p_code));
  if not found then
    raise exception 'invalid_code' using errcode = 'P0001';
  end if;
  if v_invite.used_at is not null then
    raise exception 'code_already_used' using errcode = 'P0001';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'code_expired' using errcode = 'P0001';
  end if;

  select * into v_couple from couples where id = v_invite.couple_id for update;

  if v_couple.member_a = v_uid then
    raise exception 'cannot_pair_with_yourself' using errcode = 'P0001';
  end if;
  if v_couple.member_b is not null then
    raise exception 'couple_full' using errcode = 'P0001';
  end if;

  update couples set member_b = v_uid where id = v_couple.id;
  update invites set used_at = now() where code = v_invite.code;

  -- Every other code for this couple dies with the pairing. Leaving them live
  -- would mean a screenshot from last week could still join a full couple.
  delete from invites where couple_id = v_couple.id and used_at is null;

  return v_couple.id;
end;
$$;

revoke execute on function redeem_invite(text) from public;
grant execute on function redeem_invite(text) to authenticated;

-- ── coming apart ─────────────────────────────────────────────────────────────
--
-- Unpairing takes both people. One asks, the other confirms, and only then does
-- anything get deleted. A one-tap unpair in an app two people share is a way to
-- delete someone else's memories during an argument.

alter table couples add column unpair_requested_by uuid references profiles on delete set null;
alter table couples add column unpair_requested_at timestamptz;

create function request_unpair()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  update couples
     set unpair_requested_by = v_uid, unpair_requested_at = now()
   where (member_a = v_uid or member_b = v_uid)
     and member_b is not null;

  if not found then
    raise exception 'not_paired' using errcode = 'P0001';
  end if;
end;
$$;

create function cancel_unpair()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  update couples
     set unpair_requested_by = null, unpair_requested_at = null
   where member_a = v_uid or member_b = v_uid;
end;
$$;

/**
 * Deletes the shared life. Callable only by the partner who did *not* ask, so
 * it always takes two people.
 *
 * Deleting the couple row cascades through every couple-scoped table. Storage
 * objects are not reached by that cascade — the client must delete the
 * `<couple_id>/` prefix through the storage API *before* calling this, while it
 * still has permission to. After this returns, the policies no longer match and
 * those files become unreachable orphans.
 */
create function confirm_unpair()
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

  delete from couples where id = v_couple.id;
end;
$$;

revoke execute on function request_unpair() from public;
revoke execute on function cancel_unpair() from public;
revoke execute on function confirm_unpair() from public;
grant execute on function request_unpair() to authenticated;
grant execute on function cancel_unpair() to authenticated;
grant execute on function confirm_unpair() to authenticated;
