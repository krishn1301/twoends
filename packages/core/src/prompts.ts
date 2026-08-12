import raw from '../content/prompts.json' with { type: 'json' };

import { deterministicId, type Prompt } from './daily.ts';

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
 */
export function promptsFor(options: {
  relationshipType?: string | null;
  adultEnabled?: boolean;
}): Prompt[] {
  return PROMPT_PACKS.filter((pack) => {
    if (pack.isAdult) return options.adultEnabled === true;
    if (pack.key === 'distance') return options.relationshipType === 'long_distance';
    return true;
  }).flatMap((pack) => pack.prompts);
}
