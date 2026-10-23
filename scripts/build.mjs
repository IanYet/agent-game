import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';

await mkdir('dist/connector', { recursive: true });
await build({ entryPoints: ['apps/connector/src/index.ts'], outfile: 'dist/connector/index.cjs', platform: 'node', target: 'node22', format: 'cjs', bundle: true, sourcemap: false, logLevel: 'info' });
// The ACP adapter is already a self-contained published bundle. CODEX_PATH is always
// set to the user's installed binary, so its optional bundled CLI is unnecessary.
await copyFile('node_modules/@agentclientprotocol/codex-acp/dist/index.js', 'dist/connector/codex-acp.mjs');
console.log('Independent outputs: dist/web (static website), dist/connector (local bridge).');
