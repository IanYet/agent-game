import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import {PlayerCard,type PlayerCardState} from '../../visuals/PlayerCard';
import {useEffectsPreference} from '../../visuals/preferences';

/** Keep the foil sheet mounted through its exit transition. Reversing open while
 * closing cancels the timer and continues from the current CSS transition. */
export function HandPanel({open,title,subtitle,state,children,summary,onClose,onClear,canClear}:{
  open:boolean;title:string;subtitle:string;state:PlayerCardState;children:(ready:boolean)=>ReactNode;
  summary:ReactNode;onClose:()=>void;onClear?:()=>void;canClear:boolean;
}){
  const {reduced}=useEffectsPreference();
  const [present,setPresent]=useState(false),[shown,setShown]=useState(false),[ready,setReady]=useState(false);
  const surface=useRef<HTMLDivElement>(null),close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    let first=0,second=0,timer:ReturnType<typeof setTimeout>|undefined;
    const duration=reduced?0:220;
    if(open){
      setPresent(true);
      if(reduced){setShown(true);setReady(true);}
      else first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>{setShown(true);timer=setTimeout(()=>setReady(true),duration);});});
    }else{
      setShown(false);setReady(false);timer=setTimeout(()=>setPresent(false),duration);
    }
    return()=>{cancelAnimationFrame(first);cancelAnimationFrame(second);clearTimeout(timer);};
  },[open,reduced]);
  useLayoutEffect(()=>{
    if(!present)return;
    const previous=document.activeElement as HTMLElement|null,app=document.querySelector<HTMLElement>('.app-content'),oldInert=app?.inert??false;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';if(app)app.inert=true;
    const dialog=surface.current?.querySelector<HTMLElement>('[role="dialog"]');dialog?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close.current();}
      if(event.key==='Tab'){
        const controls=Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),[tabindex="0"]')??[]).filter(e=>e.getClientRects().length);
        const first=controls[0],last=controls.at(-1);
        if(!controls.length){event.preventDefault();return;}
        if(event.shiftKey&&(document.activeElement===dialog||document.activeElement===first)){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&(document.activeElement===dialog||document.activeElement===last)){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',key);
    return()=>{
      document.removeEventListener('keydown',key);document.body.style.overflow=overflow;if(app)app.inert=oldInert;
      requestAnimationFrame(()=>{if(previous?.isConnected)previous.focus({preventScroll:true});});
    };
  },[present]);
  if(!present)return null;
  return createPortal(<div ref={surface} className="gd-hand-backdrop" data-open={shown} data-ready={ready} data-reduced={reduced} data-cursor-lens="off" onPointerDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="gd-hand-motion"><PlayerCard primary state={state} className="gd-hand-sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
      <header className="gd-hand-heading"><div><small>YOUR HAND · 手牌收纳</small><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button" aria-label="关闭手牌" onClick={onClose}><X size={18}/></button></header>
      <div className="gd-hand-scroll">{children(ready&&open)}</div>
      <footer className="gd-hand-footer"><div role="status">{summary}</div><div>{onClear&&<button className="button outline" disabled={!canClear||!ready||!open} onClick={onClear}>清空选择</button>}<button className="button primary" onClick={onClose}>{onClear?'完成选牌':'收起手牌'}</button></div></footer>
    </PlayerCard></div>
  </div>,document.body);
}
