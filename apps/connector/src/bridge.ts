import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { modelsForHarness, type AgentSettings, type BrowserToolRequest, type ConnectorEvent, type GameTool, type SessionRequest, type ToolResponse } from '@agent-game/protocol';
import type { AgentSession, ConnectorInfo, HarnessAdapter } from './types';
import { GAME_INSTRUCTIONS } from './harness/instructions';
import { resolveSettings } from './harness/settings';

interface PlayerSession { session: AgentSession; request: SessionRequest; mcpToken: string }
interface ActiveTurn { sessionId: string; controller: AbortController; revision: number; acted: boolean; done?: Promise<void> }
export class LocalBridge extends EventEmitter {
  private owner: { token: string; origin: string; attached: boolean } | null = null;
  private sessions = new Map<string, PlayerSession>();
  private capabilities = new Map<string, SessionRequest>();
  private pending = new Map<string, { resolve: (response: ToolResponse) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private active: ActiveTurn | null = null;
  private generation = 0;
  private creating = false;
  private attachTimeout: ReturnType<typeof setTimeout> | null = null;
  constructor(readonly info: ConnectorInfo, private adapters: Map<string, HarnessAdapter>, private dataDirectory: string) { super(); }
  connect(origin: string): string {
    if (this.owner) throw new Error('连接器已被另一个网页占用，请关闭那张网页后重试');
    if (this.info.auth !== 'chatgpt') throw new Error('请先打开 Codex 并使用 ChatGPT 订阅登录，再重启连接器');
    const token = randomBytes(32).toString('hex'); this.owner = { token, origin, attached: false };
    this.attachTimeout = setTimeout(() => { if (!this.owner?.attached) void this.disconnect(); }, 15_000);
    return token;
  }
  authorized(token: string, origin: string): boolean {
    return !!this.owner && this.owner.origin === origin && token.length === this.owner.token.length && timingSafeEqual(Buffer.from(token), Buffer.from(this.owner.token));
  }
  attach(): void {
    if (!this.owner || this.owner.attached) throw new Error('游戏页面已连接');
    this.owner.attached = true;
    this.emit('connected');
    if (this.attachTimeout) clearTimeout(this.attachTimeout); this.attachTimeout = null;
  }
  emitEvent(event: ConnectorEvent): void { if (this.owner?.attached) this.emit('event', event); }
  mcpSeat(roomId: string, token: string): SessionRequest | null {
    const seat = this.capabilities.get(token);
    return seat?.roomId === roomId ? seat : null;
  }
  async callBrowser(request: Omit<BrowserToolRequest, 'id'>): Promise<ToolResponse> {
    if (!this.owner?.attached) throw new Error('游戏网页已断开');
    const authorizedTurn = request.tool === 'game_act' ? this.active : null;
    if (request.tool === 'game_act') {
      const session = this.active && this.sessions.get(this.active.sessionId);
      if (!this.active || !session || session.request.seat !== request.seat || session.request.roomId !== request.roomId || this.active.acted || request.args.revision !== this.active.revision) throw new Error('当前没有此座位的行动授权，或本轮已行动');
    }
    const id = randomUUID();
    const response = await new Promise<ToolResponse>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('游戏网页没有响应，请保持网页打开')); }, 20_000);
      this.pending.set(id, { resolve, reject, timer });
      this.emitEvent({ type: 'tool', request: { ...request, id } });
    });
    if (!response.isError && authorizedTurn && this.active === authorizedTurn) authorizedTurn.acted = true;
    return response;
  }
  toolResult(id: string, response: ToolResponse): void {
    const pending = this.pending.get(id);
    if (!pending) throw new Error('游戏工具请求已过期');
    this.pending.delete(id); clearTimeout(pending.timer); pending.resolve(response);
  }
  async createSession(request: SessionRequest): Promise<{ sessionId: string }> {
    if (!this.owner?.attached) throw new Error('请先连接游戏网页');
    if (this.creating) throw new Error('正在创建玩家，请稍候');
    if ([...this.sessions.values()].some(s => s.request.seat === request.seat)) throw new Error('该座位已经有一个玩家会话');
    const adapter = this.adapters.get(request.kind);
    if (!adapter) throw new Error('所选 harness 不可用');
    request = { ...request, ...resolveSettings(modelsForHarness(this.info, request.kind), request) };
    this.creating = true;
    const generation = this.generation;
    const mcpToken = randomBytes(24).toString('hex'); this.capabilities.set(mcpToken, request);
    try {
      const cwd = join(this.dataDirectory, 'sessions', randomUUID());
      await mkdir(cwd, { recursive: true }); await writeFile(join(cwd, 'AGENTS.md'), GAME_INSTRUCTIONS, 'utf8');
      const session = await adapter.createSession({
        ...request, cwd, mcpUrl: `http://127.0.0.1:${this.info.port}/mcp/${request.roomId}/${mcpToken}`,
        onActivity: (text, tool) => this.emitEvent({ type: 'activity', seat: request.seat, text, tool }),
        onUsage: tokens => this.emitEvent({ type: 'usage', seat: request.seat, tokens }),
      });
      if (generation !== this.generation || !this.owner?.attached) { await session.close(); throw new Error('连接已结束'); }
      this.sessions.set(session.sessionId, { session, request, mcpToken });
      return { sessionId: session.sessionId };
    } catch (error) { this.capabilities.delete(mcpToken); throw error; }
    finally { this.creating = false; }
  }
  async playTurn(sessionId: string, prompt: string, revision: number, settings?: AgentSettings): Promise<{ acted: boolean }> {
    const player = this.sessions.get(sessionId);
    if (!player) throw new Error('找不到玩家会话，请重新连接');
    if (this.active) throw new Error('已有玩家正在行动');
    const requested = settings ?? player.request;
    const resolved = resolveSettings(modelsForHarness(this.info, player.request.kind), requested);
    const active: ActiveTurn = { sessionId, controller: new AbortController(), revision, acted: false };
    this.active = active;
    active.done = player.session.playTurn(prompt, active.controller.signal, resolved);
    try { await active.done; return { acted: active.acted }; }
    finally { if (this.active === active) this.active = null; }
  }
  async pauseTurn(): Promise<void> {
    const active = this.active;
    if (!active) return;
    active.controller.abort();
    await active.done?.catch(() => {});
  }
  async stopSessions(): Promise<void> {
    this.generation++; this.active?.controller.abort(); this.active = null;
    this.capabilities.clear();
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('会话已结束')); } this.pending.clear();
    const sessions = [...this.sessions.values()]; this.sessions.clear();
    await Promise.allSettled(sessions.map(s => s.session.close()));
  }
  async disconnect(expectedOwnerToken?: string): Promise<void> {
    if (expectedOwnerToken && this.owner?.token !== expectedOwnerToken) return;
    this.owner = null;
    if (this.attachTimeout) clearTimeout(this.attachTimeout); this.attachTimeout = null;
    this.emit('disconnect'); await this.stopSessions();
  }
}

export const GAME_TOOLS: GameTool[] = ['game_get_state', 'game_legal_actions', 'game_act', 'game_rules'];
