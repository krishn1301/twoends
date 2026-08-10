-- TwoEnds — row-level security.
--
-- "A couple app that leaks between couples is not a bug, it's the end of the
-- project." Everything in this file exists to make that impossible, and
-- `supabase/tests/leak.test.ts` exists to prove it stayed impossible.
--
-- Read this file as the complete answer to "who can see what". If a table is
-- added without a policy here, it is unreachable rather than public — Postgres
-- denies by default once RLS is enabled — and the guard at the bottom fails the
-- migration if any table has RLS off.

-- ── the helper ───────────────────────────────────────────────────────────────

-- security definer so it can read `couples` without recursing into that table's
-- own policy. `search_path` is pinned because a security-definer function with a
-- mutable search_path is a privilege-escalation hole: a caller could create a
-- `public.couples` shadow and have this function read it instead.
create function is_member_of(c uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from couples
    where id = c
      and (member_a = (select auth.uid()) or member_b = (select auth.uid()))
  );
$$;

comment on function is_member_of is
  'True when the calling user is one of the two members of couple `c`. '
  'The single predicate every couple-scoped policy is built from.';

revoke execute on function is_member_of(uuid) from public;
grant execute on function is_member_of(uuid) to authenticated;

-- ── profiles ─────────────────────────────────────────────────────────────────

alter table profiles enable row level security;

create policy "read own profile" on profiles
  for select using (id = (select auth.uid()));

-- You may read your partner's profile, and nobody else's. This is the only
-- place one user reads another user's row, and it is scoped to the pair.
create policy "read partner profile" on profiles
  for select using (
    exists (
      select 1 from couples
      where (member_a = (select auth.uid()) and member_b = profiles.id)
         or (member_b = (select auth.uid()) and member_a = profiles.id)
    )
  );

create policy "write own profile" on profiles
  for insert with check (id = (select auth.uid()));

create policy "update own profile" on profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ── couples ──────────────────────────────────────────────────────────────────

alter table couples enable row level security;

create policy "read own couple" on couples
  for select using (
    member_a = (select auth.uid()) or member_b = (select auth.uid())
  );

-- You may only create a couple with yourself as member_a, and unpaired.
create policy "create own couple" on couples
  for insert with check (
    member_a = (select auth.uid()) and member_b is null
  );

create policy "update own couple" on couples
  for update using (
    member_a = (select auth.uid()) or member_b = (select auth.uid())
  ) with check (
    member_a = (select auth.uid()) or member_b = (select auth.uid())
  );

create policy "delete own couple" on couples
  for delete using (
    member_a = (select auth.uid()) or member_b = (select auth.uid())
  );

-- ── invites ──────────────────────────────────────────────────────────────────

alter table invites enable row level security;

-- Deliberately narrow: you can read an invite you created, but redeeming
-- someone else's code goes through a security-definer function rather than a
-- select policy. A policy permissive enough to let a stranger *find* a code by
-- reading the table would make six characters brute-forceable.
create policy "read own invites" on invites
  for select using (created_by = (select auth.uid()));

create policy "create invite for own couple" on invites
  for insert with check (
    created_by = (select auth.uid()) and is_member_of(couple_id)
  );

create policy "delete own invites" on invites
  for delete using (created_by = (select auth.uid()));

-- ── prompts: the one shared, world-readable table ────────────────────────────

alter table prompts enable row level security;

-- Readable by any signed-in user because the same questions are served to
-- everyone and none of it is personal. Adult packs are filtered at read time by
-- the client and by the couple's own opt-in flag; they are not secret content,
-- they are content you have to ask for.
create policy "read prompts" on prompts
  for select to authenticated using (true);

-- ── couple-scoped tables: one shape, applied uniformly ───────────────────────
--
-- Separate policies per command rather than `for all`, so that an accidental
-- future edit to the read rule cannot silently widen the write rule.

do $$
declare t text;
begin
  foreach t in array array[
    'prompt_days', 'answers', 'streaks', 'canvases', 'photos',
    'countdowns', 'journal_entries', 'list_items', 'capsules'
  ]
  loop
    execute format('alter table %I enable row level security', t);

    execute format(
      'create policy "members read" on %I for select using (is_member_of(couple_id))', t);
    execute format(
      'create policy "members insert" on %I for insert with check (is_member_of(couple_id))', t);
    execute format(
      'create policy "members update" on %I for update using (is_member_of(couple_id)) '
      'with check (is_member_of(couple_id))', t);
    execute format(
      'create policy "members delete" on %I for delete using (is_member_of(couple_id))', t);
  end loop;
end
$$;

-- `streaks` is keyed by couple_id, so the generic shape above already covers it.

-- ── author-owned rows inside a couple ────────────────────────────────────────
--
-- Both partners can read everything in the pair — that is the point of the pair.
-- But neither may rewrite the other's words. Answers and journal entries are
-- append-only from the partner's side, matching the conflict rule in Phase 3.

create policy "authors only rewrite their own answers" on answers
  as restrictive for update using (author_id = (select auth.uid()));

create policy "authors only delete their own answers" on answers
  as restrictive for delete using (author_id = (select auth.uid()));

create policy "authors only rewrite their own journal" on journal_entries
  as restrictive for update using (author_id = (select auth.uid()));

create policy "authors only delete their own journal" on journal_entries
  as restrictive for delete using (author_id = (select auth.uid()));

-- ── per-person plumbing ──────────────────────────────────────────────────────

alter table push_tokens enable row level security;

create policy "own push tokens" on push_tokens
  for all using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

alter table presence enable row level security;

-- You write only your own presence, and read only your own or your partner's.
-- Location is the one thing in this schema that could turn the app into a
-- surveillance tool, so the read rule is spelled out rather than delegated.
create policy "write own presence" on presence
  for insert with check (profile_id = (select auth.uid()));

create policy "update own presence" on presence
  for update using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "delete own presence" on presence
  for delete using (profile_id = (select auth.uid()));

create policy "read own presence" on presence
  for select using (profile_id = (select auth.uid()));

create policy "read partner presence" on presence
  for select using (
    exists (
      select 1 from couples
      where (member_a = (select auth.uid()) and member_b = presence.profile_id)
         or (member_b = (select auth.uid()) and member_a = presence.profile_id)
    )
  );

-- ── the guard ────────────────────────────────────────────────────────────────
--
-- Fails the migration if any table in `public` has RLS off. Adding a table and
-- forgetting a policy is the single most likely way this project leaks, and the
-- mistake is silent until someone goes looking. This makes it loud, at deploy
-- time, before any data exists.

do $$
declare unguarded text;
begin
  select string_agg(c.relname, ', ')
    into unguarded
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  if unguarded is not null then
    raise exception 'Tables without row-level security: %', unguarded;
  end if;
end
$$;
