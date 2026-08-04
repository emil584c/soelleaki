import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.jsx';
import { applyTheme, resolveTheme } from './lib/theme.js';
import './styles.css';

applyTheme(resolveTheme());

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service worker'en giver app-skallen offline, så appen åbner i en butik
// med dårlig dækning. Selve produktopslaget kræver stadig net.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Uden service worker virker alt stadig — bare ikke offline.
    });
  });
}
