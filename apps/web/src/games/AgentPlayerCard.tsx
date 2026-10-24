import type {ComponentProps,ReactNode} from 'react';
import type {StablePlayer} from '../runtime/types';
import {effortLabel,kindName} from '../AgentModelFields';
import {PlayerCard,PlayerCardAvatar} from '../visuals/PlayerCard';
import {PlayingCard,PlayingCardGroup,type PlayingCardProps} from './PlayingCard';
import './AgentPlayerCard.css';

type AgentPlayer=Pick<StablePlayer,'name'|'kind'|'model'|'reasoningEffort'>&{seat:number};
type AgentHand={count:number;cards?:readonly Pick<PlayingCardProps,'card'|'marker'>[];note?:string};
type AgentPlayerCardProps=Omit<ComponentProps<typeof PlayerCard>,'children'|'className'|'primary'>&{
  player:AgentPlayer;
  caption?:string;
  modelName?:string;
  metrics?:readonly {label:string;value:ReactNode}[];
  hand?:AgentHand;
  children?:ReactNode;
  status:string;
  action:string;
};

export function AgentPlayerCard({player,caption,modelName,metrics,hand,status,action,children,...props}:AgentPlayerCardProps){
  const values=metrics??(hand?[{label:'张',value:hand.count}]:[]);
  const model=modelName??player.model;
  return <PlayerCard {...props} className="agent-player-card" status={status} action={action} aria-label={props['aria-label']??`${player.name}的玩家卡`}>
    <header className="agent-player-heading">
      <span className="agent-player-caption">PLAYER {String(player.seat+1).padStart(2,'0')}{caption?` · ${caption}`:''}</span>
      <strong className="agent-player-name" title={player.name}>{player.name}</strong>
      <small className="agent-player-model" title={[kindName[player.kind],model,player.reasoningEffort&&effortLabel(player.reasoningEffort)].filter(Boolean).join(' · ')}>{kindName[player.kind]}{model?` · ${model}`:''}{player.reasoningEffort?` · ${effortLabel(player.reasoningEffort)}`:''}</small>
      <div className="agent-player-metrics">{values.map(value=><span key={value.label}><b>{value.value}</b><small>{value.label}</small></span>)}</div>
      <PlayerCardAvatar kind={player.kind} seat={player.seat}/>
    </header>
    {(hand||children)&&<div className="agent-player-body">
      {hand&&<><PlayingCardGroup className="agent-player-hand" data-short-hand={hand.count<=2}>
        {hand.count?hand.cards?hand.cards.map((card,i)=><PlayingCard {...card} key={card.card?.id??i} size="small"/>):Array.from({length:hand.count},(_,i)=><PlayingCard key={i} size="small"/>):<span className="empty-hand">手牌已出完</span>}
      </PlayingCardGroup>{(hand.note||(!hand.cards&&hand.count>0))&&<p className="agent-player-note">{hand.note||'手牌仅本人可见'}</p>}</>}
      {children}
    </div>}
  </PlayerCard>;
}
