import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // `pnpm dev --host` binds to the LAN so the S9+ can load the app off this
    // laptop over Wi-Fi. That is the dev loop for every phase before the
    // Capacitor shell exists, so it is worth having in the config, not the flag.
    host: true,
    port: 5173,
    strictPort: true,
  },
});
