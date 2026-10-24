import type {ComponentProps,CSSProperties,ReactNode} from 'react';
import {HumanPlayerCard} from './HumanPlayerCard';
import {PlayingCard,PlayingCardGroup,type PlayingCardProps} from './PlayingCard';

type HumanPokerPlayerCardProps=Omit<ComponentProps<typeof HumanPlayerCard>,'player'|'children'|'actions'>&{
  player:{name:string;count:number};
  hand:readonly PlayingCardProps[];
  status:string;
  emptyHand?:string;
  actions:ReactNode;
  children?:ReactNode;
};

export function HumanPokerPlayerCard({player,hand,emptyHand='手牌已出完',actions,children,metrics,...props}:HumanPokerPlayerCardProps){
  return <HumanPlayerCard {...props} player={player} metrics={metrics??[{label:'张',value:player.count}]} actions={<div className="action-area">{actions}</div>}>
    <PlayingCardGroup className="hand card-hand" style={{'--hand-count':Math.max(1,hand.length)} as CSSProperties}>
      {hand.length?hand.map((card,i)=><PlayingCard {...card} key={card.card?.id??i} size="large"/>):<span className="empty-hand">{emptyHand}</span>}
    </PlayingCardGroup>
    {children}
  </HumanPlayerCard>;
}
