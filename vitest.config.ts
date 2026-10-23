import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@agent-game/core': fileURLToPath(new URL('./packages/game-core/src/index.ts', import.meta.url)), '@agent-game/protocol': fileURLToPath(new URL('./packages/protocol/src/index.ts', import.meta.url)) } },
  test: { include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'], testTimeout: 20_000 },
});
