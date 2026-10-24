import {useLayoutEffect, useRef, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import {BrandPanel} from './visuals/BrandPanel';
export function Modal({title,subtitle,symbol,onClose,children,wide=false,footer,branded=true,dismissible=true,className=''}:{title:string;subtitle?:string;symbol?:string;onClose:()=>void;children:ReactNode;wide?:boolean;footer?:ReactNode;branded?:boolean;dismissible?:boolean;className?:string}){
  const ref=useRef<HTMLDivElement>(null),close=useRef(onClose);close.current=()=>{if(dismissible)onClose();};
  useLayoutEffect(()=>{
    const previous=document.activeElement as HTMLElement|null,app=document.querySelector<HTMLElement>('.app-content');
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';if(app)app.inert=true;
    const controls=()=>Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href],summary,[tabindex="0"]')??[]).filter(el=>el.getClientRects().length>0);
    const key=(event:KeyboardEvent)=>{
      if(event.defaultPrevented)return;
      if(event.key==='Escape'){event.preventDefault();close.current();}
      if(event.key==='Tab'){const items=controls(),first=items[0],last=items.at(-1);if(!items.length){event.preventDefault();return;}if(event.shiftKey&&(!ref.current?.contains(document.activeElement)||document.activeElement===first||document.activeElement===ref.current)){event.preventDefault();last?.focus();}else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===ref.current)){event.preventDefault();first?.focus();}}
    };
    ref.current?.focus();document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=overflow;if(app)app.inert=false;requestAnimationFrame(()=>{if(previous?.isConnected)previous.focus({preventScroll:true});});};
  },[]);
  useLayoutEffect(()=>{if(!ref.current?.contains(document.activeElement)&&!document.querySelector('.select-menu'))ref.current?.focus();});
  return createPortal(<div className="modal-backdrop" data-cursor-lens="off" onPointerDown={e=>{if(e.target===e.currentTarget)close.current();}}><div ref={ref} tabIndex={-1} className={`modal ${wide?'wide':''} ${branded?'branded':''} ${className}`} role="dialog" aria-modal="true" aria-label={title}>{branded&&<BrandPanel symbol={symbol}/>}<div className="modal-panel"><header className="modal-heading"><div><span className="eyebrow">同桌 / {subtitle??'HUMAN × AGENT'}</span><h2>{title}</h2></div><button className="icon-button" disabled={!dismissible} onClick={()=>close.current()} aria-label="关闭弹窗"><X size={19}/></button></header><div className="modal-scroll">{children}</div>{footer&&<footer className="modal-footer">{footer}</footer>}</div></div></div>,document.body);
}
