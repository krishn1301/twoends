-- TwoEnds — voice notes.
--
-- Thirty seconds, hard. The cap is not a storage decision — a 30-second Opus
-- clip is about 40KB and a couple could send one a day for a decade inside the
-- free tier. It is what makes them get sent at all: nobody rehearses half a
-- minute, and a voice note with no ceiling becomes a thing you put off until
-- you have something worth saying.
--
-- Its own table rather than a `kind` column on `photos`. Reusing photos would
-- have given retention, keeping and the recap for free, and it would have meant
-- a table called `photos` holding audio — which is the kind of shortcut that is
-- invisible for a year and then costs an afternoon to every person who reads
-- the schema. The retention columns are copied deliberately instead.

create table voice_notes (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references couples on delete cascade,
  author_id    uuid not null references profiles on delete cascade,
  storage_path text not null,

  -- What the recorder actually produced, so playback can show a scrubber before
  -- the file has finished loading and a waveform can be laid out at the right
  -- width. Clamped in the client; checked here because a length nothing agrees
  -- with makes both of those wrong.
  duration_ms  integer not null check (duration_ms > 0 and duration_ms <= 31000),

  -- The shape drawn while it was recorded, as a short array of 0-1 peaks.
  -- Stored rather than computed on playback: decoding audio to draw a waveform
  -- costs more than the clip does to fetch, and the shape somebody watched
  -- while speaking is the honest one to show back.
  peaks        jsonb not null default '[]'::jsonb,

  created_at   timestamptz not null default now(),

  -- Same rules as a snap: sixty days, unless either of them keeps it, and a
  -- recap keeps everything it uses. Nothing sweeps either yet — see migration 25.
  expires_at   timestamptz not null default now() + interval '60 days',
  kept         boolean not null default false
);

create index voice_notes_couple_idx on voice_notes (couple_id, created_at desc);
create index voice_notes_sweep_idx on voice_notes (expires_at) where not kept;

alter table voice_notes enable row level security;

create policy "members read voice notes"
  on voice_notes for select
  using (is_member_of(couple_id));

create policy "members send voice notes"
  on voice_notes for insert
  with check (is_member_of(couple_id) and author_id = (select auth.uid()));

/*
  Either of them may keep one, and either may delete one — the same rule photos
  have, for the same reason. The person who recorded it does not own the memory
  of it, and unpairing has to be able to remove everything the pair made.
*/
create policy "members keep voice notes"
  on voice_notes for update
  using (is_member_of(couple_id))
  with check (is_member_of(couple_id));

create policy "members delete voice notes"
  on voice_notes for delete
  using (is_member_of(couple_id));

comment on table voice_notes is
  'Thirty seconds each, at most. The cap is what makes them get sent; the '
  'storage is negligible either way.';

-- ── the bucket ───────────────────────────────────────────────────────────────
--
-- Private, like the other three. The existing policies name their buckets in a
-- list, so each has to be replaced rather than extended — there is no way to
-- add one to an `in (…)` in place.

insert into storage.buckets (id, name, public)
values ('voice', 'voice', false)
on conflict (id) do nothing;

drop policy if exists "members read couple media" on storage.objects;
drop policy if exists "members upload couple media" on storage.objects;
drop policy if exists "members update couple media" on storage.objects;
drop policy if exists "members delete couple media" on storage.objects;

create policy "members read couple media" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('photos', 'covers', 'avatars', 'voice')
    and is_member_of(((storage.foldername(name))[1])::uuid)
  );

create policy "members upload couple media" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('photos', 'covers', 'avatars', 'voice')
    and is_member_of(((storage.foldername(name))[1])::uuid)
    and owner = (select auth.uid())
  );

create policy "members update couple media" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('photos', 'covers', 'avatars', 'voice')
    and is_member_of(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id in ('photos', 'covers', 'avatars', 'voice')
    and is_member_of(((storage.foldername(name))[1])::uuid)
  );

-- Deletion stays open to both partners rather than the uploader only, for the
-- reason migration 3 gives: unpairing must be able to wipe every object a pair
-- made, and half the media surviving one person's account is not a real delete.
create policy "members delete couple media" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('photos', 'covers', 'avatars', 'voice')
    and is_member_of(((storage.foldername(name))[1])::uuid)
  );
