/**
 * @twoends/ui — shared components and the design tokens.
 *
 * Deliberately near-empty until Phase 0 closes. The three design shells live in
 * `apps/web/src/design/` while they are still candidates; the winner's tokens
 * and primitives get promoted here, and the other two get deleted rather than
 * kept "just in case". Two abandoned design systems in a shared package is how
 * a codebase stops having a design.
 *
 * Unlike `@twoends/core`, this package may import React and touch the DOM.
 * It may not import `@capacitor/*` or `@supabase/*` — components render, they
 * do not fetch.
 */

/** Placeholder so the package is a module. Replaced when a design wins. */
export const UI_PACKAGE_READY = false;
