import {useLayoutEffect,useRef,type ReactNode} from 'react';

export function GameChrome({title,status,actions}:{title:string;status?:string;actions:ReactNode}){
  const heading=useRef<HTMLElement>(null);
  useLayoutEffect(()=>{
    const page=heading.current?.closest('.game-page');
    const layout=page?.querySelector<HTMLElement>('.game-layout');
    const main=layout?.querySelector<HTMLElement>(':scope>section'),rail=layout?.querySelector<HTMLElement>(':scope>aside');
    const toolbar=main?.querySelector<HTMLElement>(':scope>.table-toolbar');
    if(!layout||!main||!rail||!toolbar)return;
    const align=()=>{
      const content=toolbar.nextElementSibling;if(!content)return;
      const mainBounds=main.getBoundingClientRect(),railBounds=rail.getBoundingClientRect();
      const beside=railBounds.left>=mainBounds.right-1;
      const offset=beside?Math.max(0,content.getBoundingClientRect().top-layout.getBoundingClientRect().top):0;
      const value=`${Math.round(offset*100)/100}px`;
      if(rail.style.getPropertyValue('--game-rail-offset')!==value)rail.style.setProperty('--game-rail-offset',value);
    };
    const observer=new ResizeObserver(align);observer.observe(layout);observer.observe(main);observer.observe(toolbar);align();
    return()=>{observer.disconnect();rail.style.removeProperty('--game-rail-offset');};
  },[title]);
  return <header ref={heading} className="game-chrome"><div className="game-heading-row"><h1>{title}{status&&<span>{status}</span>}</h1><div className="game-actions game-page-actions">{actions}</div></div></header>;
}
