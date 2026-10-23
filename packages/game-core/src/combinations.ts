import { groupCards } from './cards';
import type { Card, Combination, CombinationKind } from './types';

const labels: Record<CombinationKind, string> = {
  single: '单张', pair: '对子', triple: '三张', triple_single: '三带一', triple_pair: '三带二',
  straight: '顺子', pair_straight: '连对', airplane: '飞机', airplane_single: '飞机带单',
  airplane_pair: '飞机带对', four_two_single: '四带二', four_two_pair: '四带两对', bomb: '炸弹', rocket: '王炸',
};
const consecutive = (ranks: number[]) => ranks.length > 0 && ranks.at(-1)! < 15 && ranks.every((r, i) => i === 0 || r === ranks[i - 1] + 1);
const combo = (kind: CombinationKind, rank: number, size: number, chain = 1): Combination => ({ kind, rank, size, chain, label: labels[kind] });

export function classify(cards: Card[]): Combination | null {
  if (!cards.length || new Set(cards.map(c => c.id)).size !== cards.length) return null;
  const groups = groupCards(cards);
  const ranks = [...groups.keys()];
  const n = cards.length;
  const counts = [...groups.values()].map(g => g.length);
  if (n === 2 && ranks.length === 2 && ranks[0] === 16 && ranks[1] === 17) return combo('rocket', 17, n);
  if (ranks.length === 1) {
    const kind = ({ 1: 'single', 2: 'pair', 3: 'triple', 4: 'bomb' } as const)[n as 1 | 2 | 3 | 4];
    return kind ? combo(kind, ranks[0], n) : null;
  }
  if (n === 4 && counts.includes(3)) return combo('triple_single', ranks[counts.indexOf(3)], n);
  if (n === 5 && counts.includes(3) && counts.includes(2)) return combo('triple_pair', ranks[counts.indexOf(3)], n);
  if (n >= 5 && counts.every(c => c === 1) && consecutive(ranks)) return combo('straight', ranks.at(-1)!, n, ranks.length);
  if (n >= 6 && counts.every(c => c === 2) && consecutive(ranks)) return combo('pair_straight', ranks.at(-1)!, n, ranks.length);
  if (n >= 6 && counts.every(c => c === 3) && consecutive(ranks)) return combo('airplane', ranks.at(-1)!, n, ranks.length);
  if (n === 6 && counts.includes(4)) return combo('four_two_single', ranks[counts.indexOf(4)], n);
  if (n === 8 && counts.filter(c => c === 4).length === 1 && counts.filter(c => c === 2).length === 2) return combo('four_two_pair', ranks[counts.indexOf(4)], n);
  for (const [wingSize, kind] of [[1, 'airplane_single'], [2, 'airplane_pair']] as const) {
    const bodyLength = n / (3 + wingSize);
    if (!Number.isInteger(bodyLength) || bodyLength < 2) continue;
    const triples = ranks.filter(r => groups.get(r)!.length === 3 && r < 15);
    for (let i = 0; i <= triples.length - bodyLength; i++) {
      const body = triples.slice(i, i + bodyLength);
      if (!consecutive(body)) continue;
      const wings = ranks.filter(r => !body.includes(r)).map(r => groups.get(r)!.length);
      if ((wingSize === 1 && wings.every(c => c <= 2)) || (wingSize === 2 && wings.length === bodyLength && wings.every(c => c === 2))) {
        return combo(kind, body.at(-1)!, n, bodyLength);
      }
    }
  }
  return null;
}

export function beats(candidate: Combination, previous: Combination | null): boolean {
  if (!previous) return true;
  if (previous.kind === 'rocket') return false;
  if (candidate.kind === 'rocket') return true;
  if (candidate.kind === 'bomb' && previous.kind !== 'bomb') return true;
  return candidate.kind === previous.kind && candidate.size === previous.size && candidate.chain === previous.chain && candidate.rank > previous.rank;
}

function chooseGroups(groups: Card[][], count: number, width: number): Card[][] {
  if (count === 0) return [[]];
  const choices: Card[][] = [];
  function visit(index: number, needed: number, taken: Card[]): void {
    if (needed === 0) { choices.push(taken); return; }
    if (index >= groups.length) return;
    const group = groups[index];
    const limit = width === 2 ? (group.length >= 2 ? 1 : 0) : Math.min(2, group.length, needed);
    for (let take = 0; take <= limit; take++) visit(index + 1, needed - take, [...taken, ...group.slice(0, take * width)]);
  }
  visit(0, count, []);
  return choices;
}

// Rank-equivalent suit choices are deduplicated. The UI may still play any equivalent cards.
export function enumeratePlays(hand: Card[], previous: Combination | null = null): Array<{ cards: Card[]; combination: Combination }> {
  const groups = groupCards(hand);
  const entries = [...groups.entries()];
  const found = new Map<string, { cards: Card[]; combination: Combination }>();
  function add(cards: Card[]): void {
    const combination = classify(cards);
    if (!combination || !beats(combination, previous)) return;
    const key = cards.map(c => c.id).sort().join(',');
    found.set(key, { cards, combination });
  }
  for (const [rank, group] of entries) {
    for (let n = 1; n <= Math.min(4, group.length); n++) add(group.slice(0, n));
    if (group.length >= 3) {
      for (const [other, wing] of entries) {
        if (other === rank) continue;
        add([...group.slice(0, 3), ...wing.slice(0, 1)]);
        if (wing.length >= 2) add([...group.slice(0, 3), ...wing.slice(0, 2)]);
      }
    }
    if (group.length === 4) {
      const wings = entries.filter(([r]) => r !== rank).map(([, g]) => g);
      for (const chosen of chooseGroups(wings, 2, 1)) add([...group, ...chosen]);
      for (const chosen of chooseGroups(wings, 2, 2)) add([...group, ...chosen]);
    }
  }
  if (groups.has(16) && groups.has(17)) add([...groups.get(16)!, ...groups.get(17)!]);
  for (const [width, minimum] of [[1, 5], [2, 3], [3, 2]]) {
    const eligible = entries.filter(([r, g]) => r < 15 && g.length >= width).map(([r]) => r);
    for (let start = 0; start < eligible.length; start++) {
      for (let end = start + minimum; end <= eligible.length; end++) {
        const bodyRanks = eligible.slice(start, end);
        if (!consecutive(bodyRanks)) break;
        const body = bodyRanks.flatMap(r => groups.get(r)!.slice(0, width));
        add(body);
        if (width === 3) {
          const wings = entries.filter(([r]) => !bodyRanks.includes(r)).map(([, g]) => g);
          if (body.length + bodyRanks.length <= hand.length) for (const chosen of chooseGroups(wings, bodyRanks.length, 1)) add([...body, ...chosen]);
          if (body.length + 2 * bodyRanks.length <= hand.length) for (const chosen of chooseGroups(wings, bodyRanks.length, 2)) add([...body, ...chosen]);
        }
      }
    }
  }
  return [...found.values()].sort((a, b) => {
    const power = (c: Combination) => c.kind === 'rocket' ? 2 : c.kind === 'bomb' ? 1 : 0;
    return power(a.combination) - power(b.combination) || b.cards.length - a.cards.length || a.combination.rank - b.combination.rank;
  });
}
