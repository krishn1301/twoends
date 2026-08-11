import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],

  /*
    GitHub Pages serves a project site from `/<repo>/`, so the built asset URLs
    need that prefix. Left as `/` for local dev and for any host that serves
    from a domain root, and set by the deploy script.
  */
  base: process.env.VITE_BASE ?? '/',

  /*
    Vite looks for `.env.local` beside this config — that is, in `apps/web` —
    but the repo keeps one at the root so the app and the leak suite read the
    same file. Without this, `import.meta.env.VITE_*` is silently undefined and
    the app dies on a missing-key throw with no hint as to why.
  */
  envDir: fileURLToPath(new URL('../../', import.meta.url)),
  server: {
    // `pnpm dev --host` binds to the LAN so the S9+ can load the app off this
    // laptop over Wi-Fi. That is the dev loop for every phase before the
    // Capacitor shell exists, so it is worth having in the config, not the flag.
    host: true,
    port: 5173,
    strictPort: true,
  },
});
