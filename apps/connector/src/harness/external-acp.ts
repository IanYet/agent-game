import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { APP_VERSION, type AgentSettings, type ModelInfo } from '@agent-game/protocol';
import type { AgentSession, HarnessAdapter, HarnessContext } from '../types';
import { executableCommand, inspectCommand } from './discovery';
import { gameInstructions } from './instructions';
import { JsonRpcProcess, abortError, type ProcessCommand } from './rpc';

export interface AcpChoice { value: string; name?: string; description?: string; options?: AcpChoice[] }
export interface AcpConfigOption { id: string; category?: string; type?: string; currentValue: string; options?: AcpChoice[] }
export const flattenChoices = (options: AcpChoice[] = []): AcpChoice[] => options.flatMap(o => o.options ? flattenChoices(o.options) : [o]);
const modelOption = (options: AcpConfigOption[]) => options.find(o => o.category === 'model' || o.id === 'model');
const effortOption = (options: AcpConfigOption[]) => options.find(o => o.category === 'thought_level' || ['reasoning_effort', 'reasoning', 'effort', 'thought_level'].includes(o.id));
export function modelsFromAcp(options: AcpConfigOption[], legacy?: { availableModels?: Array<{ modelId: string; name?: string }>; currentModelId?: string }): ModelInfo[] {
  const model = modelOption(options), effort = effortOption(options);
  const choices = model ? flattenChoices(model.options) : (legacy?.availableModels ?? []).map(m => ({ value: m.modelId, name: m.name }));
  return choices.map(choice => ({ id: choice.value, name: choice.name ?? choice.value, isDefault: choice.value === (model?.currentValue ?? legacy?.currentModelId), ...(choice.value === model?.currentValue && effort ? { defaultReasoningEffort: effort.currentValue || undefined, supportedReasoningEfforts: flattenChoices(effort.options).filter(e => e.value).map(e => ({ effort: e.value, description: e.description ?? e.name ?? e.value })) } : {}) }));
}
export function acpPromptFailure(response: any): string {
  const native = response._meta?.['codebuddy.ai/errorMessage'];
  let detail = typeof native === 'string' ? native : '';
  try { const error = JSON.parse(detail); detail = error.data?.details ?? error.message ?? ''; } catch { /* Other ACP agents may send plain text. */ }
  if (/authentication required|please use \/login/i.test(detail)) return 'WorkBuddy 未向此独立公开 CLI 会话提供有效登录；桌面已登录仍可能无法共享。请在支持独立 ACP 的官方 CLI 完成 /login，或用 WORKBUDDY_PATH 指定该入口';
  return detail.replace(/https?:\/\/\S+/g, '[endpoint]').replace(/Bearer\s+\S+|sk-[A-Za-z0-9_-]+/gi, '[redacted]').slice(0, 600);
}

/** The guard is loaded by dsh in its own process; its authentication and model providers stay native. */
export const DSH_GAME_GUARD = `export const name = 'agent-arcade-game-guard';
export const inject = ['tools'];
export function apply(ctx) {
  if (typeof ctx.tools.guard !== 'function') throw new Error('This dsh version has no tools.guard; update dsh.');
  const allowed = new Set(['game_get_state','game_legal_actions','game_act','game_rules'].map(n => 'mcp__agent_game__' + n));
  ctx.tools.guard(execution => allowed.has(execution.name) ? undefined : 'Only this seat\\'s agent_game MCP tools are allowed.');
}
`;

export class ExternalAcpAdapter implements HarnessAdapter {
  constructor(readonly id: 'dsh' | 'workbuddy', private path: string, private help = '') {}
  private async command(context: HarnessContext): Promise<ProcessCommand> {
    if (this.id === 'dsh') {
      const guard = join(context.cwd, 'game-guard.mjs'), patch = join(context.cwd, 'game.patch.yml');
      await writeFile(guard, DSH_GAME_GUARD, 'utf8');
      const patches: unknown[] = [
        { id: 'system-prompt', config: { personaPrefix: gameInstructions(context) } },
        { id: 'session-title-llm', disabled: true },
        { id: 'hmr', disabled: true },
        { id: 'session-telemetry-otel', disabled: true },
        { insert: [{ id: 'agent-arcade-game-guard', name: guard.replaceAll('\\', '/') }] },
      ];
      if (!context.persistConversation) patches.push(
        { id: 'session-persistence-jsonl', config: { root: join(context.cwd, 'dsh-history') } },
        { id: 'session-projection-cache', disabled: true },
        { id: 'session-query-sqlite', config: { path: ':memory:', openAt: 'never' } },
      );
      await writeFile(patch, JSON.stringify(patches), 'utf8');
      const command = await executableCommand(this.path, ['--profile', process.env.DSH_PROFILE ?? 'acp', '--patch', patch]);
      return { ...command, env: { ...process.env, ...command.env, DSH_PERMISSION_MODE: 'read-only' } };
    }
    for (const flag of ['--acp', '--tools', '--allowedTools', '--strict-mcp-config', '--mcp-config', '--settings']) if (!this.help.includes(flag)) throw new Error(`此 WorkBuddy CLI 未提供 ${flag}，请升级或使用 WORKBUDDY_PATH 指定支持公开 ACP 的 CLI`);
    if (!context.persistConversation && !this.help.includes('--no-session-persistence')) throw new Error('此 WorkBuddy CLI 不支持关闭历史保存，请升级，或主动开启保留玩家对话');
    // The official desktop lite bundle exposes stdio ACP together with --serve.
    // Keep its incidental gateway on a random loopback port with a per-process
    // password, supplied via env so it neither appears in args nor changes login/settings.
    const base = await executableCommand(this.path);
    const lite = /(?:^|[\\/])codebuddy-lite-wb\.mjs$/i.test(this.path) || base.env?.CODEBUDDY_FORCE_LITE_WB_BUNDLE === '1';
    const command = { ...base, args: [...base.args, ...(lite ? ['--serve'] : []), '--acp', '--tools', '', '--allowedTools', ['game_get_state','game_legal_actions','game_act','game_rules'].map(name => `mcp__agent_game__${name}`).join(','), '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--settings', JSON.stringify({ disableAllHooks: true, enableAllProjectMcpServers: false }), ...(!context.persistConversation ? ['--no-session-persistence'] : [])] };
    return { ...command, env: { ...process.env, ...command.env,
      CODEBUDDY_CODE_DISABLE_AUTO_MEMORY: '1', CODEBUDDY_DISABLE_BACKGROUND_TASKS: '1',
      CODEBUDDY_CHANNEL_AUTO_CONNECT: '0', CODEBUDDY_WECOM_AUTO_CONNECT: '0', CODEBUDDY_WECHAT_AUTO_CONNECT: '0',
      ...(lite ? { SERVER__HOST: '127.0.0.1', SERVER__PORT: '0', CODEBUDDY_GATEWAY_AUTH: 'password', CODEBUDDY_GATEWAY_PASSWORD: randomBytes(32).toString('hex'), CODEBUDDY_GATEWAY_FORCE_TUNNEL: '0' } : {}),
    } };
  }
  private async open(context: HarnessContext, mountGame: boolean) {
    const rpc = new JsonRpcProcess(await this.command(context), context.cwd);
    let agentText = '';
    rpc.onRequest = async (method, params) => {
      if (method === 'session/request_permission') {
        const title = String(params.toolCall?.title ?? ''), kind = params.toolCall?.kind;
        const game = /\bagent_game\b|mcp__agent_game__/.test(title) && /(?:\b|__)game_(?:get_state|legal_actions|act|rules)\b/.test(title) && (!kind || kind === 'other');
        const allow = game && params.options?.find((o: any) => o.kind === 'allow_once');
        return { outcome: allow ? { outcome: 'selected', optionId: allow.optionId } : { outcome: 'cancelled' } };
      }
      throw new Error('此客户端只允许座位绑定的游戏 MCP');
    };
    rpc.on('notification', (method: string, params: any) => {
      if (method !== 'session/update') return;
      const u = params.update;
      if (u?.sessionUpdate === 'agent_message_chunk' && u.content?.type === 'text') agentText = (agentText + u.content.text).slice(-1200);
      if (u?.sessionUpdate === 'tool_call' || u?.sessionUpdate === 'tool_call_update') context.onActivity('正在使用游戏工具', u.title ?? 'MCP');
      if (u?.sessionUpdate === 'usage_update') context.onUsage(u.used ?? u.totalTokens ?? 0);
    });
    try {
      const init = await rpc.call('initialize', { protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: 'agent_arcade', version: APP_VERSION } }, 20_000);
      if (init.protocolVersion !== 1 || !init.agentCapabilities?.mcpCapabilities?.http) throw new Error(`${this.id} 当前版本未提供 ACP v1 的 HTTP MCP，请升级此 Harness`);
      const identity = String(init.agentInfo?.name ?? '');
      if (this.id === 'dsh' && !/deepseek|\bdsh\b/i.test(identity)) throw new Error('DSH_PATH 指向的服务不是 DeepSeek Harness');
      // agentInfo is optional in ACP v1 and absent in the desktop lite bundle.
      if (this.id === 'workbuddy' && identity && !/workbuddy|codebuddy/i.test(identity)) throw new Error('WORKBUDDY_PATH 指向的服务不是 WorkBuddy/CodeBuddy');
      const result = await rpc.call('session/new', { cwd: context.cwd, mcpServers: mountGame ? [{ type: 'http', name: 'agent_game', url: context.mcpUrl, headers: [] }] : [] }, 45_000);
      if (typeof result.sessionId !== 'string' || !result.sessionId) throw new Error('ACP 没有返回有效会话 ID');
      if (this.id === 'dsh') {
        // Desktop dsh can answer session/new while account providers are still
        // registering. Re-read its native options until the catalog settles;
        // otherwise the UI can lose the account route or reject a selected model.
        const started = Date.now(); let stable = 0;
        let previous = JSON.stringify(modelsFromAcp(result.configOptions ?? []).map(m => m.id));
        while (Date.now() - started < 1500) {
          const model = modelOption(result.configOptions ?? []); if (!model) break;
          await new Promise(resolve => setTimeout(resolve, 150));
          result.configOptions = (await rpc.call('session/set_config_option', { sessionId: result.sessionId, configId: model.id, value: model.currentValue }, 15_000)).configOptions ?? [];
          const ids = JSON.stringify(modelsFromAcp(result.configOptions).map(m => m.id));
          stable = ids === previous ? stable + 1 : 0; previous = ids;
          const found = !context.model || flattenChoices(modelOption(result.configOptions)?.options).some(m => m.value === context.model);
          if (stable >= 2 && Date.now() - started >= 450 && found) break;
        }
      }
      return { rpc, init, result, resetText: () => { agentText = ''; }, failureText: () => agentText.replace(/https?:\/\/\S+/g, '[endpoint]').replace(/Bearer\s+\S+|sk-[A-Za-z0-9_-]+/gi, '[redacted]').trim().slice(0, 600) };
    } catch (error: any) {
      await rpc.close();
      if (this.id === 'workbuddy' && /authentication required/i.test(error.message)) throw new Error(acpPromptFailure({ _meta: { 'codebuddy.ai/errorMessage': error.message } }));
      throw error;
    }
  }
  async inspect(): Promise<{ models: ModelInfo[]; version?: string; ephemeral: boolean }> {
    if (this.id === 'workbuddy' && !this.help) this.help = await inspectCommand(this.path, ['--help']);
    const cwd = await mkdtemp(join(tmpdir(), 'agent-arcade-probe-'));
    let rpc: JsonRpcProcess | undefined;
    try {
      const opened = await this.open({ cwd, seat: 0, name: '接口检测', mcpUrl: '', persistConversation: false, onActivity: () => {}, onUsage: () => {} }, false); rpc = opened.rpc;
      const { result, init } = opened;
      let options: AcpConfigOption[] = result.configOptions ?? [];
      const models = modelsFromAcp(options, result.models);
      if (!models.length) throw new Error('Harness 未返回自己的模型目录，请先在该 Harness 中登录并配置模型');
      const option = modelOption(options);
      // Query each model's dependent effort selector without sending any inference prompt.
      if (option) for (const model of models) {
        if (modelOption(options)?.currentValue !== model.id) options = (await rpc.call('session/set_config_option', { sessionId: result.sessionId, configId: option.id, value: model.id }, 15_000)).configOptions ?? [];
        const effort = effortOption(options);
        model.defaultReasoningEffort = effort?.currentValue || undefined;
        model.supportedReasoningEfforts = effort ? flattenChoices(effort.options).filter(e => e.value).map(e => ({ effort: e.value, description: e.description ?? e.name ?? e.value })) : [];
      }
      const version = init.agentInfo?.version ?? (this.id === 'workbuddy' ? (await inspectCommand(this.path, ['--version'])).trim() : undefined);
      return { models, version, ephemeral: true };
    } finally { await rpc?.close(); await safeRemoveProbe(cwd); }
  }
  async createSession(context: HarnessContext): Promise<AgentSession> {
    if (this.id === 'workbuddy' && !this.help) this.help = await inspectCommand(this.path, ['--help']);
    const { rpc, result, init, resetText, failureText } = await this.open(context, true), sessionId: string = result.sessionId;
    let options: AcpConfigOption[] = result.configOptions ?? [], currentLegacy = result.models?.currentModelId, prompted = false;
    const configure = async (settings: AgentSettings) => {
      const model = modelOption(options);
      if (settings.model && model && settings.model !== model.currentValue) {
        if (!flattenChoices(model.options).some(o => o.value === settings.model)) throw new Error('所选模型不在该 Harness 的目录中');
        options = (await rpc.call('session/set_config_option', { sessionId, configId: model.id, value: settings.model })).configOptions ?? [];
      } else if (settings.model && !model && settings.model !== currentLegacy) {
        if (!result.models?.availableModels?.some((m: any) => m.modelId === settings.model)) throw new Error('所选模型不在该 Harness 的目录中');
        await rpc.call('session/set_model', { sessionId, modelId: settings.model }); currentLegacy = settings.model;
      }
      if (settings.reasoningEffort) {
        const effort = effortOption(options);
        if (!effort || !flattenChoices(effort.options).some(o => o.value === settings.reasoningEffort)) throw new Error('此模型没有提供所选思考强度');
        if (effort.currentValue !== settings.reasoningEffort) options = (await rpc.call('session/set_config_option', { sessionId, configId: effort.id, value: settings.reasoningEffort })).configOptions ?? [];
      }
    };
    try {
      await configure(context);
      return {
        sessionId,
        playTurn: async (prompt, signal, settings) => {
          if (signal.aborted) throw abortError(); await configure(settings ?? context); if (signal.aborted) throw abortError();
          const abort = () => rpc.notify('session/cancel', { sessionId }); signal.addEventListener('abort', abort, { once: true });
          try {
            resetText();
            const response = await rpc.call('session/prompt', { sessionId, prompt: [{ type: 'text', text: prompted ? prompt : `${gameInstructions(context)}\n\n${prompt}` }] }, 180_000);
            prompted = true;
            if (signal.aborted) throw abortError();
            if (response.stopReason && !['end_turn', 'stop_sequence'].includes(response.stopReason)) {
              const detail = acpPromptFailure(response) || failureText();
              throw new Error(`ACP 回合停止：${response.stopReason}${detail ? `；${detail}` : ''}`);
            }
          } finally { signal.removeEventListener('abort', abort); }
        },
        close: async () => {
          if (init.agentCapabilities?.sessionCapabilities?.close) await rpc.call('session/close', { sessionId }, 3000).catch(() => {});
          await rpc.close();
          if (this.id === 'dsh' && !context.persistConversation) {
            const target = resolve(context.cwd, 'dsh-history');
            if (target.startsWith(resolve(context.cwd) + sep)) await rm(target, { recursive: true, force: true });
          }
        },
      };
    } catch (error) { await rpc.close(); throw error; }
  }
}
async function safeRemoveProbe(path: string) {
  const target = resolve(path), parent = resolve(tmpdir());
  if (target.startsWith(parent + sep) && target.slice(parent.length + 1).startsWith('agent-arcade-probe-')) await rm(target, { recursive: true, force: true });
}
