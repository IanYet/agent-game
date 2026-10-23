import type { Card, Suit } from './types';

export const RANK_LABELS: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: '小王', 17: '大王' };
export const SUIT_LABELS = { S: '♠', H: '♥', C: '♣', D: '♦', J: '★' };
export function rankLabel(rank: number): string { return RANK_LABELS[rank] ?? String(rank); }
export function cardLabel(card: Card): string { return card.suit === 'J' ? rankLabel(card.rank) : `${SUIT_LABELS[card.suit]}${rankLabel(card.rank)}`; }
export function createDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of ['S', 'H', 'C', 'D'] as Suit[]) {
    for (let rank = 3; rank <= 15; rank++) cards.push({ id: `${suit}${rank}`, rank, suit });
  }
  return [...cards, { id: 'J16', rank: 16, suit: 'J' }, { id: 'J17', rank: 17, suit: 'J' }];
}
export function sortCards(cards: Card[]): Card[] { return [...cards].sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id)); }
export function shuffle(cards: Card[], random: () => number): Card[] {
  const deck = [...cards];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
export function groupCards(cards: Card[]): Map<number, Card[]> {
  const groups = new Map<number, Card[]>();
  for (const card of [...cards].sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id))) {
    groups.set(card.rank, [...(groups.get(card.rank) ?? []), card]);
  }
  return groups;
}
