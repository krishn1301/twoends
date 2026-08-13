-- Push, and the cap that keeps it kind.
--
-- The build plan's rule: two pushes per person per day, hard cap, and every
-- type individually switchable. That is a product decision, not a technical
-- one — a relationship app that pushes guilt is a product failure — so it is
-- counted server-side rather than trusted to a client that might loop.

create table push_log (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles on delete cascade,
  kind       text not null,
  sent_at    timestamptz not null default now()
);

create index push_log_recent_idx on push_log (profile_id, sent_at desc);

alter table push_log enable row level security;

-- Nobody reads this from a client. It exists so the edge function can count,
-- and the function uses the service role. No policy means no access, which is
-- the correct amount for a table that records when someone was interrupted.
comment on table push_log is
  'Written only by the notify function, read only by it. Enforces the two-a-day '
  'cap. Deliberately has no policies: a client has no business here.';

-- `quiet_until` already exists on couples and has never been used. This is what
-- it is for: while it is set and in the future, no push is sent at all.
comment on column couples.quiet_until is
  'Quiet mode. While set and in the future, streaks do not break and no push is '
  'sent. Exams, travel, a fight, a funeral. Anti-guilt by design.';

-- Web push subscriptions are JSON, not opaque strings, and one person may have
-- several devices. The unique constraint on (profile_id, token) already handles
-- re-subscribing on the same device.
comment on column push_tokens.token is
  'For platform=web this is the JSON PushSubscription, endpoint and keys.';
