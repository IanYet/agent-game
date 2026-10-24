type FoilTone='warm'|'cool'|'silver';
const palettes:Record<FoilTone,string[]>={
  warm:['#7e8ba5','#cec3a9','#525b77','#8d747f','#b2bfbb','#787c9f','#bcb7a7','#7e8ba5'],
  cool:['#6b88a2','#b0acd3','#627d87','#a5c8c5','#857b9e','#b6b9ce','#677d9f','#6b88a2'],
  silver:['#747780','#d1d3d7','#565962','#a2a5ac','#c1c3c8','#7c7f88','#b8bbc1','#747780'],
};

export function paintFoilGlare(ctx:CanvasRenderingContext2D,width:number,height:number,x:number,y:number,tone:FoilTone){
  const gradient=ctx.createConicGradient(tone==='warm'?0:Math.PI*.5,x*width,y*height),colors=palettes[tone];
  colors.forEach((color,i)=>gradient.addColorStop(i/(colors.length-1),color));ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
}

export function paintFoilTexture(ctx:CanvasRenderingContext2D,width:number,height:number,x=.5,y=.5,tone:FoilTone='cool'){
  ctx.save();
  paintFoilGlare(ctx,width,height,x,y,tone);
  ctx.save();ctx.globalCompositeOperation='soft-light';ctx.globalAlpha=.55;ctx.lineWidth=1;
  for(const [slope,spacing,color] of [[.445,3,'#ffffff33'],[-2.14,5,'#00000022']] as const){ctx.strokeStyle=color;for(let i=-height*3;i<width+height*3;i+=spacing){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i-height*slope,height);ctx.stroke();}}ctx.restore();
  ctx.translate(width*.5,height*.5);ctx.rotate(-25*Math.PI/180);ctx.lineWidth=1;ctx.globalAlpha=.7;
  for(const ring of [0,25,50,76]){ctx.strokeStyle=ring===0?'#eff8ff55':'#edf6ff44';ctx.beginPath();ctx.ellipse(0,0,width*.5+90+ring,height*.5+70+ring,0,0,Math.PI*2);ctx.stroke();}
  ctx.restore();
}
