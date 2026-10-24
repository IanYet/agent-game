import type {Gem} from './types';
export const GEM_PALETTE:Record<Gem,[string,string,string,string]>={
  white:['#dce7ed','#ffffff','#9aaebc','#62798e'],blue:['#246dbb','#81c9ff','#16457e','#102a58'],
  green:['#168965','#80e3af','#0c5b43','#083e35'],red:['#b51e45','#ff88a2','#7e1034','#4f1129'],
  black:['#3b465c','#a4aec3','#232b40','#111726'],gold:['#c9902e','#ffe7a1','#96631b','#704319'],
};
// A cut octagonal gemstone; the white diamond and gold ingot have distinct outlines.
export function gemOutline(color:Gem):Array<[number,number]>{
  if(color==='white')return [[0,-.8],[.7,-.25],[.48,.46],[0,.8],[-.48,.46],[-.7,-.25]];
  if(color==='gold')return [[-.68,-.36],[-.43,-.68],[.43,-.68],[.68,-.36],[.48,.62],[-.48,.62]];
  return [[-.4,-.75],[.4,-.75],[.77,-.37],[.77,.37],[.4,.75],[-.4,.75],[-.77,.37],[-.77,-.37]];
}
export function paintGem(ctx:CanvasRenderingContext2D,color:Gem,x:number,y:number,size:number){
  const outline=gemOutline(color),palette=GEM_PALETTE[color];ctx.save();ctx.translate(x,y);ctx.scale(size,size);
  const polygon=(vertices:Array<[number,number]>,fill:string)=>{ctx.beginPath();vertices.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));ctx.closePath();ctx.fillStyle=fill;ctx.fill();};
  polygon(outline,palette[0]);
  for(let i=0;i<outline.length;i++){
    const a=outline[i],b=outline[(i+1)%outline.length];polygon([a,b,[b[0]*.47,b[1]*.47],[a[0]*.47,a[1]*.47]],palette[[1,0,2,3,2,0,1,1][i]]);
  }
  polygon(outline.map(([px,py])=>[px*.47,py*.47]),palette[0]);
  ctx.beginPath();outline.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));ctx.closePath();ctx.lineWidth=.015;ctx.strokeStyle=palette[1];ctx.stroke();
  if(color==='gold'){ctx.fillStyle=palette[1];ctx.fillRect(-.2,-.1,.4,.07);ctx.fillRect(-.15,.05,.3,.07);}
  ctx.restore();
}
export function paintSplendorSymbol(ctx:CanvasRenderingContext2D){
  const outline=gemOutline('red');ctx.save();ctx.rotate(-.16);ctx.scale(99,99);ctx.lineWidth/=99;
  ctx.beginPath();outline.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();ctx.stroke();
  ctx.beginPath();outline.forEach(([x,y],i)=>i?ctx.lineTo(x*.47,y*.47):ctx.moveTo(x*.47,y*.47));ctx.closePath();
  for(const [x,y] of outline){ctx.moveTo(x,y);ctx.lineTo(x*.47,y*.47);}ctx.stroke();ctx.restore();
}
