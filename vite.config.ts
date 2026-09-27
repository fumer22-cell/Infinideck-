import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// `vite build --mode artifact` produces a self-contained build for hosting inside a
// claude.ai artifact: relative asset paths, fonts inlined, no service worker.
export default defineConfig(({ mode }) => ({
  base: mode === 'artifact' ? './' : '/',
  build:
    mode === 'artifact'
      ? { outDir: 'dist-artifact', assetsInlineLimit: (file: string) => /\.woff2?$/.test(file) }
      : {},
  plugins: [
    react(),
    VitePWA({
      disable: mode === 'artifact',
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Grimrecall',
        short_name: 'Grimrecall',
        description: 'A spaced-repetition dungeon crawler. Remember, or perish.',
        theme_color: '#15110f',
        background_color: '#15110f',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,wasm,png,svg,ico,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  test: {
    environment: 'node',
  },
}));
