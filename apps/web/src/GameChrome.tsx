import type {ReactNode} from 'react';

export function GameChrome({title,status,actions}:{title:string;status?:string;actions:ReactNode}){
  return <header className="game-chrome"><div className="game-heading-row"><h1>{title}{status&&<span>{status}</span>}</h1><div className="game-actions game-page-actions">{actions}</div></div></header>;
}
