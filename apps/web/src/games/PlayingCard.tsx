import {useLayoutEffect,useRef,type HTMLAttributes,type ReactNode} from 'react';
import {cardLabel,rankLabel,type Card} from '@agent-game/core';
import {useEffectsPreference} from '../visuals/preferences';
import {SvgIcon} from '../visuals/SvgIcon';
import type {SvgIconName} from '../visuals/svg-icons';
import './PlayingCard.css';

const SUIT_ICONS:Record<Card['suit'],SvgIconName>={S:'spade',H:'heart',C:'club',D:'diamond',J:'joker'};

export type PlayingCardProps={
  card?:Card;
  size?:'small'|'large';
  selected?:boolean;
  disabled?:boolean;
  onClick?:()=>void;
  marker?:{symbol:ReactNode;label:string};
  className?:string;
};

export function PlayingCard({card,size='large',selected=false,disabled=false,onClick,marker,className=''}:PlayingCardProps){
  const joker=card?.suit==='J',red=!!card&&(card.suit==='H'||card.suit==='D'||card.rank===17);
  const name=card?joker?card.rank===17?'红色王牌':'黑色王牌':cardLabel(card):'背面牌';
  const label=marker?`${name} · ${marker.label}`:name;
  const cls=`playing-card ${size==='small'?'mini':'large'}${red?' red':''}${!card?' card-back':''}${selected?' selected':''}${marker?' card-marked':''} ${className}`;
  const content=card?<>
    <span className={`card-corner${joker?' card-joker-corner':''}`} aria-hidden="true"><b>{joker?'JOKER':rankLabel(card.rank)}</b>{!joker&&<i><SvgIcon name={SUIT_ICONS[card.suit]}/></i>}</span>
    <span className={`card-pip${joker?' card-joker':''}`} aria-hidden="true"><SvgIcon name={SUIT_ICONS[card.suit]}/></span>
    {marker&&<em className="card-marker" aria-hidden="true">{marker.symbol}</em>}
  </>:<span className="card-back-pattern" aria-hidden="true"><SvgIcon name="sparkle"/></span>;
  return onClick?<button type="button" className={cls} title={label} aria-label={label} aria-pressed={selected} disabled={disabled} onClick={onClick}>{content}</button>:<span className={cls} role="img" title={label} aria-label={label}>{content}</span>;
}

export function PlayingCardGroup({children,className='',...props}:Omit<HTMLAttributes<HTMLDivElement>,'onPointerMove'|'onPointerLeave'>){
  const root=useRef<HTMLDivElement>(null),point=useRef<{x:number;y:number;card:HTMLElement|null}|null>(null),{reduced}=useEffectsPreference();
  const wave=()=>{
    const area=root.current;if(!area)return;
    const cards=Array.from(area.querySelectorAll<HTMLElement>('.playing-card')),rect=area.getBoundingClientRect();
    let at=-1;
    if(point.current&&!reduced&&rect.width&&rect.height){
      if(point.current.card)at=cards.indexOf(point.current.card);
      const x=(point.current.x-rect.left)/rect.width*area.clientWidth+area.scrollLeft,y=(point.current.y-rect.top)/rect.height*area.clientHeight+area.scrollTop;
      if(at<0)for(let i=cards.length-1;i>=0;i--){const card=cards[i];if(x>=card.offsetLeft&&x<=card.offsetLeft+card.offsetWidth&&y>=card.offsetTop-32&&y<=card.offsetTop+card.offsetHeight){at=i;break;}}
    }
    cards.forEach((card,i)=>{
      const sameRow=at>=0&&Math.abs(card.offsetTop-cards[at].offsetTop)<2;
      const lift=sameRow?[24,15,7][Math.abs(i-at)]??0:0;
      card.style.setProperty('--card-lift',`${lift}px`);
    });
  };
  useLayoutEffect(()=>{wave();});
  return <div {...props} ref={root} className={`playing-card-group ${className}`} onPointerMove={event=>{if(event.pointerType==='touch')return;const card=event.target instanceof Element?event.target.closest<HTMLElement>('.playing-card'):null;point.current={x:event.clientX,y:event.clientY,card:card&&event.currentTarget.contains(card)?card:null};wave();}} onPointerLeave={()=>{point.current=null;wave();}}>{children}</div>;
}
