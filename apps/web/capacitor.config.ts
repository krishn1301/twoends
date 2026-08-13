import type { CapacitorConfig } from '@capacitor/cli';

/*
  The native shell.

  This exists for one reason: home-screen widgets. The web app is already a
  usable PWA and nothing in it needs a native runtime — but a widget has to be
  an Android component, registered in a manifest, drawn by the launcher. That
  cannot come from a web build, so there has to be an APK around it.
*/
const config: CapacitorConfig = {
  appId: 'com.twoends.app',
  appName: 'TwoEnds',

  /*
    Vite's output. The GitHub Pages build sets `VITE_BASE=/twoends/` so its
    asset URLs carry the repo prefix; the Android build must not, because the
    WebView serves from the bundle root. `vite.config.ts` already defaults to
    `/`, so `pnpm build` with no VITE_BASE is the right input here.
  */
  webDir: 'dist',

  android: {
    allowMixedContent: false,
  },

  server: {
    /*
      `https://localhost` rather than the older `http://`. Service workers,
      crypto.subtle and the Push API all refuse to run on an insecure origin,
      and the app uses all three.
    */
    androidScheme: 'https',
  },
};

export default config;
