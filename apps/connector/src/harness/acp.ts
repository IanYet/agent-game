import { JsonRpcProcess, abortError } from './rpc';
import { executableCommand } from './discovery';
import { gameConfig, subscriptionEnvironment } from './codex';
import { GAME_INSTRUCTIONS } from './instructions';
import { readFile } from 'node:fs/promises';
import { playerConversationTitle, selectAcpModel } from './settings';
import type { AgentSession, HarnessAdapter, HarnessContext } from '../types';

export class AcpAdapter implements HarnessAdapter {
  id = 'codex-acp';
  constructor(private path: string, private codexPath: string, private disabledServers: string[] = []) {}
  async createSession(context: HarnessContext): Promise<AgentSession> {
    if (!context.persistConversation && !(await readFile(this.path, 'utf8').catch(() => '')).includes('AgentArcade: ephemeral sessions')) throw new Error('此 ACP 适配器不支持临时会话。请更新连接器，或主动开启“保留玩家对话”。');
    const command = await executableCommand(this.path);
    const rpc = new JsonRpcProcess({ ...command, env: { ...subscriptionEnvironment(), CODEX_PATH: this.codexPath, MODEL_PROVIDER: 'agent_arcade_chatgpt', INITIAL_AGENT_MODE: 'read-only', CODEX_CONFIG: JSON.stringify({ ...gameConfig(undefined, this.disabledServers), approval_policy: 'never', ...(context.reasoningEffort ? { model_reasoning_effort: context.reasoningEffort } : {}), ...(context.model ? { model: context.model } : {}), developer_instructions: GAME_INSTRUCTIONS }) } }, context.cwd);
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
      const initialized = await rpc.call('initialize', { protocolVersion: 1, clientCapabilities: { _meta: { jetbrains: { air: { version: 1, capabilities: ['sessionIndex'] } } } }, clientInfo: { name: 'agent_arcade', title: '同桌 Agent Arcade', version: '0.2.0' } });
      if (initialized.protocolVersion !== 1) throw new Error(`暂不支持此 ACP 版本：${initialized.protocolVersion}`);
      if (!initialized.agentCapabilities?.mcpCapabilities?.http) throw new Error('此 ACP harness 不支持 HTTP MCP，请使用 Codex App Server 模式');
      const result = await rpc.call('session/new', { cwd: context.cwd, mcpServers: [{ type: 'http', name: 'agent_game', url: context.mcpUrl, headers: [] }], _meta: { agentArcade: { ephemeral: !context.persistConversation } } }, 90_000);
      const sessionId: string = result.sessionId;
      const models: Array<{ modelId: string }> = result.models?.availableModels ?? [];
      let currentModelId: string | undefined = result.models?.currentModelId;
      const configure = async (settings: { model?: string; reasoningEffort?: string }) => {
        const selected = selectAcpModel(models, currentModelId, settings);
        if (selected && selected !== currentModelId) { await rpc.call('session/set_model', { sessionId, modelId: selected }); currentModelId = selected; }
      };
      await configure(context);
      if (context.persistConversation) await rpc.call('_session/rename', { sessionId, title: playerConversationTitle(context) });
      return {
        sessionId,
        playTurn: async (prompt, signal, settings) => {
          if (signal.aborted) throw abortError();
          if (settings) await configure(settings);
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
