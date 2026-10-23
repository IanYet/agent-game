import { JsonRpcProcess, abortError } from './rpc';
import { executableCommand } from './discovery';
import { gameConfig, subscriptionEnvironment } from './codex';
import { GAME_INSTRUCTIONS } from './instructions';
import type { AgentSession, HarnessAdapter, HarnessContext } from '../types';

export class AcpAdapter implements HarnessAdapter {
  id = 'codex-acp';
  constructor(private path: string, private codexPath: string, private disabledServers: string[] = []) {}
  async createSession(context: HarnessContext): Promise<AgentSession> {
    const command = await executableCommand(this.path);
    const rpc = new JsonRpcProcess({ ...command, env: { ...subscriptionEnvironment(), CODEX_PATH: this.codexPath, MODEL_PROVIDER: 'agent_arcade_chatgpt', INITIAL_AGENT_MODE: 'read-only', CODEX_CONFIG: JSON.stringify({ ...gameConfig(undefined, this.disabledServers), approval_policy: 'never', model_reasoning_effort: 'low', ...(context.model ? { model: context.model } : {}), developer_instructions: GAME_INSTRUCTIONS }) } }, context.cwd);
    rpc.onRequest = async method => {
      if (method === 'session/request_permission') return { outcome: { outcome: 'cancelled' } };
      throw new Error('连接器只提供游戏 MCP，不提供文件和终端权限');
    };
    rpc.on('notification', (method: string, params: any) => {
      if (method !== 'session/update') return;
      const update = params.update;
      if (update?.sessionUpdate === 'tool_call' || update?.sessionUpdate === 'tool_call_update') context.onActivity('正在使用游戏工具', update.title ?? 'MCP');
      if (update?.sessionUpdate === 'usage_update') context.onUsage(update.used ?? update.totalTokens ?? 0);
    });
    try {
      const initialized = await rpc.call('initialize', { protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: 'agent_arcade', title: '同桌 Agent Arcade', version: '0.1.0' } });
      if (initialized.protocolVersion !== 1) throw new Error(`暂不支持此 ACP 版本：${initialized.protocolVersion}`);
      if (!initialized.agentCapabilities?.mcpCapabilities?.http) throw new Error('此 ACP harness 不支持 HTTP MCP，请使用 Codex App Server 模式');
      const result = await rpc.call('session/new', { cwd: context.cwd, mcpServers: [{ type: 'http', name: 'agent_game', url: context.mcpUrl, headers: [] }] }, 90_000);
      const sessionId: string = result.sessionId;
      if (context.model) {
        const models: Array<{ modelId: string }> = result.models?.availableModels ?? [];
        const selected = models.find(m => m.modelId === `${context.model}[low]`) ?? models.find(m => m.modelId === context.model || m.modelId.startsWith(`${context.model}[`));
        if (!selected) throw new Error(`此 harness 没有提供所选模型：${context.model}`);
        await rpc.call('session/set_model', { sessionId, modelId: selected.modelId });
      }
      return {
        sessionId,
        playTurn: async (prompt, signal) => {
          if (signal.aborted) throw abortError();
          const abort = () => rpc.notify('session/cancel', { sessionId });
          signal.addEventListener('abort', abort, { once: true });
          try {
            const response = await rpc.call('session/prompt', { sessionId, prompt: [{ type: 'text', text: prompt }] }, 180_000);
            if (signal.aborted) throw abortError();
            if (response.stopReason && !['end_turn', 'stop_sequence'].includes(response.stopReason)) throw new Error(`ACP 回合停止：${response.stopReason}`);
          } finally { signal.removeEventListener('abort', abort); }
        },
        close: () => rpc.close(),
      };
    } catch (error) { await rpc.close(); throw error; }
  }
}
