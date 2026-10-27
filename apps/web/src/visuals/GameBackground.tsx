import {useEffect,useRef} from 'react';
import {useEffectsPreference} from './preferences';
import type {TableTheme} from './table-models';
import type {TablePhysics} from './table-physics';
import {TILE_IMAGES} from '../games/azul/artwork';
import {GemIcon} from '../games/splendor/gem';
import {COLORS as GEM_COLORS} from '../games/splendor/types';
import {Barrel} from '../games/puerto-rico/artwork';
import {GOODS as PUERTO_GOODS} from '../games/puerto-rico/data';
import {CARD_SUIT_COLORS,CHESS_COLORS,POKER_CHIP_COLORS,CITADELS_CHIP_COLORS} from './table-palette';
import {SvgIcon} from './SvgIcon';
import type {SvgIconName} from './svg-icons';
const fallbackSymbols:Record<'doudizhu'|'chess',readonly SvgIconName[]>={doudizhu:['spade','heart','diamond','club'],chess:['chess-king','chess-queen','chess-rook','chess-bishop','chess-knight','chess-pawn']};
const chipPalettes={holdem:POKER_CHIP_COLORS,citadels:CITADELS_CHIP_COLORS};

export function GameBackground({enabled,theme}:{enabled:boolean;theme:TableTheme}){
  const effects=useEffectsPreference();
  const surface=useRef<HTMLDivElement>(null),runtime=useRef({enabled,reduced:effects.reduced});
  runtime.current={enabled,reduced:effects.reduced};
  useEffect(()=>{
    const host=surface.current;if(!host)return;
    const app=document.querySelector<HTMLElement>('.app-content');
    const target=document.createElement('canvas');target.className='table-object-canvas';host.append(target);
    let alive=true,scene:TablePhysics|undefined,frame=0,last=0,phase=0,lost=false,resizePending=false,restorePending=false,frames=0,measured=performance.now();
    const canRender=()=>alive&&!lost&&!document.hidden&&runtime.current.enabled&&!app?.inert;
    const stop=()=>{cancelAnimationFrame(frame);frame=0;last=0;phase=0;frames=0;measured=performance.now();scene?.clearPointer(true);};
    const schedule=()=>{if(!frame&&canRender()&&!runtime.current.reduced)frame=requestAnimationFrame(tick);};
    const tick=(now:number)=>{
      frame=0;if(!scene||!canRender()||runtime.current.reduced)return;
      const interval=1000/60,due=now-phase;
      if(phase&&due<interval-.25){schedule();return;}
      scene.step(last?(now-last)/1000:1/60);last=now;frames++;
      phase=phase?phase+Math.max(1,Math.floor((due+.25)/interval))*interval:now;
      if(import.meta.env.DEV&&now-measured>=1000){target.dataset.fps=(frames*1000/(now-measured)).toFixed(1);frames=0;measured=now;}
      if(scene.moving)schedule();
    };
    const wake=()=>{
      stop();if(!canRender())return;
      if(scene&&(resizePending||restorePending)){
        try{
          if(restorePending){scene.restore();restorePending=false;target.dataset.gpuReady='true';}
          else scene.resize();
          resizePending=false;
        }catch{lost=true;delete target.dataset.gpuReady;return;}
      }
      schedule();
    };
    // Keep the last frame while a modal covers the table, including on resize.
    const resize=()=>{resizePending=true;wake();};
    const move=(event:PointerEvent)=>{
      const element=event.target;
      if(!canRender()||runtime.current.reduced||event.pointerType==='touch'||!(element instanceof Element)||
        element.closest('button,a,input,textarea,select,[role="dialog"],.identity-shell')){
        scene?.clearPointer();return;
      }
      const samples=event.getCoalescedEvents?.();
      scene?.movePointer(samples?.length?samples:[event]);
      schedule();
    };
    const leave=()=>scene?.clearPointer();
    const lose=(event:Event)=>{event.preventDefault();lost=true;stop();delete target.dataset.gpuReady;};
    const restore=()=>{lost=false;restorePending=true;wake();};
    const observer=new ResizeObserver(resize);observer.observe(target);
    // Modal owns this inert state, so game-local dialogs pause the background too.
    const occlusion=new MutationObserver(wake);
    if(app)occlusion.observe(app,{attributes:true,attributeFilter:['inert']});
    const events:Array<[EventTarget,string,EventListener]>=[
      [window,'pointermove',move as EventListener],[document.documentElement,'pointerleave',leave],[window,'blur',leave],
      [window,'tongzhuo:table-motion',wake],[document,'visibilitychange',wake],
    ];
    events.forEach(([el,name,handler])=>el.addEventListener(name,handler,{passive:true}));
    void import('./table-physics').then(async({TablePhysics})=>{
      if(!alive)return;
      const {TableSurfaces}=await import('./table-surfaces'),surfaces=await TableSurfaces.load();
      if(!alive){surfaces.dispose();return;}
      try{
        scene=new TablePhysics(target,theme,surfaces);resizePending=false;target.dataset.gpuReady='true';
        scene.source.addEventListener('webglcontextlost',lose);scene.source.addEventListener('webglcontextrestored',restore);schedule();
      }catch{scene?.dispose();surfaces.dispose();scene=undefined;delete target.dataset.gpuReady;}
    }).catch(()=>{/* The still suit field remains available if the module cannot load. */});
    return()=>{
      alive=false;stop();observer.disconnect();occlusion.disconnect();events.forEach(([el,name,handler])=>el.removeEventListener(name,handler));
      scene?.source.removeEventListener('webglcontextlost',lose);scene?.source.removeEventListener('webglcontextrestored',restore);
      scene?.dispose();target.remove();
    };
  },[theme]);
  useEffect(()=>{window.dispatchEvent(new Event('tongzhuo:table-motion'));},[enabled,effects.reduced]);
  return <div className="game-background" data-table-theme={theme} aria-hidden="true">
    <div className="table-object-fallback">{theme==='splendor'
      ?Array.from({length:12},(_,i)=><span className="table-fallback-gem" key={i}><GemIcon color={GEM_COLORS[i%GEM_COLORS.length]}/></span>)
      :theme==='puerto-rico'
      ?Array.from({length:12},(_,i)=><span key={i} style={{textShadow:'none',opacity:.2}}><Barrel good={PUERTO_GOODS[i%5]}/></span>)
      :theme==='holdem'||theme==='citadels'
      ?Array.from({length:12},(_,i)=><span className="table-fallback-chip" key={i} style={{background:chipPalettes[theme][i%chipPalettes[theme].length],textShadow:'none'}}/>)
      :Array.from({length:12},(_,i)=><span key={i} style={{color:theme==='chess'?CHESS_COLORS[i%2]:CARD_SUIT_COLORS[i%CARD_SUIT_COLORS.length],textShadow:'none',...(theme==='azul'?{backgroundImage:`url("${TILE_IMAGES[i%5]}")`,filter:'none',boxShadow:'none'}:{})}}>{theme!=='azul'&&<SvgIcon name={fallbackSymbols[theme][i%fallbackSymbols[theme].length]}/>}</span>)}</div>
    <div ref={surface} className="table-object-surface"/>
  </div>;
}
