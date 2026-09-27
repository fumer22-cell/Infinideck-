import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/App';
import '@fontsource/silkscreen/latin-400.css';
import '@fontsource/silkscreen/latin-700.css';
import '@fontsource/crimson-pro/latin-400.css';
import '@fontsource/crimson-pro/latin-600.css';
import '@fontsource/crimson-pro/latin-400-italic.css';
import './styles.css';

registerSW({ immediate: true });
if (navigator.storage?.persist) void navigator.storage.persist();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.DEV) {
  // test/debug hook for seeding data in development only
  void import('./core/db').then(({ db }) => ((window as unknown as { __grim: unknown }).__grim = { db }));
}
