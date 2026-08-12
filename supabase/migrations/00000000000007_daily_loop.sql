-- The daily loop, and the rule that makes it work.
--
-- "Answers reveal only after both reply" is the core mechanic of this app. If
-- the client decides when to reveal, it is not a mechanic — it is a curtain, and
-- anyone who opens dev tools or reads the network tab can look behind it. So the
-- database decides, and the client merely renders what it is allowed to see.

-- ── the couple's day ─────────────────────────────────────────────────────────
--
-- Two people in different timezones do not share a calendar day. Somebody's
-- clock has to win, and it is member_a's — chosen because it is stable, not
-- because it is fair. The UI shows both, so the person whose day it is not can
-- see why the question changed at an odd hour.

alter table couples add column day_timezone text not null default 'UTC';

comment on column couples.day_timezone is
  'IANA zone deciding when "today" rolls over for this pair. Taken from '
  'member_a''s device at pairing. Long-distance couples are in different days; '
  'this picks one so both see the same question.';

-- ── the reveal ───────────────────────────────────────────────────────────────
--
-- Restrictive, so it intersects with the existing "members read" policy rather
-- than widening anything: you must be in the couple AND satisfy this.
--
-- You may always read your own answer. You may read your partner's only once
-- you have written your own for the same day. Nothing about the partner's row
-- reaches the device before then — not the text, not its length, not whether it
-- was edited.

create policy "answers reveal only after you have answered" on answers
  as restrictive for select
  using (
    author_id = (select auth.uid())
    or exists (
      select 1 from answers mine
      where mine.prompt_day_id = answers.prompt_day_id
        and mine.author_id = (select auth.uid())
    )
  );

/*
  The client still needs to know *that* they answered, to show "waiting on you"
  rather than an empty screen. That is a count, not content — so it is a
  security-definer function returning a boolean, and no row ever crosses.
*/
create function partner_has_answered(p_prompt_day_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from answers a
    join prompt_days d on d.id = a.prompt_day_id
    where a.prompt_day_id = p_prompt_day_id
      and a.author_id <> (select auth.uid())
      and is_member_of(d.couple_id)
  );
$$;

revoke execute on function partner_has_answered(uuid) from public;
grant execute on function partner_has_answered(uuid) to authenticated;

-- ── content ──────────────────────────────────────────────────────────────────
--
-- Prompts are seeded from `packages/core/content/prompts.json`, which is the
-- source of truth. Ids are stable and generated from the text, so re-seeding is
-- idempotent and a prompt keeps its identity across environments.

alter table prompts add column if not exists sort_order integer not null default 0;

-- Clear the ad-hoc rows the test suite left behind before the real pack lands.
delete from prompts where pack = 'core' and id not in (select prompt_id from prompt_days);
