import {useId, useLayoutEffect, useRef, useState, type KeyboardEvent} from 'react';
import {createPortal} from 'react-dom';
import {Check, ChevronDown} from 'lucide-react';

export interface SelectOption {value:string; label:string; disabled?:boolean; detail?:string}
interface SelectProps {value:string;options:SelectOption[];onChange:(value:string)=>void;label:string;disabled?:boolean;invalid?:boolean;id?:string;showDetails?:boolean;buttonGroup?:boolean;lensAllowed?:boolean}
export function Select(props:SelectProps){
  return props.buttonGroup||props.options.length<3?<ButtonGroup {...props}/>:<DropdownSelect {...props}/>;
}
function ButtonGroup({value,options,onChange,label,disabled=false,invalid=false,id,showDetails=false,lensAllowed=false}:SelectProps){
  const ref=useRef<HTMLDivElement>(null),selected=options.findIndex(option=>option.value===value),first=options.findIndex(option=>!option.disabled);
  const key=(event:KeyboardEvent<HTMLDivElement>)=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)||disabled||first<0)return;
    event.preventDefault();
    const focused=Array.from(ref.current?.querySelectorAll('button')??[]).indexOf(document.activeElement as HTMLButtonElement);
    const direction=event.key==='ArrowLeft'||event.key==='ArrowUp'?-1:1;
    let next=event.key==='Home'?0:event.key==='End'?options.length-1:(focused<0?selected:focused)+direction;
    for(let i=0;i<options.length;i++){next=(next+options.length)%options.length;if(!options[next].disabled)break;next+=event.key==='End'?-1:direction;}
    onChange(options[next].value);ref.current?.querySelectorAll('button')[next]?.focus();
  };
  return <div ref={ref} id={id} role="group" aria-label={label} aria-invalid={invalid||undefined} data-cursor-lens={lensAllowed?undefined:'off'} className={`choice-group ${options.length===1?'single':''} ${showDetails?'has-details':''} ${invalid?'invalid':''}`} onKeyDown={key}>
    {options.map((option,index)=><button type="button" key={option.value} aria-pressed={option.value===value} disabled={disabled||option.disabled} tabIndex={index===(selected>=0&&!options[selected].disabled?selected:first)?0:-1} title={!showDetails?option.detail:undefined} onClick={()=>onChange(option.value)}><span>{option.label}</span>{showDetails&&option.detail&&<small>{option.detail}</small>}</button>)}
  </div>;
}
function DropdownSelect({value, options, onChange, label, disabled=false, invalid=false, id}:SelectProps) {
  const generated=useId(), fieldId=id??generated, listId=generated+'-options';
  const trigger=useRef<HTMLButtonElement>(null), menu=useRef<HTMLDivElement>(null);
  const [open,setOpen]=useState(false),[active,setActive]=useState(0),[position,setPosition]=useState({left:0,top:0,width:0,maxHeight:300});
  const search=useRef({text:'',time:0});
  const selected=options.find(o=>o.value===value);
  const first=()=>options.findIndex(o=>!o.disabled);
  const show=()=>{const at=options.findIndex(o=>o.value===value&&!o.disabled);setActive(at<0?first():at);setOpen(true);};
  const choose=(index:number)=>{if(!options[index]||options[index].disabled)return;onChange(options[index].value);setOpen(false);trigger.current?.focus();};
  useLayoutEffect(()=>{
    if(!open)return;
    const place=()=>{const r=trigger.current!.getBoundingClientRect(),height=Math.min(320,menu.current?.scrollHeight??options.length*59+12),below=innerHeight-r.bottom-16,above=r.top-16,up=below<height&&above>below;
      const maxHeight=Math.max(80,Math.min(height,up?above:below));setPosition({left:Math.max(12,Math.min(r.left,innerWidth-Math.max(r.width,230)-12)),top:up?r.top-maxHeight-6:r.bottom+6,width:Math.min(Math.max(r.width,230),innerWidth-24),maxHeight});};
    const outside=(e:PointerEvent)=>{if(!trigger.current?.contains(e.target as Node)&&!menu.current?.contains(e.target as Node))setOpen(false);};
    place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);document.addEventListener('pointerdown',outside);
    return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);document.removeEventListener('pointerdown',outside);};
  },[open,options.length,position.width]);
  useLayoutEffect(()=>{const list=menu.current,item=list?.querySelector<HTMLElement>('[data-active="true"]');if(!open||!list||!item)return;if(item.offsetTop<list.scrollTop)list.scrollTop=item.offsetTop;else if(item.offsetTop+item.offsetHeight>list.scrollTop+list.clientHeight)list.scrollTop=item.offsetTop+item.offsetHeight-list.clientHeight;},[active,open,position.width,position.maxHeight]);
  const keyDown=(e:KeyboardEvent)=>{
    if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();setOpen(false);return;}
    if(e.key==='Tab'){setOpen(false);return;}
    if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
      e.preventDefault();if(!open){show();return;}if(!options.some(o=>!o.disabled))return;
      let next=e.key==='Home'?first():e.key==='End'?options.length-1:active+(e.key==='ArrowDown'?1:-1),direction=e.key==='ArrowUp'||e.key==='End'?-1:1;
      for(let i=0;i<options.length;i++){next=(next+options.length)%options.length;if(!options[next].disabled)break;next+=direction;}setActive(next);return;
    }
    if(e.key==='Enter'||e.key===' '){e.preventDefault();open?choose(active):show();return;}
    if(e.key.length===1&&!e.ctrlKey&&!e.metaKey){e.preventDefault();const now=performance.now();search.current.text=(now-search.current.time<700?search.current.text:'')+e.key.toLowerCase();search.current.time=now;const q=search.current.text;let next=options.findIndex(o=>!o.disabled&&(o.label.toLowerCase().startsWith(q)||o.value.toLowerCase().startsWith(q)));if(next<0&&new Set(q).size===1)next=options.findIndex((o,i)=>i>active&&!o.disabled&&o.label.toLowerCase().startsWith(e.key.toLowerCase()));if(next>=0){setActive(next);setOpen(true);}}
  };
  return <><button ref={trigger} id={fieldId} type="button" className={`designed-select ${invalid?'invalid':''}`} role="combobox" aria-label={label} aria-expanded={open} aria-controls={listId} aria-activedescendant={open&&active>=0?`${listId}-${active}`:undefined} aria-haspopup="listbox" aria-invalid={invalid||undefined} disabled={disabled} onClick={()=>open?setOpen(false):show()} onKeyDown={keyDown} onBlur={e=>{if(!menu.current?.contains(e.relatedTarget))setOpen(false);}}><span>{selected?.label??value??'请选择'}</span><ChevronDown size={15}/></button>{open&&createPortal(<div ref={menu} id={listId} className="select-menu" role="listbox" aria-label={label} data-cursor-lens="off" style={position}>{options.map((option,index)=><div id={`${listId}-${index}`} role="option" aria-selected={option.value===value} aria-disabled={option.disabled||undefined} data-active={active===index} key={option.value} onPointerMove={()=>!option.disabled&&setActive(index)} onPointerDown={e=>e.preventDefault()} onClick={()=>choose(index)}><span><b>{option.label}</b>{option.detail&&<small>{option.detail}</small>}</span>{option.value===value&&<Check size={15}/>}</div>)}</div>,document.body)}</>;
}
