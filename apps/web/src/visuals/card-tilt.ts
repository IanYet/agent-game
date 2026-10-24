// Maximum movement of a projected corner, in CSS pixels, from its resting place.
// Limit the visible movement rather than an angle or an unprojected Z depth.
const EDGE_TRAVEL=20;
export const cardPerspective=(width:number,height:number,scale=1)=>Math.max(1,width,height)*scale;
type TiltGeometry={scale?:number;rotation?:number;offsetX?:number;offsetY?:number;offsetZ?:number};
export function cardTilt(x:number,y:number,width:number,height:number,{scale=1,rotation=0,offsetX=0,offsetY=0,offsetZ=0}:TiltGeometry={}){
  const nx=2*Math.max(0,Math.min(1,x))-1,ny=2*Math.max(0,Math.min(1,y))-1;
  const strength=Math.max(Math.abs(nx),Math.abs(ny));
  if(strength<.0001||width<=0||height<=0)return {rx:0,ry:0};
  const directionX=-ny/strength,directionY=nx/strength,limit=EDGE_TRAVEL*strength,perspective=cardPerspective(width,height,scale);
  const angle=rotation*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
  const corners=[[-1,-1],[1,-1],[-1,1],[1,1]].map(([sx,sy])=>{
    const px=sx*width*scale/2,py=sy*height*scale/2;
    const x=px*cos-py*sin,y=px*sin+py*cos,projection=perspective/(perspective-offsetZ);
    return {x,y,restX:(x+offsetX)*projection,restY:(y+offsetY)*projection};
  });
  // Match CSS rotateY -> rotateX -> translate -> perspective. Include all four
  // corners so diagonal movement and the gallery's scale/offset obey one limit.
  const travel=(amount:number)=>{
    const rx=directionX*amount,ry=directionY*amount,sx=Math.sin(rx),cx=Math.cos(rx),sy=Math.sin(ry),cy=Math.cos(ry);
    return Math.max(...corners.map(p=>{
      const z=p.y*sx-p.x*sy*cx,projection=perspective/(perspective-offsetZ-z);
      const x=(p.x*cy+offsetX)*projection,y=(p.x*sy*sx+p.y*cx+offsetY)*projection;
      return Math.hypot(x-p.restX,y-p.restY);
    }));
  };
  let low=0,high=Math.PI/3;
  for(let i=0;i<16;i++){const middle=(low+high)/2;if(travel(middle)>limit)high=middle;else low=middle;}
  return {rx:directionX*low*180/Math.PI,ry:directionY*low*180/Math.PI};
}
