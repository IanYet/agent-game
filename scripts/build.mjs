import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

await mkdir('dist/connector', { recursive: true });
await build({ entryPoints: ['apps/connector/src/index.ts'], outfile: 'dist/connector/index.cjs', platform: 'node', target: 'node22', format: 'cjs', bundle: true, sourcemap: false, logLevel: 'info' });
// The ACP adapter is already a self-contained published bundle. CODEX_PATH is always
// set to the user's installed binary, so its optional bundled CLI is unnecessary.
// ACP has no standard ephemeral-session field. This small, guarded extension to
// the pinned adapter always creates a temporary thread through the official API.
// Never patch node_modules or the user's Codex installation/configuration.
let acp = await readFile('node_modules/@agentclientprotocol/codex-acp/dist/index.js', 'utf8');
const start = 'const response = await this.codexClient.threadStart({\n      config: sessionConfig.config,';
const title = 'sessionTitleSource: operation === "resume" ? "unknown" : "unset",';
for (const marker of [start, title]) if (acp.split(marker).length !== 2) throw new Error('Pinned codex-acp changed; review the ephemeral-session extension before packaging.');
acp = acp.replace(start, 'const response = await this.codexClient.threadStart({\n      /* AgentArcade: ephemeral sessions */\n      ephemeral: true,\n      config: sessionConfig.config,')
  .replace(title, 'sessionTitleSource: "explicit",');
await writeFile('dist/connector/codex-acp.mjs', acp);
console.log('Independent outputs: dist/client (static website), dist/connector (local bridge).');
