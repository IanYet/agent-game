import { shuffle } from './cards';
import { RuleError } from './doudizhu';
import { PLAYER_KINDS, type Card, type PlayerConfig, type Seat } from './types';

export const HOLDEM_RULES = `无限注德州扑克，2–9 人，52 张牌，无大小王。每人两张底牌，依次翻出 3 张翻牌、1 张转牌、1 张河牌，每次发公共牌前烧一张牌。以任意 5 张组成最佳牌型（可不用底牌）：同花顺 > 四条 > 葫芦 > 同花 > 顺子 > 三条 > 两对 > 一对 > 高牌。A 可作顺子的最大牌或 A2345 的最小牌；花色不分大小。
庄家按钮每手顺时针移动。多人桌按钮左侧为小盲、再左为大盲，翻牌前大盲左侧先行动；翻牌后按钮左侧先行动。单挑时按钮下小盲、翻牌前先行动，大盲翻牌后先行动。变更阵容时先将大盲轮转到上一大盲之后的存续座位，再按新人数确定按钮，避免单挑转换时连下两次大盲。盲注不足则全下，翻牌前最低跟注基准仍为大盲；只剩一位可下注玩家时只需跟足对手实际投入。
行动为弃牌、过牌、跟注或加注。加注金额表示本轮累计下注到多少（raise-to），必须是整数筹码。最小开注为大盲，最小加注幅度为上一次完整加注的幅度。筹码不足时允许不足额全下；不足额加注不会单独重开已行动玩家的加注权，累计增加达到完整加注幅度时重开。过牌也视为已行动。不足额开注后再加注必须额外增加至少一个大盲，不能只补足到大盲。只有自己仍有可下注筹码时，不可对全下玩家额外加注。
所有未弃牌玩家完成跟注或全下后进入下一轮；不足两位可继续下注时自动发完公共牌。只剩一位未弃牌者立即获胜。未被跟注的超额下注退回。按每人累计投入建立主池及边池，弃牌筹码留在池中，只有投入达到该池门槛且未弃牌的玩家可争夺；各池独立比较、平分，不能整除的零头按按钮左侧起顺时针分给并列赢家。无抽水，逐手筹码守恒。摊牌仅展示未弃牌玩家底牌。
同桌下一手保留各玩家结算筹码，为每位 Agent 创建全新会话。发牌前可增减玩家或替换 Agent/Harness/模型/思考强度；筹码归玩家身份，替换 Agent 不重置筹码。新玩家按本桌初始筹码买入，离桌玩家兑现剩余筹码，买入/离桌记账；筹码归零的玩家必须离桌，可以另加新玩家。新牌桌清空旧桌账本，重新按初始筹码开始。一手进行中不更换阵容，最多一位真人。`;

export interface HoldemOptions { initialChips: number; smallBlind: number; bigBlind: number }
export const DEFAULT_HOLDEM_OPTIONS: HoldemOptions = { initialChips: 1000, smallBlind: 5, bigBlind: 10 };
export interface HoldemPlayerConfig extends PlayerConfig { playerId?: string }
export interface HoldemPlayer extends PlayerConfig {
  playerId: string; seat: Seat; hand: Card[]; chips: number; startingChips: number;
  committed: number; streetBet: number; folded: boolean; allIn: boolean; actedAtBet: number | null;
}
export type HoldemAction = { type: 'fold' | 'check' | 'call' } | { type: 'raise'; amount: number };
export interface HoldemLegalAction { id: string; action: HoldemAction; label: string; cards: Card[] }
export interface HoldemEvent { seq: number; time: string; type: 'deal' | 'blind' | 'fold' | 'check' | 'call' | 'raise' | 'street' | 'return' | 'finish'; seat?: Seat; text: string; cards?: Card[] }
export interface HandRank { category: number; values: number[]; label: string }
export interface HoldemPot { amount: number; eligible: Seat[]; winners: Seat[]; awards: Array<{ seat: Seat; amount: number }> }
export interface HoldemResult { deltas: number[]; pots: HoldemPot[]; winners: Seat[]; ranks: Record<number, HandRank>; showdown: boolean }
export interface HoldemLedgerEntry { round: number; playerId: string; name: string; type: 'buy-in' | 'cash-out'; amount: number }
export interface HoldemState {
  id: string; gameId: 'holdem'; handId: string; round: number; revision: number;
  phase: 'preflop' | 'flop' | 'turn' | 'river' | 'finished';
  players: HoldemPlayer[]; options: HoldemOptions; dealer: Seat; smallBlindSeat: Seat; bigBlindSeat: Seat; turn: Seat;
  board: Card[]; deck: Card[]; burned: Card[]; currentBet: number; lastFullRaise: number;
  totalChips: number; ledger: HoldemLedgerEntry[]; events: HoldemEvent[]; result: HoldemResult | null; createdAt: string;
}
export interface HoldemBetting { toCall: number; minRaiseTo: number; maxRaiseTo: number; canRaise: boolean; shortAllInOnly: boolean }
export interface HoldemPlayerView extends Omit<HoldemPlayer, 'hand' | 'actedAtBet'> { hand?: Card[]; count: number }
export interface HoldemView extends Omit<HoldemState, 'players' | 'deck' | 'burned'> {
  players: HoldemPlayerView[]; viewer: Seat | null; legalActions: HoldemLegalAction[]; betting: HoldemBetting | null; pot: number;
}

function event(state: HoldemState, entry: Omit<HoldemEvent, 'seq' | 'time'>) {
  state.events.push({ ...entry, seq: state.events.length + 1, time: new Date().toISOString() });
}
const clockwise = (seat: Seat, count: number) => (seat + 1) % count;
export function createPokerDeck(): Card[] {
  return (['S', 'H', 'C', 'D'] as const).flatMap(suit => Array.from({ length: 13 }, (_, i) => ({ id: `${suit}${i + 2}`, rank: i + 2, suit })));
}
export function compareRanks(a: HandRank, b: HandRank): number {
  if (a.category !== b.category) return a.category - b.category;
  for (let i = 0; i < Math.max(a.values.length, b.values.length); i++) if ((a.values[i] ?? 0) !== (b.values[i] ?? 0)) return (a.values[i] ?? 0) - (b.values[i] ?? 0);
  return 0;
}
function rankFive(cards: Card[]): HandRank {
  const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
  const groups = [...new Set(ranks)].map(rank => ({ rank, count: ranks.filter(r => r === rank).length })).sort((a, b) => b.count - a.count || b.rank - a.rank);
  const flush = cards.every(c => c.suit === cards[0].suit);
  const straight = groups.length === 5 ? ranks[0] - ranks[4] === 4 ? ranks[0] : ranks.join(',') === '14,5,4,3,2' ? 5 : 0 : 0;
  if (flush && straight) return { category: 8, values: [straight], label: straight === 14 ? '皇家同花顺' : '同花顺' };
  if (groups[0].count === 4) return { category: 7, values: groups.map(g => g.rank), label: '四条' };
  if (groups[0].count === 3 && groups[1].count === 2) return { category: 6, values: groups.map(g => g.rank), label: '葫芦' };
  if (flush) return { category: 5, values: ranks, label: '同花' };
  if (straight) return { category: 4, values: [straight], label: '顺子' };
  if (groups[0].count === 3) return { category: 3, values: groups.map(g => g.rank), label: '三条' };
  if (groups[0].count === 2 && groups[1].count === 2) return { category: 2, values: groups.map(g => g.rank), label: '两对' };
  if (groups[0].count === 2) return { category: 1, values: groups.map(g => g.rank), label: '一对' };
  return { category: 0, values: ranks, label: '高牌' };
}
export function evaluateHoldem(cards: Card[]): HandRank {
  if (cards.length < 5 || cards.length > 7 || new Set(cards.map(c => c.id)).size !== cards.length || cards.some(c => c.suit === 'J' || c.rank < 2 || c.rank > 14)) throw new RuleError('评估需要 5–7 张不重复的标准扑克牌');
  let best: HandRank | undefined;
  for (let a = 0; a < cards.length - 4; a++) for (let b = a + 1; b < cards.length - 3; b++) for (let c = b + 1; c < cards.length - 2; c++) for (let d = c + 1; d < cards.length - 1; d++) for (let e = d + 1; e < cards.length; e++) {
    const rank = rankFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
    if (!best || compareRanks(rank, best) > 0) best = rank;
  }
  return best!;
}
function pay(state: HoldemState, player: HoldemPlayer, amount: number) {
  const paid = Math.min(player.chips, amount);
  player.chips -= paid; player.committed += paid; player.streetBet += paid; player.allIn = player.chips === 0;
  return paid;
}
export function validateHoldemOptions(options: HoldemOptions): void {
  if (![options.initialChips, options.smallBlind, options.bigBlind].every(n => Number.isSafeInteger(n) && n > 0 && n <= 1_000_000_000)) throw new RuleError('初始筹码和盲注须为 1–1,000,000,000 的整数');
  if (options.bigBlind < options.smallBlind || options.initialChips < options.bigBlind) throw new RuleError('大盲不能小于小盲，初始筹码不能小于大盲');
}
export function createHoldem(id: string, configs: HoldemPlayerConfig[], settings: Partial<HoldemOptions> & { random?: () => number; handId?: string; round?: number; dealer?: Seat; chips?: number[]; ledger?: HoldemLedgerEntry[] } = {}): HoldemState {
  if (configs.length < 2 || configs.length > 9) throw new RuleError('德州扑克需要 2–9 名玩家');
  if (configs.some(p => !PLAYER_KINDS.includes(p.kind))) throw new RuleError('不支持的玩家类型');
  if (configs.filter(p => p.kind === 'human').length > 1) throw new RuleError('一张牌桌最多只能有 1 名真人玩家');
  if (configs.some(p => !p.name.trim() || p.name.length > 32)) throw new RuleError('玩家名称需要 1–32 个字符');
  const options = { initialChips: settings.initialChips ?? 1000, smallBlind: settings.smallBlind ?? 5, bigBlind: settings.bigBlind ?? 10 };
  validateHoldemOptions(options);
  const round = settings.round ?? 1, dealer = settings.dealer ?? 0;
  if (!Number.isInteger(dealer) || dealer < 0 || dealer >= configs.length) throw new RuleError('庄家座位不存在');
  if (settings.chips && (settings.chips.length !== configs.length || settings.chips.some(n => !Number.isSafeInteger(n) || n <= 0))) throw new RuleError('筹码必须为正整数；筹码归零的玩家请先离桌');
  const players: HoldemPlayer[] = configs.map((p, seat) => ({ ...p, name: p.name.trim(), playerId: p.playerId ?? `${id}:player:${round}:${seat}`, seat, hand: [], chips: settings.chips?.[seat] ?? options.initialChips, startingChips: settings.chips?.[seat] ?? options.initialChips, committed: 0, streetBet: 0, folded: false, allIn: false, actedAtBet: null }));
  if (new Set(players.map(p => p.playerId)).size !== players.length) throw new RuleError('玩家身份不能重复');
  const smallBlindSeat = players.length === 2 ? dealer : clockwise(dealer, players.length), bigBlindSeat = clockwise(smallBlindSeat, players.length);
  const state: HoldemState = {
    id, gameId: 'holdem', handId: settings.handId ?? `${id}:hand:${round}`, round, revision: 1, phase: 'preflop', players, options, dealer, smallBlindSeat, bigBlindSeat, turn: clockwise(bigBlindSeat, players.length),
    board: [], deck: shuffle(createPokerDeck(), settings.random ?? Math.random), burned: [], currentBet: options.bigBlind, lastFullRaise: options.bigBlind,
    totalChips: players.reduce((s, p) => s + p.chips, 0), ledger: settings.ledger ? structuredClone(settings.ledger) : players.map(p => ({ round, playerId: p.playerId, name: p.name, type: 'buy-in', amount: p.chips })), events: [], result: null, createdAt: new Date().toISOString(),
  };
  for (let card = 0; card < 2; card++) for (let step = 1; step <= players.length; step++) players[(dealer + step) % players.length].hand.push(state.deck.shift()!);
  event(state, { type: 'deal', text: `第 ${round} 手开始，每人两张底牌，盲注 ${options.smallBlind}/${options.bigBlind}` });
  for (const [seat, blind, label] of [[smallBlindSeat, options.smallBlind, '小盲'], [bigBlindSeat, options.bigBlind, '大盲']] as const) {
    const amount = pay(state, players[seat], blind); event(state, { type: 'blind', seat, text: `${label} ${amount}${players[seat].allIn ? ' · 全下' : ''}` });
  }
  advance(state, bigBlindSeat);
  assertHoldemChips(state);
  return state;
}
export function holdemBetting(state: HoldemState, seat: Seat): HoldemBetting | null {
  const p = state.players[seat];
  if (!p || state.phase === 'finished' || state.turn !== seat || p.folded || p.allIn) return null;
  const maxRaiseTo = p.streetBet + p.chips, minRaiseTo = state.currentBet + state.lastFullRaise;
  const reopened = p.actedAtBet === null || state.currentBet - p.actedAtBet >= state.lastFullRaise;
  const canRaise = reopened && maxRaiseTo > state.currentBet && state.players.some(other => other.seat !== seat && !other.folded && !other.allIn);
  const effectiveBet = state.players.filter(other => !other.folded && !other.allIn).length === 1 ? Math.max(0, ...state.players.filter(other => !other.folded && other.seat !== seat).map(other => other.streetBet)) : state.currentBet;
  return { toCall: Math.min(p.chips, Math.max(0, effectiveBet - p.streetBet)), minRaiseTo, maxRaiseTo, canRaise, shortAllInOnly: maxRaiseTo < minRaiseTo };
}
export function getHoldemLegalActions(state: HoldemState, seat: Seat): HoldemLegalAction[] {
  const bet = holdemBetting(state, seat); if (!bet) return [];
  const actions: HoldemLegalAction[] = [{ id: 'fold', action: { type: 'fold' }, label: '弃牌', cards: [] }];
  actions.push(bet.toCall ? { id: 'call', action: { type: 'call' }, label: `跟注 ${bet.toCall}${bet.toCall === state.players[seat].chips ? ' · 全下' : ''}`, cards: [] } : { id: 'check', action: { type: 'check' }, label: '过牌', cards: [] });
  if (bet.canRaise) {
    const pot = state.players.reduce((s, p) => s + p.committed, 0);
    const amounts = [...new Set([Math.min(bet.minRaiseTo, bet.maxRaiseTo), Math.max(bet.minRaiseTo, state.currentBet + Math.floor((pot + bet.toCall) / 2)), Math.max(bet.minRaiseTo, state.currentBet + pot + bet.toCall), bet.maxRaiseTo])].filter(n => n <= bet.maxRaiseTo);
    for (const amount of amounts) actions.push({ id: `raise-${amount}`, action: { type: 'raise', amount }, label: `${amount === bet.maxRaiseTo ? '全下至' : state.currentBet ? '加注至' : '下注至'} ${amount}`, cards: [] });
  }
  return actions;
}
function live(state: HoldemState) { return state.players.filter(p => !p.folded); }
function needsAction(state: HoldemState, player: HoldemPlayer) {
  if (player.folded || player.allIn) return false;
  const actionable = live(state).filter(p => !p.allIn);
  if (actionable.length === 1) return player.streetBet < Math.max(0, ...live(state).filter(p => p.seat !== player.seat).map(p => p.streetBet));
  return player.actedAtBet === null || player.streetBet < state.currentBet;
}
function dealStreet(state: HoldemState) {
  state.burned.push(state.deck.shift()!);
  const count = state.phase === 'preflop' ? 3 : 1;
  const cards = state.deck.splice(0, count); state.board.push(...cards);
  state.phase = state.phase === 'preflop' ? 'flop' : state.phase === 'flop' ? 'turn' : 'river';
  state.currentBet = 0; state.lastFullRaise = state.options.bigBlind;
  state.players.forEach(p => { p.streetBet = 0; p.actedAtBet = null; });
  event(state, { type: 'street', text: { flop: '翻牌', turn: '转牌', river: '河牌' }[state.phase], cards });
}
function advance(state: HoldemState, after: Seat) {
  while (state.phase !== 'finished') {
    if (live(state).length === 1) { settle(state); return; }
    for (let step = 1; step <= state.players.length; step++) {
      const seat = (after + step) % state.players.length;
      if (needsAction(state, state.players[seat])) { state.turn = seat; return; }
    }
    if (state.phase === 'river') { settle(state); return; }
    dealStreet(state); after = state.dealer;
  }
}
export function applyHoldemAction(current: HoldemState, seat: Seat, action: HoldemAction): HoldemState {
  const bet = holdemBetting(current, seat);
  if (!bet) throw new RuleError('当前不是此座位的行动回合');
  const state = structuredClone(current), p = state.players[seat];
  if (action.type === 'fold') { p.folded = true; event(state, { type: 'fold', seat, text: '弃牌' }); }
  else if (action.type === 'check') { if (bet.toCall) throw new RuleError('需要跟注，不能过牌'); event(state, { type: 'check', seat, text: '过牌' }); }
  else if (action.type === 'call') { if (!bet.toCall) throw new RuleError('无需跟注，请过牌'); const amount = pay(state, p, bet.toCall); event(state, { type: 'call', seat, text: `跟注 ${amount}${p.allIn ? ' · 全下' : ''}` }); }
  else if (action.type === 'raise') {
    if (!bet.canRaise) throw new RuleError('加注权未重开，或没有可继续下注的对手');
    if (!Number.isSafeInteger(action.amount) || action.amount <= state.currentBet || action.amount > bet.maxRaiseTo || (action.amount < bet.minRaiseTo && action.amount !== bet.maxRaiseTo)) throw new RuleError(`加注须到至少 ${bet.minRaiseTo}，或全下到 ${bet.maxRaiseTo}`);
    const increase = action.amount - state.currentBet;
    if (action.amount >= bet.minRaiseTo) state.lastFullRaise = increase;
    pay(state, p, action.amount - p.streetBet); state.currentBet = action.amount;
    event(state, { type: 'raise', seat, text: `${p.allIn ? '全下至' : '下注至'} ${action.amount}` });
  } else throw new RuleError('不支持此德州扑克行动');
  p.actedAtBet = state.currentBet; state.revision++;
  advance(state, seat); assertHoldemChips(state); return state;
}
function settle(state: HoldemState) {
  const sorted = [...state.players].sort((a, b) => b.committed - a.committed);
  const excess = sorted[0].committed - sorted[1].committed;
  if (excess > 0) { const p = sorted[0]; p.chips += excess; p.committed -= excess; p.streetBet = Math.max(0, p.streetBet - excess); event(state, { type: 'return', seat: p.seat, text: `退回未被跟注的 ${excess}` }); }
  const showdown = live(state).length > 1;
  const ranks: Record<number, HandRank> = {};
  if (showdown) for (const p of live(state)) ranks[p.seat] = evaluateHoldem([...p.hand, ...state.board]);
  const pots: HoldemPot[] = []; let previous = 0;
  for (const level of [...new Set(state.players.map(p => p.committed).filter(n => n > 0))].sort((a, b) => a - b)) {
    const contributors = state.players.filter(p => p.committed >= level), amount = (level - previous) * contributors.length; previous = level;
    const eligible = contributors.filter(p => !p.folded).map(p => p.seat);
    if (!eligible.length) throw new RuleError('底池没有符合条件的玩家');
    let winners = showdown ? eligible.filter(seat => eligible.every(other => compareRanks(ranks[seat], ranks[other]) >= 0)) : eligible;
    winners = winners.sort((a, b) => ((a - state.dealer - 1 + state.players.length) % state.players.length) - ((b - state.dealer - 1 + state.players.length) % state.players.length));
    const share = Math.floor(amount / winners.length), remainder = amount % winners.length;
    const awards = winners.map((seat, i) => ({ seat, amount: share + (i < remainder ? 1 : 0) }));
    for (const award of awards) state.players[award.seat].chips += award.amount;
    pots.push({ amount, eligible, winners, awards });
  }
  state.players.forEach(p => { p.committed = 0; p.streetBet = 0; });
  const winners = [...new Set(pots.flatMap(p => p.winners))];
  state.phase = 'finished'; state.result = { deltas: state.players.map(p => p.chips - p.startingChips), pots, winners, ranks, showdown };
  event(state, { type: 'finish', text: `${showdown ? '摊牌' : '其他玩家弃牌'}，${winners.map(s => state.players[s].name).join('、')}赢得底池，共 ${pots.reduce((s, p) => s + p.amount, 0)} 筹码` });
}
export function assertHoldemChips(state: HoldemState): void {
  if (!Number.isSafeInteger(state.totalChips) || state.totalChips <= 0 || state.players.some(p => !Number.isSafeInteger(p.chips) || p.chips < 0 || !Number.isSafeInteger(p.committed) || p.committed < 0) || state.players.reduce((s, p) => s + p.chips + p.committed, 0) !== state.totalChips) throw new RuleError('筹码守恒检查失败');
  if (state.ledger.reduce((sum, e) => sum + (e.type === 'buy-in' ? e.amount : -e.amount), 0) !== state.totalChips) throw new RuleError('牌桌买入与离桌账本不平衡');
}
export function viewHoldem(state: HoldemState, viewer: Seat | null): HoldemView {
  const { deck: _deck, burned: _burned, players, ...publicState } = structuredClone(state);
  return { ...publicState, viewer, players: players.map(({ hand, actedAtBet: _acted, ...p }) => ({ ...p, count: hand.length, ...(p.seat === viewer || (state.result?.showdown && !p.folded) ? { hand } : {}) })), legalActions: viewer === null ? [] : getHoldemLegalActions(state, viewer), betting: viewer === null ? null : holdemBetting(state, viewer), pot: players.reduce((s, p) => s + p.committed, 0) };
}
export function nextHoldemHand(previous: HoldemState, configs: HoldemPlayerConfig[], settings: { random?: () => number; handId?: string } = {}): HoldemState {
  if (previous.phase !== 'finished') throw new RuleError('一手牌进行中不能变更阵容');
  const round = previous.round + 1, oldPlayers = new Map(previous.players.map(p => [p.playerId, p]));
  const roster = configs.map((p, i) => ({ ...p, playerId: p.playerId ?? `${previous.id}:player:${round}:${i}` }));
  if (roster.some(p => p.playerId && !oldPlayers.has(p.playerId) && previous.ledger.some(e => e.playerId === p.playerId))) throw new RuleError('已离桌的身份不能重复买入，请新增玩家');
  const ledger = structuredClone(previous.ledger), ids = new Set(roster.map(p => p.playerId));
  for (const p of previous.players) if (!ids.has(p.playerId)) ledger.push({ round, playerId: p.playerId, name: p.name, type: 'cash-out', amount: p.chips });
  for (const p of roster) if (!oldPlayers.has(p.playerId)) ledger.push({ round, playerId: p.playerId, name: p.name, type: 'buy-in', amount: previous.options.initialChips });
  const chips = roster.map(p => oldPlayers.get(p.playerId)?.chips ?? previous.options.initialChips);
  let dealer = 0;
  const oldBigBlindIndex = roster.findIndex(p => p.playerId === previous.players[previous.bigBlindSeat].playerId);
  let bigBlind = oldBigBlindIndex >= 0 ? (oldBigBlindIndex + 1) % roster.length : -1;
  if (bigBlind < 0) for (let step = 1; step <= previous.players.length; step++) {
    const id = previous.players[(previous.bigBlindSeat + step) % previous.players.length].playerId;
    const index = roster.findIndex(p => p.playerId === id); if (index >= 0) { bigBlind = index; break; }
  }
  if (bigBlind >= 0) dealer = (bigBlind - (roster.length === 2 ? 1 : 2) + roster.length) % roster.length;
  return createHoldem(previous.id, roster, { ...previous.options, ...settings, round, dealer, chips, ledger });
}
