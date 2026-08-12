-- Profile pictures.
--
-- `profiles.avatar_path` already exists — it was in the original schema and has
-- been null on every row since. What was missing is the storage rule.
--
-- Avatars break the `<couple_id>/…` convention the other buckets use, and they
-- have to: you upload yours before there is a couple, and it must survive
-- unpairing. So the folder is the *person*, and the read rule is the one place
-- in this schema where one user reads another's object — scoped, as everywhere
-- else, to their partner and nobody else.

create policy "read own avatar" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "read partner avatar" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and exists (
      select 1 from couples
      where (member_a = (select auth.uid())
             and member_b::text = (storage.foldername(name))[1])
         or (member_b = (select auth.uid())
             and member_a::text = (storage.foldername(name))[1])
    )
  );

create policy "write own avatar" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and owner = (select auth.uid())
  );

create policy "replace own avatar" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Only your own. A partner cannot remove your face from your own profile.
create policy "delete own avatar" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- The earlier blanket policies covered all three buckets by couple id, which
-- can never match an avatar path and would only confuse the next reader.
drop policy if exists "members read couple media" on storage.objects;
drop policy if exists "members upload couple media" on storage.objects;
drop policy if exists "members update couple media" on storage.objects;
drop policy if exists "members delete couple media" on storage.objects;

create policy "members read couple media" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('photos', 'covers')
    and is_member_of(((storage.foldername(name))[1])::uuid)
  );

create policy "members upload couple media" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('photos', 'covers')
    and is_member_of(((storage.foldername(name))[1])::uuid)
    and owner = (select auth.uid())
  );

create policy "members update couple media" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('photos', 'covers')
    and is_member_of(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id in ('photos', 'covers')
    and is_member_of(((storage.foldername(name))[1])::uuid)
  );

create policy "members delete couple media" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('photos', 'covers')
    and is_member_of(((storage.foldername(name))[1])::uuid)
  );
