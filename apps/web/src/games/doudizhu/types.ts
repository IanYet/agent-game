import type {Card,PlayerConfig,Seat} from '@agent-game/core';
export type CombinationKind = 'single' | 'pair' | 'triple' | 'triple_single' | 'triple_pair' | 'straight' | 'pair_straight' | 'airplane' | 'airplane_single' | 'airplane_pair' | 'four_two_single' | 'four_two_pair' | 'bomb' | 'rocket';
export interface Combination { kind: CombinationKind; rank: number; size: number; chain: number; label: string }

export interface Player extends PlayerConfig { seat: Seat; hand: Card[]; score: number; plays: number }
export type GameAction = { type: 'bid'; value: number } | { type: 'play'; cards: string[] } | { type: 'pass' };
export interface LegalAction { id: string; action: GameAction; label: string; cards: Card[]; combination?: Combination }
export interface GameEvent { seq: number; time: string; type: 'deal' | 'bid' | 'landlord' | 'play' | 'pass' | 'finish'; seat?: Seat; text: string; cards?: Card[]; combination?: Combination }
export interface PlayedHand { seat: Seat; cards: Card[]; combination: Combination }
export interface GameResult { winner: 'landlord' | 'farmers'; winnerSeat: Seat; deltas: number[]; spring: boolean; multiplier: number }
export interface DoudizhuState {
  id: string;
  gameId: 'doudizhu';
  round: number;
  revision: number;
  phase: 'bidding' | 'playing' | 'finished';
  players: Player[];
  bottom: Card[];
  turn: Seat;
  firstBidder: Seat;
  bids: Array<number | null>;
  highBid: number;
  highBidder: Seat | null;
  landlord: Seat | null;
  lastPlay: PlayedHand | null;
  lastActions: Array<{ type: 'play' | 'pass'; cards: Card[] } | null>;
  passes: number;
  multiplier: number;
  events: GameEvent[];
  result: GameResult | null;
  createdAt: string;
}
export interface PlayerView extends PlayerConfig { seat: Seat; count: number; score: number; role: 'landlord' | 'farmer' | null; hand?: Card[] }
export interface GameView extends Omit<DoudizhuState, 'players' | 'bottom' | 'highBidder'> {
  players: PlayerView[];
  bottom: Card[];
  viewer: Seat | null;
  legalActions: LegalAction[];
}
