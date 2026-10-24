export const TILE_COLORS=['#235cad','#dfa93c','#b94c47','#253743','#eee7d3','#f1e2b4'];
const INKS=['#e8f1df','#7a492a','#ffe3bb','#77bfcd','#286b9a','#234b75'];
// Original vector motifs shared by porcelain faces, table tokens and the lobby foil.
const motifs=[
  'M50 17C37 29 40 40 50 50C60 40 63 29 50 17ZM83 50C71 37 60 40 50 50C60 60 71 63 83 50ZM50 83C63 71 60 60 50 50C40 60 37 71 50 83ZM17 50C29 63 40 60 50 50C40 40 29 37 17 50Z',
  'M50 15L59 36L82 18L69 43L89 50L69 57L82 82L59 64L50 85L41 64L18 82L31 57L11 50L31 43L18 18L41 36Z',
  'M50 17L83 50L50 83L17 50ZM50 30L30 50L50 70L70 50Z',
  'M20 20H32V44H44V20H56V44H68V20H80V32H56V44H80V56H56V68H80V80H68V56H56V80H44V56H32V80H20V68H44V56H20V44H44V32H20Z',
  'M47 13H53V35L64 24L68 28L53 43V47H57L72 32L76 36L65 47H87V53H65L76 64L72 68L57 53H53V57L68 72L64 76L53 65V87H47V65L36 76L32 72L47 57V53H43L28 68L24 64L35 53H13V47H35L24 36L28 32L43 47H47V43L32 28L36 24L47 35Z',
];
export function tileSvg(index:number){const i=index%6;return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="2" y="2" width="96" height="96" rx="12" fill="${TILE_COLORS[i]}" stroke="#f8e5bf" stroke-width="2"/><rect x="9" y="9" width="82" height="82" rx="5" fill="none" stroke="${INKS[i]}" stroke-opacity=".65" stroke-width="2"/>${i===5?`<circle cx="50" cy="50" r="29" fill="none" stroke="${INKS[i]}" stroke-width="3"/><text x="50" y="70" text-anchor="middle" font-family="Georgia,serif" font-weight="bold" font-size="56" fill="${INKS[i]}">1</text>`:`<path d="${motifs[i]}" fill="${INKS[i]}" fill-rule="evenodd"/><circle cx="50" cy="50" r="5" fill="${TILE_COLORS[i]}"/>`}<path d="M16 7H84" stroke="white" stroke-opacity=".5" stroke-width="3"/></svg>`;}
export const TILE_IMAGES=Array.from({length:6},(_,i)=>`data:image/svg+xml,${encodeURIComponent(tileSvg(i))}`);
export function paintTile(ctx:CanvasRenderingContext2D,index:number,x=0,y=0,size=100){
  const i=index%6;ctx.save();ctx.translate(x,y);ctx.scale(size/100,size/100);
  ctx.fillStyle=TILE_COLORS[i];ctx.beginPath();ctx.roundRect(2,2,96,96,12);ctx.fill();ctx.strokeStyle='#f6e5bd';ctx.lineWidth=2;ctx.stroke();
  ctx.strokeStyle=INKS[i];ctx.globalAlpha=.7;ctx.strokeRect(9,9,82,82);ctx.globalAlpha=1;ctx.fillStyle=INKS[i];
  if(i===5){ctx.beginPath();ctx.arc(50,50,29,0,Math.PI*2);ctx.stroke();ctx.font='bold 56px Georgia';ctx.textAlign='center';ctx.fillText('1',50,70);}
  else{ctx.fill(new Path2D(motifs[i]),'evenodd');ctx.beginPath();ctx.arc(50,50,5,0,Math.PI*2);ctx.fillStyle=TILE_COLORS[i];ctx.fill();}
  ctx.strokeStyle='#ffffff80';ctx.beginPath();ctx.moveTo(16,7);ctx.lineTo(84,7);ctx.stroke();ctx.restore();
}
export function paintAzulSymbol(ctx:CanvasRenderingContext2D){
  ctx.save();ctx.rotate(.08);ctx.shadowColor='#070c2466';ctx.shadowBlur=5;
  for(let y=0;y<2;y++)for(let x=0;x<2;x++)paintTile(ctx,[0,4,4,0][y*2+x],-77+x*78,-77+y*78,76);
  ctx.restore();
}
