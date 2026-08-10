import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Node environment across the board for now: everything under test in
    // Phase 0 is pure logic, and the boundary test depends on there being no
    // `document` in scope. When Phase 3 adds component tests they get their own
    // jsdom project rather than relaxing this globally.
    environment: 'node',
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/dist-*/**'],
  },
});
