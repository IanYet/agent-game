import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { EventEmitter } from 'node:events';
import { modelsForHarness, type AgentSettings, type BrowserToolRequest, type ConnectorEvent, type SessionRequest, type ToolResponse } from '@agent-game/protocol';
import { ToolRegistry } from '../../../packages/protocol/src/validation';
import type { AgentSession, ConnectorInfo, HarnessAdapter } from './types';
import { sessionInstructions } from './harness/instructions';
import { resolveSettings } from './harness/settings';

interface Capability { request: SessionRequest; registry: ToolRegistry; sessionId?: string }
interface PlayerSession { session: AgentSession; capability: Capability; token: string; cwd: string }
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
    const definition = capability.registry.definition(tool); capability.registry.validateInput(tool, args);
    const decision = capability.sessionId ? this.active.get(capability.sessionId) : undefined;
    if (definition.requiresDecision && (!decision || decision.controller.signal.aborted)) throw new Error('当前没有此玩家的有效决策授权');
    const id = randomUUID();
    const request: BrowserToolRequest = { id, scopeId, playerId: capability.request.playerId, ...(decision ? { decisionId: decision.decisionId } : {}), tool, args };
    const result = await new Promise<ToolResponse>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('游戏网页没有响应，请保持网页打开')); }, 20_000);
      this.pending.set(id, { capability, resolve, reject, timer }); this.emitEvent({ type: 'tool', request });
    });
    capability.registry.validateOutput(tool, result); return result;
  }
  toolResult(id: string, response: ToolResponse): void {
    const pending = this.pending.get(id); if (!pending) throw new Error('工具请求已过期');
    this.pending.delete(id); clearTimeout(pending.timer); pending.resolve(response);
  }
  async createSession(request: SessionRequest): Promise<{ sessionId: string }> {
    if (!this.owner?.attached) throw new Error('请先连接游戏网页');
    const key = JSON.stringify([request.scopeId, request.playerId]);
    if (this.creating.has(key) || [...this.sessions.values()].some(s => s.capability.request.scopeId === request.scopeId && s.capability.request.playerId === request.playerId)) throw new Error('该玩家已有会话或正在创建');
    const adapter = this.adapters.get(request.kind); if (!adapter) throw new Error('所选 Harness 不可用');
    request = structuredClone({ ...request, ...resolveSettings(modelsForHarness(this.info, request.kind), request) });
    const registry = new ToolRegistry(request.tools), capability: Capability = { request, registry };
    this.creating.add(key); const generation = this.generation;
    const token = randomBytes(24).toString('hex'); this.capabilities.set(token, capability);
    const cwd = join(this.dataDirectory, 'sessions', randomUUID());
    try {
      await mkdir(cwd, { recursive: true }); await writeFile(join(cwd, 'AGENTS.md'), sessionInstructions(request), 'utf8');
      const session = await adapter.createSession({ ...request, cwd, mcpUrl: `http://127.0.0.1:${this.info.port}/mcp/${encodeURIComponent(request.scopeId)}/${token}`,
        onActivity: (text, tool) => { if(this.capabilities.get(token)===capability)this.emitEvent({ type: 'activity', playerId: request.playerId, text, tool }); },
        onUsage: tokens => { if(this.capabilities.get(token)===capability)this.emitEvent({ type: 'usage', playerId: request.playerId, tokens }); },
      });
      if (generation !== this.generation || !this.owner?.attached) { await session.close(); throw new Error('连接已结束'); }
      if (this.sessions.has(session.sessionId)) { await session.close(); throw new Error('Harness 返回重复的会话 ID'); }
      capability.sessionId = session.sessionId; this.sessions.set(session.sessionId, { session, capability, token, cwd }); return { sessionId: session.sessionId };
    } catch (error) { this.capabilities.delete(token); if (!request.persistConversation) await this.removeTemporaryWorkspace(cwd); throw error; }
    finally { this.creating.delete(key); }
  }
  async playTurn(sessionId: string, prompt: string, decisionId: string, settings?: AgentSettings): Promise<{ completed: boolean }> {
    const player = this.sessions.get(sessionId); if (!player) throw new Error('找不到玩家会话，请重新连接');
    if (this.active.has(sessionId)) throw new Error('此玩家已有正在处理的决策');
    const resolved = resolveSettings(modelsForHarness(this.info, player.capability.request.kind), settings ?? player.capability.request);
    const controller = new AbortController();
    const active: ActiveDecision = { decisionId, controller, done: Promise.resolve() }; this.active.set(sessionId, active);
    active.done = player.session.playTurn(prompt, controller.signal, resolved);
    try { await active.done; return { completed: true }; }
    finally { if (this.active.get(sessionId) === active) this.active.delete(sessionId); }
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
    await Promise.allSettled(selected.map(async ([, s]) => { try { await s.session.close(); } finally { if (!s.capability.request.persistConversation) await this.removeTemporaryWorkspace(s.cwd); } }));
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
