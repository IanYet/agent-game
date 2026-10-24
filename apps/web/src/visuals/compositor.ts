import {cardProjection,compositeFoil,compositePlane} from './foil-card';
// A local paint surface, rebuilt from current viewport geometry on every lens frame.
// DOM remains the interactive source of truth. No page screenshots, SVG filters,
// retained scroll offsets, foreignObject snapshots or private input values are used.
const SIZE=256;
const intersects=(a:DOMRect,b:{left:number;top:number;right:number;bottom:number})=>a.right>b.left&&a.left<b.right&&a.bottom>b.top&&a.top<b.bottom;
const splitLayers=(value:string)=>{
  let depth=0,start=0;const parts:string[]=[];
  for(let i=0;i<value.length;i++){if(value[i]==='(')depth++;else if(value[i]===')')depth--;else if(value[i]===','&&depth===0){parts.push(value.slice(start,i).trim());start=i+1;}}
  parts.push(value.slice(start).trim());return parts;
};
function paintBoardGameGradients(ctx:CanvasRenderingContext2D,image:string,rect:DOMRect){
  for(const layer of splitLayers(image).reverse()){
    const match=layer.match(/^(linear-gradient|radial-gradient|repeating-linear-gradient)\((.*)\)$/);if(!match)continue;
    const parts=splitLayers(match[2]),radial=match[1]==='radial-gradient',repeating=match[1]==='repeating-linear-gradient';
    const direction=parts[0].match(/deg$|\bat\b|^ellipse|^circle/)?parts.shift()!:radial?'at 50% 50%':'180deg';
    const stops=parts.map((part,index)=>{const stop=part.match(/^(.*\S)\s+([\d.]+)(%|px)$/);return {color:stop?.[1]??part,position:stop?Number(stop[2]):index/(parts.length-1),unit:stop?.[3]??'fraction'};});
    const addStops=(gradient:CanvasGradient,length:number)=>{for(const stop of stops){const position=stop.unit==='%'?stop.position/100:stop.unit==='px'?stop.position/length:stop.position;gradient.addColorStop(Math.max(0,Math.min(1,position)),stop.color);}};
    ctx.save();
    if(radial){
      const center=direction.match(/at\s+([\d.]+)%\s+([\d.]+)%/),cx=rect.x+rect.width*Number(center?.[1]??50)/100,cy=rect.y+rect.height*Number(center?.[2]??50)/100;
      const rx=Math.max(cx-rect.left,rect.right-cx)*Math.SQRT2,ry=Math.max(cy-rect.top,rect.bottom-cy)*Math.SQRT2;
      if(rx&&ry){ctx.translate(cx,cy);ctx.scale(rx,ry);const gradient=ctx.createRadialGradient(0,0,0,0,0,1);addStops(gradient,Math.max(rx,ry));ctx.fillStyle=gradient;ctx.fillRect((rect.x-cx)/rx,(rect.y-cy)/ry,rect.width/rx,rect.height/ry);}
    }else{
      const angle=(parseFloat(direction)||0)*Math.PI/180,dx=Math.sin(angle),dy=-Math.cos(angle),length=Math.abs(rect.width*dx)+Math.abs(rect.height*dy),cx=rect.x+rect.width/2,cy=rect.y+rect.height/2;
      if(repeating){
        const period=stops.at(-1)?.position??10,extent=rect.width+rect.height;
        if(period>0){ctx.translate(cx,cy);ctx.rotate(angle-Math.PI/2);for(let offset=-Math.ceil(extent/period)*period;offset<extent;offset+=period){const gradient=ctx.createLinearGradient(offset,0,offset+period,0);addStops(gradient,period);ctx.fillStyle=gradient;ctx.fillRect(offset,-extent,period,extent*2);}}
      }else{const gradient=ctx.createLinearGradient(cx-dx*length/2,cy-dy*length/2,cx+dx*length/2,cy+dy*length/2);addStops(gradient,length);ctx.fillStyle=gradient;ctx.fillRect(rect.x,rect.y,rect.width,rect.height);}
    }
    ctx.restore();
  }
}
export class LensCompositor {
  readonly canvas=document.createElement('canvas');
  sampleMs=0;
  private context:CanvasRenderingContext2D;
  private planes=new WeakMap<HTMLElement,HTMLCanvasElement>();
  constructor(){this.canvas.width=SIZE;this.canvas.height=SIZE;this.context=this.canvas.getContext('2d')!;}
  paint(x:number,y:number){
    this.sampleMs=0;
    let ctx=this.context;
    const box={left:x-SIZE/2,top:y-SIZE/2,right:x+SIZE/2,bottom:y+SIZE/2};
    let plane:{root:HTMLElement;projection:ReturnType<typeof cardProjection>}|undefined;
    const bounds=(el:Element)=>{
      if(!plane)return el.getBoundingClientRect();
      const root=plane.root;
      if(el===root)return new DOMRect(0,0,root.offsetWidth,root.offsetHeight);
      if(el instanceof HTMLElement){
        let left=root.clientLeft,top=root.clientTop,node:HTMLElement|null=el;
        while(node&&node!==root){
          left+=node.offsetLeft;top+=node.offsetTop;
          // offsetTop/Left describe layout and omit the hand's animated lift.
          // Keep child translations in the foil plane before projecting it.
          const transform=getComputedStyle(node).transform;
          if(transform!=='none'){const matrix=new DOMMatrixReadOnly(transform);left+=matrix.m41;top+=matrix.m42;}
          node=node.offsetParent as HTMLElement|null;
        }
        for(let parent=el.parentElement;parent&&parent!==root;parent=parent.parentElement){left-=parent.scrollLeft;top-=parent.scrollTop;}
        return new DOMRect(left-root.scrollLeft,top-root.scrollTop,el.offsetWidth,el.offsetHeight);
      }
      const r=el.getBoundingClientRect(),p=plane.projection.inverse(r.left+r.width/2,r.top+r.height/2);
      return new DOMRect(p.x-r.width/2,p.y-r.height/2,r.width,r.height);
    };
    ctx.setTransform(1,0,0,1,-box.left,-box.top);ctx.globalAlpha=1;ctx.fillStyle='#090a0d';ctx.fillRect(box.left,box.top,SIZE,SIZE);
    const range=document.createRange();
    const draw=(el:Element,alpha:number)=>{
      if(el.matches('[data-lens-ignore],[data-cursor-lens="off"],.cursor-lens,script,style,input,textarea,select,.glass-fallback,.hero-title-fallback'))return;
      const style=getComputedStyle(el);if(style.display==='none'||style.visibility==='hidden')return;
      const rect=bounds(el),foil=el.matches('.r-laser-card');if(!plane&&!intersects(foil?new DOMRect(rect.x-80,rect.y-80,rect.width+160,rect.height+160):rect,box))return;
      const opacity=alpha*Number(style.opacity);if(opacity<.001)return;
      if(!plane&&el instanceof HTMLElement&&el.matches('.identity-card')){
        let surface=this.planes.get(el);if(!surface){surface=document.createElement('canvas');this.planes.set(el,surface);}
        if(surface.width!==el.offsetWidth||surface.height!==el.offsetHeight){surface.width=el.offsetWidth;surface.height=el.offsetHeight;}
        const parentContext=ctx;ctx=surface.getContext('2d')!;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,surface.width,surface.height);
        plane={root:el,projection:cardProjection(el)};draw(el,1);plane=undefined;ctx=parentContext;
        ctx.save();ctx.globalAlpha=alpha;compositePlane(ctx,el,surface);ctx.restore();return;
      }
      ctx.save();ctx.globalAlpha=opacity;
      if(el instanceof HTMLElement&&el.matches('.r-laser-card')){ctx.filter=getComputedStyle(el.parentElement!).filter;compositeFoil(ctx,el);ctx.restore();return;}
      const radiusAt=(value:string)=>{const [x,y=x]=value.split(/\s+/),size=(part:string,axis:number)=>Math.max(0,parseFloat(part)||0)*(part.endsWith('%')?axis/100:1);return {x:size(x,rect.width),y:size(y,rect.height)};};
      const corners=[style.borderTopLeftRadius,style.borderTopRightRadius,style.borderBottomRightRadius,style.borderBottomLeftRadius].map(radiusAt);
      if(style.overflow==='hidden'||style.overflow==='clip'||style.overflowY==='auto'){ctx.beginPath();ctx.roundRect(rect.x,rect.y,rect.width,rect.height,corners);ctx.clip();}
      if(style.backgroundColor!=='rgba(0, 0, 0, 0)'&&style.backgroundColor!=='transparent'){
        ctx.fillStyle=style.backgroundColor;
        if(el.matches('.r-accordion-panel')){const a=155*Math.PI/180,dx=Math.sin(a),dy=-Math.cos(a),length=Math.abs(rect.width*dx)+Math.abs(rect.height*dy),x=rect.x+rect.width/2,y=rect.y+rect.height/2,gradient=ctx.createLinearGradient(x-dx*length/2,y-dy*length/2,x+dx*length/2,y+dy*length/2);gradient.addColorStop(0,'#171923');gradient.addColorStop(.7,'#0d1017');gradient.addColorStop(1,'#0d1017');ctx.fillStyle=gradient;}
        ctx.beginPath();ctx.roundRect(rect.x,rect.y,rect.width,rect.height,corners);ctx.fill();
      }
      const boardAsset=!!el.closest('.board-game-layout')&&el.matches('.azul-factory,.azul-center,.sp-card,.sp-deck,.sp-noble,.ct-building');
      if(boardAsset&&style.backgroundImage!=='none'){
        ctx.save();ctx.beginPath();ctx.roundRect(rect.x,rect.y,rect.width,rect.height,corners);ctx.clip();paintBoardGameGradients(ctx,style.backgroundImage,rect);ctx.restore();
      }
      if(el.matches('.identity-card:not(:has(.identity-material))')){
        // Same foil palette, live highlight position and fine grain as the DOM surface.
        ctx.save();ctx.beginPath();ctx.roundRect(rect.x,rect.y,rect.width,rect.height,corners);ctx.clip();
        const base=ctx.createLinearGradient(rect.left,rect.top,rect.right,rect.bottom);
        base.addColorStop(0,'#2f344a');base.addColorStop(.48,'#10131b');base.addColorStop(1,'#272630');ctx.fillStyle=base;ctx.fillRect(rect.x,rect.y,rect.width,rect.height);
        const x=rect.left+parseFloat(style.getPropertyValue('--foil-x')||'65')/100*rect.width,y=rect.top+parseFloat(style.getPropertyValue('--foil-y')||'20')/100*rect.height;
        const glow=ctx.createRadialGradient(x,y,0,x,y,rect.width*.8);glow.addColorStop(0,'#d4d8ee30');glow.addColorStop(1,'#d4d8ee00');ctx.fillStyle=glow;ctx.fillRect(rect.x,rect.y,rect.width,rect.height);
        ctx.strokeStyle='#d4d6ea0b';ctx.lineWidth=1;
        for(let i=-rect.height;i<rect.width+rect.height;i+=4){ctx.beginPath();ctx.moveTo(rect.x+i,rect.y);ctx.lineTo(rect.x+i-rect.height*.47,rect.bottom);ctx.stroke();}
        ctx.restore();
      }
      const borders=(['Top','Right','Bottom','Left'] as const).map(side=>({side,width:parseFloat(style[`border${side}Width`])||0,color:style[`border${side}Color`],kind:style[`border${side}Style`]}));
      const border=borders[0],uniform=borders.every(b=>b.width===border.width&&b.color===border.color&&b.kind===border.kind);
      if(uniform&&border.width&&border.kind!=='none'){
        const half=border.width/2;ctx.strokeStyle=border.color;ctx.lineWidth=border.width;ctx.beginPath();
        ctx.roundRect(rect.x+half,rect.y+half,Math.max(0,rect.width-border.width),Math.max(0,rect.height-border.width),corners.map(r=>({x:Math.max(0,r.x-half),y:Math.max(0,r.y-half)})));ctx.stroke();
      }else if(!uniform){
        // Side-specific accents still clip to the same outer contour as their DOM box.
        ctx.save();ctx.beginPath();ctx.roundRect(rect.x,rect.y,rect.width,rect.height,corners);ctx.clip();
        for(const b of borders){if(!b.width||b.kind==='none')continue;ctx.fillStyle=b.color;if(b.side==='Top'||b.side==='Bottom')ctx.fillRect(rect.x,b.side==='Top'?rect.y:rect.bottom-b.width,rect.width,b.width);else ctx.fillRect(b.side==='Left'?rect.x:rect.right-b.width,rect.y,b.width,rect.height);}
        ctx.restore();
      }
      if(el.matches('.effects-preference .choice-group>button[aria-pressed="true"]')){ctx.fillStyle='#e7b7a288';ctx.fillRect(rect.left+12,rect.bottom-1,Math.max(0,rect.width-24),1);}
      if(el.closest('.board-game-layout')&&style.outlineStyle!=='none'&&parseFloat(style.outlineWidth)>0){
        const width=parseFloat(style.outlineWidth),offset=(parseFloat(style.outlineOffset)||0)+width/2;ctx.strokeStyle=style.outlineColor;ctx.lineWidth=width;ctx.beginPath();ctx.roundRect(rect.x-offset,rect.y-offset,rect.width+offset*2,rect.height+offset*2,corners);ctx.stroke();
      }
      if(el instanceof HTMLImageElement&&el.matches('.azul-tile')){
        if(el.complete&&el.naturalWidth){ctx.filter=style.filter==='none'?'none':style.filter;ctx.drawImage(el,rect.x,rect.y,rect.width,rect.height);ctx.filter='none';}
      }else if(el instanceof HTMLCanvasElement){
        if(el.width&&el.height){
          const sampleStarted=performance.now();
          ctx.filter=style.filter==='none'?'none':style.filter;if(style.mixBlendMode==='screen')ctx.globalCompositeOperation='screen';
          if(plane)ctx.drawImage(el,rect.x,rect.y,rect.width,rect.height);
          else{
            const left=Math.max(rect.left,box.left),top=Math.max(rect.top,box.top),width=Math.min(rect.right,box.right)-left,height=Math.min(rect.bottom,box.bottom)-top;
            if(width>0&&height>0)ctx.drawImage(el,(left-rect.left)/rect.width*el.width,(top-rect.top)/rect.height*el.height,width/rect.width*el.width,height/rect.height*el.height,left,top,width,height);
          }
          ctx.filter='none';
          if(import.meta.env.DEV)this.sampleMs+=performance.now()-sampleStarted;
        }
      }else if(el instanceof SVGSVGElement){
        const view=el.viewBox.baseVal;ctx.translate(rect.x,rect.y);ctx.scale(rect.width/(view.width||24),rect.height/(view.height||24));ctx.translate(-view.x,-view.y);ctx.strokeStyle=style.stroke==='none'?style.color:style.stroke;ctx.lineWidth=Number(el.getAttribute('stroke-width')??2);ctx.lineCap='round';ctx.lineJoin='round';
        for(const shape of el.children){let path:Path2D|undefined;const n=(name:string)=>Number(shape.getAttribute(name)??0);ctx.save();const transforms=(shape as SVGGraphicsElement).transform?.baseVal;if(transforms)for(let i=0;i<transforms.numberOfItems;i++){const m=transforms.getItem(i).matrix;ctx.transform(m.a,m.b,m.c,m.d,m.e,m.f);}if(shape.tagName==='ellipse'){path=new Path2D();path.ellipse(n('cx'),n('cy'),n('rx'),n('ry'),0,0,Math.PI*2);}else if(shape.tagName==='path')path=new Path2D(shape.getAttribute('d')??'');else if(shape.tagName==='line'){path=new Path2D();path.moveTo(n('x1'),n('y1'));path.lineTo(n('x2'),n('y2'));}else if(shape.tagName==='circle'){path=new Path2D();path.arc(n('cx'),n('cy'),n('r'),0,Math.PI*2);}else if(shape.tagName==='polyline'||shape.tagName==='polygon'){const points=(shape.getAttribute('points')??'').trim().split(/[ ,]+/).map(Number);path=new Path2D();for(let i=0;i<points.length;i+=2)i?path.lineTo(points[i],points[i+1]):path.moveTo(points[i],points[i+1]);if(shape.tagName==='polygon')path.closePath();}else if(shape.tagName==='rect'){path=new Path2D();path.roundRect(n('x'),n('y'),n('width'),n('height'),n('rx'));}if(path){if(el.matches('.sp-gem,.sp-card-scene')){const paint=getComputedStyle(shape);ctx.globalAlpha=opacity*Number(paint.opacity);if(paint.fill!=='none'){ctx.fillStyle=paint.fill;ctx.fill(path,paint.fillRule==='evenodd'?'evenodd':'nonzero');}if(paint.stroke!=='none'){ctx.strokeStyle=paint.stroke;ctx.lineWidth=parseFloat(paint.strokeWidth)||1;ctx.stroke(path);}}else ctx.stroke(path);}ctx.restore();}
      }else{
        const children=Array.from(el.childNodes).sort((a,b)=>{const z=(n:Node)=>n instanceof Element?Number.parseInt(getComputedStyle(n).zIndex)||0:0;return z(a)-z(b);});
        for(const child of children){
          if(child instanceof Element){draw(child,opacity);if(el.matches('.r-accordion-panel')&&child.matches('.r-accordion-media')){const overlay=ctx.createLinearGradient(0,rect.top+rect.height*.55,0,rect.bottom);overlay.addColorStop(0,'#080b1200');overlay.addColorStop(1,'#080b12d9');ctx.fillStyle=overlay;ctx.fillRect(rect.left,rect.top+rect.height*.55,rect.width,rect.height*.45);}continue;}
          if(child.nodeType!==Node.TEXT_NODE||!child.textContent?.trim())continue;
          const text=child.textContent;ctx.fillStyle=style.color;ctx.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;ctx.textBaseline='alphabetic';
          const size=parseFloat(style.fontSize),metrics=ctx.measureText('Mg'),descent=metrics.fontBoundingBoxDescent??size*.2;
          // Browser Range positions preserve wrapping, sticky offsets, kerning,
          // letter spacing and the current transform. Drawing a glyph at its own
          // measured rectangle avoids estimating line breaks or fixed positions.
          for(let i=0;i<text.length;){const code=text.codePointAt(i)!,length=code>0xffff?2:1;range.setStart(child,i);range.setEnd(child,i+length);let r=range.getBoundingClientRect();const char=text.slice(i,i+length);i+=length;if(!char.trim())continue;
            if(plane){const center=plane.projection.inverse(r.x+r.width/2,r.y+r.height/2),m=ctx.measureText(char),height=(m.fontBoundingBoxAscent??size*.8)+(m.fontBoundingBoxDescent??size*.2);r=new DOMRect(center.x-m.width/2,center.y-height/2,m.width,height);}
            for(const offset of el.matches('.nav-roll>span')?[0,rect.height]:[0]){const destination=new DOMRect(r.x,r.y+offset,r.width,r.height);if(plane||intersects(destination,box))ctx.fillText(style.textTransform==='uppercase'?char.toUpperCase():char,r.left,r.bottom+offset-descent);}}
        }
      }
      ctx.restore();
    };
    // The header is a topmost sticky stacking context, independent of document order.
    for(const el of document.querySelectorAll('.game-background,.app-content main,.app-content .site-footer,.app-content .site-header'))draw(el,1);
    return this.canvas;
  }
}
