export const SEAT_COLORS=['#c67565','#6e9db6','#d9a65d','#d9d6cb'];
export const RESOURCE_COLORS={wood:'#608d76',brick:'#b87965',wool:'#a5b18a',wheat:'#c6ad70',ore:'#8b98b0',desert:'#b8a58b'};
export function paintCatanSymbol(ctx:CanvasRenderingContext2D){
  ctx.save();ctx.lineWidth=8;ctx.lineJoin='round';ctx.beginPath();
  for(let i=0;i<6;i++){const a=Math.PI/3*i-Math.PI/6,x=Math.cos(a)*91,y=Math.sin(a)*91;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.stroke();
  ctx.beginPath();ctx.moveTo(-37,29);ctx.lineTo(-37,-12);ctx.lineTo(0,-46);ctx.lineTo(37,-12);ctx.lineTo(37,29);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.moveTo(-56,57);ctx.lineTo(56,57);ctx.stroke();ctx.restore();
}
