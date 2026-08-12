-- Turn realtime on.
--
-- Subscribing to `postgres_changes` succeeds whether or not a table is actually
-- published, and then silently delivers nothing forever. Phase 3 shipped a
-- realtime bridge that had never once fired, and the symptom was not an error —
-- it was one partner sitting on the invite screen watching nothing happen while
-- the other had already joined.
--
-- `pull()` still runs on every reconnect and remains the source of truth, which
-- is why the app worked at all: a reload fixed everything, which is exactly the
-- shape of bug that survives testing.

alter publication supabase_realtime add table couples;
alter publication supabase_realtime add table profiles;
alter publication supabase_realtime add table countdowns;
alter publication supabase_realtime add table answers;
alter publication supabase_realtime add table journal_entries;
alter publication supabase_realtime add table canvases;
alter publication supabase_realtime add table list_items;
alter publication supabase_realtime add table photos;

/*
  DELETE events carry only the primary key by default, so a subscription
  filtered on `couple_id=eq.…` never matches one — the column simply is not in
  the payload. The row would vanish on the server and linger on the partner's
  device until the next full pull.

  REPLICA IDENTITY FULL puts the whole old row in the WAL, which costs a little
  write amplification on tables that are tiny by construction: one couple's
  countdowns, drawings and journal entries.
*/
alter table countdowns replica identity full;
alter table answers replica identity full;
alter table journal_entries replica identity full;
alter table canvases replica identity full;
alter table list_items replica identity full;
alter table photos replica identity full;
alter table couples replica identity full;
