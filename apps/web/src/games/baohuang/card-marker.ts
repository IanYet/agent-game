import type {BaoCard} from './types';

export const baoCardMarker=(card:BaoCard)=>card.mark==='emperor'?{symbol:'👑',label:'皇牌'}:card.mark==='guard'?{symbol:'⚔',label:'侍卫牌'}:undefined;
