import {useCallback,useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import type {ControlledView} from '../../runtime/types';
import {useEffectsPreference} from '../../visuals/preferences';
import {transferHolographicLight} from '../../visuals/HolographicMaterial';
import {GemIcon} from './gem';
import {GEMS,LEVELS,type Card,type Gem,type SplendorView} from './types';

type Rect={left:number;top:number;width:number;height:number};
type View=ControlledView<SplendorView>;
type CardTransfer={kind:'card';id:string;card:Card|null;level:Card['level'];from:Rect;target:HTMLElement;reserved:boolean;deck:boolean;replacement?:HTMLElement};
type GemTransfer={kind:'gem';id:string;gem:Gem;from:Rect;target:SVGElement;delay:number};
type Transfer=CardTransfer|GemTransfer;
const visible=(rect:Rect)=>rect.width>0&&rect.height>0&&rect.left<innerWidth&&rect.top<innerHeight&&rect.left+rect.width>0&&rect.top+rect.height>0;

function FlyingCard({transfer,renderCard,onFinish}:{transfer:CardTransfer;renderCard:(card:Card|null,level:Card['level'])=>ReactNode;onFinish:(id:string)=>void}){
  const element=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    const {id,from,target,reserved,deck,replacement}=transfer,to=target.getBoundingClientRect();
    if(!visible(to)){onFinish(id);return;}
    const width=from.width,height=width*91/64;
    const x=to.left+to.width/2-from.left-width/2,y=to.top+(reserved?to.width*91/64:to.height)/2-from.top-height/2;
    const scale=reserved?to.width/width:.24,lean=x<0?-7:7;
    if(reserved)target.dataset.spCardArriving=id;
    const refill=replacement?.animate([{opacity:0},{opacity:1}],{duration:240,delay:120,fill:'backwards'});
    const animation=element.current!.animate([
      {transform:`translate(0,0) rotate(0deg) scale(${deck ? .3 : 1})`,opacity:deck?0:1,offset:0},
      {transform:`translate(${x*.32}px,${y*.25-28}px) rotate(${lean}deg) scale(1.06)`,opacity:1,offset:.35},
      {transform:`translate(${x*.9}px,${y*.9-8}px) rotate(${-lean*.25}deg) scale(${reserved?scale:Math.max(.42,scale)})`,opacity:1,offset:.82},
      {transform:`translate(${x}px,${y}px) rotate(0deg) scale(${scale})`,opacity:reserved?1:0,offset:1},
    ],{duration:660,easing:'cubic-bezier(.22,.61,.36,1)',fill:'both'});
    animation.onfinish=()=>{
      if(reserved&&element.current&&target.isConnected)transferHolographicLight(element.current,target);
      if(target.dataset.spCardArriving===id)delete target.dataset.spCardArriving;
      onFinish(id);
    };
    return()=>{
      animation.onfinish=null;animation.cancel();refill?.cancel();
      if(target.dataset.spCardArriving===id)delete target.dataset.spCardArriving;
    };
  },[transfer,onFinish]);
  const {from}=transfer;
  return <div ref={element} className="sp-flying-card" style={{left:from.left,top:from.top,'--sp-card-width':`${from.width}px`} as CSSProperties}>{renderCard(transfer.card,transfer.level)}</div>;
}

function FlyingGem({transfer,onFinish}:{transfer:GemTransfer;onFinish:(id:string)=>void}){
  const element=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    const {id,from,target,delay}=transfer,to=target.getBoundingClientRect();
    if(!visible(to)){onFinish(id);return;}
    const x=to.left+to.width/2-from.left-from.width/2,y=to.top+to.height/2-from.top-from.height/2;
    const scale=to.width/from.width,turn=x<0?-12:12;
    target.dataset.spGemArriving=id;
    const animation=element.current!.animate([
      {transform:'translate(0,0) rotate(0deg) scale(1)',offset:0},
      {transform:`translate(${x*.28}px,${y*.2-28}px) rotate(${turn}deg) scale(1.2)`,offset:.35},
      {transform:`translate(${x}px,${y}px) rotate(0deg) scale(${scale})`,offset:1},
    ],{duration:540,delay,easing:'cubic-bezier(.22,.61,.36,1)',fill:'both'});
    animation.onfinish=()=>{
      if(target.dataset.spGemArriving===id)delete target.dataset.spGemArriving;
      onFinish(id);
    };
    return()=>{animation.onfinish=null;animation.cancel();if(target.dataset.spGemArriving===id)delete target.dataset.spGemArriving;};
  },[transfer,onFinish]);
  const {from}=transfer;
  return <div ref={element} className="sp-flying-gem" style={{left:from.left,top:from.top,width:from.width,height:from.height}}><GemIcon color={transfer.gem}/></div>;
}

// Origins are measured before cards and gems leave the table. Only the
// projected view is used, so a private deck draw never supplies a card face.
export function TableTransfers({game,market,renderCard}:{game:View;market:RefObject<HTMLDivElement|null>;renderCard:(card:Card|null,level:Card['level'])=>ReactNode}){
  const {reduced}=useEffectsPreference(),previous=useRef<View|null>(null),origins=useRef(new Map<string,Rect>());
  const [transfers,setTransfers]=useState<Transfer[]>([]);
  const finish=useCallback((id:string)=>setTransfers(items=>items.filter(item=>item.id!==id)),[]);
  const measure=useCallback(()=>{
    const root=market.current?.closest('.sp-layout');
    const measured=new Map(Array.from(root?.querySelectorAll<HTMLElement>('[data-sp-card-origin]')??[],element=>[element.dataset.spCardOrigin!,element.getBoundingClientRect()]));
    for(const stock of root?.querySelectorAll<HTMLElement>('[data-sp-bank-color]')??[]){
      stock.querySelectorAll('.sp-bank-gems>.sp-gem').forEach((gem,index)=>measured.set(`bank:${stock.dataset.spBankColor}:${index}`,gem.getBoundingClientRect()));
    }
    origins.current=measured;
  },[market]);
  useLayoutEffect(()=>{
    const before=previous.current;previous.current=game;
    const root=market.current?.closest('.sp-layout');
    if(!before||before.id!==game.id||before.viewer!==game.viewer||game.revision<before.revision||game.revision>before.revision+1||reduced||document.hidden){
      setTransfers(items=>items.length?[]:items);measure();return;
    }
    const added:Transfer[]=[];
    for(const event of game.events.filter(event=>event.seq>(before.events.at(-1)?.seq??0))){
      if(event.seat===undefined||!['take','buy','reserve','reserveDeck'].includes(event.type))continue;
      const player=game.players[event.seat],oldPlayer=before.players[event.seat];
      if(!player||!oldPlayer)continue;
      if(event.type!=='buy'){
        let order=0;
        for(const gem of GEMS){
          const count=Math.min(event.tokens?.[gem]??0,player.tokens[gem]-oldPlayer.tokens[gem]);
          const destinations=root?.querySelectorAll<SVGElement>(`[data-sp-held-seat="${event.seat}"] [data-sp-held-gem="${gem}"]>.sp-gem`);
          for(let index=0;index<count;index++){
            const from=origins.current.get(`bank:${gem}:${before.bank[gem]-count+index}`),target=destinations?.[oldPlayer.tokens[gem]+index];
            if(from&&target&&visible(from)&&visible(target.getBoundingClientRect()))added.push({kind:'gem',id:`${game.id}:${event.seq}:${gem}:${index}`,gem,from,target,delay:(event.type==='take'?0:120)+order++*60});
          }
        }
      }
      if(event.type==='take')continue;
      const reserved=event.type!=='buy',deck=event.type==='reserveDeck';
      const cardId=event.cards?.[0];
      const card=reserved?player.reserved.find(item=>item.card?.id===cardId)?.card:player.bought.find(item=>item.id===cardId);
      const level=event.level??card?.level;
      if(!level||!reserved&&!card)continue;
      let origin=deck?`deck:${level}`:`market:${cardId}`,replacement:HTMLElement|undefined;
      const marketLevel=LEVELS.find(value=>before.market[value].some(item=>item?.id===cardId));
      if(marketLevel){
        const slot=before.market[marketLevel].findIndex(item=>item?.id===cardId);
        replacement=root?.querySelector<HTMLElement>(`[data-sp-market-slot="${marketLevel}:${slot}"] .sp-card`)??undefined;
      }else if(!deck){
        const index=oldPlayer.reserved.findIndex(item=>item.card?.id===cardId);
        // A purchased hidden reservation is now public; its former identity was
        // unavailable, so use a matching back rather than reading private state.
        const source=index>=0?index:oldPlayer.reserved.findIndex(item=>!item.card&&item.level===level);
        origin=`reserved:${event.seat}:${source}`;
      }
      let from=origins.current.get(origin);
      const target=root?.querySelector<HTMLElement>(reserved?`[data-sp-reserved-seat="${event.seat}"] .sp-reserved-card:last-child`:`[data-sp-bought-target="${event.seat}"]`);
      if(!from||!target||!visible(from)||!visible(target.getBoundingClientRect()))continue;
      if(deck){
        const width=root?.querySelector('.sp-market-slot')?.getBoundingClientRect().width??112;
        from={left:from.left+from.width/2-width/2,top:from.top+from.height/2-width*91/128,width,height:width*91/64};
      }
      added.push({kind:'card',id:`${game.id}:${event.seq}`,card:deck?null:card??null,level,from,target,reserved,deck,replacement});
    }
    setTransfers(items=>{
      const active=items.filter(item=>item.target.isConnected);
      return added.length?[...active,...added]:active.length===items.length?items:active;
    });
    measure();
  },[game,reduced,market,measure]);
  useLayoutEffect(()=>{
    const root=market.current?.closest('.sp-layout');
    const reset=()=>{setTransfers(items=>items.length?[]:items);measure();};
    const observer=new ResizeObserver(reset);if(root)observer.observe(root);
    window.addEventListener('resize',reset);window.addEventListener('scroll',reset,true);document.addEventListener('visibilitychange',reset);
    return()=>{observer.disconnect();window.removeEventListener('resize',reset);window.removeEventListener('scroll',reset,true);document.removeEventListener('visibilitychange',reset);};
  },[game.id,market,measure]);
  // These non-interactive copies must remain paintable: the card material
  // renderer suspends inert subtrees. Pointer input is disabled by the layer.
  return createPortal(<div className="sp-table-transfers" aria-hidden="true">{!reduced&&transfers.map(transfer=>transfer.kind==='card'?<FlyingCard key={transfer.id} transfer={transfer} renderCard={renderCard} onFinish={finish}/>:<FlyingGem key={transfer.id} transfer={transfer} onFinish={finish}/>)}</div>,document.body);
}
