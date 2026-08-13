-- Distance apart, and never a position.
--
-- The `presence` table has held `lat`, `lng` and `precision` since the first
-- migration, and nothing has ever written to it. This is the migration that
-- turns it on, and the whole of it is about making the privacy promise in
-- docs/PRIVACY.md structural rather than a paragraph.
--
-- Three rules, and each one is enforced by the database rather than by the app:
--
--  1. Off by default, per person. Not per couple — one partner turning it on
--     must never turn it on for the other.
--  2. Coordinates are stored at city resolution unless *both* people have asked
--     for precise. The original schema comment said "the write path must" do
--     this. A write path is a client, and a client is the layer an attacker
--     replaces, so it is done in a trigger instead.
--  3. Turning it off erases the coordinate. Not "stops updating it" — a stale
--     position is still a position, and someone who switches this off means the
--     other person should stop being able to see where they are.

-- ── the two switches ─────────────────────────────────────────────────────────

alter table presence
  add column sharing       boolean not null default false,
  add column wants_precise boolean not null default false;

comment on column presence.sharing is
  'This person is sharing their location. Off by default, and the only thing '
  'that makes lat/lng non-null.';

comment on column presence.wants_precise is
  'This person is willing to share a precise position. Only takes effect when '
  'the partner has set it too — see coarsen_presence().';

/*
  Roughly eleven kilometres a side.

  Chosen so that a coordinate identifies a city and not a neighbourhood, which
  is the line "city-level" in the build plan is drawing. The cost is that two
  people in the same city compute a distance anywhere from 0 to ~15 km, which is
  noise rather than signal — so the app does not print a number below that. It
  says "same city", which is both true and all the grid can honestly support.
*/
create or replace function coarse_grid() returns double precision
language sql immutable as $$ select 0.1::double precision $$;

-- ── the enforcement ──────────────────────────────────────────────────────────

/**
 * Rewrites every presence row on its way in.
 *
 * Runs `before insert or update`, so there is no window in which a precise
 * coordinate is stored and then cleaned up: what the table holds has already
 * been through this. A client that lies about `precision`, or that skips the
 * client-side rounding entirely, achieves nothing.
 *
 * Note it degrades rather than rejects. If it raised, then one partner turning
 * precise off would start failing the other partner's writes, and their location
 * would silently freeze at its last value — the worst outcome available, because
 * a frozen position looks exactly like a current one.
 */
create or replace function coarsen_presence()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  partner_precise boolean;
begin
  -- Rule 3. Sharing off means there is nothing to store, not even the last
  -- known value, and no amount of what the client sent changes that.
  if new.sharing is not true then
    new.lat := null;
    new.lng := null;
    new.precision := 'coarse';
    new.updated_at := now();
    return new;
  end if;

  -- Rule 2. Precise is a mutual setting: it is what *both* of you asked for, so
  -- one person cannot obtain it by asking twice.
  select p.wants_precise and p.sharing
    into partner_precise
  from presence p
  join couples c
    on (c.member_a = new.profile_id and c.member_b = p.profile_id)
    or (c.member_b = new.profile_id and c.member_a = p.profile_id);

  if new.wants_precise is true and coalesce(partner_precise, false) then
    new.precision := 'precise';
  else
    new.precision := 'coarse';
    if new.lat is not null then
      new.lat := round((new.lat / coarse_grid())::numeric) * coarse_grid();
    end if;
    if new.lng is not null then
      new.lng := round((new.lng / coarse_grid())::numeric) * coarse_grid();
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger presence_coarsen
  before insert or update on presence
  for each row execute function coarsen_presence();

comment on function coarsen_presence is
  'Erases the coordinate when sharing is off, and rounds it to a city-sized '
  'grid unless both partners have set wants_precise. The privacy promise, in '
  'the one place a client cannot route around.';

/**
 * Drops the coordinate the moment the *partner* stops sharing precisely.
 *
 * Without this there is a stale window: you both agreed to precise, they turn
 * precise off, and your row keeps its precise coordinate until you next open the
 * app. `wants_precise` is a consent flag, and consent that only takes effect on
 * the other person's next foreground is not consent.
 *
 * It coarsens the partner's stored row directly rather than waiting for them —
 * an update on `presence` re-enters `coarsen_presence`, which now sees the new
 * answer and rounds accordingly.
 */
create or replace function recoarsen_partner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  partner_id uuid;
begin
  if new.wants_precise is not distinct from old.wants_precise
     and new.sharing is not distinct from old.sharing then
    return null;
  end if;

  select case when c.member_a = new.profile_id then c.member_b else c.member_a end
    into partner_id
  from couples c
  where c.member_a = new.profile_id or c.member_b = new.profile_id;

  if partner_id is not null then
    -- A no-op update on the face of it; the point is the before-trigger it
    -- fires, which re-decides that row's precision against the new answer.
    update presence set updated_at = now() where profile_id = partner_id;
  end if;

  return null;
end;
$$;

create trigger presence_recoarsen_partner
  after update on presence
  for each row execute function recoarsen_partner();

-- ── what the partner may read ────────────────────────────────────────────────
--
-- The existing "read partner presence" policy hands over the whole row. That was
-- right when the row was empty. Now it means a partner reads `wants_precise`,
-- which is a preference and not theirs — and, more importantly, it would keep
-- returning the row of someone who has switched sharing off, so the app would
-- have to be trusted to notice. Replaced with a policy that simply stops
-- matching once the row is not being shared.

drop policy "read partner presence" on presence;

create policy "read partner presence" on presence
  for select using (
    sharing
    and exists (
      select 1 from couples
      where (member_a = (select auth.uid()) and member_b = presence.profile_id)
         or (member_b = (select auth.uid()) and member_a = presence.profile_id)
    )
  );

comment on table presence is
  'One row per person. The only table in this schema that can hold a location, '
  'and the only one whose read policy is conditional on the subject''s own '
  'setting rather than on membership alone.';
