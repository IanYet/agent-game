import {Children,useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {PlayerCardGrid} from './GameLayout';

function agentTextWidth(card:Element,context:CanvasRenderingContext2D){
  const px=(value:string)=>Number.parseFloat(value)||0;
  const text=(element:Element|null)=>{
    if(!element)return 0;
    const style=getComputedStyle(element),value=element.textContent??'';
    context.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    return context.measureText(value).width+Math.max(0,value.length-1)*px(style.letterSpacing);
  };
  const inset=(style:CSSStyleDeclaration)=>px(style.paddingLeft)+px(style.paddingRight)+px(style.borderLeftWidth)+px(style.borderRightWidth);
  const heading=card.querySelector('.agent-player-heading'),footer=card.querySelector('.player-card-footer');
  let width=0;
  if(heading){
    const style=getComputedStyle(heading),gap=px(style.columnGap),avatar=heading.querySelector('.player-agent-avatar,.participant-mark');
    const avatarWidth=avatar?px(getComputedStyle(avatar).width):0,metrics=heading.querySelector('.agent-player-metrics');
    const values=Array.from(metrics?.children??[]);
    const metricWidth=values.reduce((sum,value)=>sum+text(value.querySelector('b'))+text(value.querySelector('small'))+px(getComputedStyle(value).columnGap),0)+Math.max(0,values.length-1)*(metrics?px(getComputedStyle(metrics).columnGap):0);
    width=Math.max(text(heading.querySelector('.agent-player-caption'))+gap+avatarWidth,text(heading.querySelector('.agent-player-name'))+gap+avatarWidth,text(heading.querySelector('.agent-player-model'))+gap*2+metricWidth+avatarWidth)+inset(style);
  }
  if(footer){
    const style=getComputedStyle(footer);
    width=Math.max(width,text(footer.querySelector('.player-card-status'))+text(footer.querySelector('.player-card-action'))+px(style.columnGap)+px(style.marginLeft)+px(style.marginRight)+inset(style));
  }
  return Math.ceil(width+inset(getComputedStyle(card))+2);
}

// Render every seat; the grid reflows without changing the shared card framework.
export function BoardGamePlayers({children,activeIndex=-1,activeName,className='',minCardWidth=200,fitCardText=false}:{children:ReactNode;activeIndex?:number;activeName?:string;className?:string;minCardWidth?:number;fitCardText?:boolean}){
  const cards=Children.toArray(children),grid=useRef<HTMLDivElement>(null);
  const [{columns,cardWidth},setLayout]=useState({columns:1,cardWidth:minCardWidth});
  useLayoutEffect(()=>{
    const element=grid.current;if(!element)return;
    const surface=element.closest('[data-game-surface]'),context=fitCardText?document.createElement('canvas').getContext('2d'):null;
    const measure=()=>{
      if(!element.clientWidth)return;
      const width=context?Math.max(minCardWidth,...Array.from(element.querySelectorAll('.agent-player-card'),card=>agentTextWidth(card,context))):minCardWidth;
      const reserved=fitCardText?Number.parseFloat(getComputedStyle(element).getPropertyValue('--board-player-reserved-width'))||0:0;
      const available=fitCardText&&surface?surface.clientWidth-reserved:element.clientWidth;
      const count=Math.max(1,Math.min(4,cards.length,Math.floor((available+14)/(width+14))));
      setLayout(previous=>previous.columns===count&&previous.cardWidth===width?previous:{columns:count,cardWidth:width});
    };
    const observer=new ResizeObserver(measure);observer.observe(element);if(fitCardText&&surface)observer.observe(surface);
    const content=fitCardText?new MutationObserver(measure):null;content?.observe(element,{subtree:true,childList:true,characterData:true});
    if(fitCardText)document.fonts.addEventListener('loadingdone',measure);
    measure();
    return()=>{observer.disconnect();content?.disconnect();if(fitCardText)document.fonts.removeEventListener('loadingdone',measure);};
  },[cards.length,minCardWidth,fitCardText]);
  const rows=Math.max(1,Math.ceil(cards.length/columns));
  return <section className={`board-players ${className}`} aria-label="玩家信息" style={{'--board-player-rows':rows,'--board-player-count':cards.length,'--board-min-player-width':`${cardWidth}px`,...(fitCardText?{'--board-fit-player-width':`${columns*cardWidth+(columns-1)*14}px`,'--board-player-template':`repeat(${columns},${cardWidth}px)`}:{})} as CSSProperties}>
    <div className="board-players-heading"><span>{cards.length} 位玩家</span>{activeIndex>=0&&<span>当前：{activeName}</span>}</div>
    <div ref={grid} className="board-player-slots"><PlayerCardGrid count={cards.length} columns={`var(--board-player-template,repeat(${columns},minmax(0,1fr)))`} style={{gridTemplateRows:`var(--board-player-template-rows,repeat(${rows},minmax(var(--board-player-min-height,264px),max-content)))`}}>{cards}</PlayerCardGrid></div>
  </section>;
}
