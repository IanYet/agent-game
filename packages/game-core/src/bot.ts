import { getLegalActions } from './doudizhu';
import type { DoudizhuState, LegalAction, Seat } from './types';

// A deterministic local practice opponent. This is explicitly labelled in the UI.
export function chooseBotAction(state: DoudizhuState, seat: Seat): LegalAction {
  const legal = getLegalActions(state, seat);
  if (!legal.length) throw new Error('没有可执行的动作');
  if (state.phase === 'bidding') {
    const hand = state.players[seat].hand;
    const strength = hand.reduce((sum, c) => sum + (c.rank >= 15 ? 2 : c.rank === 14 ? 1 : 0), 0);
    const desired = strength >= 8 ? 3 : strength >= 6 ? 2 : strength >= 4 ? 1 : 0;
    return legal.find(a => a.action.type === 'bid' && a.action.value === desired) ?? legal[0];
  }
  const win = legal.find(a => a.cards.length === state.players[seat].hand.length);
  if (win) return win;
  const pass = legal.find(a => a.action.type === 'pass');
  if (pass && state.lastPlay && state.landlord !== seat && state.lastPlay.seat !== state.landlord) return pass;
  return legal.find(a => a.action.type === 'play' && a.combination?.kind !== 'bomb' && a.combination?.kind !== 'rocket') ?? pass ?? legal[0];
}
