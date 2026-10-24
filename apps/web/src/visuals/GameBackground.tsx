import {useEffect,useRef} from 'react';
import {useEffectsPreference} from './preferences';
import type {TableTheme} from './table-models';
import type {TablePhysics} from './table-physics';

export function GameBackground({enabled,theme}:{enabled:boolean;theme:TableTheme}){
  const effects=useEffectsPreference();
  const canvas=useRef<HTMLCanvasElement>(null),runtime=useRef({enabled,reduced:effects.reduced});
  runtime.current={enabled,reduced:effects.reduced};
  useEffect(()=>{
    const target=canvas.current;if(!target)return;
    let alive=true,scene:TablePhysics|undefined,frame=0,last=0,lost=false;
    const stop=()=>{cancelAnimationFrame(frame);frame=0;last=0;scene?.clearPointer();};
    const schedule=()=>{if(alive&&!frame&&!lost&&!document.hidden&&runtime.current.enabled&&!runtime.current.reduced)frame=requestAnimationFrame(tick);};
    const tick=(now:number)=>{
      frame=0;if(!scene||!alive||lost||document.hidden||!runtime.current.enabled||runtime.current.reduced)return;
      if(now-last>=1000/30){scene.step(last?(now-last)/1000:1/30);last=now;}
      schedule();
    };
    const wake=()=>{stop();schedule();};
    const resize=()=>{scene?.resize();wake();};
    const move=(event:PointerEvent)=>{
      const element=event.target;
      if(!runtime.current.enabled||runtime.current.reduced||event.pointerType==='touch'||!(element instanceof Element)||
        !element.closest('.game-page')||element.closest('button,a,input,textarea,select,[role="dialog"],.identity-shell,.game-chrome,.table-toolbar')){
        scene?.clearPointer();return;
      }
      scene?.movePointer(event.clientX,event.clientY);
    };
    const leave=()=>scene?.clearPointer();
    const lose=(event:Event)=>{event.preventDefault();lost=true;stop();delete target.dataset.gpuReady;};
    const restore=()=>{
      try{scene?.restore();lost=false;target.dataset.gpuReady='true';wake();}
      catch{lost=true;stop();delete target.dataset.gpuReady;}
    };
    const observer=new ResizeObserver(resize);observer.observe(target);
    const events:Array<[EventTarget,string,EventListener]>=[
      [window,'pointermove',move as EventListener],[document.documentElement,'pointerleave',leave],[window,'blur',leave],
      [window,'tongzhuo:table-motion',wake],[document,'visibilitychange',wake],
    ];
    events.forEach(([el,name,handler])=>el.addEventListener(name,handler,{passive:true}));
    void import('./table-physics').then(({TablePhysics})=>{
      if(!alive)return;
      try{
        scene=new TablePhysics(target,theme);target.dataset.gpuReady='true';
        scene.source.addEventListener('webglcontextlost',lose);scene.source.addEventListener('webglcontextrestored',restore);schedule();
      }catch{scene?.dispose();scene=undefined;delete target.dataset.gpuReady;}
    }).catch(()=>{/* The still suit field remains available if the module cannot load. */});
    return()=>{
      alive=false;stop();observer.disconnect();events.forEach(([el,name,handler])=>el.removeEventListener(name,handler));
      scene?.source.removeEventListener('webglcontextlost',lose);scene?.source.removeEventListener('webglcontextrestored',restore);
      scene?.dispose();delete target.dataset.gpuReady;
    };
  },[theme]);
  useEffect(()=>{window.dispatchEvent(new Event('tongzhuo:table-motion'));},[enabled,effects.reduced]);
  return <div className="game-background" data-table-theme={theme} aria-hidden="true">
    <div className="table-object-fallback">{Array.from({length:12},(_,i)=><span key={i}>{['♠','♥','♦','♣'][i%4]}</span>)}</div>
    <canvas ref={canvas} className="table-object-canvas"/>
  </div>;
}
