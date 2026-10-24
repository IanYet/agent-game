import type {Card,Suit} from '@agent-game/core';
import {cardLabel,shuffle} from '@agent-game/core';

export const POINTS=Array.from({length:13},(_,i)=>i+2);
export const label=(rank:number)=>({11:'J',12:'Q',13:'K',14:'A',16:'小王',17:'大王'}[rank]??String(rank));
export const teamName=(team:number)=>team===0?'一队':'二队';
export const isWild=(card:Card,level:number)=>card.suit==='H'&&card.rank===level;
export const strength=(rank:number,level:number)=>rank===level?15:rank;
export const makeDeck=():Card[]=>[0,1].flatMap(deck=>[
  ...(['S','H','C','D'] as Suit[]).flatMap(suit=>POINTS.map(rank=>({id:`${deck}-${suit}${rank}`,suit,rank}))),
  {id:`${deck}-J16`,suit:'J' as const,rank:16},{id:`${deck}-J17`,suit:'J' as const,rank:17},
]);
export const shuffledDeck=(random:()=>number)=>shuffle(makeDeck(),random);
export const sortHand=(cards:Card[],level:number)=>[...cards].sort((a,b)=>strength(b.rank,level)-strength(a.rank,level)||a.suit.localeCompare(b.suit)||a.id.localeCompare(b.id));
export const cardsText=(cards:Card[])=>cards.map(cardLabel).join(' ');
