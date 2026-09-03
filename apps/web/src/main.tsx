import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Self-hosted, not the Google Fonts CDN. An offline-first app with no analytics
// should not make a third-party request just to render its own text — and the
// service worker in Phase 6 can only precache what we serve ourselves.
import '@fontsource-variable/fraunces';
import '@fontsource/karla/400.css';
import '@fontsource/karla/500.css';
import '@fontsource-variable/jetbrains-mono';

import { App } from './App.tsx';
import { startDesignVersion } from './design/version.ts';
import { startServiceWorker } from './lib/serviceWorker.ts';
import './styles/theme.css';

// Before the first render, so nobody who chose the original look watches the
// app flash the other one on every launch.
startDesignVersion();

startServiceWorker();

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
