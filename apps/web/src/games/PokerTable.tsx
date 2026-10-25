import type {CSSProperties} from 'react';
import {FoilPanel} from '../visuals/FoilPanel';
import {GameTable} from './GameLayout';
import {PlayingCard,PlayingCardGroup,type PlayingCardProps} from './PlayingCard';
import './PokerTable.css';

export type PokerTableCard=Pick<PlayingCardProps,'card'|'marker'>;
export type PokerTableAction={label:string;cards?:readonly PokerTableCard[]};
type TableNotice={title:string;text?:string;lines?:readonly string[]};
type TableResult={title:string;detail?:string;note?:string;scores?:readonly {name:string;delta:number;detail?:string}[]};

export function PokerTable({players,actions,status,topCards,caption,notice,result}:{players:readonly {name:string;seat:number}[];actions:readonly (PokerTableAction|null)[];status:string;topCards?:{label:string;cards:readonly PokerTableCard[]};caption?:string;notice?:TableNotice;result?:TableResult}){
  const columns=Math.min(5,players.length);
  return <GameTable className="poker-table" aria-label="公开出牌信息">
    {caption&&<p className="poker-table-caption">{caption}</p>}
    {topCards&&<div className="poker-table-top-cards"><span>{topCards.label}</span><PlayingCardGroup>{topCards.cards.map((card,i)=><PlayingCard {...card} size="small" key={card.card?.id??i}/>)}</PlayingCardGroup></div>}
    {notice&&<div className="poker-table-notice"><h2>{notice.title}</h2>{notice.text&&<p>{notice.text}</p>}{notice.lines?.map((line,i)=><small key={i}>{line}</small>)}</div>}
    <div className="poker-played-grid" style={{gridTemplateColumns:`repeat(${columns},minmax(0,1fr))`}}>
      {players.map(player=>{const action=actions[player.seat];return <div className="poker-played-zone" key={player.seat}>
        <small>{player.name}</small><span className="poker-played-label" title={action?.label}>{action?.label||'本回合尚未行动'}</span>
        <PlayingCardGroup className="poker-played-cards" style={{'--played-count':action?.cards?.length??0} as CSSProperties}>{action?.cards?.map((card,i)=><PlayingCard {...card} size="large" key={card.card?.id??i}/>)}</PlayingCardGroup>
      </div>;})}
    </div>
    <div className="poker-table-status"><span className="turn-pulse"/>{status}</div>
    {result&&<div className="result-overlay"><FoilPanel className="result-panel"><h2>{result.title}</h2>{result.detail&&<p>{result.detail}</p>}<div className="result-scores">{result.scores?.map((score,i)=><span key={i}>{score.name}<b className={score.delta>0?'positive':''}>{score.delta>0?'+':''}{score.delta}</b>{score.detail&&<small>{score.detail}</small>}</span>)}</div>{result.note&&<p>{result.note}</p>}</FoilPanel></div>}
  </GameTable>;
}
