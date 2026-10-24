import type {ComponentProps,ReactNode} from 'react';
import {PlayerCard,PlayerTableActions} from '../visuals/PlayerCard';
import './HumanPlayerCard.css';

type HumanPlayerCardProps=Omit<ComponentProps<typeof PlayerCard>,'children'|'className'|'primary'|'status'|'action'>&{
  player:{name:string};
  badges?:ReactNode;
  metrics?:readonly {label:string;value:ReactNode}[];
  status:string;
  children?:ReactNode;
  actions?:ReactNode;
  tableActions?:ReactNode;
};

export function HumanPlayerCard({player,badges,metrics,status,children,actions,tableActions,...props}:HumanPlayerCardProps){
  return <PlayerCard {...props} primary className="human-player-card" data-player-surface data-cursor-lens="off">
    <header className="human-player-heading">
      <div className="human-player-identity"><span className="human-player-caption">YOU ARE IN.</span><div className="human-player-name-row"><strong title={player.name}>{player.name}</strong>{badges&&<span className="human-player-badges">{badges}</span>}</div></div>
      {!!metrics?.length&&<div className="human-player-metrics">{metrics.map(metric=><span key={metric.label}><b>{metric.value}</b><small>{metric.label}</small></span>)}</div>}
    </header>
    {children&&<div className="human-player-content">{children}</div>}
    {actions&&<div className="human-player-actions">{actions}</div>}
    <PlayerTableActions status={status}>{tableActions}</PlayerTableActions>
  </PlayerCard>;
}
