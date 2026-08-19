import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminClient, createUser, deleteUsers, requireKeys, type TestUser } from './helpers.ts';

/**
 * Comments on snaps.
 *
 * Two things worth asking the database rather than the app.
 *
 * The first is the retention promise. Photos carry `expires_at` and are swept
 * after thirty days unless one of them keeps it, and the app tells people that
 * plainly. A comment that outlived its photo would be a piece of a conversation
 * about a picture nobody can see — and, worse, a row that survived a deletion
 * the app said had happened.
 *
 * The second is that this is deliberately *not* gated the way answers and picks
 * are. Both of them see a comment immediately. That is a decision rather than an
 * oversight, so it is asserted here: if somebody later copies the reveal policy
 * from the nearest migration, this goes red.
 */

const admin = () => adminClient();
const users: TestUser[] = [];

let alice: TestUser;
let bob: TestUser;
let coupleId: string;
let photoId: string;

async function newUser(label: string): Promise<TestUser> {
  const u = await createUser(label);
  await admin().from('profiles').insert({ id: u.id, display_name: label, accent_key: 'teal' });
  users.push(u);
  return u;
}

async function newPhoto(): Promise<string> {
  const { data } = await admin()
    .from('photos')
    .insert({
      couple_id: coupleId,
      author_id: alice.id,
      storage_path: `${coupleId}/${crypto.randomUUID()}.jpg`,
    })
    .select('id')
    .single();
  return data!.id as string;
}

beforeAll(async () => {
  requireKeys();

  alice = await newUser('snapc-a');
  bob = await newUser('snapc-b');

  const { data: code } = await alice.db.rpc('create_invite');
  const { data } = await bob.db.rpc('redeem_invite', { p_code: code });
  coupleId = data as string;

  photoId = await newPhoto();
}, 60_000);

afterAll(async () => {
  await deleteUsers(users);
});

describe('a comment is a reaction, not an answer', () => {
  it('is visible to the other one straight away', async () => {
    /*
      The opposite of the rule everywhere else, and on purpose. Answers and
      picks hide until both have moved because seeing theirs first would change
      what you write; a photograph cannot be changed by being looked at.
    */
    const written = await bob.db.from('snap_comments').insert({
      couple_id: coupleId,
      photo_id: photoId,
      author_id: bob.id,
      body: 'your hair looks good',
    });
    expect(written.error).toBeNull();

    const { data } = await alice.db.from('snap_comments').select('body').eq('photo_id', photoId);
    expect(data).toHaveLength(1);
    expect(data![0]!.body).toBe('your hair looks good');
  });

  it('is not visible to anybody else', async () => {
    const stranger = await newUser('snapc-c');
    const { data } = await stranger.db.from('snap_comments').select('id').eq('photo_id', photoId);
    expect(data ?? []).toHaveLength(0);
  });
});

describe('who may say and unsay things', () => {
  it('refuses a comment signed in the other name', async () => {
    const forged = await bob.db.from('snap_comments').insert({
      couple_id: coupleId,
      photo_id: photoId,
      author_id: alice.id,
      body: 'she did not write this',
    });
    expect(forged.error).not.toBeNull();
  });

  it('refuses an empty one', async () => {
    const blank = await bob.db.from('snap_comments').insert({
      couple_id: coupleId,
      photo_id: photoId,
      author_id: bob.id,
      body: '   ',
    });
    expect(blank.error).not.toBeNull();
  });

  it('lets nobody rewrite what was said', async () => {
    // A comment that can be silently changed after it has been read is one you
    // cannot trust having read. Delete and say it again instead.
    await bob.db.from('snap_comments').update({ body: 'something else' }).eq('photo_id', photoId);
    const { data } = await admin().from('snap_comments').select('body').eq('photo_id', photoId);
    expect(data![0]!.body).toBe('your hair looks good');
  });

  it('refuses her deleting his', async () => {
    await alice.db.from('snap_comments').delete().eq('photo_id', photoId);
    const { data } = await admin().from('snap_comments').select('id').eq('photo_id', photoId);
    expect(data ?? [], 'alice deleted a comment bob wrote').toHaveLength(1);
  });

  it('lets him take back his own', async () => {
    const mine = await newPhoto();
    await bob.db
      .from('snap_comments')
      .insert({ couple_id: coupleId, photo_id: mine, author_id: bob.id, body: 'never mind' });

    await bob.db.from('snap_comments').delete().eq('photo_id', mine);
    const { data } = await admin().from('snap_comments').select('id').eq('photo_id', mine);
    expect(data ?? []).toHaveLength(0);
  });
});

describe('nothing outlives the photo it is about', () => {
  it('goes when the photo goes', async () => {
    /*
      The property that makes this safe to add at all. Photos are swept after
      thirty days unless kept, and the app promises that out loud. A comment
      left behind would be both a fragment of nothing and a row surviving a
      deletion the app reported as done.
    */
    const doomed = await newPhoto();
    await bob.db
      .from('snap_comments')
      .insert({ couple_id: coupleId, photo_id: doomed, author_id: bob.id, body: 'about this one' });

    await admin().from('photos').delete().eq('id', doomed);

    const { data } = await admin().from('snap_comments').select('id').eq('photo_id', doomed);
    expect(data ?? [], 'a comment survived its photo').toHaveLength(0);
  });
});
