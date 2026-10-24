import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {gsap} from 'gsap';
import './vendor/AccordionGallery.css';
import './gallery.css';
import {useEffectsPreference} from './preferences';
import {paintFoil} from './foil-card';
import {cardTilt,cardPerspective} from './card-tilt';

export type GalleryGame={id:string;name:string;english:string;players:string;symbol:string;tone:'warm'|'cool'};
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
  const root=useRef<HTMLDivElement>(null),[active,setActive]=useState<string|null>(null);
  const hovered=useRef<string|null>(null),focused=useRef<string|null>(null);
  const {reduced}=useEffectsPreference();
  useLayoutEffect(()=>{
    const panels=root.current?.querySelectorAll<HTMLElement>('.r-accordion-panel');if(!panels)return;
    panels.forEach(panel=>{panel.dataset.expanded='false';});
    if(reduced)gsap.set(panels,{'--foil-rx':'0deg','--foil-ry':'0deg','--foil-x':'50%','--foil-y':'50%',overwrite:'auto'});
    const animation=gsap.to(panels,{width:(_:number,panel:HTMLElement)=>panel.dataset.gameId===active?500:120,'--card-open':(_:number,panel:HTMLElement)=>panel.dataset.gameId===active?1:0,'--foil-camera':(_:number,panel:HTMLElement)=>{const card=panel.querySelector<HTMLElement>('.r-laser-card')!;return panel.dataset.gameId===active?cardPerspective(card.offsetWidth,card.offsetHeight,1.12):1000;},'--ag-gray':(_:number,panel:HTMLElement)=>panel.dataset.gameId===active?0:.7,duration:reduced?0:.88,ease:'power3.inOut',overwrite:'auto',onComplete:()=>{panels.forEach(panel=>{panel.dataset.expanded=String(panel.dataset.gameId===active);});}});
    return()=>{animation.kill();};
  },[active,reduced]);
  useEffect(()=>{const element=root.current;return()=>{if(element)gsap.killTweensOf(element.querySelectorAll('.r-accordion-panel'));};},[]);
  const leave=(panel:HTMLElement)=>{
    hovered.current=null;
    gsap.to(panel,{'--foil-rx':'0deg','--foil-ry':'0deg','--foil-x':'50%','--foil-y':'50%',duration:reduced?0:.55,overwrite:'auto'});
    if(enabled)setActive(focused.current);
  };
  return <div ref={root} className="tz-gallery-scope" data-gallery-active={active!==null}><div className="r-accordion-viewport"><div className="accordion-gallery r-accordion-track" role="list" aria-label="游戏画廊">
    {games.map((item,i)=>{
      const game={...item,tone:i%2?'cool' as const:'warm' as const};
      return <div key={game.id} role="listitem" data-game-id={game.id} data-tone={game.tone} className={'ag-panel r-accordion-panel'+(active===game.id?' ag-panel--active':'')}
        onPointerEnter={()=>{hovered.current=game.id;focused.current=null;setActive(game.id);}} onPointerLeave={e=>leave(e.currentTarget)}
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
          onFocus={e=>{if(e.currentTarget.matches(':focus-visible')){focused.current=game.id;setActive(game.id);}}}
          onBlur={()=>{focused.current=null;if(enabled)setActive(hovered.current);}}
          onKeyDown={e=>{if(e.key==='Escape'){focused.current=null;e.currentTarget.blur();setActive(null);return;}if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;e.preventDefault();const buttons=Array.from(root.current!.querySelectorAll<HTMLButtonElement>('.r-accordion-choice'));buttons[(i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length]?.focus();}}
          onClick={e=>onSelect(game.id,e.currentTarget)}><span>选择游戏 <b>↗</b></span></button>
      </div>;
    })}
  </div></div></div>;
}
