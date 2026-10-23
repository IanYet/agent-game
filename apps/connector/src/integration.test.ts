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
import { APP_VERSION, PROTOCOL_VERSION, type AgentSettings } from '@agent-game/protocol';

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
async function fixture(options: { blockFirstTurn?: boolean; customRaise?: boolean } = {}) {
  const port = await freePort();
  const info: ConnectorInfo = { version: APP_VERSION, protocolVersion: PROTOCOL_VERSION, platform: 'win32', port, harnesses: [], models: [], auth: 'chatgpt' };
  const contexts: HarnessContext[] = []; const calls: string[] = []; const closed: string[] = []; const duplicateErrors: boolean[] = [];
  const createdKinds: string[] = [];
  const turns: Array<{ sessionId: string; settings?: AgentSettings }> = [];
  let blocked = false;
  let raised = false;
  const adapter: HarnessAdapter = { id: 'codex-acp', createSession: async context => {
    contexts.push(context);
    const client = new Client({ name: 'test-agent', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(context.mcpUrl)));
    const sessionId = randomUUID();
    return {
      sessionId,
      playTurn: async (_prompt, signal, settings) => {
        turns.push({ sessionId, settings });
        if (options.blockFirstTurn && !blocked) {
          blocked = true;
          await new Promise<void>((_resolve, reject) => { const abort = () => reject(new Error('test turn interrupted')); if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true }); });
        }
        const invoke = async (name: string, args = {}) => { calls.push(name); const r = await client.callTool({ name, arguments: args }); return { isError: r.isError === true, data: JSON.parse((r.content as Array<{ text: string }>)[0].text) }; };
        const { data: state } = await invoke('game_get_state');
        expect(state.players.filter((p: any) => p.hand).map((p: any) => p.seat)).toEqual([context.seat]);
        const { data: legal } = await invoke('game_legal_actions', { offset: 0, limit: 100 });
        const action = state.gameId === 'holdem' ? legal.actions.find((a: any) => a.id === 'check') ?? legal.actions.find((a: any) => a.id === 'call') ?? legal.actions[0] : legal.actions.find((a: any) => a.id === 'bid-3') ?? legal.actions[0];
        if (!action) throw new Error('agent has no action');
        const custom = options.customRaise && !raised && legal.betting?.canRaise ? { actionId: 'raise', amount: legal.betting.minRaiseTo + 3 } : null;
        if (custom) raised = true;
        const acted = await invoke('game_act', { ...(custom ?? { actionId: action.id }), revision: state.revision }); expect(acted.isError).not.toBe(true);
        const duplicate = await invoke('game_act', { actionId: action.id, revision: state.revision }); duplicateErrors.push(duplicate.isError === true);
      },
      close: async () => { closed.push(sessionId); await client.close(); },
    };
  } };
  const adapters = new Map<string, HarnessAdapter>();
  for (const id of ['codex-acp', 'codex', 'dsh', 'workbuddy']) adapters.set(id, { id, createSession: context => { createdKinds.push(id); return adapter.createSession(context); } });
  const bridge = new LocalBridge(info, adapters, resolve('.cache', `integration-${randomUUID()}`));
  const service = createConnectorServer(bridge, [ORIGIN]); await service.listen();
  const endpoint = `http://127.0.0.1:${port}`;
  const browserFetch: typeof fetch = (url, options) => fetch(url, { ...options, headers: { ...Object.fromEntries(new Headers(options?.headers).entries()), Origin: ORIGIN } });
  const client = new ConnectorClient(endpoint, browserFetch);
  const store = memoryStore(); const game = new GameController(store, client);
  cleanups.push(() => service.close()); cleanups.push(() => game.disconnect());
  return { game, client, store, bridge, endpoint, contexts, calls, closed, duplicateErrors, browserFetch, turns, createdKinds };
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
    await game.connect();
    await game.create([{ name: '你', kind: 'human' }, { name: 'B', kind: 'codex-acp' }, { name: 'C', kind: 'codex-acp' }]);
    const restored = new GameController(store);
    expect(restored.getSnapshot().game?.id).toBe(game.getSnapshot().game?.id);
    expect(restored.getSnapshot().paused).toBe(true);
    expect(restored.getSnapshot().game?.players.filter(p => p.hand)).toHaveLength(1);
  });
  it('版本不兼容时阻止握手并提示下载；更新连接器后可直接重连', async () => {
    const f = await fixture(); f.bridge.info.version = '0.1.9';
    await expect(f.game.connect()).rejects.toThrow('请下载最新连接器');
    expect(f.game.getSnapshot()).toMatchObject({ connected: false, connectorUpdateRequired: true, connector: { version: '0.1.9' } });
    f.bridge.info.version = APP_VERSION;
    await f.game.connect();
    expect(f.game.getSnapshot()).toMatchObject({ connected: true, connectorUpdateRequired: false, error: null });
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
    await f.game.nextRound();
    await until(() => f.game.getSnapshot().game?.phase === 'finished' || !!f.game.getSnapshot().error, 15_000);
    expect(f.game.getSnapshot().error).toBeNull(); expect(f.contexts).toHaveLength(6);
    expect(new Set(f.contexts.map(c => c.mcpUrl)).size).toBe(6);
    expect(f.contexts.slice(3).every(c => c.round === 2)).toBe(true);
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
  it('暂停中断行动但不销毁玩家；继续沿用会话，模型与强度可以分别调整', async () => {
    const f = await fixture({ blockFirstTurn: true });
    f.bridge.info.models = [
      { id: 'a', name: 'A', isDefault: true, defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ effort: 'low', description: '' }, { effort: 'high', description: '' }] },
      { id: 'b', name: 'B', isDefault: false, defaultReasoningEffort: 'medium', supportedReasoningEfforts: [{ effort: 'medium', description: '' }] },
    ];
    await f.game.connect();
    await f.game.create([{ name: '你', kind: 'human' }, { name: 'Atlas', kind: 'codex-acp', model: 'a', reasoningEffort: 'high' }, { name: 'Nova', kind: 'codex-acp', model: 'b', reasoningEffort: 'medium' }], { persistConversations: true });
    f.game.humanAction({ type: 'bid', value: 0 });
    await until(() => f.turns.length === 1);
    const sessionId = f.turns[0].sessionId;
    await f.game.pause();
    expect(f.closed).toHaveLength(0);
    expect(f.game.getSnapshot().seats[1].sessionId).toBe(sessionId);
    expect(f.game.getSnapshot().seats[1].conversationId).toBe(sessionId);
    expect(f.contexts[0]).toMatchObject({ persistConversation: true, model: 'a', reasoningEffort: 'high' });
    expect(f.turns[0].settings).toEqual({ model: 'a', reasoningEffort: 'high' });
    const players = f.game.getSnapshot().game!.players.map(p => ({ ...p })); players[1].model = 'b'; players[1].reasoningEffort = undefined;
    f.game.configurePlayers(players);
    await f.game.resume();
    await until(() => f.turns.length >= 3 && f.game.getSnapshot().game?.turn === 0);
    expect(f.contexts).toHaveLength(2);
    expect(f.turns[1]).toEqual({ sessionId, settings: { model: 'b', reasoningEffort: 'medium' } });
    expect(f.closed).toHaveLength(0);
    await f.game.pause();
    const restored = new GameController(f.store);
    expect(restored.getSnapshot().persistConversations).toBe(true);
    expect(restored.getSnapshot().game!.players[1].model).toBe('b');
  });
  it('同桌按座位路由不同 Harness，各自使用自己的模型目录和默认强度', async () => {
    const f = await fixture();
    f.bridge.info.harnesses = [
      { id: 'codex-acp', name: 'ACP', available: true, protocol: 'ACP', models: [{ id: 'a', name: 'A', isDefault: true, defaultReasoningEffort: 'high', supportedReasoningEfforts: [{ effort: 'high', description: '' }] }] },
      { id: 'codex', name: 'Native', available: true, protocol: 'Codex App Server', models: [{ id: 'b', name: 'B', isDefault: true, defaultReasoningEffort: 'medium', supportedReasoningEfforts: [{ effort: 'medium', description: '' }] }] },
    ];
    await f.game.connect();
    await expect(f.client.createSession({ roomId: randomUUID(), seat: 1, name: 'A', kind: 'codex', model: 'a' })).rejects.toThrow('所选模型');
    await f.game.create([{ name: '你', kind: 'human' }, { name: 'ACP', kind: 'codex-acp' }, { name: 'Native', kind: 'codex' }]);
    f.game.humanAction({ type: 'bid', value: 0 });
    await until(() => f.contexts.length === 2 && f.game.getSnapshot().game?.turn === 0);
    await f.game.pause();
    expect(f.game.getSnapshot().error).toBeNull();
    expect(f.createdKinds).toEqual(['codex-acp', 'codex']);
    expect(f.contexts.map(c => [c.model, c.reasoningEffort])).toEqual([['a', 'high'], ['b', 'medium']]);
    const seats = f.game.getSnapshot().seats;
    expect(new Set(f.turns.map(t => t.sessionId))).toEqual(new Set([seats[1].sessionId, seats[2].sessionId]));
    for (const turn of f.turns) expect(turn.settings).toEqual(turn.sessionId === seats[1].sessionId ? { model: 'a', reasoningEffort: 'high' } : { model: 'b', reasoningEffort: 'medium' });
    expect(new Set(f.contexts.map(c => c.mcpUrl)).size).toBe(2);
  });
  it('默认关闭对话保留，拒绝未知模型或不支持的思考强度', async () => {
    const f = await fixture(); await f.game.connect();
    f.bridge.info.models = [{ id: 'a', name: 'A', isDefault: true, supportedReasoningEfforts: [{ effort: 'low', description: '' }] }];
    await expect(f.client.createSession({ roomId: randomUUID(), seat: 1, name: 'A', kind: 'codex-acp', model: 'unknown' })).rejects.toThrow('所选模型');
    await expect(f.client.createSession({ roomId: randomUUID(), seat: 1, name: 'A', kind: 'codex-acp', model: 'a', reasoningEffort: 'ultra' })).rejects.toThrow('思考强度');
    await f.game.create([{ name: '你', kind: 'human' }, { name: 'B', kind: 'codex-acp' }, { name: 'C', kind: 'codex-acp' }]);
    f.game.humanAction({ type: 'bid', value: 0 }); await until(() => f.contexts.length > 0);
    expect(f.contexts[0].persistConversation).toBe(false);
    expect(f.game.getSnapshot().persistConversations).toBe(false);
    expect(f.game.getSnapshot().seats.every(s => !s.conversationId)).toBe(true);
  });
  it('四种 Harness 混用完成德州；下一手保留筹码、调整阵容、重新创建全部会话并撤销旧凭据', async () => {
    const f = await fixture({ customRaise: true });
    const ids = ['codex-acp', 'codex', 'dsh', 'workbuddy'] as const;
    f.bridge.info.harnesses = ids.map(id => ({ id, name: id, protocol: 'test', available: true, models: [{ id: `${id}-model`, name: id, isDefault: true, defaultReasoningEffort: 'high', supportedReasoningEfforts: [{ effort: 'high', description: '' }] }] }));
    f.bridge.info.auth = 'missing'; // WorkBuddy/dsh must not depend on Codex login.
    await f.game.connect();
    await expect(f.client.createSession({ roomId: randomUUID(), gameId: 'holdem', handId: randomUUID(), seat: 8, name: 'wrong-model', kind: 'dsh', model: 'codex-model' })).rejects.toThrow('所选模型');
    await f.game.create(ids.map((kind,i)=>({name:`P${i}`,kind,model:`${kind}-model`,reasoningEffort:'high'})), {gameId:'holdem'});
    await until(()=>f.game.getSnapshot().game?.phase==='finished' || !!f.game.getSnapshot().error);
    expect(f.game.getSnapshot().error).toBeNull(); expect(f.contexts).toHaveLength(4); expect(f.createdKinds).toEqual(ids);
    await until(()=>f.closed.length===4);
    const first=f.game.getSnapshot().game!; if(first.gameId!=='holdem') throw new Error('expected poker');
    expect(first.result?.deltas.reduce((a,b)=>a+b,0)).toBe(0); expect(first.events.some(e=>e.type==='raise' && e.text.includes('23'))).toBe(true);
    for(const context of f.contexts) {
      const initial=JSON.parse(context.initialState!); expect(initial.players[context.seat].startingChips).toBe(1000);
      expect(initial.players.filter((p:any)=>p.hand).map((p:any)=>p.seat)).toEqual([context.seat]); expect(initial.deck).toBeUndefined();
    }
    const oldUrl=f.contexts[0].mcpUrl;
    const roster=first.players.filter(p=>p.seat!==1).map(({playerId,name,kind,model,reasoningEffort})=>({playerId,name,kind,model,reasoningEffort}));
    roster[0]={...roster[0],name:'替换 Agent',kind:'workbuddy',model:'workbuddy-model',reasoningEffort:'high'};
    await f.game.nextRound([...roster,{name:'新玩家',kind:'dsh',model:'dsh-model',reasoningEffort:'high'}]);
    expect(f.game.handleTool({id:randomUUID(),roomId:first.id,handId:first.handId,seat:0,tool:'game_get_state',args:{}}).isError).toBe(true);
    await until(()=>f.game.getSnapshot().game?.phase==='finished' || !!f.game.getSnapshot().error);
    expect(f.game.getSnapshot().error).toBeNull(); expect(f.contexts).toHaveLength(8);
    const second=f.game.getSnapshot().game!; if(second.gameId!=='holdem') throw new Error('expected poker');
    expect(second.id).toBe(first.id); expect(second.handId).not.toBe(first.handId); expect(new Set(f.contexts.map(c=>c.mcpUrl)).size).toBe(8);
    for(const context of f.contexts.slice(4)) {
      const initial=JSON.parse(context.initialState!), p=initial.players[context.seat], old=first.players.find(o=>o.playerId===p.playerId);
      expect(p.startingChips).toBe(old?.chips ?? 1000); expect(context.handId).toBe(second.handId); expect(context.round).toBe(2);
    }
    expect(second.ledger.slice(-2).map(e=>e.type)).toEqual(['cash-out','buy-in']);
    expect((await fetch(oldUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status).toBe(401);
    await until(()=>f.closed.length===8);
    await f.game.create(ids.slice(0,2).map(kind=>({name:kind,kind,model:`${kind}-model`})),{gameId:'holdem',holdem:{initialChips:200}});
    const fresh=f.game.getSnapshot().game!; if(fresh.gameId!=='holdem') throw new Error('expected poker');
    expect(fresh.id).not.toBe(first.id); expect(fresh.ledger).toHaveLength(2); expect(fresh.players.every(p=>p.startingChips===200)).toBe(true);
  });
  it('九个座位通过真实 HTTP MCP 工作；暂停保留会话，一手进行中不能改阵容', async()=>{
    const f=await fixture({blockFirstTurn:true}); await f.game.connect();
    await f.game.create(Array.from({length:9},(_,i)=>({name:`P${i}`,kind:'dsh' as const})),{gameId:'holdem'});
    await until(()=>f.turns.length===1); expect(f.contexts).toHaveLength(9);
    const sessionId=f.turns[0].sessionId; await f.game.pause();
    const players=f.game.getSnapshot().game!.players;
    expect(()=>f.game.configurePlayers(players.slice(0,8))).toThrow('阵容');
    expect(()=>f.game.configurePlayers(players.map((p,i)=>({...p,...(i===0?{kind:'workbuddy' as const}:{})})))).toThrow('阵容');
    await expect(f.game.nextRound()).rejects.toThrow('尚未结束');
    await f.game.resume(); await until(()=>f.turns.length>1);
    expect(f.turns[1].sessionId).toBe(sessionId); expect(f.contexts).toHaveLength(9);
  });
  it('真人完成最后一次行动也立即关闭会话；本机恢复保留筹码并默认暂停',async()=>{
    const f=await fixture(); await f.game.connect();
    await f.game.create([{name:'你',kind:'human'},{name:'Agent',kind:'workbuddy'}],{gameId:'holdem'});
    await until(()=>f.contexts.length===1);
    f.game.humanAction({type:'call'});
    for(let i=0;i<4;i++) {
      await until(()=>f.game.getSnapshot().game?.turn===0 || f.game.getSnapshot().game?.phase==='finished' || !!f.game.getSnapshot().error);
      if(f.game.getSnapshot().game?.phase==='finished') break;
      f.game.humanAction({type:'check'});
    }
    expect(f.game.getSnapshot().game?.phase).toBe('finished'); await until(()=>f.closed.length===1);
    const restored=new GameController(f.store); expect(restored.getSnapshot().paused).toBe(true);
    const before=f.game.getSnapshot().game!, after=restored.getSnapshot().game!;
    expect(after).toEqual(before); expect(restored.getSnapshot().history[0].gameId).toBe('holdem');
  });
  it('新桌发盲注即全部全下时自动结算并保存牌谱，无需启动推理',async()=>{
    const f=await fixture(); await f.game.connect();
    await f.game.create([{name:'A',kind:'dsh'},{name:'B',kind:'workbuddy'}],{gameId:'holdem',holdem:{initialChips:1,smallBlind:1,bigBlind:1}});
    const state=f.game.getSnapshot();
    expect(state.game?.phase).toBe('finished'); expect(state.history).toHaveLength(1);
    expect(state.history[0].players.reduce((sum,p)=>sum+p.delta,0)).toBe(0); expect(f.contexts).toHaveLength(0);
    expect(new GameController(f.store).getSnapshot().history).toEqual(state.history);
  });
});
