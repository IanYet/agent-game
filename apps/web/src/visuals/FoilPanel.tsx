import {useEffect,useRef,type HTMLAttributes} from 'react';
import {paintIdentity,paintIdentityGlass} from './identity-foil';
import {useEffectsPreference} from './preferences';
import {cardTilt,cardPerspective} from './card-tilt';

export type FoilPanelProps=HTMLAttributes<HTMLDivElement>&{primary?:boolean;illumination?:number;radialGlare?:boolean;interactive?:boolean;glass?:boolean};
export function FoilPanel({children,className='',primary=false,illumination=1,radialGlare=false,interactive=true,glass=true,...props}:FoilPanelProps){
  const root=useRef<HTMLDivElement>(null),face=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),film=useRef<HTMLCanvasElement>(null);
  const lighting=useRef<(value:number)=>void>(undefined);
  const {reduced}=useEffectsPreference();
  useEffect(()=>{
    const element=root.current!,card=face.current!,source=canvas.current!;
    let raf=0,last=0,intro=glass?0:1,visible=false,seen=false,bounds=element.getBoundingClientRect();
    const current={x:.65,y:.2,presence:0,tilt:0,light:illumination},target={...current};
    const paint=()=>{
      const tilt=cardTilt(.5+(current.x-.5)*current.tilt,.5+(current.y-.5)*current.tilt,card.offsetWidth,card.offsetHeight);
      card.style.transform=reduced?'none':`perspective(${cardPerspective(card.offsetWidth,card.offsetHeight)}px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`;
      paintIdentity(source,card.clientWidth,card.clientHeight,current.x,current.y,current.light,radialGlare);
      if(film.current)paintIdentityGlass(film.current,element.clientWidth,element.clientHeight,current.x,current.y,current.presence,intro,current.light);
    };
    const frame=(now:number)=>{
      raf=0;if(document.hidden||!visible||element.closest('[inert]'))return;
      const dt=Math.min((now-last)/1000||.016,.05);last=now;
      let moving=false;
      for(const key of Object.keys(current) as (keyof typeof current)[]){const delta=target[key]-current[key];current[key]=Math.abs(delta)<.001?target[key]:current[key]+delta*(1-Math.exp(-dt*(key==='light'?7:10)));if(Math.abs(delta)>.001)moving=true;}
      if(intro<1){intro=Math.min(1,intro+dt/1.1);moving=true;}
      paint();if(moving&&!reduced)raf=requestAnimationFrame(frame);
    };
    const wake=()=>{if(!raf&&!reduced&&visible&&!document.hidden){last=performance.now();raf=requestAnimationFrame(frame);}};
    lighting.current=value=>{target.light=Math.max(0,value);if(reduced){current.light=target.light;paint();}else wake();};
    const enter=(event:PointerEvent)=>{bounds=element.getBoundingClientRect();if(event.pointerType==='touch'||reduced)return;target.presence=1;move(event);};
    const move=(event:PointerEvent)=>{
      if(reduced||event.pointerType==='touch')return;
      bounds=element.getBoundingClientRect();
      target.x=Math.max(0,Math.min(1,(event.clientX-bounds.left)/bounds.width));target.y=Math.max(0,Math.min(1,(event.clientY-bounds.top)/bounds.height));
      target.tilt=1;wake();
    };
    const leave=()=>{Object.assign(target,{x:.65,y:.2,presence:0,tilt:0});wake();};
    const focus=()=>{target.presence=1;wake();};
    const blur=(event:FocusEvent)=>{if(!element.contains(event.relatedTarget as Node))leave();};
    const resize=new ResizeObserver(()=>{bounds=element.getBoundingClientRect();paint();});resize.observe(element);
    const intersection=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible&&!seen){seen=true;intro=reduced||!glass?1:0;}wake();},{threshold:.05});intersection.observe(element);
    if(interactive){element.addEventListener('pointerenter',enter);element.addEventListener('pointermove',move);element.addEventListener('pointerleave',leave);element.addEventListener('focusin',focus);element.addEventListener('focusout',blur);}
    document.addEventListener('visibilitychange',wake);paint();
    return()=>{lighting.current=undefined;cancelAnimationFrame(raf);resize.disconnect();intersection.disconnect();element.removeEventListener('pointerenter',enter);element.removeEventListener('pointermove',move);element.removeEventListener('pointerleave',leave);element.removeEventListener('focusin',focus);element.removeEventListener('focusout',blur);document.removeEventListener('visibilitychange',wake);};
  },[reduced,radialGlare,interactive,glass]);
  useEffect(()=>{lighting.current?.(illumination);},[illumination]);
  return <div {...props} ref={root} className="identity-shell" data-foil-light={illumination}><div ref={face} className={`identity-card ${primary?'player-primary ':''}${className}`}><canvas ref={canvas} className="identity-material" aria-hidden="true"/>{children}</div>{glass&&<canvas ref={film} className="identity-glass" aria-hidden="true"/>}</div>;
}
