import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { get } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ConnectorClient } from '../../web/src/connector';
import { GameController } from '../../web/src/controller';
import { LocalBridge } from './bridge';
import { createConnectorServer } from './server';
import type { ConnectorInfo, HarnessAdapter, HarnessContext } from './types';

const ORIGIN = 'http://127.0.0.1:5173';
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); });
function memoryStore() { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } }; }
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>(resolve => server.close(() => resolve())); return port;
}
async function until(check: () => boolean, timeout = 10_000) {
  const start = Date.now(); while (!check()) { if (Date.now() - start > timeout) throw new Error('condition timed out'); await new Promise(resolve => setTimeout(resolve, 15)); }
}
async function fixture() {
  const port = await freePort();
  const info: ConnectorInfo = { version: 'test', protocolVersion: 1, platform: 'win32', port, harnesses: [], models: [], auth: 'chatgpt' };
  const contexts: HarnessContext[] = []; const calls: string[] = []; const closed: string[] = []; const duplicateErrors: boolean[] = [];
  const adapter: HarnessAdapter = { id: 'codex-acp', createSession: async context => {
    contexts.push(context);
    const client = new Client({ name: 'test-agent', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(context.mcpUrl)));
    const sessionId = randomUUID();
    return {
      sessionId,
      playTurn: async () => {
        const invoke = async (name: string, args = {}) => { calls.push(name); const r = await client.callTool({ name, arguments: args }); return { isError: r.isError === true, data: JSON.parse((r.content as Array<{ text: string }>)[0].text) }; };
        const { data: state } = await invoke('game_get_state');
        expect(state.players.filter((p: any) => p.hand).map((p: any) => p.seat)).toEqual([context.seat]);
        const { data: legal } = await invoke('game_legal_actions', { offset: 0, limit: 100 });
        const action = legal.actions.find((a: any) => a.id === 'bid-3') ?? legal.actions[0];
        if (!action) throw new Error('agent has no action');
        const acted = await invoke('game_act', { actionId: action.id, revision: state.revision }); expect(acted.isError).not.toBe(true);
        const duplicate = await invoke('game_act', { actionId: action.id, revision: state.revision }); duplicateErrors.push(duplicate.isError === true);
      },
      close: async () => { closed.push(sessionId); await client.close(); },
    };
  } };
  const bridge = new LocalBridge(info, new Map([['codex-acp', adapter]]), resolve('.cache', `integration-${randomUUID()}`));
  const service = createConnectorServer(bridge, [ORIGIN]); await service.listen();
  const endpoint = `http://127.0.0.1:${port}`;
  const browserFetch: typeof fetch = (url, options) => fetch(url, { ...options, headers: { ...Object.fromEntries(new Headers(options?.headers).entries()), Origin: ORIGIN } });
  const client = new ConnectorClient(endpoint, browserFetch);
  const store = memoryStore(); const game = new GameController(store, client); game.botDelayMs = 0;
  cleanups.push(() => service.close()); cleanups.push(() => game.disconnect());
  return { game, client, store, bridge, endpoint, contexts, calls, closed, duplicateErrors, browserFetch };
}

describe('静态网页 ↔ 独立连接器 ↔ 标准 MCP', () => {
  it('拒绝未授权来源、伪造 Host 和没有控制令牌的请求', async () => {
    const { endpoint } = await fixture();
    expect((await fetch(`${endpoint}/health`, { headers: { Origin: 'https://untrusted.example' } })).status).toBe(403);
    const badHostStatus = await new Promise<number>(resolve => { get(`${endpoint}/health`, { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode!); }); });
    expect(badHostStatus).toBe(403);
    expect((await fetch(`${endpoint}/api/sessions`, { method: 'DELETE', headers: { Origin: ORIGIN } })).status).toBe(401);
    expect((await fetch(`${endpoint}/mcp/${randomUUID()}/bad`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(401);
    const preflight = await fetch(`${endpoint}/api/connect`, { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Private-Network': 'true' } });
    expect(preflight.status).toBe(204); expect(preflight.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });
  it('一键连接，拒绝第二个网页接管；断开后可重新连接', async () => {
    const { game, browserFetch, endpoint } = await fixture(); await game.connect();
    expect(game.getSnapshot().connected).toBe(true);
    const second = new ConnectorClient(endpoint, browserFetch);
    await expect(second.connect()).rejects.toThrow('另一个网页');
    await game.disconnect(); await game.connect(); expect(game.getSnapshot().connected).toBe(true);
  });
  it('浏览器本地存储恢复牌局，恢复后暂停，不自动消耗订阅', async () => {
    const { game, store } = await fixture();
    await game.create([{ name: '你', kind: 'human' }, { name: 'B', kind: 'bot' }, { name: 'C', kind: 'bot' }]);
    const restored = new GameController(store);
    expect(restored.getSnapshot().game?.id).toBe(game.getSnapshot().game?.id);
    expect(restored.getSnapshot().paused).toBe(true);
    expect(restored.getSnapshot().game?.players.filter(p => p.hand)).toHaveLength(1);
  });
  it('三个独立会话走真实 HTTP MCP 完成整局，手牌隔离，拒绝重复行动，自动收尾', async () => {
    const f = await fixture(); await f.game.connect();
    await f.game.create(['Echo', 'Atlas', 'Nova'].map(name => ({ name, kind: 'codex-acp' })));
    await until(() => f.game.getSnapshot().game?.phase === 'finished' || !!f.game.getSnapshot().error, 15_000);
    const state = f.game.getSnapshot();
    expect(state.error).toBeNull(); expect(state.game?.phase).toBe('finished');
    expect(f.contexts).toHaveLength(3); expect(new Set(f.contexts.map(c => c.mcpUrl)).size).toBe(3);
    expect(f.duplicateErrors.length).toBeGreaterThan(10); expect(f.duplicateErrors.every(Boolean)).toBe(true);
    expect(state.game?.result?.deltas.reduce((a, b) => a + b)).toBe(0); expect(state.history).toHaveLength(1);
    await until(() => f.closed.length === 3); expect(state.game?.viewer).toBeNull();
    const oldUrl = f.contexts[0].mcpUrl;
    expect((await fetch(oldUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(401);
  });
  it('连接断开后立即暂停，旧的座位凭据失效', async () => {
    const f = await fixture(); await f.game.connect();
    await f.game.create([{ name: '你', kind: 'human' }, { name: 'B', kind: 'codex-acp' }, { name: 'C', kind: 'codex-acp' }]);
    f.game.humanAction({ type: 'bid', value: 0 });
    await until(() => f.contexts.length > 0);
    await f.bridge.disconnect();
    await until(() => !f.game.getSnapshot().connected);
    expect(f.game.getSnapshot().paused).toBe(true);
  });
});
