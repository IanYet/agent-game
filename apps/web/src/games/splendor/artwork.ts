import type {Gem} from './types';
export type GemPalette=readonly [string,string,string,string];
export const GEM_PALETTE:Record<Gem,GemPalette>={
  white:['#dce7ed','#ffffff','#9aaebc','#62798e'],blue:['#246dbb','#81c9ff','#16457e','#102a58'],
  green:['#168965','#80e3af','#0c5b43','#083e35'],red:['#b51e45','#ff88a2','#7e1034','#4f1129'],
  black:['#3b465c','#a4aec3','#232b40','#111726'],gold:['#c9902e','#ffe7a1','#96631b','#704319'],
};
type Point=[number,number];
const normalized=(points:Point[]):Point[]=>points.map(([x,y])=>[(x-50)/50,(y-50)/50]);
const OUTLINES:Record<Gem,Point[]>={
  white:normalized([[50,4],[60,19],[72,33],[82,47],[87,62],[84,77],[75,88],[63,95],[50,97],[37,95],[25,88],[16,77],[13,62],[18,47],[28,33],[40,19]]),
  blue:Array.from({length:20},(_,i)=>{const angle=-Math.PI/2+i*Math.PI/10;return [.7*Math.cos(angle),.9*Math.sin(angle)];}),
  green:normalized([[28,7],[72,7],[85,20],[85,80],[72,93],[28,93],[15,80],[15,20]]),
  red:normalized([[24,14],[76,14],[94,39],[50,94],[6,39]]),
  black:[[-.4,-.75],[.4,-.75],[.77,-.37],[.77,.37],[.4,.75],[-.4,.75],[-.77,.37],[-.77,-.37]],
  gold:Array.from({length:32},(_,i)=>{const angle=i*Math.PI/16;return [.88*Math.cos(angle),.88*Math.sin(angle)];}),
};
// The approved silhouettes are shared by icons, canvas art and table models.
export const gemOutline=(color:Gem):Point[]=>OUTLINES[color];
export const GEM_FACET_SCALE=.53;
export function mixGemColor(a:string,b:string,amount:number){
  return '#'+[0,2,4].map(index=>Math.round(parseInt(a.slice(index+1,index+3),16)*(1-amount)+parseInt(b.slice(index+1,index+3),16)*amount).toString(16).padStart(2,'0')).join('');
}
export function gemFacetColor(color:Gem,index:number,palette:GemPalette=GEM_PALETTE[color]){
  const outline=gemOutline(color),a=outline[index],b=outline[(index+1)%outline.length];
  const light=Math.max(-1,Math.min(1,-(a[0]+b[0]+a[1]+b[1])/2.6));
  return mixGemColor(palette[0],light>0?palette[1]:palette[3],Math.abs(light)*.8);
}
export function paintGem(ctx:CanvasRenderingContext2D,color:Gem,x:number,y:number,size:number,palette:GemPalette=GEM_PALETTE[color]){
  const outline=gemOutline(color);ctx.save();ctx.translate(x,y);ctx.scale(size,size);
  if(color==='gold'){
    const rim=ctx.createLinearGradient(-.8,-.8,.8,.8);rim.addColorStop(0,palette[1]);rim.addColorStop(.45,palette[0]);rim.addColorStop(1,palette[3]);
    ctx.beginPath();ctx.arc(0,0,.88,0,Math.PI*2);ctx.fillStyle=rim;ctx.fill();ctx.lineWidth=.014;ctx.strokeStyle=palette[2];ctx.stroke();
    ctx.beginPath();ctx.arc(0,0,.74,0,Math.PI*2);ctx.lineWidth=.026;ctx.strokeStyle=palette[1];ctx.stroke();
    const face=ctx.createLinearGradient(-.5,-.6,.5,.6);face.addColorStop(0,mixGemColor(palette[0],palette[1],.55));face.addColorStop(1,palette[0]);
    ctx.beginPath();ctx.arc(0,0,.66,0,Math.PI*2);ctx.fillStyle=face;ctx.fill();ctx.lineWidth=.024;ctx.strokeStyle=palette[2];ctx.stroke();ctx.restore();return;
  }
  const polygon=(vertices:Array<[number,number]>,fill:string)=>{ctx.beginPath();vertices.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));ctx.closePath();ctx.fillStyle=fill;ctx.fill();};
  polygon(outline,palette[0]);
  for(let i=0;i<outline.length;i++){
    const a=outline[i],b=outline[(i+1)%outline.length];polygon([a,b,[b[0]*GEM_FACET_SCALE,b[1]*GEM_FACET_SCALE],[a[0]*GEM_FACET_SCALE,a[1]*GEM_FACET_SCALE]],gemFacetColor(color,i,palette));
  }
  const center=ctx.createLinearGradient(-.5,-.5,.5,.5);center.addColorStop(0,mixGemColor(palette[0],palette[1],.28));center.addColorStop(1,palette[0]);
  ctx.beginPath();outline.forEach(([px,py],i)=>i?ctx.lineTo(px*GEM_FACET_SCALE,py*GEM_FACET_SCALE):ctx.moveTo(px*GEM_FACET_SCALE,py*GEM_FACET_SCALE));ctx.closePath();ctx.fillStyle=center;ctx.fill();
  ctx.beginPath();outline.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));ctx.closePath();ctx.lineWidth=.015;ctx.strokeStyle=palette[1];ctx.stroke();
  ctx.restore();
}
export function paintSplendorSymbol(ctx:CanvasRenderingContext2D){
  const outline=gemOutline('red');ctx.save();ctx.rotate(-.16);ctx.scale(99,99);ctx.lineWidth/=99;
  ctx.beginPath();outline.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();ctx.stroke();
  ctx.beginPath();outline.forEach(([x,y],i)=>i?ctx.lineTo(x*GEM_FACET_SCALE,y*GEM_FACET_SCALE):ctx.moveTo(x*GEM_FACET_SCALE,y*GEM_FACET_SCALE));ctx.closePath();
  for(const [x,y] of outline){ctx.moveTo(x,y);ctx.lineTo(x*GEM_FACET_SCALE,y*GEM_FACET_SCALE);}ctx.stroke();ctx.restore();
}
