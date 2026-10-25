export type HolographicPattern='contours'|'crowns';
export type EngravingBitmap={width:number;height:number;mark:HTMLCanvasElement;pixels:Uint8Array};
const CROWN_OUTLINE:Array<[number,number]>=[[0,-.78],[.34,-.18],[.82,-.55],[.6,.5],[-.6,.5],[-.82,-.55],[-.34,-.18]];

// Contours are generated in the shader; crowns use a staggered outline mask.
export function createCardEngraving(pattern:HolographicPattern,width:number,height:number,dpr:number):EngravingBitmap{
  const pixelWidth=Math.max(1,Math.round(width*dpr)),pixelHeight=Math.max(1,Math.round(height*dpr));
  const mark=document.createElement('canvas');mark.width=pixelWidth;mark.height=pixelHeight;
  const ctx=mark.getContext('2d',{willReadFrequently:true})!;ctx.scale(dpr,dpr);ctx.strokeStyle='#fff';ctx.lineJoin='round';
  const trace=(ctx:CanvasRenderingContext2D,vertices:Array<[number,number]>,cx:number,cy:number,size:number)=>{
    ctx.beginPath();vertices.forEach(([px,py],i)=>i?ctx.lineTo(cx+px*size,cy+py*size):ctx.moveTo(cx+px*size,cy+py*size));ctx.closePath();
  };
  if(pattern==='crowns'){
    const spacing=32,scale=11.5;ctx.lineWidth=.6;
    for(let row=-1;row<=Math.ceil(height/spacing);row++)for(let col=-1;col<=Math.ceil(width/spacing);col++){
      const x=(col+.5+(row&1)*.5)*spacing,y=(row+.5)*spacing;
      trace(ctx,CROWN_OUTLINE,x,y,scale);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x-scale*.58,y+scale*.78);ctx.lineTo(x+scale*.58,y+scale*.78);ctx.stroke();
    }
  }
  const channel=ctx.getImageData(0,0,pixelWidth,pixelHeight).data;
  const pixels=new Uint8Array(pixelWidth*pixelHeight*4);
  for(let i=0;i<pixels.length;i+=4){pixels[i]=channel[i+3];pixels[i+3]=255;}
  return {width:pixelWidth,height:pixelHeight,mark,pixels};
}
