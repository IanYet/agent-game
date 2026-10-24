import {cardLabel,rankLabel,SUIT_LABELS} from '@agent-game/core';
import type {BaoCard} from './types';

export function BaoPlayingCard({card,selected=false,onClick,disabled=false,small=false}:{card:BaoCard;selected?:boolean;onClick?:()=>void;disabled?:boolean;small?:boolean}){
  const label=`${cardLabel(card)}${card.mark==='emperor'?' · 皇牌':card.mark==='guard'?' · 侍卫牌':''}`;
  const content=<><b>{card.rank>=16?(card.rank===17?'大王':'小王'):rankLabel(card.rank)}</b><span>{card.mark==='emperor'?'👑':card.mark==='guard'?'⚔':SUIT_LABELS[card.suit]}</span></>;
  const cls=`bao-card ${small?'bao-card-small':''} ${['H','D'].includes(card.suit)||card.rank===17?'bao-red':''} ${card.mark?'bao-marked':''} ${selected?'bao-selected':''}`;
  return onClick?<button className={cls} title={label} aria-label={label} aria-pressed={selected} disabled={disabled} onClick={onClick}>{content}</button>:<span className={cls} title={label} aria-label={label}>{content}</span>;
}
