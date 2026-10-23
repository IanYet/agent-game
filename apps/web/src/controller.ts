import { applyArcadeAction, assertHoldemChips, createGame, createHoldem, gameName, holdemBetting, legalArcadeActions, nextHoldemHand, PLAYER_KINDS, rulesForGame, viewArcade, type ArcadeAction, type ArcadeState, type GameId, type HoldemOptions, type HoldemPlayerConfig, type PlayerConfig, type Seat } from '@agent-game/core';
import type { AppSnapshot, BrowserToolRequest, ConnectorInfo, MatchSummary, SeatRuntime, ToolResponse } from '@agent-game/protocol';
import { ConnectorClient, ConnectorVersionError } from './connector';

interface SavedGames { version: 2; current: ArcadeState | null; archives: ArcadeState[]; persistConversations?: boolean }
export interface LocalStore { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void }
export interface CreateOptions { gameId?: GameId; holdem?: Partial<HoldemOptions>; persistConversations?: boolean }
const STORE_KEY = 'agent-arcade.games.v1';
const response = (value: unknown, isError = false): ToolResponse => ({ content: [{ type: 'text', text: JSON.stringify(value) }], ...(isError ? { isError } : {}) });
const summary = (g: ArcadeState): MatchSummary => ({ id: g.id, gameId: g.gameId, round: g.round, endedAt: g.events.at(-1)?.time ?? g.createdAt, players: g.players.map((p, i) => ({ name: p.name, kind: p.kind, score: 'chips' in p ? p.chips : p.score, delta: g.result?.deltas[i] ?? 0 })), winner: g.gameId === 'holdem' ? g.result?.winners.map(s => g.players[s].name).join('、') ?? '' : g.result?.winner === 'landlord' ? '地主' : '农民', actions: g.events.filter(e => !['deal', 'blind', 'street', 'return', 'finish', 'landlord'].includes(e.type)).length });
const secureRandom = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; };
function supported(game: any): game is ArcadeState {
  if (!game || !Array.isArray(game.players) || !Array.isArray(game.events) || !game.players.every((p: any, i: number) => PLAYER_KINDS.includes(p.kind) && p.seat === i && Array.isArray(p.hand)) || game.players.filter((p: any) => p.kind === 'human').length > 1) return false;
  if (game.gameId === 'doudizhu') return game.players.length === 3;
  if (game.gameId === 'holdem' && game.players.length >= 2 && game.players.length <= 9 && Array.isArray(game.deck) && Array.isArray(game.ledger) && typeof game.handId === 'string') {
    try { assertHoldemChips(game); return true; } catch { return false; }
  }
  return false;
}

export class GameController {
  private data: SavedGames = { version: 2, current: null, archives: [] };
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
  private cleanupTask: Promise<void> | null = null;
  private active: { seat: Seat; revision: number; used: boolean } | null = null;
  constructor(private store: LocalStore, private client = new ConnectorClient()) {
    try {
      const raw = store.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if ([1, 2].includes(saved.version) && Array.isArray(saved.archives)) {
          this.data = { version: 2, persistConversations: saved.persistConversations === true, current: supported(saved.current) ? saved.current : null, archives: saved.archives.filter(supported) };
          if ((saved.current && !this.data.current) || saved.archives.length !== this.data.archives.length || saved.version !== 2) this.save();
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
      this.connected = false; this.seats.forEach(s => { delete s.sessionId; });
      if (this.data.current?.players.some(p => p.kind !== 'human') && this.data.current.phase !== 'finished') { this.paused = true; this.generation++; this.active = null; this.error = '连接器已断开，牌局已暂停。重新连接后可以继续。'; this.seats.forEach(s => s.status = 'paused'); }
      this.refresh();
    };
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  private resetSeats() { this.seats = this.data.current?.players.map(p => ({ seat: p.seat, kind: p.kind, status: 'idle', turns: 0, tokens: 0 })) ?? []; }
  private refresh() {
    const game = this.data.current, viewer = game?.players.find(p => p.kind === 'human')?.seat ?? null;
    this.snapshot = { connector: this.info, connected: this.connected, connectorUpdateRequired: this.connectorUpdateRequired, game: game ? viewArcade(game, viewer) : null, seats: structuredClone(this.seats), paused: this.paused, persistConversations: this.data.persistConversations === true, error: this.error, history: [...this.data.archives].reverse().map(summary) };
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
  async create(players: PlayerConfig[], options: CreateOptions = {}): Promise<void> {
    const id = crypto.randomUUID();
    const game = options.gameId === 'holdem' ? createHoldem(id, players, { ...options.holdem, handId: crypto.randomUUID(), random: secureRandom }) : createGame(id, players, { random: secureRandom });
    if (!this.connected) throw new Error('请先启动并连接本地连接器');
    await this.pause(); await this.client.stopSessions();
    this.data.current = game; this.data.persistConversations = options.persistConversations === true; this.paused = false; this.error = null; this.resetSeats(); this.save(); this.refresh(); this.schedule();
    if (game.phase === 'finished') { this.data.archives.push(structuredClone(game)); this.data.archives = this.data.archives.slice(-20); this.save(); this.refresh(); }
  }
  async nextRound(configs?: HoldemPlayerConfig[]): Promise<void> {
    const old = this.data.current;
    if (!old || old.phase !== 'finished') throw new Error('当前牌局尚未结束，不能变更阵容');
    if (!this.connected) throw new Error('请先重新连接本地连接器');
    const next = old.gameId === 'holdem' ? nextHoldemHand(old, configs ?? old.players, { random: secureRandom, handId: crypto.randomUUID() }) : createGame(old.id, configs ?? old.players, { random: secureRandom, round: old.round + 1, scores: old.players.map(p => p.score), firstBidder: (old.firstBidder + 1) % 3 });
    await this.pause(); await this.client.stopSessions();
    this.data.current = next; this.paused = false; this.error = null; this.resetSeats(); this.save(); this.refresh(); this.schedule();
    if (next.phase === 'finished') { this.data.archives.push(structuredClone(next)); this.data.archives = this.data.archives.slice(-20); this.save(); this.refresh(); }
  }
  humanAction(action: ArcadeAction): void {
    const game = this.data.current, seat = game?.players.find(p => p.kind === 'human')?.seat;
    if (seat === undefined || this.paused) throw new Error('当前不能操作手牌');
    this.commit(seat, action, game!.revision);
    if (this.data.current?.phase === 'finished') void this.closeFinishedSessions(); else this.schedule();
  }
  private commit(seat: Seat, action: ArcadeAction, revision: number): void {
    const game = this.data.current;
    if (!game || game.revision !== revision) throw new Error('牌局已更新，请重新读取状态');
    if (this.paused) throw new Error('牌局已暂停');
    this.data.current = applyArcadeAction(game, seat, action);
    if (this.data.current.phase === 'finished') { this.data.archives.push(structuredClone(this.data.current)); this.data.archives = this.data.archives.slice(-20); }
    this.save(); this.refresh();
  }
  async pause(): Promise<void> {
    this.paused = true; this.generation++; this.active = null;
    this.seats.forEach(s => { if (s.status !== 'error') s.status = 'paused'; }); this.refresh();
    await this.client.pauseTurn(); await this.pumpTask; await this.cleanupTask; this.refresh();
  }
  async resume(): Promise<void> {
    const game = this.data.current;
    if (!game || game.phase === 'finished') return;
    if (!this.connected) throw new Error('请先连接本地连接器');
    if (!this.paused) return;
    this.error = null; this.paused = false; this.seats.forEach(s => { s.status = s.sessionId ? 'ready' : 'idle'; s.message = undefined; }); this.refresh(); this.schedule();
  }
  configurePlayers(players: PlayerConfig[]): void {
    const game = this.data.current;
    if (!game || !this.paused || game.phase === 'finished') throw new Error('请先暂停当前牌局，再调整玩家设置');
    if (players.length !== game.players.length || players.some((p, i) => p.kind !== game.players[i].kind || p.name !== game.players[i].name)) throw new Error('一手进行中不变更阵容或 Harness，请在下一手开始前调整');
    game.players.forEach((player, i) => { if (player.kind !== 'human') { player.model = players[i].model || undefined; player.reasoningEffort = players[i].reasoningEffort || undefined; } });
    this.save(); this.refresh();
  }
  replay(id: string, round: number): ArcadeState | undefined { return this.data.archives.find(g => g.id === id && g.round === round); }
  clearError(): void { this.error = null; this.refresh(); }
  handleTool(request: BrowserToolRequest): ToolResponse {
    try {
      const game = this.data.current;
      if (!game || request.roomId !== game.id || (game.gameId === 'holdem' && request.handId !== game.handId) || !game.players[request.seat] || game.players[request.seat].kind === 'human') throw new Error('座位凭据不属于当前这手牌');
      if (request.tool === 'game_rules') return response({ gameId: game.gameId, rules: rulesForGame(game.gameId) });
      if (request.tool === 'game_get_state') {
        const view = viewArcade(game, request.seat);
        return response({ ...view, legalActions: view.legalActions.slice(0, 12), legalActionCount: view.legalActions.length, paused: this.paused });
      }
      if (request.tool === 'game_legal_actions') {
        const actions = legalArcadeActions(game, request.seat);
        const offset = Math.max(0, Math.floor(Number(request.args.offset) || 0)), limit = Math.min(100, Math.max(1, Math.floor(Number(request.args.limit) || 80)));
        return response({ revision: game.revision, total: actions.length, offset, actions: actions.slice(offset, offset + limit), ...(game.gameId === 'holdem' ? { betting: holdemBetting(game, request.seat), customRaise: { actionId: 'raise', amount: '整数，本轮累计下注到的筹码数；不足最小加注仅允许全下' } } : {}) });
      }
      if (request.tool === 'game_act') {
        const active = this.active;
        if (!active || active.seat !== request.seat || active.used || active.revision !== request.args.revision) throw new Error('当前没有此座位的行动授权，或本轮已行动');
        let action: ArcadeAction | undefined;
        if (game.gameId === 'holdem' && request.args.actionId === 'raise') action = { type: 'raise', amount: request.args.amount as number };
        else {
          if (request.args.amount !== undefined) throw new Error('只有 actionId=raise 时可以指定 amount');
          action = legalArcadeActions(game, request.seat).find(a => a.id === request.args.actionId)?.action;
        }
        if (!action) throw new Error('actionId 不在合法行动列表中');
        this.commit(request.seat, action, Number(request.args.revision)); active.used = true;
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
  private async ensureSession(seat: Seat, generation: number) {
    const game = this.data.current!, player = game.players[seat], runtime = this.seats[seat];
    if (player.kind === 'human' || runtime.sessionId) return;
    runtime.status = 'connecting'; runtime.message = '创建本手独立玩家会话'; this.refresh();
    const { sessionId } = await this.client.createSession({ roomId: game.id, gameId: game.gameId, handId: game.gameId === 'holdem' ? game.handId : `${game.id}:${game.round}`, initialState: JSON.stringify(viewArcade(game, seat)), round: game.round, persistConversation: this.data.persistConversations === true, seat, kind: player.kind, name: player.name, ...(player.model ? { model: player.model } : {}), ...(player.reasoningEffort ? { reasoningEffort: player.reasoningEffort } : {}) });
    runtime.sessionId = sessionId; runtime.status = this.paused || generation !== this.generation ? 'paused' : 'ready';
    if (this.data.persistConversations) runtime.conversationId = sessionId;
    this.refresh();
  }
  private async pump(generation: number): Promise<void> {
    // Poker creates every Agent before the first action. Every hand has fresh capabilities and initial chips.
    if (this.data.current?.gameId === 'holdem') {
      try {
        for (const p of this.data.current.players) { if (this.paused || this.generation !== generation) return; await this.ensureSession(p.seat, generation); }
      } catch (error: any) { if (generation === this.generation) await this.failTurn(error.message); return; }
    }
    while (!this.paused && this.generation === generation && this.data.current?.phase !== 'finished') {
      const game = this.data.current; if (!game) break;
      const seat = game.turn, player = game.players[seat], runtime = this.seats[seat];
      if (player.kind === 'human') break;
      try {
        await this.ensureSession(seat, generation);
        if (this.paused || generation !== this.generation) break;
        runtime.status = 'thinking'; runtime.message = '正在思考'; this.active = { seat, revision: game.revision, used: false }; this.refresh();
        const chips = game.gameId === 'holdem' ? `本手起始筹码 ${game.players[seat].startingChips}，当前可用筹码 ${game.players[seat].chips}，已投入 ${game.players[seat].committed}。` : '';
        const result = await this.client.playTurn(runtime.sessionId!, `你是座位 ${seat} 的玩家 ${player.name}。${gameName(game.gameId)}，第 ${game.round} ${game.gameId === 'holdem' ? '手' : '局'}，revision=${game.revision}，阶段 ${game.phase}。${chips}通过 agent_game MCP 读取状态，执行恰好一次合法行动，然后结束任务。`, game.revision, { model: player.model, reasoningEffort: player.reasoningEffort });
        if (this.paused || generation !== this.generation) break;
        if (!this.active?.used || !result.acted) throw new Error('Agent 结束了任务但没有执行游戏行动。点击继续可重试。');
        this.active = null; runtime.status = 'ready'; runtime.message = undefined; runtime.turns++; this.refresh();
      } catch (error: any) { if (generation !== this.generation || this.paused) break; runtime.status = 'error'; runtime.message = `${player.name}：${error.message}`; await this.failTurn(runtime.message); break; }
    }
    this.active = null;
    if (this.data.current?.phase === 'finished') await this.closeFinishedSessions();
  }
  private closeFinishedSessions(): Promise<void> {
    if (this.cleanupTask) return this.cleanupTask;
    const seats = this.seats;
    this.cleanupTask = this.client.stopSessions().catch(() => {}).then(() => {
      if (this.seats === seats) seats.forEach(s => { s.status = 'ready'; delete s.sessionId; });
      this.refresh();
    }).finally(() => { this.cleanupTask = null; });
    return this.cleanupTask;
  }
  private async failTurn(message: string) {
    this.active = null; this.paused = true; this.error = message; this.refresh();
    await this.client.stopSessions().catch(() => {}); this.seats.forEach(s => { delete s.sessionId; }); this.refresh();
  }
}
