import { cardLabel, createDeck, shuffle, sortCards } from '@agent-game/core';
import { beats, classify, enumeratePlays } from './combinations';
import { type DoudizhuState, type GameAction, type GameEvent, type GameView, type LegalAction, } from './types';

import {RuleError,type PlayerConfig,type Seat} from '@agent-game/core';
export const nextSeat = (seat: Seat): Seat => ((seat + 1) % 3) as Seat;

function event(state: DoudizhuState, entry: Omit<GameEvent, 'seq' | 'time'>): void {
  state.events.push({ ...entry, seq: state.events.length + 1, time: new Date().toISOString() });
}

export function createGame(id: string, configs: PlayerConfig[], options: { random?: () => number; round?: number; scores?: number[]; firstBidder?: Seat } = {}): DoudizhuState {
  if (configs.length !== 3) throw new RuleError('斗地主需要恰好 3 名玩家');
  if (configs.some(p => !['human','agent'].includes(p.kind))) throw new RuleError('牌桌包含无效的控制方式');
  if (configs.filter(p => p.kind === 'human').length > 1) throw new RuleError('一张牌桌最多只能有 1 名真人玩家');
  if (configs.some(p => !p.name.trim() || p.name.length > 32)) throw new RuleError('玩家名称需要 1–32 个字符');
  const deck = shuffle(createDeck(), options.random ?? Math.random);
  const firstBidder = options.firstBidder ?? 0;
  const state: DoudizhuState = {
    id, gameId: 'doudizhu', round: options.round ?? 1, revision: 1, phase: 'bidding',
    players: configs.map((config, index) => ({ ...config, name: config.name.trim(), seat: index as Seat, hand: sortCards(deck.slice(index * 17, index * 17 + 17)), score: options.scores?.[index] ?? 0, plays: 0 })),
    bottom: deck.slice(51), turn: firstBidder, firstBidder, bids: [null, null, null], highBid: 0, highBidder: null,
    landlord: null, lastPlay: null, lastActions: [null, null, null], passes: 0, multiplier: 1, events: [], result: null, createdAt: new Date().toISOString(),
  };
  event(state, { type: 'deal', text: `第 ${state.round} 局开始，每人 17 张牌，等待叫分` });
  return state;
}

export function getLegalActions(state: DoudizhuState, seat: Seat): LegalAction[] {
  if (state.phase === 'finished' || state.turn !== seat) return [];
  if (state.phase === 'bidding') {
    return [0, 1, 2, 3].filter(value => value === 0 || value > state.highBid).map(value => ({ id: `bid-${value}`, action: { type: 'bid', value }, label: value ? `叫 ${value} 分` : '不叫', cards: [] }));
  }
  const actions: LegalAction[] = enumeratePlays(state.players[seat].hand, state.lastPlay?.combination ?? null).map(({ cards, combination }) => ({
    id: `play-${cards.map(c => c.id).sort().join('-')}`, action: { type: 'play', cards: cards.map(c => c.id) }, label: `${combination.label} · ${cards.map(cardLabel).join(' ')}`, cards: sortCards(cards), combination,
  }));
  if (state.lastPlay && state.lastPlay.seat !== seat) actions.push({ id: 'pass', action: { type: 'pass' }, label: '不出', cards: [] });
  return actions;
}

export function applyAction(current: DoudizhuState, seat: Seat, action: GameAction): DoudizhuState {
  if (!Number.isInteger(seat) || seat < 0 || seat > 2) throw new RuleError('座位不存在');
  if (current.phase === 'finished') throw new RuleError('本局已经结束');
  if (current.turn !== seat) throw new RuleError('还没有轮到你');
  if (!action || typeof action !== 'object' || Array.isArray(action)) throw new RuleError('行动须包含 type 和对应的叫分或手牌参数');
  const state = structuredClone(current);
  const player = state.players[seat];
  if (state.phase === 'bidding') {
    if (action.type !== 'bid') throw new RuleError('现在是叫分阶段');
    if (!Number.isInteger(action.value) || action.value < 0 || action.value > 3 || (action.value > 0 && action.value <= state.highBid)) throw new RuleError('叫分必须高于当前分数，或选择不叫');
    state.bids[seat] = action.value;
    if (action.value > 0) { state.highBid = action.value; state.highBidder = seat; }
    event(state, { type: 'bid', seat, text: action.value ? `叫 ${action.value} 分` : '不叫' });
    if (action.value === 3 || state.bids.every(bid => bid !== null)) {
      if (state.highBidder === null) {
        const redealt = createGame(state.id, state.players, { round: state.round, scores: state.players.map(p => p.score), firstBidder: nextSeat(state.firstBidder) });
        redealt.revision = state.revision + 1;
        redealt.events = [...state.events];
        event(redealt, { type: 'deal', text: '三家不叫，重新洗牌发牌' });
        return redealt;
      }
      state.landlord = state.highBidder;
      state.players[state.landlord].hand = sortCards([...state.players[state.landlord].hand, ...state.bottom]);
      state.phase = 'playing'; state.turn = state.landlord;
      event(state, { type: 'landlord', seat: state.landlord, text: `成为地主，底分 ${state.highBid}`, cards: state.bottom });
    } else state.turn = nextSeat(seat);
  } else if (action.type === 'pass') {
    if (!state.lastPlay || state.lastPlay.seat === seat) throw new RuleError('你先出牌，不能不出');
    state.passes++;
    state.lastActions[seat] = { type: 'pass', cards: [] };
    event(state, { type: 'pass', seat, text: '不出' });
    state.turn = nextSeat(seat);
    if (state.passes === 2) {
      state.turn = state.lastPlay.seat; state.lastPlay = null; state.passes = 0; state.lastActions = [null, null, null];
    }
  } else if (action.type === 'play') {
    if (!Array.isArray(action.cards) || !action.cards.length || new Set(action.cards).size !== action.cards.length) throw new RuleError('请选择不重复的手牌');
    const cards = action.cards.map(id => player.hand.find(c => c.id === id));
    if (cards.some(card => !card)) throw new RuleError('不能出不属于自己的牌');
    const played = sortCards(cards.filter(card => !!card));
    const combination = classify(played);
    if (!combination) throw new RuleError('这个牌型不符合规则');
    if (!beats(combination, state.lastPlay?.combination ?? null)) throw new RuleError('需要用相同牌型、更大的牌压过上家');
    player.hand = player.hand.filter(card => !action.cards.includes(card.id));
    player.plays++;
    state.lastPlay = { seat, cards: played, combination }; state.passes = 0;
    state.lastActions[seat] = { type: 'play', cards: played };
    if (combination.kind === 'bomb' || combination.kind === 'rocket') state.multiplier *= 2;
    event(state, { type: 'play', seat, text: combination.label, cards: played, combination });
    state.turn = nextSeat(seat);
    if (!player.hand.length) {
      const landlordWon = seat === state.landlord;
      const spring = landlordWon ? state.players.filter(p => p.seat !== state.landlord).every(p => p.plays === 0) : state.players[state.landlord!].plays <= 1;
      if (spring) state.multiplier *= 2;
      const stake = state.highBid * state.multiplier;
      const deltas = state.players.map(p => (p.seat === state.landlord ? 2 : -1) * (landlordWon ? 1 : -1) * stake);
      state.players.forEach((p, i) => p.score += deltas[i]);
      state.phase = 'finished';
      state.result = { winner: landlordWon ? 'landlord' : 'farmers', winnerSeat: seat, deltas, spring, multiplier: state.multiplier };
      event(state, { type: 'finish', seat, text: `${landlordWon ? '地主' : '农民'}获胜${spring ? ' · 春天' : ''}，${state.multiplier} 倍结算` });
    }
  } else throw new RuleError('出牌阶段不能叫分');
  state.revision++;
  return state;
}

export function viewGame(state: DoudizhuState, viewer: Seat | null, revealHands = false, includeActions = true): GameView {
  const { highBidder: _highBidder, ...publicState } = state;
  return {
    ...publicState,
    players: state.players.map(({ hand, plays: _plays, ...player }) => ({ ...player, count: hand.length, role: state.landlord === null ? null : state.landlord === player.seat ? 'landlord' : 'farmer', ...(viewer === player.seat || revealHands ? { hand: [...hand] } : {}) })),
    bottom: state.phase === 'bidding' ? [] : [...state.bottom],
    viewer,
    legalActions: viewer === null || !includeActions ? [] : getLegalActions(state, viewer),
  };
}
