-- TwoEnds — storage buckets and their policies.
--
-- Three private buckets. Never a public one: a public bucket means a photograph
-- of two people is one guessed URL away from anybody, forever, and no amount of
-- table-level security compensates for that. Everything is reached through
-- short-lived signed URLs.
--
-- The path convention is load-bearing:
--
--     <couple_id>/<anything>
--
-- The first path segment is the couple that owns the object, which is what lets
-- the same `is_member_of` predicate secure storage exactly as it secures the
-- tables. An object stored outside that convention is unreachable rather than
-- public — the policies below can never match it.

insert into storage.buckets (id, name, public)
values ('photos', 'photos', false),
       ('covers', 'covers', false),
       ('avatars', 'avatars', false)
on conflict (id) do nothing;

-- storage.foldername(name) splits the object path; element 1 is the first
-- segment. Cast is needed because the column is text and couple ids are uuid.
create policy "members read couple media" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('photos', 'covers', 'avatars')
    and is_member_of(((storage.foldername(name))[1])::uuid)
  );

create policy "members upload couple media" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('photos', 'covers', 'avatars')
    and is_member_of(((storage.foldername(name))[1])::uuid)
    and owner = (select auth.uid())
  );

create policy "members update couple media" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('photos', 'covers', 'avatars')
    and is_member_of(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id in ('photos', 'covers', 'avatars')
    and is_member_of(((storage.foldername(name))[1])::uuid)
  );

-- Deletion is deliberately open to both partners rather than the uploader only.
-- "Real delete" is a headline promise (N3): unpairing must be able to wipe every
-- object in the pair, and a rule that let only the uploader delete would leave
-- half the media behind after one person's account was gone.
create policy "members delete couple media" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('photos', 'covers', 'avatars')
    and is_member_of(((storage.foldername(name))[1])::uuid)
  );
