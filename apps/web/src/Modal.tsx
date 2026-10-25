import {useLayoutEffect, useRef, type ReactNode, type PointerEvent} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import {BrandPanel} from './visuals/BrandPanel';
export function Modal({title,subtitle,symbol,onClose,children,wide=false,footer,branded=true,dismissible=true,floating=false,className=''}:{title:string;subtitle?:string;symbol?:string;onClose:()=>void;children:ReactNode;wide?:boolean;footer?:ReactNode;branded?:boolean;dismissible?:boolean;floating?:boolean;className?:string}){
  const ref=useRef<HTMLDivElement>(null),close=useRef(onClose);close.current=()=>{if(dismissible)onClose();};
  const position=useRef({left:0,top:0}),drag=useRef<{pointerId:number;x:number;y:number}|null>(null),restoreFocus=useRef(0);
  const place=(left:number,top:number)=>{
    const panel=ref.current;if(!panel)return;
    const margin=12,width=document.documentElement.clientWidth,height=window.innerHeight;
    position.current={left:Math.max(margin,Math.min(left,width-panel.offsetWidth-margin)),top:Math.max(margin,Math.min(top,height-panel.offsetHeight-margin))};
    panel.style.left=`${position.current.left}px`;panel.style.top=`${position.current.top}px`;
  };
  useLayoutEffect(()=>{
    if(!floating||!ref.current)return;
    place((document.documentElement.clientWidth-ref.current.offsetWidth)/2,(window.innerHeight-ref.current.offsetHeight)/2);
    const resize=()=>place(position.current.left,position.current.top);
    window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);
  },[floating]);
  const startDrag=(event:PointerEvent<HTMLDivElement>)=>{
    if(!floating||!event.isPrimary||event.button!==0||(event.target as Element).closest('button,a,input,select,textarea,summary,[contenteditable="true"],.modal-scroll'))return;
    drag.current={pointerId:event.pointerId,x:event.clientX-position.current.left,y:event.clientY-position.current.top};
    event.currentTarget.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);event.currentTarget.dataset.dragging='true';event.preventDefault();
  };
  const moveDrag=(event:PointerEvent<HTMLDivElement>)=>{const current=drag.current;if(current?.pointerId===event.pointerId)place(event.clientX-current.x,event.clientY-current.y);};
  const endDrag=(event:PointerEvent<HTMLDivElement>)=>{
    if(drag.current?.pointerId!==event.pointerId)return;
    drag.current=null;delete event.currentTarget.dataset.dragging;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  };
  useLayoutEffect(()=>{
    cancelAnimationFrame(restoreFocus.current);
    const previous=document.activeElement as HTMLElement|null,app=document.querySelector<HTMLElement>('.app-content');
    const overflow=document.body.style.overflow;if(!floating){document.body.style.overflow='hidden';if(app)app.inert=true;}
    const controls=()=>Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href],summary,[tabindex="0"]')??[]).filter(el=>el.getClientRects().length>0);
    const key=(event:KeyboardEvent)=>{
      if(event.defaultPrevented)return;
      if(floating&&!ref.current?.contains(document.activeElement))return;
      if(event.key==='Escape'){event.preventDefault();close.current();}
      if(!floating&&event.key==='Tab'){const items=controls(),first=items[0],last=items.at(-1);if(!items.length){event.preventDefault();return;}if(event.shiftKey&&(!ref.current?.contains(document.activeElement)||document.activeElement===first||document.activeElement===ref.current)){event.preventDefault();last?.focus();}else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===ref.current)){event.preventDefault();first?.focus();}}
    };
    ref.current?.focus({preventScroll:true});document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('keydown',key);if(!floating){document.body.style.overflow=overflow;if(app)app.inert=false;}if(!floating||ref.current?.contains(document.activeElement))restoreFocus.current=requestAnimationFrame(()=>{if(previous?.isConnected)previous.focus({preventScroll:true});});};
  },[floating]);
  useLayoutEffect(()=>{if(!floating&&!ref.current?.contains(document.activeElement)&&!document.querySelector('.select-menu'))ref.current?.focus();});
  const panel=<div ref={ref} tabIndex={-1} className={`modal ${wide?'wide':''} ${branded?'branded':''} ${floating?'floating-window':''} ${className}`} role="dialog" aria-modal={!floating} aria-label={title} data-cursor-lens="off" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}>{branded&&<BrandPanel symbol={symbol}/>}<div className="modal-panel"><header className="modal-heading" title={floating?'拖动标题栏移动窗口':undefined}><div><span className="eyebrow">同桌 / {subtitle??'HUMAN × AGENT'}</span><h2>{title}</h2></div><button className="icon-button" disabled={!dismissible} onClick={()=>close.current()} aria-label="关闭弹窗"><X size={19}/></button></header><div className="modal-scroll">{children}</div>{footer&&<footer className="modal-footer">{footer}</footer>}</div></div>;
  return createPortal(floating?panel:<div className="modal-backdrop" data-cursor-lens="off" onPointerDown={e=>{if(e.target===e.currentTarget)close.current();}}>{panel}</div>,document.body);
}
