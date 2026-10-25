import type {CSSProperties,HTMLAttributes,ReactNode} from 'react';
import {GameSidebar,GameActivity} from './GameSidebar';
import './GameLayout.css';
import './BoardGameLayout.css';

type PublicEvent={seq:number;text:string;seat?:number};
export type BoardGamePanel='table'|'players'|'player'|'activity';
type ViewportLayout={mode:'player'|'spectator';panel:BoardGamePanel;onPanelChange:(panel:BoardGamePanel)=>void;playerLabel:string;tableActions:ReactNode};
export function GameLayout<Event extends PublicEvent>({gameId,label,className='',surfaceClassName='',toolbar,score,events,eventPlayers,activityTitle,renderEventDetail,children,after,viewport}:{gameId:string;label:string;className?:string;surfaceClassName?:string;toolbar:ReactNode;score:ReactNode;events:readonly Event[];eventPlayers?:readonly {name:string}[];activityTitle?:string;renderEventDetail?:(event:Event)=>ReactNode;children:ReactNode;after?:ReactNode;viewport?:ViewportLayout}){
  const activePanel=viewport?.mode==='spectator'&&viewport.panel==='player'?'table':viewport?.panel;
  return <div className={`table-layout game-layout ${viewport?'board-game-layout ':''}${className}`} data-board-mode={viewport?.mode} data-board-panel={activePanel}>
    {viewport&&<nav className="board-layout-tabs" aria-label="游戏区域">
      {(['table','players',...(viewport.mode==='player'?['player'] as const:[]),'activity'] as BoardGamePanel[]).map(panel=><button key={panel} type="button" className="button outline" aria-pressed={activePanel===panel} onClick={()=>viewport.onPanelChange(panel)}>{panel==='table'?'公共牌桌':panel==='players'?'玩家':panel==='player'?viewport.playerLabel:'计分与动态'}</button>)}
    </nav>}
    <section className={`game-surface ${surfaceClassName}`} data-game-surface={gameId} aria-label={label}>
      <div className="table-toolbar">{toolbar}</div>
      {children}
    </section>
    <GameSidebar>{score}<GameActivity events={events} players={eventPlayers} title={activityTitle} renderDetail={renderEventDetail}/></GameSidebar>
    {viewport&&<div className="board-layout-controls">{viewport.mode==='spectator'?<SpectatorTableActions>{viewport.tableActions}</SpectatorTableActions>:viewport.tableActions}</div>}
    {after}
  </div>;
}

export function GameTable({className='',...props}:HTMLAttributes<HTMLDivElement>){
  return <div {...props} className={`game-table ${className}`}/>;
}

export function PlayerCardGrid({count,columns,minCardWidth=220,children,className='',style,...props}:HTMLAttributes<HTMLDivElement>&{count:number;columns?:number|string;minCardWidth?:number}){
  const cols=columns??(count===4?2:Math.min(3,Math.max(1,count)));
  const template=typeof cols==='string'?cols:`repeat(auto-fit,minmax(min(100%,max(${minCardWidth}px,calc((100% - ${Math.max(0,cols-1)} * 14px) / ${cols}))),1fr))`;
  return <div {...props} className={`player-card-grid ${className}`} style={{...style,gridTemplateColumns:template,gap:14} as CSSProperties}>{children}</div>;
}

export function SpectatorTableActions({children,notice='观战中 · 点击 Agent 光球查看对话'}:{children:ReactNode;notice?:string}){
  return <div className="spectator-table-actions"><p>{notice}</p>{children}</div>;
}
