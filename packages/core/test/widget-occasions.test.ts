import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { MILESTONES } from '../src/occasions.ts';

/**
 * The Kotlin copy of "what today is", checked against the real one.
 *
 * A widget cannot run TypeScript, and the alternative — the app writing a
 * finished label into the snapshot — fails on precisely the morning the feature
 * exists for, because a label is computed when the app was last opened and this
 * has to be right when it has not been opened for a week. So the rule is written
 * twice, on purpose, and the duplication is the thing that needs guarding.
 *
 * Nobody would notice a drift. Both copies would keep working, and the only
 * symptom would be a home screen quietly disagreeing with the app about whether
 * today was day 1000 — once, years from now, on a morning that cannot be redone.
 */

const KOTLIN = fileURLToPath(
  new URL(
    '../../../apps/web/android/app/src/main/java/com/twoends/app/widget/Theme.kt',
    import.meta.url,
  ),
);

const source = () => readFileSync(KOTLIN, 'utf8');

describe('the widget agrees with core about what today is', () => {
  it('has the same milestones, in the same order', () => {
    const line = /private val MILESTONES = longArrayOf\(([^)]*)\)/.exec(source());
    expect(line, 'MILESTONES has moved or been renamed in Theme.kt').not.toBeNull();

    const kotlin = line![1]!
      .split(',')
      .map((n) => Number(n.trim().replace(/_/g, '')))
      .filter((n) => Number.isFinite(n));

    expect(kotlin).toEqual([...MILESTONES]);
  });

  it('leaves out the yearly counts, for the reason core does', () => {
    // "365 days" and "one year" are the same sentence said twice, and for the
    // couple this was built for they land on the same morning. A rule that
    // cannot fire twice beats a rule about which one wins — on both platforms.
    const line = /private val MILESTONES = longArrayOf\(([^)]*)\)/.exec(source())![1]!;
    for (const yearly of ['365', '730', '1095']) {
      expect(line, `${yearly} duplicates an anniversary`).not.toContain(yearly);
    }
  });

  it('resolves the April cluster the same way round', () => {
    /*
      Precedence is anniversary, then a birthday, then a milestone. Asserted
      against the order the checks appear in the Kotlin, because there it *is*
      the order of the `if`s — which is exactly the accident `occasions.ts`
      exists to avoid, and worth pinning on the side that cannot be unit tested
      from here.
    */
    const body = source();
    const anniversary = body.indexOf('years today');
    const birthday = body.indexOf('’s birthday');
    const milestone = body.indexOf('days today');
    const monthly = body.indexOf('months today');

    expect(anniversary, 'the anniversary branch is missing').toBeGreaterThan(-1);
    expect(birthday).toBeGreaterThan(anniversary);
    expect(milestone).toBeGreaterThan(birthday);
    expect(monthly, 'the monthly branch is missing or too early').toBeGreaterThan(milestone);
  });

  it('clamps a monthly to the last day of a short month, as core does', () => {
    /*
      The rule that decides whether a couple who started on the 31st get seven
      of these a year or twelve. Both copies have to make the same choice, and
      it is invisible on either side until February.
    */
    expect(source(), 'the widget does not clamp to the last day').toContain('lengthOfMonth()');
  });

  it('never announces the minute', () => {
    // Sixty seconds is not something a launcher redraws for, and a widget that
    // tried would be wrong for most of the minute it was about.
    expect(source()).not.toContain('minutesFor');
  });
});
