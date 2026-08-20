#!/usr/bin/env node
/**
 * What a couple will be shown, and when.
 *
 *     pnpm occasions                                  # the dates this was built for
 *     pnpm occasions 2026-03-01 2007-12-18 2008-04-17 # started, mine, theirs
 *
 * This exists because of a problem the feature has by design: occasions are
 * sparse, so the next one for the couple this app was written for is **five
 * months away**. Day 100 passed in July. That means the words cannot be read in
 * place before they fire, and the one thing you must not do to check them is
 * move the date they are checked against — that tests the edit, not the code.
 *
 * So this imports `occasions.ts` and `dedication.ts` themselves and walks the
 * calendar forwards. If what it prints is wrong, the module is wrong; there is
 * no second copy of the rule here to drift.
 *
 * Requires `--experimental-strip-types`, which is how the `pnpm` script invokes
 * it — the modules are TypeScript and nothing in this repo ships compiled JS.
 */
const root = new URL('../packages/core/src/', import.meta.url);
const { occasionFor, minutesFor, occasionHeadline } = await import(
  new URL('occasions.ts', root).href,
);
const { occasionCopy, heldQuotes } = await import(new URL('dedication.ts', root).href);

const [startedOn, myBirthday, theirBirthday] = process.argv.slice(2);

/** The couple this was built for, when asked for nobody in particular. */
const couple = startedOn
  ? { startedOn, myBirthday: myBirthday ?? null, theirBirthday: theirBirthday ?? null }
  : { startedOn: '2026-04-16', myBirthday: '2006-01-13', theirBirthday: '2008-04-18' };

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => d.toISOString().slice(0, 10);

console.log(`\nstarted ${couple.startedOn}`);
console.log(`  you  ${couple.myBirthday ?? '(no birthday)'}`);
console.log(`  them ${couple.theirBirthday ?? '(no birthday)'}\n`);

// ── the one that happens today, and every day ────────────────────────────────

const times = minutesFor(couple.startedOn);
console.log(
  times.length === 0
    ? 'the clock: nothing, with no start date'
    : `the clock, daily at ${times.map((t) => `${pad(t.hour)}:${pad(t.minute)}`).join(' and ')}`,
);
console.log(`   "${occasionCopy('minute')?.line ?? '(unwritten)'}"`);

const quotes = heldQuotes();
console.log(`
holding the counter: one of ${quotes.length} lines, a different one each time`);
for (const quote of quotes) console.log(`   "${quote}"`);

// ── the ones that take the screen ────────────────────────────────────────────

const today = new Date();
today.setUTCHours(0, 0, 0, 0);

console.log('the next ten that take the whole screen:\n');

let found = 0;
for (let i = 0; i < 4000 && found < 10; i++) {
  const localDate = iso(new Date(today.getTime() + i * 86_400_000));
  const occasion = occasionFor({ ...couple, localDate });
  if (!occasion || occasion.kind === 'minute') continue;

  found++;
  const away = i === 0 ? 'today' : `${i} day${i === 1 ? '' : 's'} away`;
  /*
    Asked of `occasionHeadline` rather than restated here. This script grew its
    own copy of the wording and promptly went out of date the day a fourth kind
    of occasion existed, printing "undefined days" for every one of them.
  */
  const what = occasionHeadline(occasion, 'them');

  console.log(`  ${localDate}  ${away.padEnd(16)} ${what.padEnd(16)} ${occasion.key}`);
  console.log(`      "${occasionCopy(occasion.kind, occasion.whose)?.line ?? '(unwritten)'}"`);
}

if (found === 0) console.log('  nothing in the next eleven years, which would be a bug.');
console.log('');
