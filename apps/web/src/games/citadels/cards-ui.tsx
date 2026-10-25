import {useId,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {HolographicCard} from '../../visuals/HolographicCard';
import {GoldCoin} from '../../visuals/GoldCoin';
import {COLORS,ROLES,district,type Color,type District} from './cards';

export const DISTRICT_COLORS:Record<Color,`#${string}`>={yellow:'#dbb864',blue:'#79aee3',green:'#79bd91',red:'#d77e89',purple:'#b28bdf'};
const ROLE_COLORS:readonly `#${string}`[]=['#c6cee3','#c6cee3','#c6cee3',DISTRICT_COLORS.yellow,DISTRICT_COLORS.blue,DISTRICT_COLORS.green,'#e3e8ef',DISTRICT_COLORS.red];

function useCardTooltip(text:string|undefined){
  const id=useId(),[anchor,setAnchor]=useState<HTMLElement|null>(null),tooltip=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    const bubble=tooltip.current;if(!anchor||!bubble)return;
    const place=()=>{
      if(!anchor.isConnected||!anchor.getClientRects().length){setAnchor(null);return;}
      const rect=anchor.getBoundingClientRect(),margin=10,width=bubble.offsetWidth,height=bubble.offsetHeight;
      const above=rect.top>=height+margin*2;
      bubble.style.left=`${Math.max(margin,Math.min(rect.left+rect.width/2-width/2,document.documentElement.clientWidth-width-margin))}px`;
      bubble.style.top=`${Math.max(margin,Math.min(above?rect.top-height-margin:rect.bottom+margin,window.innerHeight-height-margin))}px`;
      bubble.style.visibility='visible';
    };
    const resize=new ResizeObserver(place);resize.observe(anchor);
    place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
    return()=>{resize.disconnect();window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
  },[anchor,text]);
  return {
    props:{
      'aria-describedby':anchor&&text?id:undefined,
      onPointerEnter:(event:{currentTarget:HTMLElement})=>{if(text)setAnchor(event.currentTarget);},
      onPointerLeave:(event:{currentTarget:HTMLElement})=>{if(!event.currentTarget.matches(':focus-visible'))setAnchor(null);},
      onFocus:(event:{currentTarget:HTMLElement})=>{if(text)setAnchor(event.currentTarget);},
      onBlur:(event:{currentTarget:HTMLElement})=>{if(!event.currentTarget.matches(':hover'))setAnchor(null);},
    },
    bubble:anchor&&text?createPortal(<div ref={tooltip} id={id} className="ct-card-tooltip" role="tooltip" style={{visibility:'hidden'}}>{text}</div>,document.body):null,
  };
}

export function Building({card,selected=false,onClick}:{card:District;selected?:boolean;onClick?:()=>void}){
  const d=district(card),color=DISTRICT_COLORS[d.color],tooltip=useCardTooltip(d.text?`${d.name}：${d.text}`:undefined);
  const appearance={glowColor:color,highlightColor:color,trimColor:`${color}66`,pattern:'rings' as const,restingLight:(selected?[.5,.5]:[.09,.09]) as readonly [number,number],selected,width:'var(--ct-card-width,92px)',radius:8};
  const description=`${d.name} · ${COLORS[d.color]}建筑 · ${d.cost} 金币${d.text?` · ${d.text}`:''}`;
  const body=<><span className="ct-building-cost" role="img" aria-label={`费用 ${d.cost} 金币`}>{Array.from({length:d.cost},(_,index)=><GoldCoin key={index} engraved/>)}</span><strong className="ct-building-name">{d.name}</strong></>;
  const props={className:'ct-building','data-color':d.color,'data-targetable':!!onClick,'aria-label':description,...tooltip.props};
  return <>{onClick?<HolographicCard as="button" {...appearance} {...props} onClick={onClick} aria-pressed={selected}>{body}</HolographicCard>:<HolographicCard {...appearance} {...props} role="img" tabIndex={d.text?0:undefined}>{body}</HolographicCard>}{tooltip.bubble}</>;
}

export function BuildingFan({cards,label,selected=[],onChoose,canChoose,empty='城区尚待奠基'}:{cards:readonly District[];label:string;selected?:readonly string[];onChoose?:(card:District)=>void;canChoose?:(card:District)=>boolean;empty?:string}){
  return <div className="ct-building-fan" role="group" aria-label={label} style={{'--ct-card-count':Math.max(1,cards.length)} as CSSProperties}>
    {cards.length?cards.map(card=><Building key={card.id} card={card} selected={selected.includes(card.id)} onClick={onChoose&&(!canChoose||canChoose(card))?()=>onChoose(card):undefined}/>):<span className="ct-empty">{empty}</span>}
  </div>;
}

export function RoleCard({rank,current,status,called,selected,onClick}:{rank:number;current:boolean;status:string;called:boolean;selected:boolean;onClick?:()=>void}){
  const role=ROLES[rank-1],color=ROLE_COLORS[rank-1],tooltip=useCardTooltip(`${role.name}：${role.text}`);
  const appearance={glowColor:color,highlightColor:color,trimColor:`${color}66`,rainbow:rank<=3,pattern:'symbols' as const,patternSymbol:role.symbol,restingLight:(current||selected?[.5,.5]:[.09,.09]) as readonly [number,number],width:'100%',radius:9,selected};
  const props={className:'ct-role-card','data-current':current,'data-called':called,'data-targetable':!!onClick,'aria-label':`${rank} 号 ${role.name} · ${status}`,'aria-current':current?'step' as const:undefined,...tooltip.props};
  const body=<><span className="ct-role-rank">{rank}</span><strong>{role.name}</strong><small>{status}</small></>;
  return <div role="listitem">{onClick?<HolographicCard as="button" {...appearance} {...props} onClick={onClick} aria-pressed={selected}>{body}</HolographicCard>:<HolographicCard {...appearance} {...props} role="img" tabIndex={0}>{body}</HolographicCard>}{tooltip.bubble}</div>;
}
