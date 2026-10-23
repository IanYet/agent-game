import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { discoverHarnesses } from '../apps/connector/src/harness/discovery';
import { inspectCodex, CodexAdapter } from '../apps/connector/src/harness/codex';
import { AcpAdapter } from '../apps/connector/src/harness/acp';
import { ExternalAcpAdapter } from '../apps/connector/src/harness/external-acp';
import { LocalBridge } from '../apps/connector/src/bridge';
import { createConnectorServer } from '../apps/connector/src/server';
import { ConnectorClient } from '../apps/web/src/connector';
import { GameController } from '../apps/web/src/controller';
import { APP_VERSION, PROTOCOL_VERSION, type ConnectorInfo, type HarnessId, type ModelInfo } from '../packages/protocol/src';
import type { HarnessAdapter } from '../apps/connector/src/types';

// Explicit real-harness smoke check. Normal npm test never makes inference requests.
const discovery = await discoverHarnesses(process.cwd());
const argument = (name: string) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const holdem = process.argv.includes('--holdem');
const kinds = (argument('--harness') ?? (process.argv.includes('--mixed') ? (holdem ? 'codex-acp,dsh,workbuddy,codex' : 'codex-acp,dsh,workbuddy') : process.argv.includes('--native') ? 'codex' : 'codex-acp')).split(',') as HarnessId[];
if (kinds.some(k => !['codex-acp', 'codex', 'dsh', 'workbuddy'].includes(k))) throw new Error('Unknown --harness');
const adapters = new Map<string, HarnessAdapter>(), catalogs = new Map<string, ModelInfo[]>();
let codexInspection: Awaited<ReturnType<typeof inspectCodex>> | undefined;
for (const kind of new Set(kinds)) {
  if (kind === 'codex' || kind === 'codex-acp') {
    if (!discovery.codexPath || (kind === 'codex-acp' && !discovery.acpPath)) throw new Error('Install/sign in to Codex and run npm install first.');
    codexInspection ??= await inspectCodex(discovery.codexPath);
    catalogs.set(kind, codexInspection.models);
    adapters.set(kind, kind === 'codex' ? new CodexAdapter(discovery.codexPath, codexInspection.mcpServers) : new AcpAdapter(discovery.acpPath!, discovery.codexPath, codexInspection.mcpServers));
  } else {
    const path = kind === 'dsh' ? discovery.dshPath : discovery.workbuddyPath;
    if (!path) throw new Error(`Install/sign in to ${kind} first.`);
    const adapter = new ExternalAcpAdapter(kind, path), inspected = await adapter.inspect();
    catalogs.set(kind, inspected.models); adapters.set(kind, adapter);
  }
  Object.assign(discovery.harnesses.find(h => h.id === kind)!, { available: true, models: catalogs.get(kind) });
}
const players = Array.from({ length: kinds.length === 1 ? 3 : kinds.length }, (_, i) => {
  const kind = kinds[i % kinds.length], models = catalogs.get(kind)!;
  const requested = argument(`--${kind}-model`) ?? (kinds.length === 1 ? argument('--model') : undefined);
  // Prefer the desktop account-backed dsh provider over a separately configured API provider.
  const model = requested ?? (kind === 'dsh' ? models.find(m => m.id.includes('deepseek-account') && /flash/i.test(m.id))?.id : kind.startsWith('codex') ? models.find(m => /luna/.test(m.id))?.id : models.find(m => m.isDefault)?.id);
  if (requested && !models.some(m => m.id === requested)) throw new Error(`${kind} 当前目录没有返回所选模型，请检查其原生模型配置后重试。`);
  if (kind === 'dsh' && !model) throw new Error('dsh 本次目录没有返回账户模型；本检查不会改用需要 API Key 的 provider。请检查 dsh 登录或用 --dsh-model 指定自己的模型。');
  const reasoningEffort = argument(`--${kind}-effort`);
  return { name: `${kind} ${i + 1}`, kind, ...(model ? { model } : {}), ...(reasoningEffort ? { reasoningEffort } : {}) };
});
if (!holdem && players.length !== 3) throw new Error('Dou Dizhu requires exactly three seats.');
const port = Number(process.env.SMOKE_PORT ?? 3321);
const info: ConnectorInfo = { version: APP_VERSION, protocolVersion: PROTOCOL_VERSION, platform: process.platform, port, harnesses: discovery.harnesses, models: codexInspection?.models ?? [], auth: codexInspection?.auth ?? 'unknown' };
const bridge = new LocalBridge(info, adapters, resolve('.cache', `smoke-${randomUUID()}`));
const service = createConnectorServer(bridge, ['http://127.0.0.1:4173']); await service.listen();
const browserFetch: typeof fetch = (url, options) => fetch(url, { ...options, headers: { ...Object.fromEntries(new Headers(options?.headers).entries()), Origin: 'http://127.0.0.1:4173' } });
const client = new ConnectorClient(`http://127.0.0.1:${port}`, browserFetch);
const values = new Map<string, string>();
const game = new GameController({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } }, client);
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
  console.log('REAL inference smoke:', holdem ? 'holdem' : 'doudizhu', JSON.stringify(players));
  await game.create(players, { gameId: holdem ? 'holdem' : 'doudizhu' });
  const deadline = Date.now() + 480_000;
  const complete = () => {
    const current = game.getSnapshot().game;
    return !!current && (current.phase === 'finished' || current.revision >= targetRevision) && (holdem || targetRevision < 7 || current.events.some(e => e.type === 'play'));
  };
  while (!complete() && !game.getSnapshot().error && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 250));
  const snapshot = game.getSnapshot();
  if (snapshot.error) throw new Error(snapshot.error);
  if (!complete()) throw new Error('Real inference smoke timed out.');
  console.log(`PASS: real harness advanced to revision ${snapshot.game!.revision} (${snapshot.game!.phase}), using browser-owned state + MCP.`);
} catch (error: any) { console.error('FAIL:', error.message); process.exitCode = 1; }
finally { await game.disconnect(); await service.close(); }
