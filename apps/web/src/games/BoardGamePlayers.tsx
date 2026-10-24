import {Children,useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {PlayerCardGrid} from './GameLayout';

// Render every seat; the grid reflows without changing the shared card framework.
export function BoardGamePlayers({children,activeIndex=-1,activeName,className='',minCardWidth=200}:{children:ReactNode;activeIndex?:number;activeName?:string;className?:string;minCardWidth?:number}){
  const cards=Children.toArray(children),grid=useRef<HTMLDivElement>(null);
  const [columns,setColumns]=useState(1);
  useLayoutEffect(()=>{
    const element=grid.current;if(!element)return;
    const measure=()=>{
      if(!element.clientWidth)return;
      setColumns(Math.max(1,Math.min(4,cards.length,Math.floor((element.clientWidth+14)/(minCardWidth+14)))));
    };
    const observer=new ResizeObserver(measure);observer.observe(element);measure();
    return()=>observer.disconnect();
  },[cards.length,minCardWidth]);
  const rows=Math.max(1,Math.ceil(cards.length/columns));
  return <section className={`board-players ${className}`} aria-label="玩家信息" style={{'--board-player-rows':rows,'--board-player-count':cards.length,'--board-min-player-width':`${minCardWidth}px`} as CSSProperties}>
    <div className="board-players-heading"><span>{cards.length} 位玩家</span>{activeIndex>=0&&<span>当前：{activeName}</span>}</div>
    <div ref={grid} className="board-player-slots"><PlayerCardGrid count={cards.length} columns={`var(--board-player-template,repeat(${columns},minmax(0,1fr)))`} style={{gridTemplateRows:`var(--board-player-template-rows,repeat(${rows},minmax(var(--board-player-min-height,264px),max-content)))`}}>{cards}</PlayerCardGrid></div>
  </section>;
}
