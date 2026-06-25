import { resolve } from 'path';
import { readFileSync } from 'fs';
import { randomBytes } from 'crypto';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const { version } = JSON.parse(readFileSync('package.json', 'utf-8'));
const buildDate = new Date().toISOString().substring(0, 10);

function splitSecret(): { partA: string; partB: string; partC: string } {
  const raw = process.env.VITE_SYNC_APP_SECRET ?? '';
  if (!raw) {
    const zero = Buffer.alloc(32).toString('base64');
    return { partA: zero, partB: zero, partC: zero };
  }
  const secret = Buffer.from(raw, 'base64');
  const noiseA = randomBytes(32);
  const noiseB = randomBytes(32);
  const partC = Buffer.from(secret.map((b, i) => b ^ noiseA[i]! ^ noiseB[i]!));
  return {
    partA: noiseA.toString('base64'),
    partB: noiseB.toString('base64'),
    partC: partC.toString('base64'),
  };
}

const { partA, partB, partC } = splitSecret();

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
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
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(version),
    'import.meta.env.VITE_BUILD_DATE': JSON.stringify(buildDate),
    'import.meta.env.VITE_SYNC_URL': JSON.stringify(process.env.VITE_SYNC_URL ?? ''),
    '__SYNC_PART_A__': JSON.stringify(partA),
    '__SYNC_PART_B__': JSON.stringify(partB),
    '__SYNC_PART_C__': JSON.stringify(partC),
  },
  server: {
    proxy: {
      '/sync': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});
