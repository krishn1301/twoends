/**
 * @twoends/ui — components and design primitives.
 *
 * Populated at the close of Phase 0, when the Bento direction won and the other
 * two candidates were deleted.
 *
 * Unlike `@twoends/core`, this package may import React and touch the DOM. It
 * may not import `@capacitor/*` or `@supabase/*` — components render, they do
 * not fetch. Colour tokens live in `apps/web/src/styles/theme.css`, because
 * Tailwind 4 requires `@theme` to sit in the CSS entry point.
 */

export * from './media.tsx';
export * from './layout.tsx';
