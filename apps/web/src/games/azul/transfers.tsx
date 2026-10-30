import {useCallback,useEffect,useLayoutEffect,useRef,useState,type ReactNode,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import type {ControlledView} from '../../runtime/types';
import {useEffectsPreference} from '../../visuals/preferences';
import {COLORS,FLOOR_PENALTIES,type AzulEvent,type AzulView,type FloorToken} from './engine';

type View=ControlledView<AzulView>;
type Rect={left:number;top:number;width:number;height:number};
type Transfer={id:string;color:FloorToken;from:Rect;to:Rect;target:HTMLElement;delay:number;fade:boolean;reflow:boolean};
const MOVE_MS=540,STAGGER_MS=35,MAX_STAGGER=6;
const DRAFT_MS=MOVE_MS+STAGGER_MS*MAX_STAGGER+50;
const visible=(rect:Rect)=>rect.width>0&&rect.height>0&&rect.left<innerWidth&&rect.top<innerHeight&&rect.left+rect.width>0&&rect.top+rect.height>0;
const sameRect=(a:Rect,b:Rect)=>Math.abs(a.left-b.left)<.5&&Math.abs(a.top-b.top)<.5&&Math.abs(a.width-b.width)<.5&&Math.abs(a.height-b.height)<.5;

// A last pick can include wall scoring and a new deal in the same revision.
// Show its public draft event first so the pattern and floor still exist on arrival.
function draftFrame(before:View,after:View,event:AzulEvent):View|null{
  if(event.seat===undefined||!event.action)return null;
  const frame=structuredClone(before),player=frame.players[event.seat],{source,color,row}=event.action;
  if(!player)return null;
  if(source){frame.factories[source-1]=[];frame.center.push(...(event.moved??[]));}
  else frame.center=frame.center.filter(tile=>tile!==color);
  if(event.takesFirst){
    frame.markerInCenter=false;frame.firstOwner=event.seat;
    if(player.floor.length<FLOOR_PENALTIES.length)player.floor.push('first');
  }
  if(row)player.pattern[row-1].push(...Array(event.placed??0).fill(color));
  const overflow=event.overflow??0,onFloor=Math.min(overflow,FLOOR_PENALTIES.length-player.floor.length);
  player.floor.push(...Array(onFloor).fill(color));
  frame.discardCounts[color]+=overflow-onFloor;
  frame.turn=event.turn??after.turn;frame.revision=after.revision;
  frame.events=after.events.filter(item=>item.seq<=event.seq);frame.legalActions=[];
  return frame;
}

export function useAzulDraftFrame(incoming:View){
  const {reduced}=useEffectsPreference();
  const [presentation,setPresentation]=useState<{observed:View;draft:View|null}>({observed:incoming,draft:null});
  if(presentation.observed!==incoming||reduced&&presentation.draft!==null){
    const before=presentation.observed,sameTable=before.id===incoming.id&&before.viewer===incoming.viewer;
    let draft=sameTable&&before.revision===incoming.revision&&!reduced?presentation.draft:null;
    if(sameTable&&incoming.revision===before.revision+1&&!reduced&&!document.hidden){
      const added=incoming.events.filter(event=>event.seq>(before.events.at(-1)?.seq??0));
      const pick=added.find(event=>event.kind==='draft');
      if(pick&&added.some(event=>event.seq>pick.seq))draft=draftFrame(before,incoming,pick);
    }
    setPresentation({observed:incoming,draft});
  }
  const draft=presentation.draft;
  useEffect(()=>{
    if(!draft)return;
    const timer=setTimeout(()=>setPresentation(current=>current.draft===draft?{...current,draft:null}:current),DRAFT_MS);
    return()=>clearTimeout(timer);
  },[draft]);
  return {game:!reduced&&draft?draft:incoming,settling:!reduced&&draft!==null};
}

function FlyingTile({transfer,renderTile,onFinish}:{transfer:Transfer;renderTile:(color:FloorToken)=>ReactNode;onFinish:(id:string)=>void}){
  const element=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    const {id,from,to,target,delay,fade,reflow}=transfer;
    if(!target.isConnected||!visible(to)){onFinish(id);return;}
    const x=to.left+to.width/2-from.left-from.width/2,y=to.top+to.height/2-from.top-from.height/2;
    const scale=fade ? .55 : to.width/from.width,lean=x<0?-6:6;
    if(!fade)target.dataset.azulTileArriving=id;
    const keyframes=reflow?[
      {transform:'translate(0,0)'},
      {transform:`translate(${x}px,${y}px)`},
    ]:[
      {transform:'translate(0,0) rotate(0deg) scale(1)',opacity:1,offset:0},
      {transform:`translate(${x*.3}px,${y*.3-12}px) rotate(${lean}deg) scale(1.06)`,opacity:1,offset:.35},
      {transform:`translate(${x}px,${y}px) rotate(0deg) scale(${scale})`,opacity:fade?0:1,offset:1},
    ];
    const animation=element.current!.animate(keyframes,{duration:MOVE_MS,delay,easing:'cubic-bezier(.22,.61,.36,1)',fill:'both'});
    const reveal=()=>{if(target.dataset.azulTileArriving===id)delete target.dataset.azulTileArriving;};
    animation.onfinish=()=>{reveal();onFinish(id);};
    return()=>{animation.onfinish=null;animation.cancel();reveal();};
  },[transfer,onFinish]);
  const {from}=transfer;
  return <div ref={element} className="azul-flying-tile" style={{left:from.left,top:from.top,width:from.width,height:from.height}}>{renderTile(transfer.color)}</div>;
}

export function TileTransfers({game,market,renderTile}:{game:View;market:RefObject<HTMLDivElement|null>;renderTile:(color:FloorToken)=>ReactNode}){
  const {reduced}=useEffectsPreference(),previous=useRef<View|null>(null),origins=useRef(new Map<string,Rect>());
  const [transfers,setTransfers]=useState<Transfer[]>([]);
  const finish=useCallback((id:string)=>setTransfers(items=>items.filter(item=>item.id!==id)),[]);
  const measure=useCallback(()=>{
    const root=market.current?.closest('.azul-layout');
    origins.current=new Map(Array.from(root?.querySelectorAll<HTMLElement>('[data-azul-origin]')??[],element=>[element.dataset.azulOrigin!,element.getBoundingClientRect()]));
  },[market]);
  useLayoutEffect(()=>{
    const before=previous.current;previous.current=game;
    const root=market.current?.closest('.azul-layout');
    if(!before||before.id!==game.id||before.viewer!==game.viewer||game.revision<before.revision||game.revision>before.revision+1||reduced||document.hidden){
      setTransfers(items=>items.length?[]:items);return;
    }
    if(before.revision===game.revision)return;
    const added:Transfer[]=[];
    for(const event of game.events.filter(event=>event.seq>(before.events.at(-1)?.seq??0)&&event.kind==='draft')){
      if(event.seat===undefined||!event.action)continue;
      const {source,color,row}=event.action,player=before.players[event.seat];
      if(!player)continue;
      let order=0;
      const add=(tile:FloorToken,origin:string,selector:string,fade=false,reflow=false)=>{
        const from=origins.current.get(origin),slot=root?.querySelector<HTMLElement>(selector);
        const target=fade?slot:slot?.querySelector<HTMLElement>('.azul-tile')??slot;
        if(!from||!target)return;
        const to=target.getBoundingClientRect();
        if(!visible(from)||!visible(to)||reflow&&sameRect(from,to))return;
        added.push({id:`${game.id}:${event.seq}:${origin}`,color:tile,from,to,target,delay:reflow?0:Math.min(order++,MAX_STAGGER)*STAGGER_MS,fade,reflow});
      };
      const board=`[data-azul-board="${event.seat}"]`;
      let floorIndex=player.floor.length;
      if(event.takesFirst){
        if(floorIndex<FLOOR_PENALTIES.length)add('first','first',`${board} [data-azul-floor-cell="${floorIndex++}"]`);
        else add('first','first',`${board} .azul-floor-label`,true);
      }
      const count=event.count??0,placed=event.placed??0;
      for(let index=0;index<count;index++){
        const origin=`source:${source}:${color}:${index}`;
        if(index<placed){
          const cell=row-player.pattern[row-1].length-1-index;
          add(color,origin,`${board} [data-azul-pattern-cell="${row}:${cell}"]`);
        }else if(floorIndex<FLOOR_PENALTIES.length)add(color,origin,`${board} [data-azul-floor-cell="${floorIndex++}"]`);
        else add(color,origin,'[data-azul-discard]',true);
      }
      if(source)for(const leftover of COLORS){
        const oldCount=before.center.filter(tile=>tile===leftover).length;
        const moved=event.moved?.filter(tile=>tile===leftover).length??0;
        for(let index=0;index<moved;index++)add(leftover,`source:${source}:${leftover}:${index}`,`[data-azul-origin="source:0:${leftover}:${oldCount+index}"]`);
      }
      // Existing center tiles keep their identities when new colors arrive or
      // another color is taken. Slide them from their previous layout positions.
      for(const tile of COLORS){
        if(!source&&tile===color)continue;
        const count=before.center.filter(color=>color===tile).length;
        for(let index=0;index<count;index++){
          const origin=`source:0:${tile}:${index}`;
          add(tile,origin,`[data-azul-origin="${origin}"]`,false,true);
        }
      }
      if(before.markerInCenter&&!event.takesFirst)add('first','first','[data-azul-origin="first"]',false,true);
    }
    setTransfers(items=>[...items.filter(item=>item.target.isConnected),...added]);
  },[game,reduced,market]);
  // Also capture selection offsets and layout changes that do not change a revision.
  useLayoutEffect(measure);
  useLayoutEffect(()=>{
    const root=market.current?.closest('.azul-layout');
    const updateLayout=()=>{
      setTransfers(items=>{
        const active=items.filter(item=>item.target.isConnected&&sameRect(item.to,item.target.getBoundingClientRect()));
        return active.length===items.length?items:active;
      });
      measure();
    };
    const hide=()=>{setTransfers(items=>items.length?[]:items);measure();};
    const observer=new ResizeObserver(updateLayout);if(root)observer.observe(root);
    window.addEventListener('resize',updateLayout);window.addEventListener('scroll',updateLayout,true);document.addEventListener('visibilitychange',hide);
    return()=>{observer.disconnect();window.removeEventListener('resize',updateLayout);window.removeEventListener('scroll',updateLayout,true);document.removeEventListener('visibilitychange',hide);};
  },[game.id,market,measure]);
  return createPortal(<div className="azul-tile-transfers" aria-hidden="true">{!reduced&&transfers.map(transfer=><FlyingTile key={transfer.id} transfer={transfer} renderTile={renderTile} onFinish={finish}/>)}</div>,document.body);
}
