import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { discoverHarnesses } from '../apps/connector/src/harness/discovery';
import { inspectCodex, CodexAdapter } from '../apps/connector/src/harness/codex';
import { AcpAdapter } from '../apps/connector/src/harness/acp';
import { LocalBridge } from '../apps/connector/src/bridge';
import { createConnectorServer } from '../apps/connector/src/server';
import { ConnectorClient } from '../apps/web/src/connector';
import { GameController } from '../apps/web/src/controller';
import type { ConnectorInfo } from '../packages/protocol/src';
import type { HarnessAdapter } from '../apps/connector/src/types';

// Explicit real-harness smoke check. Normal npm test never makes inference requests.
const discovery = await discoverHarnesses(process.cwd());
if (!discovery.codexPath || !discovery.acpPath) throw new Error('Install/sign in to Codex and run npm install first.');
const inspection = await inspectCodex(discovery.codexPath);
const kind = process.argv.includes('--native') ? 'codex' : 'codex-acp';
const modelIndex = process.argv.indexOf('--model');
const model = modelIndex >= 0 ? process.argv[modelIndex + 1] : inspection.models.find(m => /luna/.test(m.id))?.id;
const port = Number(process.env.SMOKE_PORT ?? 3321);
const info: ConnectorInfo = { version: 'smoke', protocolVersion: 1, platform: process.platform, port, harnesses: discovery.harnesses, models: inspection.models, auth: inspection.auth };
const bridge = new LocalBridge(info, new Map<string, HarnessAdapter>([['codex', new CodexAdapter(discovery.codexPath, inspection.mcpServers)], ['codex-acp', new AcpAdapter(discovery.acpPath, discovery.codexPath, inspection.mcpServers)]]), resolve('.cache', `smoke-${randomUUID()}`));
const service = createConnectorServer(bridge, ['http://127.0.0.1:4173']); await service.listen();
const browserFetch: typeof fetch = (url, options) => fetch(url, { ...options, headers: { ...Object.fromEntries(new Headers(options?.headers).entries()), Origin: 'http://127.0.0.1:4173' } });
const client = new ConnectorClient(`http://127.0.0.1:${port}`, browserFetch);
const values = new Map<string, string>();
const game = new GameController({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } }, client);
game.botDelayMs = 1;
let lastRevision = 0; let lastStatus = '';
const started = Date.now();
const targetRevision = Number(process.env.SMOKE_TARGET ?? 7);
game.subscribe(() => {
  const snapshot = game.getSnapshot(); const revision = snapshot.game?.revision ?? 0;
  const status = snapshot.seats.map(s => `${s.seat}:${s.status}:${s.lastTool ?? '-'}`).join(' ');
  if (revision !== lastRevision || status !== lastStatus || snapshot.error) {
    console.log(`${Math.round((Date.now() - started) / 1000)}s`, 'revision', revision, snapshot.game?.phase ?? '-', status, snapshot.error ?? ''); lastRevision = revision; lastStatus = status;
  }
});
try {
  await game.connect();
  console.log('REAL inference smoke:', kind, model ?? 'Codex default');
  await game.create(['Echo', 'Atlas', 'Nova'].map(name => ({ name, kind, ...(model ? { model } : {}) })));
  const deadline = Date.now() + 480_000;
  const complete = () => {
    const current = game.getSnapshot().game;
    return !!current && current.revision >= targetRevision && (targetRevision < 7 || current.events.some(e => e.type === 'play'));
  };
  while (!complete() && !game.getSnapshot().error && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 250));
  const snapshot = game.getSnapshot();
  if (snapshot.error) throw new Error(snapshot.error);
  if (!complete()) throw new Error('Real inference smoke timed out.');
  console.log(`PASS: real harness advanced to revision ${snapshot.game!.revision} (${snapshot.game!.phase}), using browser-owned state + MCP.`);
} catch (error: any) { console.error('FAIL:', error.message); process.exitCode = 1; }
finally { await game.disconnect(); await service.close(); }
