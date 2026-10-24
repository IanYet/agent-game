import type {Card} from '@agent-game/core';
import {isWild,label,POINTS,strength} from './cards';
import type {Combination,CombinationKind} from './types';

interface Template {combination:Combination;counts:Map<number,number>;suit?:Card['suit']}
const names:Record<CombinationKind,string>={single:'单张',pair:'对子',triple:'三张',full_house:'三带对',straight:'顺子',pair_run:'三连对',triple_run:'钢板',bomb:'炸弹',straight_flush:'同花顺',four_jokers:'四王炸'};
function combination(kind:CombinationKind,rank:number,size:number,suit?:Card['suit'],pairRank?:number):Combination {
  const detail=kind==='four_jokers'?'':kind==='bomb'?`${size} 张 · ${label(rank)}`:kind==='straight'||kind==='straight_flush'||kind==='pair_run'||kind==='triple_run'?`${label(rank)} 高`:kind==='full_house'?`${label(rank)} 带 ${label(pairRank!)}`:label(rank);
  return {kind,rank,size,...(suit?{suit}:{}),...(pairRank?{pairRank}:{}),key:`${kind}:${rank}:${size}${suit?`:${suit}`:''}${pairRank?`:${pairRank}`:''}`,label:`${names[kind]}${detail?` · ${detail}`:''}`};
}
// A can be low only at the beginning of a sequence. K-A-2 never forms a window.
export function windows(length:number):number[][] {
  return [[14,...Array.from({length:length-1},(_,i)=>i+2)],...Array.from({length:14-length},(_,i)=>Array.from({length},(_,j)=>i+j+2))];
}
function templates(size?:number):Template[] {
  const result:Template[]=[];
  const add=(kind:CombinationKind,rank:number,counts:Array<[number,number]>,suit?:Card['suit'])=>{
    const total=counts.reduce((sum,[,n])=>sum+n,0);if(size!==undefined&&total!==size)return;
    result.push({combination:combination(kind,rank,total,suit,kind==='full_house'?counts[1][0]:undefined),counts:new Map(counts),suit});
  };
  for(const rank of [...POINTS,16,17])for(const n of [1,2,3,4,5,6,7,8,9,10]){
    if(rank>14&&n>2)continue;
    add(n===1?'single':n===2?'pair':n===3?'triple':'bomb',rank,[[rank,n]]);
  }
  if(size===undefined||size===5)for(const triple of POINTS)for(const pair of [...POINTS,16,17])if(triple!==pair)add('full_house',triple,[[triple,3],[pair,2]]);
  for(const [kind,length,count] of [['straight',5,1],['pair_run',3,2],['triple_run',2,3]] as const){
    if(size!==undefined&&length*count!==size)continue;
    for(const points of windows(length)){
      const rank=points.at(-1)!,counts=points.map(r=>[r,count] as [number,number]);add(kind,rank,counts);
      if(kind==='straight')for(const suit of ['S','H','C','D'] as const)add('straight_flush',rank,counts,suit);
    }
  }
  add('four_jokers',17,[[16,2],[17,2]]);
  return result;
}
const allTemplates=templates();

function fits(cards:Card[],template:Template,level:number):boolean {
  const {combination:c,counts,suit}=template;
  if(cards.length!==c.size)return false;
  // A single wild, and the two wilds by themselves, retain their level value.
  if(cards.length<=2&&cards.every(card=>isWild(card,level)))return (c.kind==='single'||c.kind==='pair')&&c.rank===level;
  const remaining=new Map(counts);
  for(const card of cards){
    if(isWild(card,level))continue;
    if(suit&&card.suit!==suit)return false;
    const need=remaining.get(card.rank)??0;if(need===0)return false;remaining.set(card.rank,need-1);
  }
  // Wilds never stand in for either joker, including the pair in a full house.
  if([...remaining].some(([rank,n])=>rank>14&&n>0))return false;
  return [...remaining.values()].reduce((a,b)=>a+b,0)===cards.filter(card=>isWild(card,level)).length;
}

export function classify(cards:Card[],level:number):Combination[] {
  if(!cards.length||cards.length>10||new Set(cards.map(c=>c.id)).size!==cards.length)return [];
  return allTemplates.filter(t=>fits(cards,t,level)).map(t=>t.combination);
}

export function bombTier(c:Combination):number {
  if(c.kind==='four_jokers')return 9;
  if(c.kind==='straight_flush')return 3;
  if(c.kind==='bomb')return c.size<6?c.size-3:c.size-2;
  return 0;
}
export function beats(candidate:Combination,previous:Combination|null,level:number):boolean {
  if(!previous)return true;
  const a=bombTier(candidate),b=bombTier(previous);
  if(a!==b)return a>b;
  if(a===9)return false;
  if(!a&&(candidate.kind!==previous.kind||candidate.size!==previous.size))return false;
  const natural=candidate.kind==='straight'||candidate.kind==='straight_flush'||candidate.kind==='pair_run'||candidate.kind==='triple_run';
  return (natural?candidate.rank:strength(candidate.rank,level))>(natural?previous.rank:strength(previous.rank,level));
}

/** One representative for each rank/wild allocation. Suit-equivalent physical cards can
 * also be submitted directly; straight flush templates preserve the exact suit. */
export function candidatePlays(hand:Card[],level:number,previous:Combination|null):Array<{cards:Card[];combination:Combination}> {
  const wilds=hand.filter(c=>isWild(c,level)).sort((a,b)=>a.id.localeCompare(b.id));
  const result:Array<{cards:Card[];combination:Combination}>=[],seen=new Set<string>();
  for(const t of allTemplates){
    const c=t.combination;if(c.size>hand.length||!beats(c,previous,level))continue;
    const entries=[...t.counts];
    const build=(index:number,used:number,chosen:Card[])=>{
      if(index===entries.length){
        const cards=[...chosen,...wilds.slice(0,used)];
        if(!fits(cards,t,level))return;
        const key=`${cards.map(c=>c.id).sort().join(',')}|${c.key}`;
        if(!seen.has(key)){seen.add(key);result.push({cards,combination:c});}return;
      }
      const [rank,need]=entries[index];
      const natural=hand.filter(card=>!isWild(card,level)&&card.rank===rank&&(!t.suit||card.suit===t.suit)).sort((a,b)=>a.id.localeCompare(b.id));
      for(let count=Math.min(need,natural.length);count>=0;count--){
        const missing=need-count;if(used+missing>wilds.length||(rank>14&&missing))continue;
        build(index+1,used+missing,[...chosen,...natural.slice(0,count)]);
      }
    };
    build(0,0,[]);
  }
  return result.sort((a,b)=>bombTier(a.combination)-bombTier(b.combination)||b.cards.length-a.cards.length||strength(a.combination.rank,level)-strength(b.combination.rank,level)||a.combination.key.localeCompare(b.combination.key));
}
