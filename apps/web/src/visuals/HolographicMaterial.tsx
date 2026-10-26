import {useEffect,useRef} from 'react';
import {useEffectsPreference} from './preferences';
import {HOLOGRAPHIC_FRAGMENT,HOLOGRAPHIC_VERTEX} from './holographic.glsl';
import {createCardEngraving,type HolographicPattern,type EngravingBitmap} from './holographic-engraving';
import {cardPerspective,cardTilt} from './card-tilt';
import {cardProjection} from './card-projection';
import type {SvgIconName} from './svg-icons';

type Light={x:number;y:number};
type Motion=Light&{tiltX:number;tiltY:number};
type InkLight={node:HTMLElement|SVGElement;x:number;y:number;level:number};
type MaterialOptions={glowColor:`#${string}`;rainbow:boolean;pattern:HolographicPattern;patternSymbol:SvgIconName;restingLight:readonly [number,number];tilt:boolean};
type Entry=Omit<MaterialOptions,'restingLight'>&{canvas:HTMLCanvasElement;root:HTMLElement;ctx:CanvasRenderingContext2D;halo:[number,number,number];rest:Light;current:Motion;target:Motion;ink:InkLight[];geometryDirty:boolean;reduced:boolean;visible:boolean;dirty:boolean};
let shared:HolographicRenderer|undefined;

// All market, inventory and replay cards share one GPU context. Resting cards
// keep their last frame; only a moving reflection schedules more frames.
class HolographicRenderer{
  private source=document.createElement('canvas');
  private fallback=document.createElement('canvas');
  private gl=this.source.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false});
  private program:WebGLProgram|null=null;
  private uniforms:Record<string,WebGLUniformLocation|null>={};
  private entries=new Map<HTMLCanvasElement,Entry>();
  private engravings=new Map<string,{bitmap:EngravingBitmap;texture:WebGLTexture|null}>();
  private raf=0;
  private last=0;
  private lost=false;
  private intersection=new IntersectionObserver(changes=>{
    for(const change of changes){const entry=this.entries.get(change.target as HTMLCanvasElement);if(entry){entry.visible=change.isIntersecting;entry.dirty=true;}}
    this.wake();
  });
  private resize=new ResizeObserver(changes=>{
    for(const change of changes){const entry=this.entries.get(change.target as HTMLCanvasElement);if(entry){entry.dirty=true;entry.geometryDirty=true;}}
    this.wake();
  });

  constructor(){
    this.setup();
    this.source.addEventListener('webglcontextlost',this.onLost);
    this.source.addEventListener('webglcontextrestored',this.onRestored);
    document.addEventListener('visibilitychange',this.wake);
  }
  private setup(){
    const gl=this.gl;if(!gl)return;
    const program=gl.createProgram();if(!program)return;
    const shaders:[number,string][]=[[gl.VERTEX_SHADER,HOLOGRAPHIC_VERTEX],[gl.FRAGMENT_SHADER,HOLOGRAPHIC_FRAGMENT]];
    for(const [type,source] of shaders){
      const shader=gl.createShader(type);if(!shader){gl.deleteProgram(program);return;}
      gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){
        if(import.meta.env.DEV)console.warn('镭射卡材质编译失败',gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);gl.deleteProgram(program);return;
      }
      gl.attachShader(program,shader);gl.deleteShader(shader);
    }
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)){gl.deleteProgram(program);return;}
    this.program=program;
    this.uniforms=Object.fromEntries(['uResolution','uCssSize','uPointer','uHaloColor','uRainbow','uPattern','uEngraving'].map(name=>[name,gl.getUniformLocation(program,name)]));
  }
  private onLost=(event:Event)=>{event.preventDefault();this.lost=true;this.program=null;for(const entry of this.entries.values())entry.dirty=true;this.wake();};
  private onRestored=()=>{this.lost=false;this.setup();for(const engraving of this.engravings.values())engraving.texture=null;for(const entry of this.entries.values())entry.dirty=true;this.wake();};
  private wake=()=>{if(!this.raf&&!document.hidden){this.last=performance.now();this.raf=requestAnimationFrame(this.tick);}};
  private tick=(now:number)=>{
    this.raf=0;if(document.hidden)return;
    const blend=1-Math.exp(-10*Math.min((now-this.last)/1000,.05));this.last=now;
    let moving=false,painted=false;
    for(const entry of this.entries.values()){
      if(!entry.visible||entry.root.closest('[inert]'))continue;
      let changed=false,unsettled=false;
      for(const key of ['x','y','tiltX','tiltY'] as const){
        const delta=entry.target[key]-entry.current[key];
        if(delta===0)continue;
        entry.current[key]=entry.reduced||Math.abs(delta)<.001?entry.target[key]:entry.current[key]+delta*blend;
        changed=true;unsettled=unsettled||entry.current[key]!==entry.target[key];
      }
      if(entry.dirty||changed){this.paint(entry);entry.dirty=false;painted=true;}
      moving=moving||unsettled;
    }
    if(painted)window.dispatchEvent(new Event('tongzhuo:visual-frame'));
    if(moving)this.raf=requestAnimationFrame(this.tick);
  };
  private engraving(entry:Entry,width:number,height:number,dpr:number){
    const key=`${entry.pattern}:${entry.patternSymbol}:${entry.glowColor}:${width}:${height}:${dpr}`;
    let result=this.engravings.get(key);
    if(!result){
      const bitmap=createCardEngraving(entry.pattern,width/dpr,height/dpr,dpr,entry.patternSymbol);
      const ctx=bitmap.mark.getContext('2d')!;ctx.setTransform(1,0,0,1,0,0);ctx.globalCompositeOperation='source-in';
      ctx.fillStyle=entry.glowColor;ctx.fillRect(0,0,width,height);
      result={bitmap,texture:null};this.engravings.set(key,result);
    }
    const gl=this.gl;
    if(gl&&this.program&&!this.lost&&!result.texture){
      result.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,result.texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,result.bitmap.pixels);
    }
    return result;
  }
  private lightInk(entry:Entry,width:number,height:number){
    if(entry.geometryDirty){
      const projection=cardProjection(entry.root);
      entry.ink=Array.from(entry.root.querySelectorAll<HTMLElement|SVGElement>('[data-holographic-ink]')).map(node=>{
        const rect=node.getBoundingClientRect(),point=projection.inverse(rect.left+rect.width/2,rect.top+rect.height/2);
        const u=(point.x-entry.root.clientLeft)/width,v=(point.y-entry.root.clientTop)/height;
        return {node,x:(u-.5)*1.28,y:(v-.5)*1.28*height/width,level:-1};
      });
      entry.geometryDirty=false;
    }
    const lightX=entry.current.x*.64,lightY=entry.current.y*.64*height/width,lightScale=Math.max(.4,Math.min(1,width/112));
    for(const ink of entry.ink){
      const dx=ink.x-lightX,dy=ink.y-lightY;
      const sweep=dx*.72+dy*.52+Math.sin(ink.y*4+ink.x*3)*.08;
      const spotlight=Math.exp(-((dx*1.05)**2+(dy*.72)**2)*2.6/(lightScale*lightScale)),band=Math.exp(-((sweep/(.36*lightScale))**2));
      const intensity=Math.max(0,Math.min(1,(spotlight*band-.06)/.64));
      const level=Math.round(intensity*intensity*(3-2*intensity)*1000)/1000;
      if(level!==ink.level){ink.node.style.setProperty('--holographic-ink-light',String(level));ink.level=level;}
    }
  }
  private tilt(entry:Entry){
    const {root,current}=entry;
    let transform='none';
    if(entry.tilt&&!entry.reduced&&(current.tiltX||current.tiltY)){
      const width=root.offsetWidth,height=root.offsetHeight,angle=cardTilt((current.tiltX+1)/2,(current.tiltY+1)/2,width,height);
      // Keep small cards readable while retaining the shared 20px edge limit.
      const strength=Math.min(1,10/Math.max(.001,Math.abs(angle.rx),Math.abs(angle.ry)));
      transform=`perspective(${cardPerspective(width,height)}px) rotateX(${angle.rx*strength}deg) rotateY(${angle.ry*strength}deg)`;
    }
    if(root.style.transform!==transform)root.style.transform=transform;
  }
  private paint(entry:Entry){
    const {canvas,ctx,current}=entry,dpr=Math.min(window.devicePixelRatio||1,2);
    if(!canvas.clientWidth||!canvas.clientHeight)return;
    const width=Math.max(1,Math.round(canvas.clientWidth*dpr)),height=Math.max(1,Math.round(canvas.clientHeight*dpr));
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    this.tilt(entry);this.lightInk(entry,width/dpr,height/dpr);
    const gl=this.gl,engraving=this.engraving(entry,width,height,dpr);
    if(gl&&this.program&&!this.lost&&engraving.texture){
      if(this.source.width!==width||this.source.height!==height){this.source.width=width;this.source.height=height;}
      gl.viewport(0,0,width,height);gl.useProgram(this.program);
      gl.uniform2f(this.uniforms.uResolution,width,height);gl.uniform2f(this.uniforms.uCssSize,width/dpr,height/dpr);
      gl.uniform2f(this.uniforms.uPointer,current.x,current.y);
      gl.uniform3fv(this.uniforms.uHaloColor,entry.halo);gl.uniform1f(this.uniforms.uRainbow,entry.rainbow?1:0);
      gl.uniform1i(this.uniforms.uPattern,{contours:0,crowns:1,rings:2,symbols:3}[entry.pattern]);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,engraving.texture);gl.uniform1i(this.uniforms.uEngraving,0);
      gl.drawArrays(gl.TRIANGLES,0,3);ctx.drawImage(this.source,0,0);
    }else{
      ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;ctx.fillStyle='#111318';ctx.fillRect(0,0,width,height);
      const lightX=(current.x+1)*width/2,lightY=(current.y+1)*height/2,lightScale=Math.max(.4,Math.min(1,width/dpr/112));
      const light=ctx.createRadialGradient(lightX,lightY,0,lightX,lightY,Math.max(width,height)*.7*lightScale);
      light.addColorStop(0,`rgba(${entry.halo.map(value=>Math.round(value*255)).join(',')},.24)`);light.addColorStop(1,'#11131800');
      ctx.fillStyle=light;ctx.fillRect(0,0,width,height);
      if(this.fallback.width!==width||this.fallback.height!==height){this.fallback.width=width;this.fallback.height=height;}
      const film=this.fallback.getContext('2d')!;film.setTransform(1,0,0,1,0,0);film.globalCompositeOperation='source-over';film.clearRect(0,0,width,height);
      film.drawImage(engraving.bitmap.mark,0,0);
      film.save();film.scale(dpr,dpr);film.strokeStyle=entry.glowColor;film.lineWidth=.55;film.globalAlpha=.65;
      if(entry.rainbow){
        const spectrum=film.createLinearGradient(0,0,width/dpr,height/dpr);spectrum.addColorStop(0,'#e6c4ed');spectrum.addColorStop(.5,'#b1e4eb');spectrum.addColorStop(1,'#ede0bc');film.strokeStyle=spectrum;
      }
      if(entry.pattern==='rings')for(let radius=2;radius<(width+height)/dpr;radius+=2){film.beginPath();film.arc(width/dpr*.5,height/dpr*.5,radius,0,Math.PI*2);film.stroke();}
      if(entry.pattern==='contours')for(let radius=7;radius<(width+height)/dpr;radius+=7){
        film.beginPath();for(let step=0;step<=96;step++){
          const angle=step*Math.PI/48,r=radius+Math.sin(angle*3+radius*.08)*2.5;
          const x=width/dpr*.56+Math.cos(angle)*r,y=height/dpr*.45+Math.sin(angle)*r*1.16;
          if(step)film.lineTo(x,y);else film.moveTo(x,y);
        }film.stroke();
      }film.restore();
      const spot=film.createRadialGradient(lightX,lightY,0,lightX,lightY,Math.max(width,height)*.65*lightScale);spot.addColorStop(0,'#fff');spot.addColorStop(1,'#fff0');
      film.globalCompositeOperation='destination-in';film.fillStyle=spot;film.fillRect(0,0,width,height);
      ctx.globalCompositeOperation='screen';ctx.globalAlpha=.7;ctx.drawImage(this.fallback,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    }
  }
  attach(canvas:HTMLCanvasElement,root:HTMLElement,options:MaterialOptions,reduced:boolean){
    const ctx=canvas.getContext('2d');if(!ctx)return()=>{};
    const {glowColor,rainbow,pattern,patternSymbol,restingLight,tilt}=options,hex=parseInt(glowColor.slice(1),16),host=root.parentElement??root;
    const rest:Light={x:Math.max(0,Math.min(1,restingLight[0]))*2-1,y:Math.max(0,Math.min(1,restingLight[1]))*2-1};
    const entry:Entry={canvas,root,ctx,glowColor,rainbow,pattern,patternSymbol,tilt,halo:[(hex>>16&255)/255,(hex>>8&255)/255,(hex&255)/255],rest,current:{...rest,tiltX:0,tiltY:0},target:{...rest,tiltX:0,tiltY:0},ink:[],geometryDirty:true,reduced,visible:false,dirty:true};
    let pointed=false,focused=false;
    const move=(event:PointerEvent)=>{
      if(reduced||event.pointerType==='touch')return;
      const rect=host.getBoundingClientRect();pointed=true;
      entry.target.x=Math.max(-1,Math.min(1,(event.clientX-rect.left)/Math.max(1,rect.width)*2-1));
      entry.target.y=Math.max(-1,Math.min(1,(event.clientY-rect.top)/Math.max(1,rect.height)*2-1));
      entry.target.tiltX=tilt?entry.target.x:0;entry.target.tiltY=tilt?entry.target.y:0;this.wake();
    };
    const leave=()=>{pointed=false;Object.assign(entry.target,focused?{x:0,y:0}:entry.rest,{tiltX:0,tiltY:0});this.wake();};
    const up=(event:PointerEvent)=>{if(event.pointerType!=='mouse')leave();};
    const focus=()=>{focused=host.matches(':focus-visible');if(focused&&!pointed&&!reduced)Object.assign(entry.target,{x:0,y:0,tiltX:0,tiltY:0});this.wake();};
    const blur=()=>{focused=false;if(!pointed)Object.assign(entry.target,entry.rest,{tiltX:0,tiltY:0});this.wake();};
    const content=new MutationObserver(()=>{entry.geometryDirty=true;entry.dirty=true;this.wake();});
    content.observe(root,{childList:true,subtree:true,characterData:true});
    host.addEventListener('pointerenter',move);host.addEventListener('pointermove',move);host.addEventListener('pointerdown',move);
    host.addEventListener('pointerleave',leave);host.addEventListener('pointercancel',leave);host.addEventListener('pointerup',up);
    host.addEventListener('focus',focus);host.addEventListener('blur',blur);
    this.entries.set(canvas,entry);this.intersection.observe(canvas);this.resize.observe(canvas);this.wake();
    return()=>{
      host.removeEventListener('pointerenter',move);host.removeEventListener('pointermove',move);host.removeEventListener('pointerdown',move);
      host.removeEventListener('pointerleave',leave);host.removeEventListener('pointercancel',leave);host.removeEventListener('pointerup',up);
      host.removeEventListener('focus',focus);host.removeEventListener('blur',blur);root.style.removeProperty('transform');
      content.disconnect();
      for(const ink of entry.ink)ink.node.style.removeProperty('--holographic-ink-light');
      this.intersection.unobserve(canvas);this.resize.unobserve(canvas);this.entries.delete(canvas);
      if(!this.entries.size){
        cancelAnimationFrame(this.raf);this.intersection.disconnect();this.resize.disconnect();document.removeEventListener('visibilitychange',this.wake);
        this.source.removeEventListener('webglcontextlost',this.onLost);this.source.removeEventListener('webglcontextrestored',this.onRestored);
        for(const engraving of this.engravings.values())if(engraving.texture)this.gl?.deleteTexture(engraving.texture);this.engravings.clear();
        if(this.program)this.gl?.deleteProgram(this.program);this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
        if(shared===this)shared=undefined;
      }
    };
  }
}

export function HolographicMaterial({glowColor,rainbow,pattern,patternSymbol,restingLight:[restX,restY],tilt}:MaterialOptions){
  const canvas=useRef<HTMLCanvasElement>(null),{reduced}=useEffectsPreference();
  useEffect(()=>{
    const source=canvas.current,root=source?.parentElement;if(!source||!root)return;
    shared??=new HolographicRenderer();return shared.attach(source,root,{glowColor,rainbow,pattern,patternSymbol,restingLight:[restX,restY],tilt},reduced);
  },[glowColor,rainbow,pattern,patternSymbol,restX,restY,tilt,reduced]);
  return <canvas ref={canvas} className="holographic-card-material" aria-hidden="true"/>;
}
