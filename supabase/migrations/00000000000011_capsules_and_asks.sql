-- Two things none of the apps in this category do.
--
-- A time capsule: something written now and not readable until a date you
-- choose. A custom question: one of you asking the other something the app
-- never thought of.
--
-- Both are cheap to build and neither can be copied comfortably by a
-- subscription app, because both are worth more the longer you stay and neither
-- can be gated without feeling mean.

-- ── time capsules ────────────────────────────────────────────────────────────
--
-- `capsules` already exists from the original schema and has never been used.
-- What was missing is the only rule that makes it a capsule rather than a note:
-- nobody reads it early. Not the recipient, and not the person who wrote it.
--
-- That has to be a policy. A client that receives the text and declines to show
-- it has built a countdown, not a capsule — anyone with dev tools can read
-- ahead, and knowing you *could* is enough to spoil it.

alter table capsules add column title text;

create policy "capsules stay shut until their day" on capsules
  as restrictive for select
  using (deliver_at <= now());

comment on table capsules is
  'Sealed until deliver_at, by policy rather than by the client. The author '
  'cannot read their own back early either — that is the point of writing one.';

/**
 * What is sealed and when it opens, without leaking a word of it.
 *
 * The waiting is most of the pleasure, so the app has to be able to say "three
 * of these open in November" while the rows themselves stay unreadable. Counts
 * and dates cross; text does not.
 */
create function sealed_capsules()
returns table (deliver_at timestamptz, title text, author_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.deliver_at, c.title, c.author_id
  from capsules c
  where is_member_of(c.couple_id)
    and c.deliver_at > now()
  order by c.deliver_at;
$$;

revoke execute on function sealed_capsules() from public;
grant execute on function sealed_capsules() to authenticated;

-- ── custom questions ─────────────────────────────────────────────────────────
--
-- Every app here ships a fixed deck. The question you actually want to ask is
-- rarely in it, and "what is a value you hope to pass on to your family" is not
-- what someone means when they want to ask their partner something specific.
--
-- Asked questions reuse the whole daily-loop machinery — prompt_days, answers,
-- the reveal — by simply being a prompt with an author.

alter table prompts add column author_id uuid references profiles on delete set null;
alter table prompts add column couple_id uuid references couples on delete cascade;

comment on column prompts.couple_id is
  'Null for the packs that ship with the app. Set for a question one partner '
  'wrote, which only that couple can see.';

-- The old policy let any signed-in user read every prompt, which was right when
-- they were all shared content and is wrong now that some belong to a couple.
drop policy if exists "read prompts" on prompts;

create policy "read shared prompts" on prompts
  for select to authenticated
  using (couple_id is null);

create policy "read our own questions" on prompts
  for select to authenticated
  using (couple_id is not null and is_member_of(couple_id));

create policy "write our own questions" on prompts
  for insert to authenticated
  with check (
    couple_id is not null
    and is_member_of(couple_id)
    and author_id = (select auth.uid())
  );

create policy "delete our own questions" on prompts
  for delete to authenticated
  using (
    couple_id is not null
    and is_member_of(couple_id)
    and author_id = (select auth.uid())
  );

create index prompts_couple_idx on prompts (couple_id) where couple_id is not null;

alter table capsules replica identity full;
alter publication supabase_realtime add table capsules;
