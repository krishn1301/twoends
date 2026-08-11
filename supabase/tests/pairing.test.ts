import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminClient, createUser, deleteUsers, requireKeys, type TestUser } from './helpers.ts';

/**
 * Pairing, and the ways it could go wrong.
 *
 * Redemption is the one place a stranger is *invited* to touch another couple's
 * data, so it gets its own suite. The interesting cases are not "does pairing
 * work" — they are the refusals: a used code, an expired one, a code for a
 * couple that is already full, and the person who tries to pair with themselves.
 */

const admin = () => adminClient();
const users: TestUser[] = [];

async function newUser(label: string): Promise<TestUser> {
  const u = await createUser(label);
  await admin().from('profiles').insert({ id: u.id, display_name: label, accent_key: 'teal' });
  users.push(u);
  return u;
}

beforeAll(() => {
  requireKeys();
}, 60_000);

afterAll(async () => {
  await deleteUsers(users);
});

describe('creating an invite', () => {
  it('creates the couple on first call and returns a readable code', async () => {
    const alice = await newUser('alice');

    const { data, error } = await alice.db.rpc('create_invite');
    expect(error).toBeNull();
    expect(data).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);

    // No 0/O or 1/I/L — someone has to read this down a phone line.
    expect(data).not.toMatch(/[01OIL]/);

    const couple = await alice.db.from('couples').select('id, member_a, member_b');
    expect(couple.data).toHaveLength(1);
    expect(couple.data?.[0]?.member_a).toBe(alice.id);
    expect(couple.data?.[0]?.member_b).toBeNull();
  });

  it('starts a streak row alongside the couple', async () => {
    const solo = await newUser('solo');
    await solo.db.rpc('create_invite');

    const { data } = await solo.db.from('streaks').select('current');
    expect(data).toHaveLength(1);
    expect(data?.[0]?.current).toBe(0);
  });

  it('refuses once the couple is full', async () => {
    const a = await newUser('full-a');
    const b = await newUser('full-b');

    const { data: code } = await a.db.rpc('create_invite');
    await b.db.rpc('redeem_invite', { p_code: code });

    const { error } = await a.db.rpc('create_invite');
    expect(error?.message).toContain('already_paired');
  });
});

describe('redeeming an invite', () => {
  it('pairs two people, and both then see each other', async () => {
    const a = await newUser('pair-a');
    const b = await newUser('pair-b');

    const { data: code } = await a.db.rpc('create_invite');
    const { data: coupleId, error } = await b.db.rpc('redeem_invite', { p_code: code });
    expect(error).toBeNull();
    expect(coupleId).toBeTruthy();

    // The Phase 2 definition of done: both sides see the other's name and accent.
    for (const [self, other] of [
      [a, b],
      [b, a],
    ] as const) {
      const { data } = await self.db
        .from('profiles')
        .select('id, display_name, accent_key')
        .eq('id', other.id);
      expect(data, `${self.email} could not see their partner`).toHaveLength(1);
      expect(data?.[0]?.accent_key).toBe('teal');
    }
  });

  it('accepts a lowercase, padded code, because people retype what they see', async () => {
    const a = await newUser('case-a');
    const b = await newUser('case-b');

    const { data: code } = await a.db.rpc('create_invite');
    const { error } = await b.db.rpc('redeem_invite', {
      p_code: `  ${String(code).toLowerCase()} `,
    });
    expect(error).toBeNull();
  });

  it('refuses a code that has already been used', async () => {
    const a = await newUser('used-a');
    const b = await newUser('used-b');
    const c = await newUser('used-c');

    const { data: code } = await a.db.rpc('create_invite');
    await b.db.rpc('redeem_invite', { p_code: code });

    const { error } = await c.db.rpc('redeem_invite', { p_code: code });
    expect(error).not.toBeNull();
    // Either message is correct — the couple filled up and the code was spent.
    expect(error?.message).toMatch(/code_already_used|couple_full/);
  });

  it('refuses an expired code', async () => {
    const a = await newUser('exp-a');
    const b = await newUser('exp-b');

    const { data: code } = await a.db.rpc('create_invite', { p_ttl: '-1 second' });
    const { error } = await b.db.rpc('redeem_invite', { p_code: code });
    expect(error?.message).toContain('code_expired');
  });

  it('refuses a code nobody issued', async () => {
    const a = await newUser('bogus');
    const { error } = await a.db.rpc('redeem_invite', { p_code: 'ZZZZZZ' });
    expect(error?.message).toContain('invalid_code');
  });

  it('refuses to let someone pair with themselves', async () => {
    const a = await newUser('narcissus');
    const { data: code } = await a.db.rpc('create_invite');

    const { error } = await a.db.rpc('redeem_invite', { p_code: code });
    // Caught by the already-paired check: creating an invite made them member_a.
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/already_paired|cannot_pair_with_yourself/);
  });

  it('refuses someone who is already in a couple', async () => {
    const a = await newUser('taken-a');
    const b = await newUser('taken-b');
    const c = await newUser('taken-c');

    const { data: firstCode } = await a.db.rpc('create_invite');
    await b.db.rpc('redeem_invite', { p_code: firstCode });

    const { data: secondCode } = await c.db.rpc('create_invite');
    const { error } = await b.db.rpc('redeem_invite', { p_code: secondCode });
    expect(error?.message).toContain('already_paired');
  });

  it('kills every other outstanding code once the pair is complete', async () => {
    const a = await newUser('extra-a');
    const b = await newUser('extra-b');

    // Someone loses the first code and generates another. Both are live.
    const { data: lost } = await a.db.rpc('create_invite');
    const { data: used } = await a.db.rpc('create_invite');
    expect(lost).not.toBe(used);

    await b.db.rpc('redeem_invite', { p_code: used });

    // A screenshot of the lost code must not still open the door.
    const { data: remaining } = await admin()
      .from('invites')
      .select('code, used_at')
      .eq('code', lost);
    expect(remaining).toEqual([]);
  });

  it('does not reveal a code to anyone but its creator', async () => {
    const a = await newUser('secret-a');
    const nosy = await newUser('nosy');

    await a.db.rpc('create_invite');

    // Six characters are guessable if the table can be listed at all.
    const { data } = await nosy.db.from('invites').select('code');
    expect(data).toEqual([]);
  });
});

describe('unpairing takes both people', () => {
  it('will not delete on one person’s say-so', async () => {
    const a = await newUser('split-a');
    const b = await newUser('split-b');

    const { data: code } = await a.db.rpc('create_invite');
    const { data: coupleId } = await b.db.rpc('redeem_invite', { p_code: code });

    const requested = await a.db.rpc('request_unpair');
    expect(requested.error).toBeNull();

    // The one who asked cannot also confirm. A single tap during an argument
    // must not be able to delete someone else's memories.
    const selfConfirm = await a.db.rpc('confirm_unpair');
    expect(selfConfirm.error?.message).toContain('partner_must_confirm');

    const stillThere = await admin().from('couples').select('id').eq('id', coupleId);
    expect(stillThere.data).toHaveLength(1);
  });

  it('can be called off', async () => {
    const a = await newUser('calm-a');
    const b = await newUser('calm-b');

    const { data: code } = await a.db.rpc('create_invite');
    await b.db.rpc('redeem_invite', { p_code: code });

    await a.db.rpc('request_unpair');
    await a.db.rpc('cancel_unpair');

    const { error } = await b.db.rpc('confirm_unpair');
    expect(error?.message).toContain('no_unpair_requested');
  });

  it('deletes the shared life when the partner confirms', async () => {
    const a = await newUser('end-a');
    const b = await newUser('end-b');

    const { data: code } = await a.db.rpc('create_invite');
    const { data: coupleId } = await b.db.rpc('redeem_invite', { p_code: code });

    await admin()
      .from('journal_entries')
      .insert({ couple_id: coupleId, author_id: a.id, body: 'the bench' });
    await admin()
      .from('countdowns')
      .insert({ couple_id: coupleId, title: 'x', target_at: '2027-01-01T00:00:00Z' });

    await a.db.rpc('request_unpair');
    const { error } = await b.db.rpc('confirm_unpair');
    expect(error).toBeNull();

    // "Real delete" is a headline promise. Verify with the service role, which
    // sees past every policy — an empty result under RLS would prove nothing.
    for (const table of ['couples', 'journal_entries', 'countdowns', 'streaks'] as const) {
      const column = table === 'couples' ? 'id' : 'couple_id';
      const { data } = await admin().from(table).select(column).eq(column, coupleId);
      expect(data, `${table} survived the unpair`).toEqual([]);
    }
  });
});
