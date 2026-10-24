// The printed foil tilts below a separate, stationary GlareHover-style cover.
function prepare(canvas:HTMLCanvasElement,width:number,height:number){
  const ratio=Math.min(window.devicePixelRatio||1,1.5);
  const w=Math.max(1,Math.round(width*ratio)),h=Math.max(1,Math.round(height*ratio));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  const ctx=canvas.getContext('2d')!;ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);return ctx;
}
export function paintIdentity(canvas:HTMLCanvasElement,width:number,height:number,x:number,y:number,illumination=1){
  const ctx=prepare(canvas,width,height);
  const base=ctx.createLinearGradient(0,0,width,height);base.addColorStop(0,'#2f344a');base.addColorStop(.48,'#10131b');base.addColorStop(1,'#272630');ctx.fillStyle=base;ctx.fillRect(0,0,width,height);
  ctx.strokeStyle='#d4d6ea0b';ctx.lineWidth=1;
  for(let i=-height;i<width+height;i+=4){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i-height*.47,height);ctx.stroke();}
  const tint=ctx.createLinearGradient(0,height,width,0);tint.addColorStop(0,'#ba7c7c14');tint.addColorStop(.5,'#9494bb00');tint.addColorStop(1,'#8e9fc714');ctx.fillStyle=tint;ctx.fillRect(0,0,width,height);
  ctx.save();ctx.globalAlpha=Math.min(1,illumination);
  const glow=ctx.createRadialGradient(x*width,y*height,0,x*width,y*height,Math.max(width,height)*.75);glow.addColorStop(0,'#a3a7ba16');glow.addColorStop(1,'#a3a7ba00');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);ctx.restore();
  // A continuous angle and an origin outside the card avoid the atan2 seam and
  // the abrupt hue change when a moving conic origin passes under the pointer.
  const angle=(15+(x-.5)*20+(y-.5)*14)*Math.PI/180;
  ctx.save();ctx.globalCompositeOperation='color-dodge';ctx.globalAlpha=Math.min(.2,.10*illumination);
  const spectrum=ctx.createConicGradient(angle,width*.5,-height*1.2);
  ['#0000','#f5d2bb','#bcb1ed','#8dafc7','#0000','#d8c1d5','#0000'].forEach((color,i)=>spectrum.addColorStop(i/6,color));ctx.fillStyle=spectrum;ctx.fillRect(0,0,width,height);ctx.restore();
}
export function paintIdentityGlass(canvas:HTMLCanvasElement,width:number,height:number,x:number,y:number,presence:number,sweep:number,illumination=1){
  const ctx=prepare(canvas,width,height);
  if(illumination<=.001)return;
  ctx.globalAlpha=Math.min(1,illumination);
  // The cover has a visible resting sheen and fixed rim even without hovering.
  const coat=ctx.createLinearGradient(0,0,width*.7,height*.9);coat.addColorStop(0,'#f5f1ff20');coat.addColorStop(.2,'#e6e2f811');coat.addColorStop(.45,'#dddaf404');coat.addColorStop(.72,'#ffffff00');coat.addColorStop(1,'#d7ddff06');ctx.fillStyle=coat;ctx.fillRect(0,0,width,height);
  const diagonal=Math.hypot(width,height),band=diagonal*.58,ux=Math.sin(-38*Math.PI/180),uy=-Math.cos(-38*Math.PI/180);
  const along=((x-.5)*width*ux+(y-.5)*height*uy)*.45;
  const reflection=(offset:number,strength:number)=>{
    const centerX=width/2+ux*offset,centerY=height/2+uy*offset;
    const light=ctx.createLinearGradient(centerX-ux*band/2,centerY-uy*band/2,centerX+ux*band/2,centerY+uy*band/2);
    const bump=(t:number,c:number,h:number)=>{const s=Math.max(0,1-Math.abs(t-c)/h);return s*s*s*(s*(s*6-15)+10);};
    for(let i=0;i<=32;i++){const t=i/32,alpha=(bump(t,.36,.2204)+.85*bump(t,.7,.0768)+.26*bump(t,.5,.5))*.23*strength;light.addColorStop(t,`rgba(230,215,250,${alpha})`);}
    ctx.fillStyle=light;ctx.fillRect(0,0,width,height);
  };
  ctx.save();ctx.globalCompositeOperation='screen';reflection(along,(.22+presence*.65)*Math.max(1,illumination));if(illumination>1)reflection(diagonal*.12,(illumination-1)*1.3);if(sweep>0&&sweep<1)reflection((sweep-.5)*diagonal*2,Math.sin(sweep*Math.PI)*.7);ctx.restore();
  const rim=ctx.createLinearGradient(0,0,width*.7,height);rim.addColorStop(0,'#f5efffa3');rim.addColorStop(.28,'#ded9f34d');rim.addColorStop(.7,'#d8dcf71a');rim.addColorStop(1,'#dde3ff29');
  ctx.strokeStyle=rim;ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(.75,.75,Math.max(0,width-1.5),Math.max(0,height-1.5),10);ctx.stroke();
}
