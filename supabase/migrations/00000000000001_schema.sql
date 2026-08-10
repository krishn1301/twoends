-- TwoEnds — core schema.
--
-- Section 7 of the build plan, minus thumb_events (the thumb-kiss feature was
-- dropped) and plus a couple of constraints the plan implied but did not state.
--
-- Everything couple-scoped carries a `couple_id`, without exception. That is not
-- redundancy: it is what lets one row-level security policy shape cover every
-- table, and a table that cannot answer "which couple owns this?" in a single
-- column cannot be secured by that shape. Row-level security itself is turned on
-- in the next migration, deliberately separated so a review of the policies is a
-- review of one file.

-- ── people ───────────────────────────────────────────────────────────────────

create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 40),
  birthday    date,
  accent_key  text check (accent_key in
                ('rose','amber','citron','fern','teal','sky','iris','orchid')),
  avatar_path text,
  locale      text not null default 'en',
  created_at  timestamptz not null default now()
);

comment on column profiles.accent_key is
  'One of the eight swatches in packages/core/src/accents.ts. Stored as a key, '
  'never a hex, so the palette can be retuned without a migration.';

-- ── the pair ─────────────────────────────────────────────────────────────────

create table couples (
  id         uuid primary key default gen_random_uuid(),
  member_a   uuid not null references profiles on delete cascade,
  member_b   uuid references profiles on delete set null,  -- null until accepted
  started_on date,
  proximity  text check (proximity in ('together','nearby','long_distance','varies')),
  nurture_focus text[] not null default '{}',
  quiet_until date,
  adult_packs_enabled boolean not null default false,
  created_at timestamptz not null default now(),

  -- A couple is two different people. Without this, a malicious client could
  -- pair with itself and the "two people" assumption breaks everywhere.
  constraint members_differ check (member_b is null or member_a <> member_b)
);

-- One person, one couple. Enforced here rather than in application code because
-- the whole product thesis ("two people, one pair, never a social graph") rests
-- on it, and application code is the layer that gets bypassed.
create unique index couples_member_a_key on couples (member_a);
create unique index couples_member_b_key on couples (member_b) where member_b is not null;

create table invites (
  code       text primary key check (code ~ '^[A-Z0-9]{6}$'),
  couple_id  uuid not null references couples on delete cascade,
  created_by uuid not null references profiles on delete cascade,
  expires_at timestamptz not null,
  used_at    timestamptz
);

-- ── the daily loop ───────────────────────────────────────────────────────────

-- Prompts are shared content, not couple data: the same question is served to
-- everyone. This is the one table that is world-readable, and it holds nothing
-- personal.
create table prompts (
  id       uuid primary key default gen_random_uuid(),
  kind     text not null default 'conversation',
  body     text not null,
  pack     text not null default 'core',
  is_adult boolean not null default false
);

create table prompt_days (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references couples on delete cascade,
  prompt_id  uuid not null references prompts on delete restrict,
  local_date date not null,
  unique (couple_id, local_date)
);

create table answers (
  id            uuid primary key default gen_random_uuid(),
  couple_id     uuid not null references couples on delete cascade,
  prompt_day_id uuid not null references prompt_days on delete cascade,
  author_id     uuid not null references profiles on delete cascade,
  body          text,
  media_path    text,
  created_at    timestamptz not null default now(),
  unique (prompt_day_id, author_id)
);

create table streaks (
  couple_id             uuid primary key references couples on delete cascade,
  current               integer not null default 0 check (current >= 0),
  longest               integer not null default 0 check (longest >= 0),
  last_active_date      date,
  grace_used_this_month integer not null default 0 check (grace_used_this_month >= 0),
  grace_month           date
);

-- ── shared surfaces ──────────────────────────────────────────────────────────

create table canvases (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references couples on delete cascade,
  author_id  uuid not null references profiles on delete cascade,
  strokes    jsonb not null,
  created_at timestamptz not null default now()
);

comment on table canvases is
  'Strokes, never a bitmap: a tiny payload, replayable, undoable, and it costs '
  'effectively nothing against the storage budget in docs/COSTS.md.';

create table photos (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references couples on delete cascade,
  author_id    uuid not null references profiles on delete cascade,
  storage_path text not null,
  caption      text,
  created_at   timestamptz not null default now(),
  -- 30-day retention, swept by a scheduled Edge Function. `kept` opts a photo
  -- out; either partner may set it.
  expires_at   timestamptz not null default now() + interval '30 days',
  kept         boolean not null default false
);

create index photos_sweep_idx on photos (expires_at) where not kept;

create table countdowns (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references couples on delete cascade,
  title      text not null,
  target_at  timestamptz not null,
  cover_path text,
  created_at timestamptz not null default now()
);

create table journal_entries (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references couples on delete cascade,
  author_id   uuid not null references profiles on delete cascade,
  body        text,
  place_label text,
  lat         double precision check (lat between -90 and 90),
  lng         double precision check (lng between -180 and 180),
  happened_on date,
  created_at  timestamptz not null default now()
);

create table list_items (
  id        uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples on delete cascade,
  kind      text not null default 'date',
  title     text not null,
  done_at   timestamptz,
  created_at timestamptz not null default now()
);

create table capsules (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references couples on delete cascade,
  author_id    uuid not null references profiles on delete cascade,
  body         text not null,
  deliver_at   timestamptz not null,
  delivered_at timestamptz
);

-- ── plumbing ─────────────────────────────────────────────────────────────────

create table push_tokens (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles on delete cascade,
  platform   text not null check (platform in ('android','ios','web')),
  token      text not null,
  updated_at timestamptz not null default now(),
  unique (profile_id, token)
);

-- Presence is per-person, not per-couple, and is the most sensitive table here.
-- `precision` is 'coarse' unless BOTH partners opted into precise; the check
-- constraint cannot enforce that, so the write path must — see docs/PRIVACY.md.
create table presence (
  profile_id  uuid primary key references profiles on delete cascade,
  status_note text,
  lat         double precision check (lat between -90 and 90),
  lng         double precision check (lng between -180 and 180),
  precision   text not null default 'coarse' check (precision in ('coarse','precise')),
  updated_at  timestamptz not null default now()
);

-- Lookup indexes for the couple-scoped reads the app actually makes.
create index answers_couple_idx        on answers (couple_id, created_at desc);
create index canvases_couple_idx       on canvases (couple_id, created_at desc);
create index photos_couple_idx         on photos (couple_id, created_at desc);
create index journal_couple_idx        on journal_entries (couple_id, happened_on desc);
create index countdowns_couple_idx     on countdowns (couple_id, target_at);
create index list_items_couple_idx     on list_items (couple_id);
create index capsules_delivery_idx     on capsules (deliver_at) where delivered_at is null;
create index prompt_days_couple_idx    on prompt_days (couple_id, local_date desc);
