import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {gsap} from 'gsap';
import './vendor/AccordionGallery.css';
import './gallery.css';
import {useEffectsPreference} from './preferences';
import {paintFoil} from './foil-card';
import {cardTilt,cardPerspective} from './card-tilt';

export type GalleryGame={id:string;name:string;english:string;players:string;symbol:string;tone:'warm'|'cool'};
const COLLAPSED_WIDTH=140,EXPANDED_WIDTH=500,PANEL_GAP=12,NEIGHBOR_PEEK=72;
function FoilArtwork({game,active,enabled}:{game:GalleryGame;active:boolean;enabled:boolean}){
  const canvas=useRef<HTMLCanvasElement>(null);
  const {reduced}=useEffectsPreference();
  useEffect(()=>{
    const source=canvas.current!,panel=source.closest<HTMLElement>('.r-accordion-panel')!;
    let raf=0,last=0,visible=false,alive=true,time=0;
    const paint=(now=0)=>{
      raf=0;if(!alive)return;
      if(now-last>=33||!now){
        time+=Math.min(Math.max(0,now-last)/1000,.05);last=now;
        const style=getComputedStyle(panel);
        paintFoil(source,game,parseFloat(style.getPropertyValue('--foil-x'))/100,parseFloat(style.getPropertyValue('--foil-y'))/100,reduced?0:time);
      }
      if(active&&enabled&&visible&&!reduced&&!document.hidden)raf=requestAnimationFrame(paint);
    };
    const wake=()=>{if(!raf&&alive)paint();};
    const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;wake();});observer.observe(source);
    document.addEventListener('visibilitychange',wake);void document.fonts.ready.then(wake);paint();
    return()=>{alive=false;cancelAnimationFrame(raf);observer.disconnect();document.removeEventListener('visibilitychange',wake);};
  },[game.symbol,game.english,game.tone,active,enabled,reduced]);
  return <div className="r-laser-card"><canvas ref={canvas} className="r-foil-source"/></div>;
}
export function GameGallery({games,onSelect,enabled=true}:{games:GalleryGame[];onSelect:(id:string,trigger:HTMLButtonElement)=>void;enabled?:boolean}){
  const root=useRef<HTMLDivElement>(null),viewport=useRef<HTMLDivElement>(null),track=useRef<HTMLDivElement>(null),[active,setActive]=useState<string|null>(null);
  const hovered=useRef<string|null>(null),focused=useRef<string|null>(null);
  const pointer=useRef<{x:number;y:number}|null>(null),edgeVelocity=useRef(0);
  const [viewportWidth,setViewportWidth]=useState(0),[scrollEdges,setScrollEdges]=useState({left:false,right:false});
  const {reduced}=useEffectsPreference();
  useLayoutEffect(()=>{
    const port=viewport.current!,strip=track.current!;let raf=0,last=0;
    const stop=()=>{cancelAnimationFrame(raf);raf=0;last=0;};
    const updateEdges=()=>{
      const next={left:port.scrollLeft>1,right:port.scrollWidth-port.clientWidth-port.scrollLeft>1};
      setScrollEdges(current=>current.left===next.left&&current.right===next.right?current:next);
    };
    const velocity=()=>{
      if(!enabled||!pointer.current||document.hidden)return 0;
      const rect=port.getBoundingClientRect(),x=pointer.current.x-rect.left,zone=Math.min(72,rect.width*.15),max=port.scrollWidth-port.clientWidth;
      if(pointer.current.y<rect.top||pointer.current.y>rect.bottom)return 0;
      if(x>=0&&x<zone&&port.scrollLeft>1)return -120-300*(1-x/zone);
      if(x<=rect.width&&x>rect.width-zone&&port.scrollLeft<max-1)return 120+300*(1-(rect.width-x)/zone);
      return 0;
    };
    const frame=(now:number)=>{
      raf=0;const speed=velocity();edgeVelocity.current=speed;if(!speed){last=0;return;}
      const dt=last?Math.min((now-last)/1000,.05):1/60;last=now;
      port.scrollLeft=Math.max(0,Math.min(port.scrollWidth-port.clientWidth,port.scrollLeft+speed*dt));
      raf=requestAnimationFrame(frame);
    };
    const wake=()=>{
      const speed=velocity();if(speed&&!edgeVelocity.current)gsap.killTweensOf(port,'scrollLeft');edgeVelocity.current=speed;
      if(speed&&!raf)raf=requestAnimationFrame(frame);else if(!speed)stop();
    };
    const move=(event:PointerEvent)=>{
      if(!enabled||event.pointerType==='touch')return;
      const previous=pointer.current;if(previous&&previous.x===event.clientX&&previous.y===event.clientY)return;
      pointer.current={x:event.clientX,y:event.clientY};wake();if(edgeVelocity.current)return;
      const panel=event.target instanceof Element?event.target.closest<HTMLElement>('.r-accordion-panel'):null;
      if(panel){hovered.current=panel.dataset.gameId!;focused.current=null;setActive(hovered.current);}
    };
    const leave=()=>{pointer.current=null;edgeVelocity.current=0;stop();hovered.current=null;if(enabled)setActive(focused.current);};
    const resize=()=>{setViewportWidth(port.clientWidth);updateEdges();wake();};
    const visibility=()=>{if(document.hidden){pointer.current=null;edgeVelocity.current=0;stop();}};
    const observer=new ResizeObserver(resize);observer.observe(port);observer.observe(strip);resize();
    port.addEventListener('pointermove',move);port.addEventListener('pointerleave',leave);port.addEventListener('pointercancel',leave);port.addEventListener('scroll',updateEdges,{passive:true});
    window.addEventListener('blur',leave);document.addEventListener('visibilitychange',visibility);
    return()=>{stop();pointer.current=null;edgeVelocity.current=0;observer.disconnect();port.removeEventListener('pointermove',move);port.removeEventListener('pointerleave',leave);port.removeEventListener('pointercancel',leave);port.removeEventListener('scroll',updateEdges);window.removeEventListener('blur',leave);document.removeEventListener('visibilitychange',visibility);};
  },[enabled]);
  useLayoutEffect(()=>{
    const port=viewport.current!,panels=Array.from(track.current!.querySelectorAll<HTMLElement>('.r-accordion-panel'));if(!viewportWidth)return;
    const index=panels.findIndex(panel=>panel.dataset.gameId===active),peek=Math.min(NEIGHBOR_PEEK,Math.max(0,(viewportWidth-COLLAPSED_WIDTH)/2-PANEL_GAP));
    const before=index>0?peek+PANEL_GAP:0,after=index>=0&&index<panels.length-1?peek+PANEL_GAP:0;
    const expandedWidth=Math.min(EXPANDED_WIDTH,Math.max(COLLAPSED_WIDTH,viewportWidth-before-after));
    const total=panels.length*COLLAPSED_WIDTH+Math.max(0,panels.length-1)*PANEL_GAP+(index>=0?expandedWidth-COLLAPSED_WIDTH:0);
    let target=port.scrollLeft;
    if(index>=0){
      const left=Math.max(0,(viewportWidth-total)/2)+index*(COLLAPSED_WIDTH+PANEL_GAP);
      target=Math.max(left+expandedWidth+after-viewportWidth,Math.min(target,left-before));
    }
    target=Math.max(0,Math.min(Math.max(0,total-viewportWidth),target));
    if(reduced)gsap.set(panels,{'--foil-rx':'0deg','--foil-ry':'0deg','--foil-x':'50%','--foil-y':'50%',overwrite:'auto'});
    // Reserve a glimpse of adjacent games using the final expanded widths.
    const layout=gsap.to(panels,{width:(_:number,panel:HTMLElement)=>panel.dataset.gameId===active?expandedWidth:COLLAPSED_WIDTH,'--ag-gray':(_:number,panel:HTMLElement)=>panel.dataset.gameId===active?0:.7,duration:reduced?0:.32,ease:'power3.out',overwrite:'auto'});
    const scrolling=edgeVelocity.current?null:gsap.to(port,{scrollLeft:target,duration:reduced?0:.32,ease:'power3.out',overwrite:'auto'});
    const artwork=gsap.to(panels,{'--card-open':(_:number,panel:HTMLElement)=>panel.dataset.gameId===active?1:0,'--foil-camera':(_:number,panel:HTMLElement)=>{const card=panel.querySelector<HTMLElement>('.r-laser-card')!;return panel.dataset.gameId===active?cardPerspective(card.offsetWidth,card.offsetHeight,1.12):1000;},duration:reduced?0:.7,ease:'power2.out',overwrite:'auto'});
    return()=>{layout.kill();scrolling?.kill();artwork.kill();};
  },[active,reduced,viewportWidth,games.length]);
  useEffect(()=>{const element=root.current;return()=>{if(element)gsap.killTweensOf(element.querySelectorAll('.r-accordion-panel'));};},[]);
  const leave=(panel:HTMLElement)=>{
    gsap.to(panel,{'--foil-rx':'0deg','--foil-ry':'0deg','--foil-x':'50%','--foil-y':'50%',duration:reduced?0:.55,overwrite:'auto'});
  };
  return <div ref={root} className="tz-gallery-scope" data-gallery-active={active!==null} data-gallery-reduced={reduced} data-scroll-left={scrollEdges.left} data-scroll-right={scrollEdges.right}><div ref={viewport} className="r-accordion-viewport"><div ref={track} className="accordion-gallery r-accordion-track" role="list" aria-label="游戏画廊">
    {games.map((item,i)=>{
      const game={...item,tone:i%2?'cool' as const:'warm' as const};
      return <div key={game.id} role="listitem" data-game-id={game.id} data-tone={game.tone} className={'ag-panel r-accordion-panel'+(active===game.id?' ag-panel--active':'')}
        onPointerLeave={e=>leave(e.currentTarget)}
        onPointerMove={e=>{
          if(reduced||!enabled||e.pointerType==='touch')return;
          const panel=e.currentTarget,r=panel.getBoundingClientRect(),x=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y=Math.max(0,Math.min(1,(e.clientY-r.top)/r.height));
          const card=panel.querySelector<HTMLElement>('.r-laser-card')!;
          gsap.to(panel,{'--foil-x':`${x*100}%`,'--foil-y':`${y*100}%`,duration:.32,ease:'power2.out',overwrite:'auto',onUpdate:()=>{
            const tilt=cardTilt(parseFloat(panel.style.getPropertyValue('--foil-x'))/100,parseFloat(panel.style.getPropertyValue('--foil-y'))/100,card.offsetWidth,card.offsetHeight,{scale:1.12,rotation:-5,offsetX:56,offsetY:-16,offsetZ:cardPerspective(card.offsetWidth,card.offsetHeight,1.12)*.065});
            panel.style.setProperty('--foil-rx',`${tilt.rx}deg`);panel.style.setProperty('--foil-ry',`${tilt.ry}deg`);
          }});
        }}>
        <span className="r-accordion-serial" aria-hidden="true">{String(i+1).padStart(2,'0')} / {game.english}</span>
        <div className="r-accordion-media" aria-hidden="true"><FoilArtwork game={game} active={active===game.id} enabled={enabled}/></div>
        <span className="r-accordion-caption"><strong>{game.name}</strong><small>{game.english} / {game.players}</small></span>
        <button type="button" className="r-accordion-choice" aria-label={'选择'+game.name}
          onFocus={e=>{if(enabled&&e.currentTarget.matches(':focus-visible')){pointer.current=null;edgeVelocity.current=0;focused.current=game.id;setActive(game.id);}}}
          onBlur={()=>{focused.current=null;if(enabled)setActive(hovered.current);}}
          onKeyDown={e=>{if(e.key==='Escape'){focused.current=null;e.currentTarget.blur();setActive(null);return;}if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;e.preventDefault();const buttons=Array.from(root.current!.querySelectorAll<HTMLButtonElement>('.r-accordion-choice'));buttons[(i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length]?.focus({preventScroll:true});}}
          onClick={e=>onSelect(game.id,e.currentTarget)}><span>选择游戏 <b>↗</b></span></button>
      </div>;
    })}
  </div></div></div>;
}
