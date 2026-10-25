type SvgLayers={face:HTMLCanvasElement;group:HTMLCanvasElement};
const layers=new WeakMap<SVGSVGElement,SvgLayers>();
const paths=new WeakMap<SVGGraphicsElement,{key:string;path:Path2D}>();

function shapePath(shape:SVGGraphicsElement){
  const names=({polygon:['points'],polyline:['points'],circle:['cx','cy','r'],ellipse:['cx','cy','rx','ry'],rect:['x','y','width','height','rx'],line:['x1','y1','x2','y2'],path:['d']} as Record<string,string[]>)[shape.localName]??[];
  if(!names.length)return;
  const values=names.map(name=>shape.getAttribute(name)??'0'),key=shape.localName+':'+values.join('|'),cached=paths.get(shape);
  if(cached?.key===key)return cached.path;
  const path=shape.localName==='path'?new Path2D(values[0]):new Path2D();
  if(shape.localName==='circle')path.arc(Number(values[0]),Number(values[1]),Number(values[2]),0,Math.PI*2);
  if(shape.localName==='ellipse')path.ellipse(Number(values[0]),Number(values[1]),Number(values[2]),Number(values[3]),0,0,Math.PI*2);
  if(shape.localName==='rect')path.roundRect(Number(values[0]),Number(values[1]),Number(values[2]),Number(values[3]),Number(values[4]));
  if(shape.localName==='line'){path.moveTo(Number(values[0]),Number(values[1]));path.lineTo(Number(values[2]),Number(values[3]));}
  if(shape.localName==='polygon'||shape.localName==='polyline'){
    const points=values[0].trim().split(/[\s,]+/).map(Number);
    for(let i=0;i<points.length;i+=2)if(i)path.lineTo(points[i],points[i+1]);else path.moveTo(points[i],points[i+1]);
    if(shape.localName==='polygon')path.closePath();
  }
  paths.set(shape,{key,path});return path;
}

function svgPaint(ctx:CanvasRenderingContext2D,svg:SVGSVGElement,shape:SVGGraphicsElement,value:string){
  if(value==='none')return;
  if(value==='currentColor')return getComputedStyle(shape).color;
  if(!value.startsWith('url('))return value;
  const id=value.match(/#([^"')]+)/)?.[1];if(!id)return;
  const gradient=Array.from(svg.querySelectorAll<SVGLinearGradientElement>('linearGradient')).find(node=>node.id===decodeURIComponent(id));
  if(!gradient)return;
  const bounds=shape.getBBox(),view=svg.viewBox.baseVal,absolute=gradient.getAttribute('gradientUnits')==='userSpaceOnUse';
  const coordinate=(name:string,start:number,length:number,fallback:string)=>{
    const raw=gradient.getAttribute(name)??fallback,n=Number.parseFloat(raw);
    if(absolute)return raw.endsWith('%')?start+n/100*length:n;
    return start+(raw.endsWith('%')?n/100:n)*length;
  };
  const box=absolute?view:bounds;
  const paint=ctx.createLinearGradient(coordinate('x1',box.x,box.width,'0'),coordinate('y1',box.y,box.height,'0'),coordinate('x2',box.x,box.width,absolute?String(view.width):'1'),coordinate('y2',box.y,box.height,'0'));
  for(const stop of gradient.querySelectorAll<SVGStopElement>('stop')){
    const style=getComputedStyle(stop),raw=stop.getAttribute('offset')??'0',offset=Number.parseFloat(raw)/(raw.endsWith('%')?100:1);
    const opacity=Number.parseFloat(style.stopOpacity),rgb=style.stopColor.match(/[\d.]+/g);
    const color=opacity<1&&rgb?`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Number(rgb[3]??1)*opacity})`:style.stopColor;
    paint.addColorStop(Math.max(0,Math.min(1,offset)),color);
  }
  return paint;
}

function paintNode(ctx:CanvasRenderingContext2D,svg:SVGSVGElement,element:Element,alpha=1,ignoreOpacity=false){
  if(!(element instanceof SVGGraphicsElement))return;
  const style=getComputedStyle(element),opacity=alpha*(ignoreOpacity?1:Number(style.opacity));
  if(style.display==='none'||style.visibility==='hidden'||opacity<.001)return;
  ctx.save();
  const transforms=element.transform.baseVal;
  for(let i=0;i<transforms.numberOfItems;i++){const m=transforms.getItem(i).matrix;ctx.transform(m.a,m.b,m.c,m.d,m.e,m.f);}
  if(element.localName==='g')for(const child of element.children)paintNode(ctx,svg,child,opacity);
  else{
    const path=shapePath(element);
    if(path){
      const fill=svgPaint(ctx,svg,element,style.fill),stroke=svgPaint(ctx,svg,element,style.stroke);
      if(fill){ctx.globalAlpha=opacity*Number(style.fillOpacity);ctx.fillStyle=fill;ctx.fill(path,style.fillRule==='evenodd'?'evenodd':'nonzero');}
      if(stroke){ctx.globalAlpha=opacity*Number(style.strokeOpacity);ctx.strokeStyle=stroke;ctx.lineWidth=Number.parseFloat(style.strokeWidth)||1;ctx.lineCap=style.strokeLinecap as CanvasLineCap;ctx.lineJoin=style.strokeLinejoin as CanvasLineJoin;ctx.stroke(path);}
    }
  }
  ctx.restore();
}

// Read the live SVG layers, including CSS-controlled lighting, rather than
// retaining a raster snapshot that could go stale as the pointer moves.
export function paintSvgInLens(target:CanvasRenderingContext2D,svg:SVGSVGElement,rect:DOMRect){
  let surfaces=layers.get(svg);
  if(!surfaces){surfaces={face:document.createElement('canvas'),group:document.createElement('canvas')};layers.set(svg,surfaces);}
  const view=svg.viewBox.baseVal,scale=2,width=Math.max(1,view.width||100),height=Math.max(1,view.height||100);
  const prepare=(canvas:HTMLCanvasElement)=>{
    if(canvas.width!==Math.ceil(width*scale)||canvas.height!==Math.ceil(height*scale)){canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);}
    const ctx=canvas.getContext('2d')!;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.setTransform(scale,0,0,scale,-view.x*scale,-view.y*scale);return ctx;
  };
  const face=prepare(surfaces.face);
  for(const child of svg.children){
    if(child instanceof SVGGraphicsElement&&Number(getComputedStyle(child).opacity)<1){
      const opacity=Number(getComputedStyle(child).opacity);if(opacity<.001)continue;
      const group=prepare(surfaces.group);paintNode(group,svg,child,1,true);
      // Apply group opacity once, so overlapping facets keep the DOM's color.
      face.save();face.setTransform(1,0,0,1,0,0);face.globalAlpha=opacity;face.drawImage(surfaces.group,0,0);face.restore();
    }else paintNode(face,svg,child);
  }
  target.drawImage(surfaces.face,rect.x,rect.y,rect.width,rect.height);
}
