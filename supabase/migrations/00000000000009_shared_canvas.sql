-- The canvas becomes one shared surface rather than a stream of messages.
--
-- It shipped as "each drawing is a thing you sent", like a photograph. That is
-- wrong for the feature people actually want: you open the canvas, see what is
-- already there — including what they drew — and add to it.
--
-- The rows stay as they are. What changes is how they are read: a canvas is the
-- union of every batch of strokes since the last clear, in order. That keeps the
-- append-only property, which is what makes concurrent drawing safe. Two people
-- scribbling at the same time on two phones produce two batches that merge by
-- timestamp, with nothing to overwrite and no conflict to resolve.
--
-- A single mutable row would have meant last-write-wins, and whoever tapped send
-- second would quietly erase the other.

alter table canvases add column is_clear boolean not null default false;

comment on column canvases.is_clear is
  'A tombstone. Rendering starts from the most recent one of these, so clearing '
  'is itself an append rather than a delete — which means it syncs, survives '
  'offline, and cannot race with someone drawing at the same moment.';

-- Reading a canvas means "everything since the last clear", so the index that
-- matters is by couple and time.
create index if not exists canvases_couple_time_idx on canvases (couple_id, created_at desc);
