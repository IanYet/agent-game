import { applyAction, createGame, DOUDIZHU_RULES, getLegalActions, viewGame, type DoudizhuState, type GameAction, type PlayerConfig, type Seat } from '@agent-game/core';
import type { AppSnapshot, BrowserToolRequest, ConnectorInfo, MatchSummary, SeatRuntime, ToolResponse } from '@agent-game/protocol';
import { ConnectorClient, ConnectorVersionError } from './connector';

interface SavedGames { version: 1; current: DoudizhuState | null; archives: DoudizhuState[]; persistConversations?: boolean }
export interface LocalStore { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void }
const STORE_KEY = 'agent-arcade.games.v1';
const response = (value: unknown, isError = false): ToolResponse => ({ content: [{ type: 'text', text: JSON.stringify(value) }], ...(isError ? { isError } : {}) });
const summary = (g: DoudizhuState): MatchSummary => ({ id: g.id, round: g.round, endedAt: g.events.at(-1)?.time ?? g.createdAt, players: g.players.map((p, i) => ({ name: p.name, kind: p.kind, score: p.score, delta: g.result?.deltas[i] ?? 0 })), winner: g.result?.winner === 'landlord' ? '地主' : '农民', actions: g.events.filter(e => e.type === 'play').length });
const secureRandom = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; };

export class GameController {
  private data: SavedGames = { version: 1, current: null, archives: [] };
  private listeners = new Set<() => void>();
  private snapshot!: AppSnapshot;
  private seats: SeatRuntime[] = [];
  private info: ConnectorInfo | null = null;
  private connected = false;
  private connectorUpdateRequired = false;
  private paused = true;
  private error: string | null = null;
  private generation = 0;
  private pumpTask: Promise<void> | null = null;
  private active: { seat: Seat; revision: number; used: boolean } | null = null;
  constructor(private store: LocalStore, private client = new ConnectorClient()) {
    try {
      const raw = store.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.version === 1 && Array.isArray(saved.archives)) {
          const supported = (game: any) => game?.gameId === 'doudizhu' && game.players?.length === 3 && Array.isArray(game.events) && game.players.every((p: any) => ['human', 'codex', 'codex-acp'].includes(p.kind));
          this.data = { ...saved, current: supported(saved.current) ? saved.current : null, archives: saved.archives.filter(supported) };
          if ((saved.current && !this.data.current) || saved.archives.length !== this.data.archives.length) this.save();
        }
      }
    } catch { this.error = '上次牌局未能恢复，可以重新创建牌桌。'; }
    this.resetSeats(); this.refresh();
    client.onTool = request => this.handleTool(request);
    client.onEvent = event => {
      if (event.type === 'ready') this.info = event.info;
      if (event.type === 'activity' && this.seats[event.seat]) { this.seats[event.seat].message = event.text; this.seats[event.seat].lastTool = event.tool; }
      if (event.type === 'usage' && this.seats[event.seat]) this.seats[event.seat].tokens = event.tokens;
      this.refresh();
    };
    client.onDisconnect = () => {
      this.connected = false;
      this.seats.forEach(s => { delete s.sessionId; });
      if (this.data.current?.players.some(p => p.kind === 'codex' || p.kind === 'codex-acp') && this.data.current.phase !== 'finished') { this.paused = true; this.generation++; this.active = null; this.error = '连接器已断开，牌局已暂停。重新连接后可以继续。'; this.seats.forEach(s => s.status = 'paused'); }
      this.refresh();
    };
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  private resetSeats() { this.seats = this.data.current?.players.map(p => ({ seat: p.seat, kind: p.kind, status: 'idle', turns: 0, tokens: 0 })) ?? []; }
  private refresh() {
    const game = this.data.current; const viewer = game?.players.find(p => p.kind === 'human')?.seat ?? null;
    this.snapshot = { connector: this.info, connected: this.connected, connectorUpdateRequired: this.connectorUpdateRequired, game: game ? viewGame(game, viewer) : null, seats: structuredClone(this.seats), paused: this.paused, persistConversations: this.data.persistConversations === true, error: this.error, history: [...this.data.archives].reverse().map(summary) };
    this.listeners.forEach(listener => listener());
  }
  private save() {
    try { this.store.setItem(STORE_KEY, JSON.stringify(this.data)); }
    catch { this.data.archives = this.data.archives.slice(-5); try { this.store.setItem(STORE_KEY, JSON.stringify(this.data)); } catch { this.error = '浏览器存储空间不足，本局仍可游玩，但刷新后可能无法恢复。'; } }
  }
  async connect(): Promise<void> {
    try { this.info = await this.client.connect(); this.connected = true; this.connectorUpdateRequired = false; this.error = null; this.refresh(); }
    catch (error) {
      if (error instanceof ConnectorVersionError) { this.info = error.connector; this.connected = false; this.connectorUpdateRequired = true; this.error = error.message; this.refresh(); }
      throw error;
    }
  }
  async disconnect(): Promise<void> { await this.pause(); await this.client.disconnect(); this.connected = false; this.refresh(); }
  async create(players: PlayerConfig[], options?: { persistConversations?: boolean }): Promise<void> {
    const game = createGame(crypto.randomUUID(), players, { random: secureRandom });
    if (!this.connected) throw new Error('请先启动本地连接器，并连接 Codex');
    await this.pause();
    await this.client.stopSessions();
    this.data.current = game; this.data.persistConversations = options?.persistConversations === true; this.paused = false; this.error = null; this.resetSeats(); this.save(); this.refresh(); this.schedule();
  }
  async nextRound(): Promise<void> {
    const old = this.data.current;
    if (!old || old.phase !== 'finished') throw new Error('当前牌局尚未结束');
    if (old.players.some(p => p.kind === 'codex' || p.kind === 'codex-acp') && !this.connected) throw new Error('请先重新连接 Codex');
    await this.pause();
    await this.client.stopSessions();
    this.data.current = createGame(old.id, old.players.map(({ name, kind, model, reasoningEffort }) => ({ name, kind, model, reasoningEffort })), { random: secureRandom, round: old.round + 1, scores: old.players.map(p => p.score), firstBidder: ((old.firstBidder + 1) % 3) as Seat });
    this.paused = false; this.error = null; this.resetSeats(); this.save(); this.refresh(); this.schedule();
  }
  humanAction(action: GameAction): void {
    const game = this.data.current; const seat = game?.players.find(p => p.kind === 'human')?.seat;
    if (seat === undefined || this.paused) throw new Error('当前不能操作手牌');
    this.commit(seat, action, game!.revision); this.schedule();
  }
  private commit(seat: Seat, action: GameAction, revision: number): void {
    const game = this.data.current;
    if (!game || game.revision !== revision) throw new Error('牌局已更新，请重新读取状态');
    if (this.paused) throw new Error('牌局已暂停');
    this.data.current = applyAction(game, seat, action);
    if (this.data.current.phase === 'finished') {
      this.data.archives.push(structuredClone(this.data.current)); this.data.archives = this.data.archives.slice(-20);
    }
    this.save(); this.refresh();
  }
  async pause(): Promise<void> {
    this.paused = true; this.generation++; this.active = null;
    this.seats.forEach(s => { if (s.status !== 'error') s.status = 'paused'; }); this.refresh();
    await this.client.pauseTurn(); await this.pumpTask;
    this.refresh();
  }
  async resume(): Promise<void> {
    const game = this.data.current;
    if (!game || game.phase === 'finished') return;
    if (game.players.some(p => p.kind === 'codex' || p.kind === 'codex-acp') && !this.connected) throw new Error('请先连接 Codex');
    if (!this.paused) return;
    this.error = null; this.paused = false; this.seats.forEach(s => { s.status = s.sessionId ? 'ready' : 'idle'; s.message = undefined; }); this.refresh(); this.schedule();
  }
  configurePlayers(players: PlayerConfig[]): void {
    const game = this.data.current;
    if (!game || !this.paused || game.phase === 'finished') throw new Error('请先暂停当前牌局，再调整玩家设置');
    if (players.length !== 3) throw new Error('玩家设置不完整');
    game.players = game.players.map((player, i) => player.kind === 'human' ? player : { ...player, model: players[i].model || undefined, reasoningEffort: players[i].reasoningEffort || undefined });
    this.save(); this.refresh();
  }
  replay(id: string, round: number): DoudizhuState | undefined { return this.data.archives.find(g => g.id === id && g.round === round); }
  clearError(): void { this.error = null; this.refresh(); }
  handleTool(request: BrowserToolRequest): ToolResponse {
    try {
      const game = this.data.current;
      if (!game || request.roomId !== game.id || !game.players[request.seat] || game.players[request.seat].kind === 'human') throw new Error('座位凭据不属于当前牌局');
      if (request.tool === 'game_rules') return response({ rules: DOUDIZHU_RULES });
      if (request.tool === 'game_get_state') {
        const view = viewGame(game, request.seat);
        return response({ ...view, legalActions: view.legalActions.slice(0, 12), legalActionCount: view.legalActions.length, paused: this.paused });
      }
      if (request.tool === 'game_legal_actions') {
        const actions = getLegalActions(game, request.seat);
        const offset = Math.max(0, Number(request.args.offset) || 0); const limit = Math.min(100, Math.max(1, Number(request.args.limit) || 80));
        return response({ revision: game.revision, total: actions.length, offset, actions: actions.slice(offset, offset + limit) });
      }
      if (request.tool === 'game_act') {
        const active = this.active;
        if (!active || active.seat !== request.seat || active.used || active.revision !== request.args.revision) throw new Error('当前没有此座位的行动授权，或本轮已行动');
        const action = getLegalActions(game, request.seat).find(a => a.id === request.args.actionId);
        if (!action) throw new Error('actionId 不在合法行动列表中');
        this.commit(request.seat, action.action, Number(request.args.revision)); active.used = true;
        return response({ success: true, revision: this.data.current!.revision, message: '行动已执行。立即结束本轮任务，等待下次唤醒。' });
      }
      throw new Error('未知游戏工具');
    } catch (error: any) { return response({ error: error.message }, true); }
  }
  private schedule(): void {
    if (this.pumpTask || this.paused || !this.data.current || this.data.current.phase === 'finished') return;
    const generation = this.generation;
    this.pumpTask = this.pump(generation).finally(() => {
      this.pumpTask = null;
      if (!this.paused && this.data.current?.phase !== 'finished' && this.data.current?.players[this.data.current.turn].kind !== 'human') this.schedule();
    });
  }
  private async pump(generation: number): Promise<void> {
    while (!this.paused && this.generation === generation && this.data.current?.phase !== 'finished') {
      const game = this.data.current; if (!game) break;
      const seat = game.turn; const player = game.players[seat]; const runtime = this.seats[seat];
      if (player.kind === 'human') break;
      try {
        if (!runtime.sessionId) {
          runtime.status = 'connecting'; runtime.message = '创建独立玩家会话'; this.refresh();
          const { sessionId } = await this.client.createSession({ roomId: game.id, round: game.round, persistConversation: this.data.persistConversations === true, seat, kind: player.kind, name: player.name, ...(player.model ? { model: player.model } : {}), ...(player.reasoningEffort ? { reasoningEffort: player.reasoningEffort } : {}) });
          runtime.sessionId = sessionId;
          if (this.data.persistConversations) runtime.conversationId = sessionId;
          if (this.paused || generation !== this.generation) { runtime.status = 'paused'; this.refresh(); break; }
        }
        runtime.status = 'thinking'; runtime.message = '正在思考'; this.active = { seat, revision: game.revision, used: false }; this.refresh();
        const result = await this.client.playTurn(runtime.sessionId, `你是座位 ${seat} 的玩家 ${player.name}。第 ${game.round} 局，revision=${game.revision}，${game.phase === 'bidding' ? '请叫分' : '轮到你出牌'}。通过 agent_game MCP 读取状态，执行恰好一次合法行动，然后结束任务。`, game.revision, { model: player.model, reasoningEffort: player.reasoningEffort });
        if (this.paused || generation !== this.generation) break;
        if (!this.active?.used || !result.acted) throw new Error('Agent 结束了任务但没有执行游戏行动。点击继续可重试。');
        this.active = null; runtime.status = 'ready'; runtime.message = undefined; runtime.turns++; this.refresh();
      } catch (error: any) {
        if (generation !== this.generation || this.paused) break;
        this.active = null; this.paused = true; runtime.status = 'error'; this.error = `${player.name}：${error.message}`; runtime.message = this.error; this.refresh();
        await this.client.stopSessions().catch(() => {}); this.seats.forEach(s => { delete s.sessionId; }); break;
      }
    }
    this.active = null;
    if (this.data.current?.phase === 'finished') { await this.client.stopSessions().catch(() => {}); this.seats.forEach(s => { s.status = 'ready'; delete s.sessionId; }); this.refresh(); }
  }
}
