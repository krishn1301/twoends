import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      /*
        `injectManifest` rather than `generateSW`: the worker has to handle push
        and notification clicks, which a generated one cannot do. Workbox still
        writes the precache list into it.
      */
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      /*
        Registered by hand in `main.tsx` instead of being injected here, because
        the one place it must *not* register is the Android app — see the guard
        there. The plugin injects a script tag into `index.html`, and that same
        `index.html` is the file the worker precaches, so there is no way to
        make the injected version conditional after the fact.
      */
      injectRegister: null,
      // The manifest is hand-written in public/ and already correct.
      manifest: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,woff2,png,webmanifest}'],
      },
      devOptions: { enabled: false },
    }),
  ],

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
