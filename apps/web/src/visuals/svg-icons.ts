import crown from './assets/crown.svg?raw';
import swords from './assets/crossed-swords.svg?raw';
import joker from './assets/joker.svg?raw';
import dagger from './assets/dagger.svg?raw';
import moneyBag from './assets/money-bag.svg?raw';
import wand from './assets/wand.svg?raw';
import fleurDeLis from './assets/fleur-de-lis.svg?raw';
import parcel from './assets/parcel.svg?raw';
import setSquare from './assets/set-square.svg?raw';
import helmet from './assets/helmet.svg?raw';
import spade from './assets/spade.svg?raw';
import heart from './assets/heart.svg?raw';
import club from './assets/club.svg?raw';
import diamond from './assets/diamond.svg?raw';
import sparkle from './assets/sparkle.svg?raw';
import infinity from './assets/infinity.svg?raw';
import pawn from './assets/chess-symbol.svg?raw';
import king from './assets/chess-king.svg?raw';
import queen from './assets/chess-queen.svg?raw';
import rook from './assets/chess-rook.svg?raw';
import bishop from './assets/chess-bishop.svg?raw';
import knight from './assets/chess-knight.svg?raw';
import castle from './assets/citadels-symbol.svg?raw';

const sources={crown,swords,joker,dagger,'money-bag':moneyBag,wand,'fleur-de-lis':fleurDeLis,parcel,'set-square':setSquare,helmet,spade,heart,club,diamond,sparkle,infinity,'chess-pawn':pawn,'chess-king':king,'chess-queen':queen,'chess-rook':rook,'chess-bishop':bishop,'chess-knight':knight,castle};
export type SvgIconName=keyof typeof sources;
export const svgIconNames=Object.keys(sources) as SvgIconName[];
export const svgIconBody=(name:SvgIconName)=>{const source=sources[name];return source.slice(source.indexOf('>')+1,source.lastIndexOf('</svg>'));};
const paths=new Map<SvgIconName,{path:Path2D;fill:boolean}[]>();

// DOM icons, foil artwork and engraved masks use these same SVG paths.
export function paintSvgIcon(ctx:CanvasRenderingContext2D,name:SvgIconName){
  let shapes=paths.get(name);
  if(!shapes){
    shapes=Array.from(new DOMParser().parseFromString(sources[name],'image/svg+xml').querySelectorAll('path'),element=>({path:new Path2D(element.getAttribute('d')!),fill:element.getAttribute('fill')!=='none'}));
    paths.set(name,shapes);
  }
  ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
  for(const {path,fill} of shapes){if(fill)ctx.fill(path,'evenodd');ctx.stroke(path);}
  ctx.restore();
}
