import { applyAction, getLegalActions, viewGame } from './doudizhu';
import { applyHoldemAction, getHoldemLegalActions, HOLDEM_RULES, viewHoldem, type HoldemAction, type HoldemState, type HoldemView } from './holdem';
import { DOUDIZHU_RULES } from './rules';
import type { DoudizhuState, GameAction, GameView, Seat } from './types';

export type ArcadeState = DoudizhuState | HoldemState;
export type ArcadeView = GameView | HoldemView;
export type ArcadeAction = GameAction | HoldemAction;
export type GameId = ArcadeState['gameId'];
export const gameName = (id: GameId) => id === 'holdem' ? '德州扑克' : '斗地主';
export const rulesForGame = (id: GameId) => id === 'holdem' ? HOLDEM_RULES : DOUDIZHU_RULES;
export const viewArcade = (state: ArcadeState, viewer: Seat | null): ArcadeView => state.gameId === 'holdem' ? viewHoldem(state, viewer) : viewGame(state, viewer);
export const legalArcadeActions = (state: ArcadeState, seat: Seat) => state.gameId === 'holdem' ? getHoldemLegalActions(state, seat) : getLegalActions(state, seat);
export function applyArcadeAction(state: ArcadeState, seat: Seat, action: ArcadeAction): ArcadeState {
  return state.gameId === 'holdem' ? applyHoldemAction(state, seat, action as HoldemAction) : applyAction(state, seat, action as GameAction);
}
