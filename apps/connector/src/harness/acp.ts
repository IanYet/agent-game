import {CONNECTOR_VERSION} from '../version';
import { JsonRpcProcess, abortError } from './rpc';
import { executableCommand } from './discovery';
import { gameConfig, subscriptionEnvironment } from './codex';
import { sessionInstructions } from './instructions';
import { readFile } from 'node:fs/promises';
import { selectAcpModel } from './settings';
import { captureConversation } from './conversation';
import type { AgentSession, HarnessAdapter, HarnessContext } from '../types';

export class AcpAdapter implements HarnessAdapter {
  id = 'codex-acp';
  constructor(private path: string, private codexPath: string, private disabledServers: string[] = []) {}
  async createSession(context: HarnessContext): Promise<AgentSession> {
    if (!(await readFile(this.path, 'utf8').catch(() => '')).includes('AgentArcade: ephemeral sessions')) throw new Error('此 ACP 适配器不支持临时会话，请更新连接器。');
    const command = await executableCommand(this.path);
    const rpc = new JsonRpcProcess({ ...command, env: { ...subscriptionEnvironment(), CODEX_PATH: this.codexPath, MODEL_PROVIDER: 'agent_arcade_chatgpt', INITIAL_AGENT_MODE: 'read-only', CODEX_CONFIG: JSON.stringify({ ...gameConfig(undefined, this.disabledServers), ...(context.reasoningEffort ? { model_reasoning_effort: context.reasoningEffort } : {}), ...(context.model ? { model: context.model } : {}), developer_instructions: sessionInstructions(context) }) } }, context.cwd);
    captureConversation(rpc, context);
    const registeredTools = new Set(context.tools.map(tool => tool.name));
    const gameCalls = new Set<string>();
    let sessionId: string | undefined;
    let activeSignal: AbortSignal | undefined;
    rpc.onRequest = async (method, params) => {
      if (method === 'session/request_permission') {
        // ACP's read-only preset requests approval even for game actions. The
        // request can contain only a call ID; bind it to the preceding native
        // MCP notification instead of trusting a title or approving execution.
        const callId = params.toolCall?.toolCallId;
        const allowed = activeSignal && !activeSignal.aborted && params.sessionId === sessionId &&
          params._meta?.is_mcp_tool_approval === true && gameCalls.has(callId);
        const option = allowed && params.options?.find((value: any) => value.kind === 'allow_once' && typeof value.optionId === 'string' && value.optionId);
        if (option) gameCalls.delete(callId);
        return { outcome: option ? { outcome: 'selected', optionId: option.optionId } : { outcome: 'cancelled' } };
      }
      throw new Error('连接器只提供游戏 MCP，不提供文件和终端权限');
    };
    rpc.on('notification', (method: string, params: any) => {
      if (method !== 'session/update' || params.sessionId !== sessionId) return;
      const update = params.update;
      if (update?.sessionUpdate === 'tool_call' || update?.sessionUpdate === 'tool_call_update') {
        const callId = update.toolCallId;
        if (typeof callId === 'string') {
          if (update.status === 'completed' || update.status === 'failed' || update.rawInput !== undefined) gameCalls.delete(callId);
          if (activeSignal && !activeSignal.aborted && update.sessionUpdate === 'tool_call' && update._meta?.is_mcp_tool_call === true &&
            update.status !== 'completed' && update.status !== 'failed' && update.rawInput?.server === 'agent_game' && registeredTools.has(update.rawInput?.tool)) gameCalls.add(callId);
        }
        context.onActivity('正在使用游戏工具', update.title ?? 'MCP');
      }
      if (update?.sessionUpdate === 'usage_update') context.onUsage(update.used ?? update.totalTokens ?? 0);
    });
    try {
      const initialized = await rpc.call('initialize', { protocolVersion: 1, clientCapabilities: { _meta: { jetbrains: { air: { version: 1, capabilities: ['sessionIndex'] } } } }, clientInfo: { name: 'agent_arcade', title: '同桌 Agent Arcade', version: CONNECTOR_VERSION } });
      if (initialized.protocolVersion !== 1) throw new Error(`暂不支持此 ACP 版本：${initialized.protocolVersion}`);
      if (!initialized.agentCapabilities?.mcpCapabilities?.http) throw new Error('此 ACP harness 不支持 HTTP MCP，请使用 Codex App Server 模式');
      const result = await rpc.call('session/new', { cwd: context.cwd, mcpServers: [{ type: 'http', name: 'agent_game', url: context.mcpUrl, headers: [] }] }, 90_000);
      const createdSessionId: string = result.sessionId;
      sessionId = createdSessionId;
      const models: Array<{ modelId: string }> = result.models?.availableModels ?? [];
      let currentModelId: string | undefined = result.models?.currentModelId;
      const configure = async (settings: { model?: string; reasoningEffort?: string }) => {
        const selected = selectAcpModel(models, currentModelId, settings);
        if (selected && selected !== currentModelId) { await rpc.call('session/set_model', { sessionId, modelId: selected }); currentModelId = selected; }
      };
      await configure(context);
      return {
        sessionId: createdSessionId,
        playTurn: async (prompt, signal, settings) => {
          if (signal.aborted) throw abortError();
          if (settings) await configure(settings);
          if (signal.aborted) throw abortError();
          const abort = () => rpc.notify('session/cancel', { sessionId });
          signal.addEventListener('abort', abort, { once: true });
          gameCalls.clear(); activeSignal = signal;
          try {
            const response = await rpc.call('session/prompt', { sessionId, prompt: [{ type: 'text', text: prompt }] }, 180_000);
            if (signal.aborted) throw abortError();
            if (response.stopReason && !['end_turn', 'stop_sequence'].includes(response.stopReason)) throw new Error(`ACP 回合停止：${response.stopReason}`);
          } finally { activeSignal = undefined; gameCalls.clear(); signal.removeEventListener('abort', abort); }
        },
        close: () => { activeSignal = undefined; gameCalls.clear(); return rpc.close(); },
      };
    } catch (error) { await rpc.close(); throw error; }
  }
}
