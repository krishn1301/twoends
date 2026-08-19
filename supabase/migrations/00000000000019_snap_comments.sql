-- Saying something about a photo.
--
-- A snap arrives and there is nothing to do with it. You can keep it, and that
-- is all — so the reply happens somewhere else, on WhatsApp, and the app that
-- was meant to be the shared space becomes the thing you leave to talk about
-- what is in it.
--
-- **This is deliberately not a both-must-move reveal**, and that is worth saying
-- out loud because every other opinion in this schema is one. Answers, picks and
-- guesses hide until both people have moved, because what is being protected
-- there is the other person's words: seeing them first would change what you
-- write. A comment on a photo is a reaction, not a simultaneous answer. There is
-- nothing to protect and nobody to wait for, and making somebody take a turn
-- before they can say "your hair looks good" would be a policy copied from the
-- nearest migration rather than one anybody decided.

create table snap_comments (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references couples on delete cascade,

  /*
    Cascades from the photo, which is the only thing that makes this safe to
    add. Photos carry `expires_at` and are swept after thirty days unless one of
    you keeps them; a comment that outlived its photo would be a fragment of a
    conversation about a picture nobody can see, and — worse — it would survive
    a retention promise that says the photo is gone.
  */
  photo_id   uuid not null references photos on delete cascade,
  author_id  uuid not null references profiles on delete cascade,

  body       text not null check (length(trim(body)) between 1 and 300),
  created_at timestamptz not null default now()
);

comment on table snap_comments is
  'What one of them said about a photo. Visible immediately — this is a '
  'reaction, not an answer, so none of the both-must-move machinery applies.';

create index snap_comments_photo_idx on snap_comments (photo_id, created_at);

alter table snap_comments enable row level security;

-- The ordinary couple shape, matching the tables in migration 2.
create policy "members read" on snap_comments
  for select using (is_member_of(couple_id));

create policy "members insert" on snap_comments
  for insert with check (is_member_of(couple_id) and author_id = (select auth.uid()));

create policy "authors delete" on snap_comments
  for delete using (is_member_of(couple_id) and author_id = (select auth.uid()));

/*
  No update policy, on purpose, and for the same reason the journal is
  append-only from the partner's side: a comment that can be silently rewritten
  after it has been read is a thing you cannot trust having read. Three hundred
  characters is short enough that deleting and saying it again costs nothing.
*/

-- It should appear on their phone while they are still looking at the photo.
-- That is most of the point of saying something about it.
alter table snap_comments replica identity full;
alter publication supabase_realtime add table snap_comments;
