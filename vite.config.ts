import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: 'apps/web',
  base: process.env.PAGES_BASE_PATH ?? './',
  plugins: [react()],
  resolve: { alias: { '@agent-game/core': fileURLToPath(new URL('./packages/game-core/src/index.ts', import.meta.url)), '@agent-game/protocol': fileURLToPath(new URL('./packages/protocol/src/index.ts', import.meta.url)) } },
  build: { outDir: '../../dist/client', emptyOutDir: true },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
});
