import {useLayoutEffect,useRef,type ReactNode} from 'react';
import {FoilPanel} from '../visuals/FoilPanel';
import './GameSidebar.css';

export function GameSidebar({children,className=''}:{children:ReactNode;className?:string}){
  return <aside className={`table-rail game-sidebar ${className}`}>{children}</aside>;
}

export function GameActivity<Event extends {seq:number;text:string;seat?:number}>({events,players,title='牌桌动态',renderDetail}:{events:readonly Event[];players?:readonly {name:string}[];title?:string;renderDetail?:(event:Event)=>ReactNode}){
  const list=useRef<HTMLDivElement>(null),follow=useRef(true);
  useLayoutEffect(()=>{if(follow.current&&list.current)list.current.scrollTop=0;},[events.length]);
  return <FoilPanel className="event-card game-activity"><div className="event-heading"><h3>{title}</h3><span>{events.length} 条</span></div><div ref={list} className="event-list" tabIndex={0} aria-label={title} onScroll={()=>{follow.current=(list.current?.scrollTop??0)<8;}}>{[...events].reverse().map(event=><div className="game-event" key={event.seq}><span className="event-time">#{event.seq}{event.seat!==undefined&&players?.[event.seat]?` · ${players[event.seat].name}`:''}</span><p>{event.text}</p>{renderDetail?.(event)}</div>)}{!events.length&&<p className="game-activity-empty">本局尚无动态。</p>}</div></FoilPanel>;
}
