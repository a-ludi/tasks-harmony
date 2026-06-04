import { resolve } from 'path';
import { createRequire } from 'module';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const require = createRequire(import.meta.url);
const { version } = require('./package.json');
const buildDate = new Date().toISOString().substring(0, 10);

// Expose to import.meta.env.VITE_* (works in both dev and prod)
process.env.VITE_APP_VERSION = version;
process.env.VITE_BUILD_DATE = buildDate;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: true },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      manifest: {
        name: 'Tasks Harmony',
        short_name: 'Tasks',
        description: 'Gamified recurring chore tracker',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
});
