-- The one scheduled thing in this backend.
--
-- `notify` deliberately has no cron, no queue and no trigger: it is called by
-- the client the instant an action succeeds, when the sender is provably online,
-- and every one of those three mechanisms is another thing to fail quietly on a
-- free tier. That argument still holds for everything it does.
--
-- It does not hold for a date. An anniversary arriving is not an action anybody
-- takes, so there is nothing to hang it off — and until now the consequence was
-- that the app only wished you if you happened to open it that morning, which is
-- the opposite of what this whole project is for.

create extension if not exists pg_cron;
create extension if not exists pg_net;

/*
  Hourly, not daily, and that is the whole timezone story.

  The function only acts on a couple when it is nine in the morning *where they
  live*, so it has to be given the chance to look every hour. Two people in two
  cities each get their morning rather than one of them getting the other's, and
  a couple who move somewhere new need no migration.

  The token comes out of Vault rather than out of this file, which is committed.
  It is a secret of its own rather than the service key: a scheduler that only
  needs to say "run" should not be carrying a credential that can read every row
  in the database. Created out of band with `vault.create_secret`, so a fresh
  environment needs that one command before this job can do anything — and it
  fails closed, with a 401 the function logs, rather than sending anything wrong.
*/
select cron.schedule(
  'occasions-hourly',
  '0 * * * *',
  $job$
  select net.http_post(
    url := 'https://gwsiivjkpvnygklmlebl.supabase.co/functions/v1/occasions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization',
      'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'occasions_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $job$
);

comment on extension pg_cron is
  'Runs the hourly occasions job, and nothing else. If a second job ever appears '
  'here, the argument in this migration has to be made again for it.';
