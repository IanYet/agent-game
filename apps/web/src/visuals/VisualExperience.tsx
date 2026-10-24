import {useEffect,useRef} from 'react';
import {CanvasTexture,Mesh,OrthographicCamera,PlaneGeometry,Scene,ShaderMaterial,Vector2,Vector3,Vector4,WebGLRenderer,WebGLRenderTarget,LinearFilter,LinearMipmapLinearFilter,NoColorSpace} from 'three';
import {FXAAShader} from 'three/addons/shaders/FXAAShader.js';
import glassFragment from './glass-hero.glsl';
import titleFragment from './hero-title.glsl';
import resolveFragment from './hero-resolve.glsl';
import {GlassLightPaths} from './glass-optics';
import {GlassBeams} from './glass-beams';
import {LensCompositor} from './compositor';
import {useEffectsPreference} from './preferences';

const vertex='varying vec2 v_uv;void main(){v_uv=uv;gl_Position=vec4(position.xy,0.,1.);}';
// The stock FXAA threshold skips the deliberately dark YOUR MOVE outlines.
const antialiasFragment=FXAAShader.fragmentShader.replace('float _ContrastThreshold = 0.0312;','float _ContrastThreshold = 0.006;');
const lensFragment=String.raw`
varying vec2 v_uv;
uniform sampler2D u_page;
uniform vec2 u_pointer;
uniform vec4 u_gameRect;
void main(){
  vec2 screen=u_pointer+(v_uv-.5)*vec2(200.,-200.);
  if(screen.x>=u_gameRect.x&&screen.y>=u_gameRect.y&&screen.x<=u_gameRect.z&&screen.y<=u_gameRect.w)discard;
  vec2 p=(v_uv-.5)*2.;float r=length(p);if(r>=1.)discard;
  float dome=max(0.,1.-r*r);
  float bend=.46*pow(dome,1.25)+.055*smoothstep(.48,.82,r)*(1.-smoothstep(.82,1.,r));
  vec2 uv=.5+(v_uv-.5)*(1.-bend)*200./256.;
  float split=(.4+6.6*r*r*r)*smoothstep(.30,.83,r)/256.;
  vec2 chroma=normalize(p+vec2(.0001))*split;
  vec3 color=vec3(texture2D(u_page,uv+chroma).r,texture2D(u_page,uv).g,texture2D(u_page,uv-chroma).b);
  gl_FragColor=vec4(color,1.-smoothstep(.965,1.,r));
}`;
const clamp=(n:number)=>Math.min(1,Math.max(0,n));

export function VisualExperience({enabled,page}:{enabled:boolean;page:string}){
  const preference=useEffectsPreference();
  const lens=useRef<HTMLCanvasElement>(null),runtime=useRef({enabled,reduced:preference.reduced,lensEnabled:preference.lensEnabled});
  runtime.current={enabled,reduced:preference.reduced,lensEnabled:preference.lensEnabled};
  useEffect(()=>{
    let renderer:WebGLRenderer;
    // Fullscreen ray marching needs shader supersampling, not triangle-edge MSAA.
    try{renderer=new WebGLRenderer({alpha:true,antialias:false,powerPreference:'high-performance'});}catch{return;}
    renderer.setPixelRatio(1);renderer.setClearColor(0,0);renderer.setSize(1,1,false);renderer.setScissorTest(true);renderer.autoClear=false;
    const scene=new Scene(),camera=new OrthographicCamera(-1,1,1,-1,0,1),geometry=new PlaneGeometry(2,2),mesh=new Mesh(geometry);scene.add(mesh);
    const materials:ShaderMaterial[]=[],textures:CanvasTexture[]=[];
    const material=(fragmentShader:string,uniforms:Record<string,{value:unknown}>)=>{
      const m=new ShaderMaterial({vertexShader:vertex,fragmentShader,uniforms,depthTest:false,depthWrite:false,transparent:true});
      materials.push(m);return m;
    };
    const texture=(canvas:HTMLCanvasElement)=>{
      const t=new CanvasTexture(canvas);t.minFilter=LinearFilter;t.generateMipmaps=false;t.colorSpace=NoColorSpace;textures.push(t);return t;
    };
    const scenePlate=new WebGLRenderTarget(1,1,{minFilter:LinearMipmapLinearFilter,magFilter:LinearFilter,generateMipmaps:true,depthBuffer:false});
    scenePlate.texture.colorSpace=NoColorSpace;
    scenePlate.texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    const heroFrame=new WebGLRenderTarget(1,1,{minFilter:LinearFilter,magFilter:LinearFilter,depthBuffer:false});
    heroFrame.texture.colorSpace=NoColorSpace;
    const resolvedFrame=heroFrame.clone();
    const resolve=material(resolveFragment,{u_frame:{value:heroFrame.texture},u_scene:{value:scenePlate.texture},u_step:{value:new Vector2()}});
    resolve.premultipliedAlpha=true;
    // FXAA searches both sides of a contour and reconstructs subpixel coverage.
    // Render targets already contain premultiplied color; preserve it through FXAA.
    const smooth=material(antialiasFragment,{tDiffuse:{value:resolvedFrame.texture},resolution:{value:new Vector2()}});
    smooth.vertexShader=FXAAShader.vertexShader;smooth.premultipliedAlpha=true;
    const paths=new GlassLightPaths(),rotation=new Vector3(),artOffset=new Vector2(.37,.02);
    const glass=material(glassFragment,{u_scene:{value:scenePlate.texture},u_res:{value:new Vector2()},u_artOffset:{value:artOffset},u_rotation:{value:rotation}});
    const beams=new GlassBeams(rotation,artOffset);scene.add(beams.mesh);
    const glyph=document.createElement('canvas');glyph.width=4096;glyph.height=2048;const g=glyph.getContext('2d')!;g.scale(2,2);
    const glyphTexture=texture(glyph),paint=document.createElement('canvas');paint.width=256;paint.height=144;
    glyphTexture.minFilter=LinearMipmapLinearFilter;glyphTexture.generateMipmaps=true;
    glyphTexture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    const paintContext=paint.getContext('2d')!,paintTexture=texture(paint);
    const drawGlyph=()=>{g.clearRect(0,0,2048,1024);g.fillStyle='#fff';g.font='400 680px Anton';g.fillText('YOUR',70,485);g.fillText('MOVE.',160,1020);glyphTexture.needsUpdate=true;};drawGlyph();
    let alive=true;document.fonts.ready.then(()=>{if(alive){drawGlyph();heroDirty=true;schedule();}});
    const title=material(titleFragment,{u_glyph:{value:glyphTexture},u_paint:{value:paintTexture},u_res:{value:new Vector2()},u_time:{value:0},u_progress:{value:0}});
    const compositor=new LensCompositor(),pageTexture=texture(compositor.canvas);
    const lensMaterial=material(lensFragment,{u_page:{value:pageTexture},u_pointer:{value:new Vector2()},u_gameRect:{value:new Vector4(-2,-2,-1,-1)}});
    const dimensions=(canvas:HTMLCanvasElement)=>{
      const r=canvas.getBoundingClientRect();
      const ratio=Math.min(Math.max(1.5,devicePixelRatio||1),2,Math.sqrt(5e6/Math.max(1,r.width*r.height)),3072/Math.max(1,r.width),2048/Math.max(1,r.height));
      return {width:Math.max(1,Math.round(r.width*ratio)),height:Math.max(1,Math.round(r.height*ratio))};
    };
    const render=(m:ShaderMaterial,width:number,height:number,target:WebGLRenderTarget|null=null)=>{
      renderer.setRenderTarget(target);
      if(!target&&(renderer.domElement.width<width||renderer.domElement.height<height))renderer.setSize(Math.max(width,renderer.domElement.width),Math.max(height,renderer.domElement.height),false);
      renderer.setViewport(0,0,width,height);renderer.setScissor(0,0,width,height);
      if(m.uniforms.u_res)(m.uniforms.u_res.value as Vector2).set(width,height);
      mesh.material=m;renderer.clear();renderer.render(scene,camera);
    };
    const copy=(canvas:HTMLCanvasElement,width:number,height:number)=>{
      if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
      const c=canvas.getContext('2d')!;c.clearRect(0,0,width,height);
      c.drawImage(renderer.domElement,0,renderer.domElement.height-height,width,height,0,0,width,height);
    };
    const visible=(el:Element|null)=>{if(!el)return false;const r=el.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;};
    const pointer={x:-500,y:-500,targetX:-500,targetY:-500,inside:false,moved:false,dragging:false,lastX:0,lastY:0};
    const coarse=matchMedia('(pointer:coarse)'),drag=new Vector2();
    let reduced=runtime.current.reduced,frame=0,time=0,last=0,lost=false,lensDirty=true,heroDirty=true,heroRenderCount=0,visualMotionUntil=0,idleAngle=0;
    const schedule=()=>{if(!frame&&alive&&!document.hidden&&!lost)frame=requestAnimationFrame(tick);};
    const allowed=()=>runtime.current.lensEnabled&&runtime.current.enabled&&!pointer.dragging&&!coarse.matches&&!reduced&&pointer.inside&&!document.elementFromPoint(pointer.targetX,pointer.targetY)?.closest('input,textarea,[contenteditable="true"],.designed-select,[data-cursor-lens="off"]')&&!document.querySelector('.select-menu');
    const move=(e:PointerEvent)=>{
      pointer.targetX=e.clientX;pointer.targetY=e.clientY;pointer.inside=e.pointerType!=='touch';pointer.moved=true;lensDirty=true;
      if((e.target as Element).closest('.glass-art'))heroDirty=true;
      if(pointer.x<0){pointer.x=e.clientX;pointer.y=e.clientY;}
      if(pointer.dragging){drag.x+=(e.clientX-pointer.lastX)*.005;drag.y+=(e.clientY-pointer.lastY)*.004;pointer.lastX=e.clientX;pointer.lastY=e.clientY;}
      if(!reduced){
        const card=(e.target as Element).closest<HTMLElement>('.identity-card');
        if(card){const r=card.getBoundingClientRect();card.style.setProperty('--foil-x',((e.clientX-r.left)/r.width*100)+'%');card.style.setProperty('--foil-y',((e.clientY-r.top)/r.height*100)+'%');}
      }
      schedule();
    };
    const down=(e:PointerEvent)=>{
      if((e.target as Element).closest('.glass-art')){pointer.dragging=true;pointer.lastX=e.clientX;pointer.lastY=e.clientY;(e.target as HTMLElement).setPointerCapture?.(e.pointerId);schedule();}
    };
    const up=()=>{if(pointer.dragging){pointer.dragging=false;schedule();}};
    const leave=()=>{pointer.inside=false;up();if(lens.current)lens.current.style.opacity='0';};
    const key=(e:KeyboardEvent)=>{
      if(!(e.target as Element).matches('.glass-art'))return;
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
        e.preventDefault();if(e.key==='ArrowLeft'||e.key==='ArrowRight')drag.x+=e.key==='ArrowLeft'?-.15:.15;
        else drag.y+=e.key==='ArrowUp'?-.15:.15;
        heroDirty=true;schedule();
      }
    };
    const wake=()=>{reduced=runtime.current.reduced;lensDirty=true;heroDirty=true;if(lens.current)lens.current.style.opacity='0';schedule();};
    const invalidate=()=>{lensDirty=true;schedule();};
    const transition=(event:Event)=>{if((event.target as Element).closest?.('.tz-gallery-scope')){visualMotionUntil=performance.now()+1300;invalidate();}};
    const tick=(now:number)=>{
      frame=0;if(!alive||lost||document.hidden)return;
      if(now-last<33){schedule();return;}
      const dt=Math.min((now-last)/1000,.06);last=now;
      if(!runtime.current.enabled){if(lens.current)lens.current.style.opacity='0';return;}
      const hero=document.querySelector<HTMLCanvasElement>('[data-visual="hero"]'),section=document.querySelector<HTMLElement>('.resonance-hero');
      let animated=now<visualMotionUntil;
      if(hero&&section&&visible(hero)){
        const r=hero.getBoundingClientRect(),sectionRect=section.getBoundingClientRect();
        const progress=reduced?0:clamp((section.offsetTop-sectionRect.top)/(section.offsetHeight*.84));
        const fraction=Math.max(0,Math.min(r.bottom,innerHeight)-Math.max(r.top,0))/Math.max(1,r.height);
        const heroMotion=!reduced&&fraction>.35&&!document.querySelector('[data-gallery-active="true"]');
        if(heroDirty||heroMotion){
        const renderStarted=performance.now();
        if(heroMotion){
          time+=dt;
          idleAngle+=.075*dt;
        }
        rotation.set(-.34+drag.y-progress*.12,.80+idleAngle+progress*.15,.27+drag.x);
        artOffset.set(.37+progress*.16,.02-progress*.09);
        paths.update(rotation);
        title.uniforms.u_time.value=time;title.uniforms.u_progress.value=progress;
        if(!reduced){
          paintContext.globalCompositeOperation='destination-out';paintContext.fillStyle='rgba(0,0,0,.055)';paintContext.fillRect(0,0,256,144);
          if(pointer.moved&&pointer.targetY>r.top&&pointer.targetY<r.bottom){
            const x=(pointer.targetX-r.left)/r.width*256,y=(pointer.targetY-r.top)/r.height*144,gradient=paintContext.createRadialGradient(x,y,0,x,y,28);
            gradient.addColorStop(0,'hsla('+((x+y)%360)+',85%,72%,.55)');gradient.addColorStop(1,'transparent');
            paintContext.globalCompositeOperation='source-over';paintContext.fillStyle=gradient;paintContext.fillRect(x-30,y-30,60,60);
          }
        }
        paintTexture.needsUpdate=true;
        const {width,height}=dimensions(hero);
        if(scenePlate.width!==width||scenePlate.height!==height)scenePlate.setSize(width,height);
        if(heroFrame.width!==width||heroFrame.height!==height)heroFrame.setSize(width,height);
        if(resolvedFrame.width!==width||resolvedFrame.height!==height)resolvedFrame.setSize(width,height);
        render(title,width,height,scenePlate);
        // Three generates the scene plate mip chain at the end of this render.
        render(glass,width,height,heroFrame);
        beams.update(paths,artOffset,width,height);mesh.visible=false;beams.mesh.visible=true;renderer.render(scene,camera);beams.mesh.visible=false;mesh.visible=true;
        // A small CSS-sized neighbourhood, independent of render pixel ratio.
        (resolve.uniforms.u_step.value as Vector2).set(1.5/r.width,1.5/r.height);
        render(resolve,width,height,resolvedFrame);
        (smooth.uniforms.resolution.value as Vector2).set(1/width,1/height);
        render(smooth,width,height);copy(hero,width,height);
        if(import.meta.env.DEV){hero.dataset.renderMs=(performance.now()-renderStarted).toFixed(1);hero.dataset.renderCount=String(++heroRenderCount);}
        if(!section.classList.contains('gpu-ready'))section.classList.add('gpu-ready');
        const scroll=progress.toFixed(4);if(section.style.getPropertyValue('--hero-scroll')!==scroll)section.style.setProperty('--hero-scroll',scroll);
        heroDirty=false;
        }
        animated=animated||heroMotion;
      }
      if(lens.current&&allowed()&&(lensDirty||animated||Math.hypot(pointer.targetX-pointer.x,pointer.targetY-pointer.y)>.15)){
        pointer.x+=(pointer.targetX-pointer.x)*.42;pointer.y+=(pointer.targetY-pointer.y)*.42;
        compositor.paint(pointer.x,pointer.y);pageTexture.needsUpdate=true;
        (lensMaterial.uniforms.u_pointer.value as Vector2).set(pointer.x,pointer.y);
        const blocked=document.querySelector<HTMLElement>('[data-player-surface]')?.getBoundingClientRect();
        (lensMaterial.uniforms.u_gameRect.value as Vector4).set(blocked?.left??-2,blocked?.top??-2,blocked?.right??-1,blocked?.bottom??-1);
        lens.current.style.transform='translate3d('+(pointer.x-100)+'px,'+(pointer.y-100)+'px,0)';
        lens.current.style.opacity='1';render(lensMaterial,256,256);copy(lens.current,256,256);lensDirty=false;
        animated=animated||Math.hypot(pointer.targetX-pointer.x,pointer.targetY-pointer.y)>.15;
      }else if(lens.current&&!allowed())lens.current.style.opacity='0';
      pointer.moved=false;if(!reduced&&animated)schedule();
    };
    const reset=()=>document.querySelectorAll('.gpu-ready').forEach(el=>el.classList.remove('gpu-ready'));
    const lose=(e:Event)=>{e.preventDefault();lost=true;cancelAnimationFrame(frame);frame=0;reset();if(lens.current)lens.current.style.opacity='0';};
    renderer.domElement.addEventListener('webglcontextlost',lose);
    const events:Array<[EventTarget,string,EventListener,AddEventListenerOptions?]>=[
      [window,'pointermove',move as EventListener,{passive:true}],[window,'pointerdown',down as EventListener],[window,'pointerup',up],[window,'pointercancel',up],
      [document.documentElement,'pointerleave',leave],[window,'blur',leave],[window,'scroll',wake,{passive:true,capture:true}],[window,'click',wake],[window,'focusin',wake],
      [window,'keyup',wake],[window,'resize',wake],[window,'tongzhuo:visual-frame',invalidate],[document,'visibilitychange',wake],[document,'keydown',key as EventListener],[document,'transitionrun',transition,{capture:true}]
    ];
    events.forEach(([target,name,handler,options])=>target.addEventListener(name,handler,options));
    const mutations=new MutationObserver(invalidate);
    const content=document.querySelector('.app-content');if(content)mutations.observe(content,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['style','class']});
    schedule();
    return()=>{
      alive=false;reset();cancelAnimationFrame(frame);mutations.disconnect();
      events.forEach(([target,name,handler,options])=>target.removeEventListener(name,handler,options));
      renderer.domElement.removeEventListener('webglcontextlost',lose);materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
      scenePlate.dispose();heroFrame.dispose();resolvedFrame.dispose();beams.dispose();geometry.dispose();renderer.dispose();renderer.forceContextLoss();
    };
  },[page]);
  useEffect(()=>{window.dispatchEvent(new Event('resize'));},[enabled,preference.mode,preference.reduced,preference.lensEnabled]);
  return <canvas ref={lens} className="cursor-lens" hidden={!preference.lensEnabled||preference.reduced} aria-hidden="true" data-lens-ignore/>;
}
