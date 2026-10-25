// Project a card's local plane into the viewport, or into a containing card
// plane when the lens is compositing nested, independently tilted cards.
export function cardProjection(card:HTMLElement,origin?:{x:number;y:number}){
  const style=getComputedStyle(card),matrix=new DOMMatrix(style.transform),rect=card.getBoundingClientRect();
  const width=card.offsetWidth,height=card.offsetHeight,perspective=parseFloat(card.parentElement?getComputedStyle(card.parentElement).perspective:'none')||Infinity;
  const project=(u:number,v:number)=>{const p=matrix.transformPoint(new DOMPoint((u-.5)*width,(v-.5)*height,0)),scale=1/(p.w-p.z/perspective);return {x:p.x*scale,y:p.y*scale};};
  const corners=[project(0,0),project(1,0),project(0,1),project(1,1)];
  const minX=Math.min(...corners.map(p=>p.x)),maxX=Math.max(...corners.map(p=>p.x)),minY=Math.min(...corners.map(p=>p.y)),maxY=Math.max(...corners.map(p=>p.y));
  const point=(u:number,v:number)=>{
    const p=project(u,v);
    return origin?{x:origin.x+width/2+p.x,y:origin.y+height/2+p.y}:{x:rect.left+(p.x-minX)*rect.width/(maxX-minX),y:rect.top+(p.y-minY)*rect.height/(maxY-minY)};
  };
  const inverse=(screenX:number,screenY:number)=>{
    const x=origin?screenX-origin.x-width/2:(screenX-rect.left)/rect.width*(maxX-minX)+minX,y=origin?screenY-origin.y-height/2:(screenY-rect.top)/rect.height*(maxY-minY)+minY;
    const a=matrix.m14-matrix.m13/perspective,b=matrix.m24-matrix.m23/perspective,c=matrix.m44-matrix.m43/perspective;
    const aa=matrix.m11-x*a,bb=matrix.m21-x*b,cc=matrix.m12-y*a,dd=matrix.m22-y*b,ex=x*c-matrix.m41,ey=y*c-matrix.m42,det=aa*dd-bb*cc;
    return {x:(ex*dd-bb*ey)/det+width/2,y:(aa*ey-ex*cc)/det+height/2};
  };
  return {style,width,height,point,inverse};
}
