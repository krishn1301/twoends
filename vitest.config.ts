import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Node environment across the board for now: everything under test in
    // Phase 0 is pure logic, and the boundary test depends on there being no
    // `document` in scope. When Phase 3 adds component tests they get their own
    // jsdom project rather than relaxing this globally.
    environment: 'node',
    /*
      `scripts/` is in here for one file: the rule deciding which accounts a
      sweep of the live development project may delete. That decision used to
      be a comment in a destructive script, and the only way to check it was to
      run it.
    */
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'scripts/**/*.test.mjs'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/dist-*/**'],
  },
});
