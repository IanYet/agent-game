import {paintSplendorSymbol} from '../games/splendor/artwork';
import {paintAzulSymbol} from '../games/azul/artwork';
import {paintCatanSymbol} from '../games/catan/artwork';
import {paintPuertoRicoSymbol} from '../games/puerto-rico/artwork';
import {paintSvgIcon,svgIconNames,type SvgIconName} from './svg-icons';

export type GameSymbol=SvgIconName|'tiles'|'gem'|'island'|'puerto-ship'|'2'|'3';

const symbolPainters:Record<string,(context:CanvasRenderingContext2D)=>void>={tiles:paintAzulSymbol,gem:paintSplendorSymbol,island:paintCatanSymbol,'puerto-ship':paintPuertoRicoSymbol,...Object.fromEntries(svgIconNames.map(name=>[name,(ctx:CanvasRenderingContext2D)=>paintSvgIcon(ctx,name)]))};
type SymbolBounds={left:number;top:number;width:number;height:number};
const paintedSymbolBounds=new Map<string,SymbolBounds>();
export const gameSymbolFont=(symbol:string)=>symbol==='2'||symbol==='3'?'400 198px Anton':'400 210px Arial, "Segoe UI Symbol", sans-serif';

function measureSymbol(ctx:CanvasRenderingContext2D,symbol:string):SymbolBounds{
  const painter=symbolPainters[symbol];
  if(!painter){
    if(symbol!=='2'&&symbol!=='3')throw new Error(`未注册的游戏图标：${symbol}`);
    ctx.font=gameSymbolFont(symbol);const metrics=ctx.measureText(symbol);
    return {left:-metrics.actualBoundingBoxLeft,top:-metrics.actualBoundingBoxAscent,width:metrics.actualBoundingBoxLeft+metrics.actualBoundingBoxRight,height:metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent};
  }
  const cached=paintedSymbolBounds.get(symbol);if(cached)return cached;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const measure=canvas.getContext('2d',{willReadFrequently:true})!;measure.translate(256,256);measure.fillStyle=measure.strokeStyle='#fff';painter(measure);
  const {data}=measure.getImageData(0,0,512,512);let left=512,top=512,right=0,bottom=0;
  for(let y=0;y<512;y++)for(let x=0;x<512;x++)if(data[(y*512+x)*4+3]){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  const bounds={left:left-256,top:top-256,width:right-left+1,height:bottom-top+1};paintedSymbolBounds.set(symbol,bounds);return bounds;
}

export function paintGameSymbol(ctx:CanvasRenderingContext2D,symbol:string,centered=false){
  ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';
  // Match visible artwork bounds to the original 210 px Hold'em spade.
  ctx.font=gameSymbolFont('spade');const metrics=ctx.measureText('♠');
  const reference={left:-metrics.actualBoundingBoxLeft,top:-metrics.actualBoundingBoxAscent,width:metrics.actualBoundingBoxLeft+metrics.actualBoundingBoxRight,height:metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent};
  const bounds=measureSymbol(ctx,symbol),scale=Math.min(reference.width/bounds.width,reference.height/bounds.height);
  if(!centered)ctx.translate(reference.left+reference.width/2,reference.top+reference.height/2);
  ctx.scale(scale,scale);ctx.translate(-bounds.left-bounds.width/2,-bounds.top-bounds.height/2);ctx.lineWidth/=scale;
  const painter=symbolPainters[symbol];
  if(painter)painter(ctx);
  else{ctx.font=gameSymbolFont(symbol);ctx.fillText(symbol,0,0);ctx.strokeText(symbol,0,0);}ctx.restore();
}

export function gameSymbolImage(symbol:string){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const ctx=canvas.getContext('2d')!;ctx.translate(256,256);ctx.scale(2,2);ctx.fillStyle='#808da8';ctx.strokeStyle='#bcc8dc';
  paintGameSymbol(ctx,symbol,true);return canvas.toDataURL();
}
