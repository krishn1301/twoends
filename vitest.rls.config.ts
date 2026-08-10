import { defineConfig } from 'vitest/config';

/**
 * The leak suite runs on its own, not as part of `pnpm test`.
 *
 * It needs a live Postgres, so folding it into the fast unit run would make
 * every `pnpm check` depend on Docker being up — and a check that is slow to
 * start is a check people learn to skip. `pnpm verify` runs both, and that is
 * what CI and pre-merge use.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['supabase/tests/**/*.test.ts'],
    // One database, shared users: parallel files would race on the same rows.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
