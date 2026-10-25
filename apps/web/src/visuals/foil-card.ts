import {paintGameSymbol} from './game-symbol';
import {paintFoilTexture} from './foil-texture';
import {cardProjection} from './card-projection';
export type FoilLabel={symbol:string;english:string;tone:'warm'|'cool'};
const WIDTH=218,HEIGHT=294;
// Canvas reproduces the approved CSS foil layers; the lens uses this very same frame.
export function paintFoil(canvas:HTMLCanvasElement,label:FoilLabel,x=.5,y=.5,time=0){
  if(canvas.width!==WIDTH*2||canvas.height!==HEIGHT*2){canvas.width=WIDTH*2;canvas.height=HEIGHT*2;}
  const ctx=canvas.getContext('2d')!;ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,WIDTH,HEIGHT);
  paintFoilTexture(ctx,WIDTH,HEIGHT,x,y,label.tone);
  ctx.save();ctx.globalCompositeOperation='hard-light';ctx.textAlign='center';ctx.textBaseline='middle';ctx.translate(WIDTH*.5,HEIGHT*.5-(label.tone==='cool'?18:8));
  if(label.tone==='cool')ctx.rotate(-16*Math.PI/180);
  ctx.fillStyle='#090c1744';ctx.strokeStyle='#f0eff1a1';ctx.lineWidth=1;ctx.shadowOffsetX=1;ctx.shadowOffsetY=2;ctx.shadowBlur=1;ctx.shadowColor='#ffffff22';
  paintGameSymbol(ctx,label.symbol);ctx.restore();
  ctx.fillStyle='#e9edf2dc';ctx.font='8px Arial';ctx.letterSpacing='2.5px';ctx.fillText('HUMAN × AGENT',18,24);ctx.letterSpacing='.6px';
  ctx.fillStyle='#eff1ed';ctx.font='400 22px Anton';ctx.fillText(label.english,18,HEIGHT-37);ctx.font='6px Arial';ctx.letterSpacing='1px';ctx.fillText('ANOTHER MIND. YOUR NEXT MOVE.',18,HEIGHT-18);ctx.letterSpacing='0px';
  // The original 4.8 s diagonal screen-blended sweep, in addition to the cursor reflection.
  const sweep=(time%4.8)/4.8,position=(-.65+Math.min(1,Math.max(0,(sweep-.1)/.55))*2.3)*WIDTH;
  ctx.save();ctx.globalCompositeOperation='screen';const light=ctx.createLinearGradient(position-120,0,position+120,HEIGHT*.55);
  light.addColorStop(0,'#ffffff00');light.addColorStop(.36,'#d1ffec16');light.addColorStop(.46,'#ffffff66');light.addColorStop(.54,'#e7c9fa25');light.addColorStop(.7,'#ffffff00');ctx.fillStyle=light;ctx.fillRect(0,0,WIDTH,HEIGHT);ctx.restore();
  ctx.strokeStyle='#e7edf955';ctx.lineWidth=1;ctx.strokeRect(.5,.5,WIDTH-1,HEIGHT-1);
}

let compositeLayer:HTMLCanvasElement|undefined;
export function compositeFoil(target:CanvasRenderingContext2D,card:HTMLElement){
  const source=card.querySelector('canvas');if(source?.width)compositePlane(target,card,source);
}
export function compositePlane(target:CanvasRenderingContext2D,card:HTMLElement,source:HTMLCanvasElement,projection=cardProjection(card)){
  compositeLayer??=document.createElement('canvas');
  if(compositeLayer.width!==target.canvas.width||compositeLayer.height!==target.canvas.height){compositeLayer.width=target.canvas.width;compositeLayer.height=target.canvas.height;}
  const ctx=compositeLayer.getContext('2d')!;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,compositeLayer.width,compositeLayer.height);ctx.setTransform(target.getTransform());
  const {style,width,height,point}=projection;
  // CSS clips the visible foil in its own plane BEFORE perspective. Reproduce
  // that contour in the lens; clipping an axis-aligned bounding box loses corners.
  const radius=Math.min(parseFloat(style.borderTopLeftRadius)||0,width/2,height/2),outline=new Path2D();
  const arcs=[[radius,radius,Math.PI],[width-radius,radius,Math.PI*1.5],[width-radius,height-radius,0],[radius,height-radius,Math.PI*.5]];
  let started=false;
  for(const [cx,cy,start] of arcs)for(let step=0;step<=12;step++){
    const angle=start+step/12*Math.PI*.5,p=point((cx+Math.cos(angle)*radius)/width,(cy+Math.sin(angle)*radius)/height);
    if(started)outline.lineTo(p.x,p.y);else{outline.moveTo(p.x,p.y);started=true;}
  }
  outline.closePath();
  const shadow=style.boxShadow.match(/^(rgba?\([^)]+\)) ([\d.-]+)px ([\d.-]+)px ([\d.-]+)px/);
  if(shadow){ctx.save();ctx.shadowColor=shadow[1];ctx.shadowOffsetX=Number(shadow[2]);ctx.shadowOffsetY=Number(shadow[3]);ctx.shadowBlur=Number(shadow[4]);ctx.fillStyle='#000';ctx.fill(outline);ctx.restore();}
  const grid=8;
  const triangle=(a:{x:number;y:number},b:{x:number;y:number},c:{x:number;y:number},uv:[[number,number],[number,number],[number,number]])=>{
    const [[u0,v0],[u1,v1],[u2,v2]]=uv.map(([u,v])=>[u*source.width,v*source.height]);
    const determinant=u0*(v1-v2)+u1*(v2-v0)+u2*(v0-v1);
    const coefficients=(p0:number,p1:number,p2:number)=>[(p0*(v1-v2)+p1*(v2-v0)+p2*(v0-v1))/determinant,(p0*(u2-u1)+p1*(u0-u2)+p2*(u1-u0))/determinant,(p0*(u1*v2-u2*v1)+p1*(u2*v0-u0*v2)+p2*(u0*v1-u1*v0))/determinant];
    const x=coefficients(a.x,b.x,c.x),y=coefficients(a.y,b.y,c.y);
    // Overlap the clip edges on an opaque intermediate surface. Compositing the
    // whole card once prevents both dark grid seams and repeated partial alpha.
    const center={x:(a.x+b.x+c.x)/3,y:(a.y+b.y+c.y)/3},expand=(p:{x:number;y:number})=>{const dx=p.x-center.x,dy=p.y-center.y,length=Math.hypot(dx,dy);return {x:p.x+dx/length*.7,y:p.y+dy/length*.7};},pa=expand(a),pb=expand(b),pc=expand(c);
    ctx.save();ctx.beginPath();ctx.moveTo(pa.x,pa.y);ctx.lineTo(pb.x,pb.y);ctx.lineTo(pc.x,pc.y);ctx.closePath();ctx.clip();ctx.transform(x[0],y[0],x[1],y[1],x[2],y[2]);ctx.drawImage(source,0,0);ctx.restore();
  };
  ctx.save();ctx.clip(outline);
  for(let y=0;y<grid;y++)for(let x=0;x<grid;x++){
    const u=x/grid,v=y/grid,un=(x+1)/grid,vn=(y+1)/grid,a=point(u,v),b=point(un,v),c=point(u,vn),d=point(un,vn);
    triangle(a,b,c,[[u,v],[un,v],[u,vn]]);triangle(b,d,c,[[un,v],[un,vn],[u,vn]]);
  }
  ctx.restore();
  target.save();target.setTransform(1,0,0,1,0,0);target.drawImage(compositeLayer,0,0);target.restore();
}
