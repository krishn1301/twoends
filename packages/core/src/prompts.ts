import raw from '../content/prompts.json' with { type: 'json' };

import { deterministicId, type Prompt } from './daily.ts';
import { herPrompts } from './dedication.ts';

/**
 * The prompt packs, loaded from JSON at build time.
 *
 * The file is the source of truth and the database is a copy of it, not the
 * other way round. That is what lets the app pick today's question offline,
 * from a pack that shipped inside the bundle, with no server call — the row in
 * Postgres exists only so an answer has something to point at.
 *
 * Ids are derived from the text. Re-seeding is therefore idempotent, and editing
 * a prompt creates a new one rather than silently rewriting words two people
 * have already answered.
 */

interface PackFile {
  version: number;
  packs: Record<string, { label: string; isAdult: boolean; prompts: string[] }>;
}

const file = raw as PackFile;

export const PROMPT_PACK_VERSION = file.version;

export interface PromptPack {
  key: string;
  label: string;
  isAdult: boolean;
  prompts: Prompt[];
}

export const PROMPT_PACKS: PromptPack[] = Object.entries(file.packs).map(([key, pack]) => ({
  key,
  label: pack.label,
  isAdult: pack.isAdult,
  prompts: pack.prompts.map((body) => ({
    id: deterministicId('twoends.prompt', body),
    body,
    pack: key,
    isAdult: pack.isAdult,
  })),
}));

export const ALL_PROMPTS: Prompt[] = PROMPT_PACKS.flatMap((p) => p.prompts);

/**
 * The prompts a given couple should be served.
 *
 * Adult packs are opt-in and off by default, and the distance pack only appears
 * for people who said they are apart — a question about the hardest hour to be
 * apart is a strange thing to ask someone sharing a bed.
 *
 * **Every option here is a property of the couple, never of the reader.** The
 * daily question is `promptForDay(couple id, date, thisList)`, so the two phones
 * only agree while they build the same list. An option that varied by who was
 * holding the phone would hand them different questions on the same morning and
 * break the reveal that is the entire feature — silently, and only for the pair
 * it was meant as a gift to.
 */
export function promptsFor(options: {
  relationshipType?: string | null;
  adultEnabled?: boolean;
  /** True for the one couple this app was written for. See `isHerCouple`. */
  hasHer?: boolean;
  /**
   * They are in the same place right now.
   *
   * Drops the distance pack for as long as that is true. "What is the hardest
   * hour of the day to be apart" is a strange question to be asked in the
   * kitchen, and it is the same objection that keeps that pack away from
   * couples who never said they were apart in the first place — this is the
   * temporary version of it.
   *
   * There is no separate "together" pack to switch to, and that is deliberate:
   * `core` already is one. Every question in it works in either state, which is
   * what made it the default.
   *
   * A property of the couple, like everything else here. A visit is on the
   * `visits` table, not on whoever is holding the phone.
   */
  together?: boolean;
}): Prompt[] {
  const packs = PROMPT_PACKS.filter((pack) => {
    if (pack.isAdult) return options.adultEnabled === true;
    if (pack.key === 'distance') {
      return options.relationshipType === 'long_distance' && options.together !== true;
    }
    return true;
  }).flatMap((pack) => pack.prompts);

  /*
    Appended rather than declared in `prompts.json`, because that file is what
    `scripts/seed-prompts.mjs` pushes to Postgres and every row it writes has a
    null `couple_id` — which migration 11 makes readable by any signed-in user.
    A hidden pack put there would be published to everybody with an account.
  */
  return options.hasHer ? [...packs, ...herPrompts()] : packs;
}
