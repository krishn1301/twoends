-- TwoEnds — photos last sixty days, not thirty.
--
-- The retention was sized in Phase 1 for an app with many couples on a 1GB free
-- tier. This one has three. At roughly 300KB a snap and one a day, a couple
-- makes about 110MB a year, so the aggressive TTL was solving a problem that
-- does not exist here — and it was about to start solving it against the wrong
-- thing, because the monthly recap is meant to be the lasting record of a month
-- and a recap whose photographs have been swept is a page of gaps.
--
-- Sixty rather than forty-five. Forty-five moves the problem: a photo would
-- still appear in exactly one recap and then die. Sixty means every photo is
-- still there when the recap that wants it is built, and the recap marks the
-- ones it used `kept`, which opts them out for good.
--
-- Worth writing down, because it changes what this migration is: **nothing has
-- ever swept a photo.** The schema comment in migration 1 says "swept by a
-- scheduled Edge Function" and no such function was ever written — there is one
-- pg_cron job in this project and it belongs to `occasions`. So no photograph
-- has been lost, there is no backlog of gaps, and this is not a rescue. It is
-- making the stated rule the one anybody would want before something starts
-- enforcing it.

alter table photos
  alter column expires_at set default now() + interval '60 days';

/*
  The rows that already exist.

  Dated from when the photo was taken rather than from now, so a snap sent
  yesterday and one sent last month do not both suddenly get sixty days from
  today — the point is a fixed life, not a rolling one.

  `kept` rows are left alone. Their `expires_at` is already meaningless (the
  sweep index excludes them) and rewriting it would only make it look like it
  meant something.
*/
update photos
  set expires_at = created_at + interval '60 days'
  where not kept;

comment on column photos.expires_at is
  'Sixty days from the snap being taken. Nothing enforces it yet: there is no '
  'sweeper, deliberately — see migration 25. The column is the promise the app '
  'makes in Snaps, and the date the "goes in N days" line counts down to.';
