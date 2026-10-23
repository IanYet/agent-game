import {CONNECTOR_VERSION} from '../version';
import { JsonRpcProcess, abortError } from './rpc';
import { executableCommand } from './discovery';
import { sessionInstructions } from './instructions';
import { playerConversationTitle } from './settings';
import type { AgentSession, HarnessAdapter, HarnessContext, ModelInfo } from '../types';

export function subscriptionEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.OPENAI_API_KEY; delete env.CODEX_API_KEY;
  return env;
}

// Per-process/per-seat MCP config prevents a thread from choosing another seat.
export function gameConfig(mcpUrl?: string, disabledServers: string[] = []): Record<string, unknown> {
  return {
    'features.shell_tool': false, 'features.unified_exec': false, 'features.apps': false,
    'features.multi_agent': false, 'features.multi_agent_v2': false, 'features.memories': false,
    'features.browser_use': false, 'features.computer_use': false, 'features.image_generation': false,
    'features.plugins': false, 'features.hooks': false, 'features.workspace_dependencies': false, 'features.sleep_tool': false,
    'web_search': 'disabled', 'mcp_servers': mcpUrl ? { agent_game: { url: mcpUrl, enabled: true, required: true, startup_timeout_sec: 30 } } : {},
    // Keep Codex's own ChatGPT auth and auth-specific default endpoint. A custom
    // provider ID is required: recent Codex versions reserve built-in IDs.
    'model_provider': 'agent_arcade_chatgpt',
    'model_providers.agent_arcade_chatgpt.name': 'Agent Arcade · ChatGPT',
    'model_providers.agent_arcade_chatgpt.wire_api': 'responses',
    'model_providers.agent_arcade_chatgpt.requires_openai_auth': true,
    'model_providers.agent_arcade_chatgpt.supports_websockets': false,
    ...Object.fromEntries(disabledServers.filter(name => name !== 'agent_game').map(name => [`mcp_servers.${name}.enabled`, false])),
  };
}
export function configArguments(config: Record<string, unknown>): string[] {
  // JSON strings/scalars are valid TOML. Inline objects are supplied through thread/start.
  return Object.entries(config).filter(([, value]) => typeof value !== 'object').flatMap(([key, value]) => ['-c', `${key}=${JSON.stringify(value)}`]);
}

export class CodexAdapter implements HarnessAdapter {
  id = 'codex';
  constructor(private path: string, private disabledServers: string[] = []) {}
  async createSession(context: HarnessContext): Promise<AgentSession> {
    const command = await executableCommand(this.path, ['app-server', '--listen', 'stdio://', ...configArguments(gameConfig(undefined, this.disabledServers))]);
    const rpc = new JsonRpcProcess({ ...command, env: subscriptionEnvironment() }, context.cwd);
    let turnId: string | null = null;
    let activeDone: ((error?: Error) => void) | null = null;
    rpc.onRequest = async method => {
      if (method.includes('requestApproval')) return { decision: 'decline' };
      if (method === 'tool/requestUserInput') return { answers: {} };
      throw new Error('只允许游戏 MCP 工具');
    };
    rpc.on('exit', error => activeDone?.(error));
    rpc.on('notification', (method: string, params: any) => {
      if (method === 'turn/started') turnId = params.turn?.id ?? null;
      if (method === 'turn/completed') {
        turnId = null;
        activeDone?.(params.turn?.status === 'completed' ? undefined : new Error(params.turn?.error?.message ?? `Codex 回合${params.turn?.status ?? '失败'}`));
      }
      if (method === 'item/started' && params.item?.type === 'mcpToolCall') context.onActivity('正在使用游戏工具', params.item.tool);
      if (method === 'thread/tokenUsage/updated') context.onUsage(params.tokenUsage?.total?.totalTokens ?? 0);
    });
    try {
      await rpc.call('initialize', { clientInfo: { name: 'agent_arcade', title: '同桌 Agent Arcade', version: CONNECTOR_VERSION } });
      rpc.notify('initialized');
      const account = await rpc.call('account/read', { refreshToken: false });
      if (!account.account || account.account.type !== 'chatgpt') throw new Error('请先运行 codex login，使用 ChatGPT 订阅登录 Codex');
      const result = await rpc.call('thread/start', {
        cwd: context.cwd, ...(context.model ? { model: context.model } : {}),
        sandbox: 'read-only', approvalPolicy: 'never', developerInstructions: sessionInstructions(context),
        config: gameConfig(context.mcpUrl, this.disabledServers), ephemeral: !context.persistConversation,
      }, 90_000);
      const sessionId: string = result.thread.id;
      if (context.persistConversation) await rpc.call('thread/name/set', { threadId: sessionId, name: playerConversationTitle(context) });
      return {
        sessionId,
        playTurn: async (prompt, signal, settings) => {
          if (signal.aborted) throw abortError();
          turnId = null;
          await new Promise<void>((resolve, reject) => {
            let settled = false;
            const finish = (error?: Error) => { if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort); activeDone = null; error ? reject(error) : resolve(); };
            // Wait for turn/completed before allowing resume to send a new turn.
            // The abort may arrive while turn/start is still being acknowledged.
            let interrupting = false;
            const interrupt = () => { if (turnId && !interrupting) { interrupting = true; void rpc.call('turn/interrupt', { threadId: sessionId, turnId }).catch(finish); } };
            const abort = () => { interrupt(); };
            const timer = setTimeout(() => { interrupt(); finish(new Error('Codex 回合超时')); }, 180_000);
            activeDone = error => finish(signal.aborted ? abortError() : error); signal.addEventListener('abort', abort, { once: true });
            rpc.call('turn/start', { threadId: sessionId, input: [{ type: 'text', text: prompt }], model: settings?.model ?? context.model ?? result.model, effort: settings?.reasoningEffort ?? context.reasoningEffort ?? result.reasoningEffort }).then(result => {
              if (settled) return;
              turnId = result.turn?.id ?? turnId;
              if (signal.aborted) interrupt();
            }).catch(finish);
          });
        },
        close: () => rpc.close(),
      };
    } catch (error) { await rpc.close(); throw error; }
  }
}

export async function inspectCodex(path: string): Promise<{ models: ModelInfo[]; auth: 'chatgpt' | 'apiKey' | 'missing'; mcpServers: string[] }> {
  const command = await executableCommand(path, ['app-server', '--listen', 'stdio://']);
  const rpc = new JsonRpcProcess({ ...command, env: subscriptionEnvironment() });
  try {
    await rpc.call('initialize', { clientInfo: { name: 'agent_arcade', version: CONNECTOR_VERSION } }); rpc.notify('initialized');
    const result = await rpc.call('model/list', { limit: 100 });
    const account = await rpc.call('account/read', { refreshToken: false });
    const configuration = await rpc.call('config/read', { includeLayers: false });
    const models = (result.data ?? []).filter((m: any) => !m.hidden).map((m: any) => ({ id: m.model ?? m.id, name: m.displayName ?? m.model ?? m.id, isDefault: !!m.isDefault, defaultReasoningEffort: m.defaultReasoningEffort, supportedReasoningEfforts: (m.supportedReasoningEfforts ?? []).map((e: any) => ({ effort: e.reasoningEffort, description: e.description ?? e.reasoningEffort })) }));
    return { models, auth: account.account?.type === 'chatgpt' ? 'chatgpt' : account.account?.type === 'apiKey' ? 'apiKey' : 'missing', mcpServers: Object.keys(configuration.config?.mcp_servers ?? {}) };
  } finally { await rpc.close(); }
}
