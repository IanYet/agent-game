import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ calls: [] as Array<{ method: string; params: any }>, rpc: null as any }));
vi.mock('./discovery', () => ({ executableCommand: async () => ({ command: 'test', args: [] }) }));
vi.mock('./rpc', () => ({
  abortError: () => Object.assign(new Error('已暂停'), { name: 'AbortError' }),
  JsonRpcProcess: class extends EventEmitter {
    onRequest: unknown;
    constructor() { super(); state.rpc = this; }
    notify() {}
    close() { return Promise.resolve(); }
    async call(method: string, params: any) {
      state.calls.push({ method, params });
      if (method === 'account/read') return { account: { type: 'chatgpt' } };
      if (method === 'thread/start') return { thread: { id: 'test-thread' }, model: 'default-model', reasoningEffort: 'medium' };
      if (method === 'turn/start') { this.emit('notification', 'turn/started', { turn: { id: 'test-turn' } }); return { turn: { id: 'test-turn' } }; }
      if (method === 'turn/interrupt') this.emit('notification', 'turn/completed', { turn: { id: 'test-turn', status: 'interrupted' } });
      return {};
    }
  },
}));
import { CodexAdapter } from './codex';

describe('Codex 原生玩家会话', () => {
  const context = { scopeId:'run',playerId:'atlas',kind:'codex' as const,name:'Atlas',instructions:'Play through the registered tools.',displayTitle:'同桌 · Atlas',tools:[{name:'observe',description:'Observe',inputSchema:{type:'object' as const}}], model: 'a', reasoningEffort: 'low', cwd: '', mcpUrl: 'http://127.0.0.1/mcp/test', onActivity() {}, onUsage() {} };
  it('默认临时；只有明确开启才持久保存并设置玩家名称', async () => {
    state.calls = [];
    const first = await new CodexAdapter('test').createSession(context);
    expect(state.calls.find(c => c.method === 'thread/start')!.params.ephemeral).toBe(true);
    expect(state.calls.some(c => c.method === 'thread/name/set')).toBe(false); await first.close();
    state.calls = [];
    const second = await new CodexAdapter('test').createSession({ ...context, persistConversation: true });
    expect(state.calls.find(c => c.method === 'thread/start')!.params.ephemeral).toBe(false);
    expect(state.calls.find(c => c.method === 'thread/name/set')!.params.name).toContain('Atlas'); await second.close();
  });
  it('中断后继续使用同一线程，新的模型与强度发送到实际 turn/start', async () => {
    state.calls = [];
    const session = await new CodexAdapter('test').createSession(context);
    const abort = new AbortController();
    const first = session.playTurn('叫分', abort.signal, { model: 'a', reasoningEffort: 'high' });
    await vi.waitFor(() => expect(state.calls.some(c => c.method === 'turn/start')).toBe(true));
    abort.abort(); await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const second = session.playTurn('继续', new AbortController().signal, { model: 'b', reasoningEffort: 'max' });
    await vi.waitFor(() => expect(state.calls.filter(c => c.method === 'turn/start')).toHaveLength(2));
    state.rpc.emit('notification', 'turn/completed', { turn: { id: 'test-turn', status: 'completed' } });
    await second;
    const turns = state.calls.filter(c => c.method === 'turn/start').map(c => c.params);
    expect(turns.map(t => [t.threadId, t.model, t.effort])).toEqual([['test-thread', 'a', 'high'], ['test-thread', 'b', 'max']]);
    expect(state.calls.filter(c => c.method === 'thread/start')).toHaveLength(1); await session.close();
  });
});
