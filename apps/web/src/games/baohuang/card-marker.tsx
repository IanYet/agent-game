import type {BaoCard} from './types';
import {SvgIcon} from '../../visuals/SvgIcon';

export const baoCardMarker=(card:BaoCard)=>card.mark==='emperor'?{symbol:<SvgIcon name="crown"/>,label:'皇牌'}:card.mark==='guard'?{symbol:<SvgIcon name="swords"/>,label:'侍卫牌'}:undefined;
