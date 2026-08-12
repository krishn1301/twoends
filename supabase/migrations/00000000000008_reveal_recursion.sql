-- Fix: the reveal policy recursed into itself.
--
-- The first version asked "does a row exist in `answers` written by me?" from
-- inside a policy *on* `answers`. Evaluating the subquery re-triggered the
-- policy, which evaluated the subquery, and Postgres stopped it with 42P17,
-- infinite recursion. Every read of the table failed — including the ones the
-- leak suite makes, which is how this was caught before it reached anybody.
--
-- The fix is the same shape as `is_member_of`: a security-definer function.
-- Running as the table owner means row-level security is not applied inside it,
-- so the check completes without re-entering the policy.

drop policy if exists "answers reveal only after you have answered" on answers;

/**
 * Whether the caller has already answered a given day.
 *
 * Only ever looks at the caller's own row — it cannot report anything about the
 * partner, so making it security-definer widens nothing. The `auth.uid()` is
 * taken inside the function rather than passed in, so a caller cannot ask the
 * question on someone else's behalf.
 */
create function i_have_answered(p_prompt_day_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from answers
    where prompt_day_id = p_prompt_day_id
      and author_id = (select auth.uid())
  );
$$;

revoke execute on function i_have_answered(uuid) from public;
grant execute on function i_have_answered(uuid) to authenticated;

create policy "answers reveal only after you have answered" on answers
  as restrictive for select
  using (
    author_id = (select auth.uid())
    or i_have_answered(prompt_day_id)
  );
