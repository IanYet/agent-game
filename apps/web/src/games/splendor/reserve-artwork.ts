import type {HolographicEngraving} from '../../visuals/HolographicCard';
import {GEM_FACET_SCALE,gemOutline} from './artwork';
import {COLORS,type Color} from './types';

// A fixed seed keeps the back independent of the hidden card and stable at
// every size. The central clearing includes the entire coin plus a visible gap.
export const RESERVED_BACK_PATTERN:HolographicEngraving={key:'splendor-reserved-gems-and-coin',paint(ctx,width,height){
  const baseWidth=112,baseHeight=height/width*baseWidth,cx=baseWidth/2,cy=baseHeight/2;
  let seed=0x51e7d0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const motifs:Array<{x:number;y:number;radius:number;angle:number;color:Color}>=[];
  for(let attempt=0;attempt<1200;attempt++){
    const radius=6+random()*4,x=-2+random()*(baseWidth+4),y=-2+random()*(baseHeight+4),angle=random()*Math.PI*2;
    if(Math.hypot(x-cx,y-cy)<baseWidth*.255+radius)continue;
    if(Math.abs(x-cx)<18+radius&&y<24+radius)continue;
    if(motifs.some(other=>Math.hypot(x-other.x,y-other.y)<radius+other.radius+1.5))continue;
    motifs.push({x,y,radius,angle,color:COLORS[motifs.length%COLORS.length]});
  }
  ctx.scale(width/baseWidth,width/baseWidth);ctx.strokeStyle='#fff';ctx.lineJoin='round';ctx.lineCap='round';
  for(const motif of motifs){
    const outline=gemOutline(motif.color);
    ctx.save();ctx.translate(motif.x,motif.y);ctx.rotate(motif.angle);
    const trace=(scale:number)=>{ctx.beginPath();outline.forEach(([x,y],i)=>i?ctx.lineTo(x*scale,y*scale):ctx.moveTo(x*scale,y*scale));ctx.closePath();};
    ctx.lineWidth=.7;trace(motif.radius);ctx.stroke();
    ctx.lineWidth=.45;ctx.globalAlpha=.65;trace(motif.radius*GEM_FACET_SCALE);ctx.stroke();
    ctx.beginPath();outline.forEach(([x,y],i)=>{if(i%Math.max(1,Math.floor(outline.length/5)))return;ctx.moveTo(x*motif.radius,y*motif.radius);ctx.lineTo(x*motif.radius*GEM_FACET_SCALE,y*motif.radius*GEM_FACET_SCALE);});ctx.stroke();
    ctx.restore();
  }
  // The coin is engraved into the same light-sensitive mask, with no filled
  // metal layer. Its quiet outer silhouette is drawn separately in the DOM.
  ctx.save();ctx.translate(cx,cy);ctx.scale(baseWidth*.44/100,baseWidth*.44/100);ctx.lineWidth=1.15;
  for(const radius of [44,37,33]){ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.stroke();}
  ctx.lineWidth=.9;
  for(let i=0;i<32;i++){
    const angle=i*Math.PI/16;ctx.beginPath();ctx.moveTo(Math.cos(angle)*39,Math.sin(angle)*39);ctx.lineTo(Math.cos(angle)*42,Math.sin(angle)*42);ctx.stroke();
  }
  ctx.lineWidth=.8;ctx.globalAlpha=.8;
  for(const ring of [10,18,26]){
    ctx.beginPath();
    for(let step=0;step<=192;step++){
      const angle=step*Math.PI/96,radius=ring+Math.cos(angle*12)*1.8,x=Math.cos(angle)*radius,y=Math.sin(angle)*radius;
      if(step)ctx.lineTo(x,y);else ctx.moveTo(x,y);
    }
    ctx.closePath();ctx.stroke();
  }
  ctx.restore();
}};
