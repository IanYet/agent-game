import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HarnessContext } from '../types';

const state = vi.hoisted(() => ({ rpc: null as any, prompt: null as any }));
vi.mock('node:fs/promises', () => ({ readFile: async () => 'AgentArcade: ephemeral sessions' }));
vi.mock('./discovery', () => ({ executableCommand: async () => ({ command: 'test', args: [] }) }));
vi.mock('./rpc', () => ({
  abortError: () => Object.assign(new Error('已暂停'), { name: 'AbortError' }),
  JsonRpcProcess: class extends EventEmitter {
    onRequest: any;
    constructor() { super(); state.rpc = this; }
    notify = vi.fn();
    close = vi.fn(async () => {});
    async call(method: string, params: any) {
      if (method === 'initialize') return { protocolVersion: 1, agentCapabilities: { mcpCapabilities: { http: true } } };
      if (method === 'session/new') return { sessionId: 'seat-session' };
      if (method === 'session/prompt') { await state.prompt(params); return { stopReason: 'end_turn' }; }
      return {};
    }
  },
}));
import { AcpAdapter } from './acp';

const context: HarnessContext = {
  scopeId: 'hand', playerId: 'echo', kind: 'codex-acp', name: 'Echo', displayTitle: 'Echo',
  instructions: 'Use the registered game tools.', tools: ['game_act', 'auction.confirm'].map(name => ({ name, description: name, inputSchema: { type: 'object' } })),
  cwd: '', mcpUrl: 'http://127.0.0.1/mcp/seat', onActivity() {}, onUsage() {},
};
const selected = { outcome: { outcome: 'selected', optionId: 'one-shot' } };
const cancelled = { outcome: { outcome: 'cancelled' } };
function tool(overrides: Record<string, any> = {}, sessionId = 'seat-session') {
  state.rpc.emit('notification', 'session/update', { sessionId, update: {
    sessionUpdate: 'tool_call', toolCallId: 'native-call', kind: 'execute', status: 'in_progress',
    rawInput: { server: 'agent_game', tool: 'game_act', arguments: {} }, _meta: { is_mcp_tool_call: true }, ...overrides,
  } });
}
function permission(overrides: Record<string, any> = {}) {
  return state.rpc.onRequest('session/request_permission', {
    sessionId: 'seat-session', toolCall: { toolCallId: 'native-call', kind: 'execute', status: 'pending' },
    _meta: { is_mcp_tool_approval: true }, options: [{ kind: 'allow_always', optionId: 'persistent' }, { kind: 'allow_once', optionId: 'one-shot' }], ...overrides,
  });
}
async function run(prompt: () => Promise<void>) {
  state.prompt = prompt;
  const session = await new AcpAdapter('test-acp', 'test-codex').createSession(context);
  try { await session.playTurn('Act once.', new AbortController().signal); }
  finally { await session.close(); }
}

describe('Codex ACP 游戏工具审批', () => {
  beforeEach(() => { state.rpc = null; state.prompt = null; });
  it.each(['game_act', 'auction.confirm'])('批准已注册的 %s：权限请求只有原生 call ID，没有标题或参数', async name => {
    await run(async () => {
      tool({ rawInput: { server: 'agent_game', tool: name, arguments: {} } });
      expect(await permission()).toEqual(selected);
      expect(await permission()).toEqual(cancelled); // allow_once is consumed.
    });
  });
  it.each([
    ['未收到原生工具通知', null],
    ['其他 MCP', { rawInput: { server: 'other', tool: 'game_act' } }],
    ['未注册工具', { rawInput: { server: 'agent_game', tool: 'terminal_exec' } }],
    ['伪造游戏标题', { title: 'mcp.agent_game.game_act', rawInput: { command: 'game_act' } }],
    ['非 MCP 通知', { _meta: {} }],
    ['已经完成', { status: 'completed' }],
    ['已经失败', { status: 'failed' }],
  ])('拒绝%s', async (_name, update) => {
    await run(async () => {
      if (update) tool(update);
      expect(await permission()).toEqual(cancelled);
    });
  });
  it('拒绝跨会话通知和审批、普通询问、以及永久授权选项', async () => {
    await run(async () => {
      tool({}, 'other-session'); expect(await permission()).toEqual(cancelled);
      tool();
      expect(await permission({ sessionId: 'other-session' })).toEqual(cancelled);
      expect(await permission({ _meta: {} })).toEqual(cancelled);
      expect(await permission({ options: [{ kind: 'allow_always', optionId: 'persistent' }] })).toEqual(cancelled);
      expect(await permission()).toEqual(selected);
    });
  });
  it('完成、失败或参数变化的工具通知撤销待审批关联', async () => {
    await run(async () => {
      for (const update of [{ status: 'completed' }, { status: 'failed' }, { rawInput: { server: 'other', tool: 'game_act' } }]) {
        tool(); tool({ sessionUpdate: 'tool_call_update', ...update });
        expect(await permission()).toEqual(cancelled);
      }
    });
  });
  it('暂停后、任务结束后和下一回合都不批准旧 call ID', async () => {
    const session = await new AcpAdapter('test-acp', 'test-codex').createSession(context);
    const abort = new AbortController();
    try {
      state.prompt = async () => { tool(); abort.abort(); expect(await permission()).toEqual(cancelled); };
      await expect(session.playTurn('Act.', abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
      expect(state.rpc.notify).toHaveBeenCalledWith('session/cancel', { sessionId: 'seat-session' });
      expect(await permission()).toEqual(cancelled);
      state.prompt = async () => { expect(await permission()).toEqual(cancelled); tool(); expect(await permission()).toEqual(selected); };
      await session.playTurn('Retry.', new AbortController().signal);
      expect(await permission()).toEqual(cancelled);
    } finally { await session.close(); }
  });
});
