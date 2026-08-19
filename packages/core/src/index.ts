/**
 * @twoends/core — domain logic, zero platform imports.
 *
 * Hard rule: nothing in this package may import from `react`, `dom` typings,
 * `@capacitor/*`, `dexie`, or `@supabase/*`. It must run in a bare Node process.
 * `src/boundary.test.ts` fails the build the moment that stops being true.
 *
 * Anything that touches a device API goes behind an adapter interface defined
 * here and implemented in the app layer, so the PWA degrades instead of crashing.
 */

// Generated from the live schema by `pnpm db:types`. Pure type declarations,
// zero runtime, so it does not breach the no-platform-imports rule above.
export type { Database, Json } from './database.types.ts';

export * from './accents.ts';
export * from './types.ts';
export * from './togetherness.ts';
export * from './seam.ts';
export * from './streak.ts';
export * from './sync.ts';
export * from './daily.ts';
export * from './streakMath.ts';
export * from './prompts.ts';
export * from './cards.ts';
export * from './occasions.ts';
export * from './dedication.ts';
export * from './consent.ts';
export * from './strokes.ts';
export * from './distance.ts';
export * from './zip.ts';
export * from './fixtures/sampleCouple.ts';
