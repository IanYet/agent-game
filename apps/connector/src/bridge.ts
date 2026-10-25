import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { EventEmitter } from 'node:events';
import { modelsForHarness, type AgentSettings, type BrowserToolRequest, type ConnectorEvent, type ConversationUpdate, type SessionRequest, type ToolResponse } from '@agent-game/protocol';
import { ToolRegistry } from '../../../packages/protocol/src/validation';
import type { AgentSession, ConnectorInfo, HarnessAdapter } from './types';
import { sessionInstructions } from './harness/instructions';
import { resolveSettings } from './harness/settings';
import { ConversationRecorder } from './harness/conversation';
import { abortError } from './harness/rpc';

interface Capability { request: SessionRequest; registry: ToolRegistry; conversation: ConversationRecorder; sessionId?: string; discarded?: boolean }
interface PlayerSession { session: AgentSession | null; capability: Capability; token: string; cwd: string }
interface ActiveDecision { decisionId: string; controller: AbortController; done: Promise<void> }
export class LocalBridge extends EventEmitter {
  private owner: { token: string; origin: string; attached: boolean } | null = null;
  private sessions = new Map<string, PlayerSession>();
  private capabilities = new Map<string, Capability>();
  private pending = new Map<string, { capability: Capability; resolve: (response: ToolResponse) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private active = new Map<string, ActiveDecision>();
  private generation = 0;
  private creating = new Set<string>();
  private attachTimeout: ReturnType<typeof setTimeout> | null = null;
  constructor(readonly info: ConnectorInfo, private adapters: Map<string, HarnessAdapter>, private dataDirectory: string) { super(); }
  connect(origin: string): string {
    if (this.owner) throw new Error('连接器已被另一个网页占用，请关闭那张网页后重试');
    const token = randomBytes(32).toString('hex'); this.owner = { token, origin, attached: false };
    this.attachTimeout = setTimeout(() => { if (!this.owner?.attached) void this.disconnect(); }, 15_000); return token;
  }
  authorized(token: string, origin: string): boolean {
    return !!this.owner && this.owner.origin === origin && token.length === this.owner.token.length && timingSafeEqual(Buffer.from(token), Buffer.from(this.owner.token));
  }
  attach(): void {
    if (!this.owner || this.owner.attached) throw new Error('游戏页面已连接');
    this.owner.attached = true; this.emit('connected');
    if (this.attachTimeout) clearTimeout(this.attachTimeout); this.attachTimeout = null;
  }
  emitEvent(event: ConnectorEvent): void { if (this.owner?.attached) this.emit('event', event); }
  mcpPlayer(scopeId: string, token: string): Capability | null {
    const capability = this.capabilities.get(token); return capability?.request.scopeId === scopeId ? capability : null;
  }
  async dispatchTool(scopeId: string, token: string, tool: string, args: Record<string, unknown>): Promise<ToolResponse> {
    if (!this.owner?.attached) throw new Error('游戏网页已断开');
    const capability = this.mcpPlayer(scopeId, token); if (!capability) throw new Error('玩家凭据已过期');
    capability.conversation.record('tool-call', tool, args);
    try {
      const definition = capability.registry.definition(tool); capability.registry.validateInput(tool, args);
      const decision = capability.sessionId ? this.active.get(capability.sessionId) : undefined;
      if (definition.requiresDecision && (!decision || decision.controller.signal.aborted)) throw new Error('当前没有此玩家的有效决策授权');
      const id = randomUUID();
      const request: BrowserToolRequest = { id, scopeId, playerId: capability.request.playerId, ...(decision ? { decisionId: decision.decisionId } : {}), tool, args };
      const result = await new Promise<ToolResponse>((resolve, reject) => {
        const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('游戏网页没有响应，请保持网页打开')); }, 20_000);
        this.pending.set(id, { capability, resolve, reject, timer }); this.emitEvent({ type: 'tool', request });
      });
      capability.conversation.record('tool-result', tool, result);
      capability.registry.validateOutput(tool, result); return result;
    } catch (error) { capability.conversation.record('error', `${tool} 调用失败`, (error as Error).message); throw error; }
  }
  toolResult(id: string, response: ToolResponse): void {
    const pending = this.pending.get(id); if (!pending) throw new Error('工具请求已过期');
    this.pending.delete(id); clearTimeout(pending.timer); pending.resolve(response);
  }
  async createSession(request: SessionRequest): Promise<{ sessionId: string }> {
    return this.startSession(request, randomUUID());
  }
  private async startSession(request: SessionRequest, sessionId: string, signal?: AbortSignal): Promise<{ sessionId: string }> {
    if (!this.owner?.attached) throw new Error('请先连接游戏网页');
    const key = JSON.stringify([request.scopeId, request.playerId]);
    if (this.creating.has(key) || [...this.sessions].some(([id, s]) => id !== sessionId && s.capability.request.scopeId === request.scopeId && s.capability.request.playerId === request.playerId)) throw new Error('该玩家已有会话或正在创建');
    const adapter = this.adapters.get(request.kind); if (!adapter) throw new Error('所选 Harness 不可用');
    request = structuredClone({ ...request, ...resolveSettings(modelsForHarness(this.info, request.kind), request) });
    const owner = this.owner, token = randomBytes(24).toString('hex');
    const mcpUrl = `http://127.0.0.1:${this.info.port}/mcp/${encodeURIComponent(request.scopeId)}/${token}`;
    const onConversation = (update: ConversationUpdate) => {
      if (this.owner === owner) this.emitEvent({ type: 'conversation', scopeId: request.scopeId, playerId: request.playerId, ...update,
        entry: { ...update.entry, text: update.entry.text.replaceAll(mcpUrl, '[本玩家游戏工具地址]').replaceAll(token, '[玩家凭据]').replaceAll(owner.token, '[网页凭据]') } });
    };
    const conversation = new ConversationRecorder(onConversation);
    const registry = new ToolRegistry(request.tools), capability: Capability = { request, registry, conversation };
    this.creating.add(key); const generation = this.generation;
    this.capabilities.set(token, capability);
    const cwd = join(this.dataDirectory, 'sessions', randomUUID());
    try {
      conversation.record('instructions', '连接器初始化指令', sessionInstructions(request));
      conversation.record('instructions', '本玩家可用的游戏工具', registry.definitions);
      await mkdir(cwd, { recursive: true }); await writeFile(join(cwd, 'AGENTS.md'), sessionInstructions(request), 'utf8');
      const session = await adapter.createSession({ ...request, cwd, mcpUrl,
        onConversation: update => { if (!capability.discarded) onConversation(update); },
        onActivity: (text, tool) => { if(this.capabilities.get(token)===capability)this.emitEvent({ type: 'activity', playerId: request.playerId, text, tool }); },
        onUsage: tokens => { if(this.capabilities.get(token)===capability)this.emitEvent({ type: 'usage', playerId: request.playerId, tokens }); },
      });
      if (signal?.aborted || generation !== this.generation || this.owner !== owner || !this.owner.attached) { await session.close(); throw signal?.aborted ? abortError() : new Error('连接已结束'); }
      // The browser keeps this logical handle when an unresponsive native
      // session is replaced. Each replacement gets fresh MCP credentials.
      capability.sessionId = sessionId; this.sessions.set(sessionId, { session, capability, token, cwd }); return { sessionId };
    } catch (error) { conversation.record('error', '创建玩家会话失败', (error as Error).message); this.capabilities.delete(token); await this.removeTemporaryWorkspace(cwd); throw error; }
    finally { this.creating.delete(key); }
  }
  async playTurn(sessionId: string, prompt: string, decisionId: string, settings?: AgentSettings): Promise<{ completed: boolean }> {
    const player = this.sessions.get(sessionId); if (!player) throw new Error('找不到玩家会话，请重新连接');
    if (this.active.has(sessionId)) throw new Error('此玩家已有正在处理的决策');
    const resolved = resolveSettings(modelsForHarness(this.info, player.capability.request.kind), settings ?? player.capability.request);
    const controller = new AbortController();
    const active: ActiveDecision = { decisionId, controller, done: Promise.resolve() }; this.active.set(sessionId, active);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 180_000);
    active.done = this.runDecision(sessionId, player, prompt, controller.signal, resolved);
    try { await active.done; player.capability.conversation.record('event', '本次决策结束', 'Agent 已结束本次任务。'); return { completed: true }; }
    catch (error) {
      const failure = timedOut ? new Error('本次决策超过 180 秒，已取消上游任务。点击继续可重试。') : error as Error;
      const paused = controller.signal.aborted && !timedOut;
      player.capability.conversation.record(paused ? 'event' : 'error', paused ? '推理已暂停' : '推理失败', failure.message); throw failure;
    }
    finally { clearTimeout(timer); if (this.active.get(sessionId) === active) this.active.delete(sessionId); }
  }
  private async runDecision(sessionId: string, player: PlayerSession, prompt: string, signal: AbortSignal, settings: AgentSettings): Promise<void> {
    let onAbort!: () => void;
    const cancelled = new Promise<{ cancelled: true }>(resolve => { onAbort = () => resolve({ cancelled: true }); signal.addEventListener('abort', onAbort, { once: true }); });
    const task = (async () => {
      if (!player.session) {
        player.capability.conversation.record('event', '重建玩家会话', '上次会话已关闭，正在根据当前决策建立新会话。');
        await this.startSession({ ...player.capability.request, ...settings }, sessionId, signal);
        player = this.sessions.get(sessionId)!;
      }
      if (signal.aborted) throw abortError();
      await player.session!.playTurn(prompt, signal, settings);
    })();
    // Keep the original task observed while cancellation is acknowledged. An
    // RPC timeout must never leave an upstream turn running behind a retry.
    const settled = task.then(() => ({ error: undefined }), (error: unknown) => ({ error }));
    let grace: ReturnType<typeof setTimeout> | undefined;
    try {
      const outcome = await Promise.race([settled, cancelled]);
      if ('cancelled' in outcome || signal.aborted) {
        const completion = await Promise.race([settled, new Promise<null>(resolve => { grace = setTimeout(() => resolve(null), 5000); })]);
        if (!completion || (completion.error !== undefined && (completion.error as Error)?.name !== 'AbortError')) await this.discardSession(sessionId);
        throw abortError();
      }
      if (outcome.error !== undefined) { await this.discardSession(sessionId); throw outcome.error; }
    } finally { clearTimeout(grace); signal.removeEventListener('abort', onAbort); }
  }
  private async discardSession(sessionId: string): Promise<void> {
    const player = this.sessions.get(sessionId); if (!player?.session) return;
    const session = player.session; player.session = null; player.capability.discarded = true; this.capabilities.delete(player.token);
    for (const [id, pending] of this.pending) if (pending.capability === player.capability) { clearTimeout(pending.timer); pending.reject(new Error('玩家会话已关闭')); this.pending.delete(id); }
    try { await session.close(); }
    finally {
      await this.removeTemporaryWorkspace(player.cwd);
      player.capability.conversation.record('event', '玩家会话已关闭', '旧会话的工具凭据已撤销；点击继续时会重建该玩家会话。');
    }
  }
  async pauseTurn(): Promise<void> {
    const active = [...this.active.values()]; for (const task of active) task.controller.abort();
    await Promise.allSettled(active.map(task => task.done));
  }
  async stopSessions(ids?: string[]): Promise<void> {
    if (!ids) this.generation++;
    const selected = [...this.sessions.entries()].filter(([id]) => !ids || ids.includes(id));
    for (const [id, s] of selected) { this.active.get(id)?.controller.abort(); this.active.delete(id); this.capabilities.delete(s.token); this.sessions.delete(id); }
    if (!ids) this.capabilities.clear();
    const revoked = new Set(selected.map(([,s])=>s.capability));
    for (const [id,pending] of this.pending) if (!ids || revoked.has(pending.capability)) { clearTimeout(pending.timer); pending.reject(new Error('会话已结束')); this.pending.delete(id); }
    await Promise.allSettled(selected.map(async ([, s]) => { try { await s.session?.close(); } finally { s.capability.conversation.record('event', '玩家会话结束', '本机临时会话已关闭，对话保存在游戏网页的浏览器中。'); await this.removeTemporaryWorkspace(s.cwd); } }));
  }
  private async removeTemporaryWorkspace(cwd: string) {
    const root = resolve(this.dataDirectory, 'sessions'), target = resolve(cwd);
    if (target.startsWith(root + sep) && /^[0-9a-f-]{36}$/i.test(target.slice(root.length + 1))) await rm(target, { recursive: true, force: true }).catch(() => {});
  }
  async disconnect(expectedOwnerToken?: string): Promise<void> {
    if (expectedOwnerToken && this.owner?.token !== expectedOwnerToken) return;
    this.owner = null; if (this.attachTimeout) clearTimeout(this.attachTimeout); this.attachTimeout = null;
    this.emit('disconnect'); await this.stopSessions();
  }
}
