import {createContext,useContext} from 'react';
import type {SeatRuntime} from '../runtime/types';
import {FoilPanel,type FoilPanelProps} from './FoilPanel';
import {AgentStrands} from './AgentStrands';
import {AgentConversationAccess} from '../AgentConversations';
import './player-card.css';

export type PlayerCardState='waiting'|'connecting'|'thinking'|'acting'|'folded'|'paused'|'finished';
const illumination:Record<PlayerCardState,number>={waiting:.5,connecting:1.15,thinking:1.85,acting:1.85,folded:0,paused:.4,finished:.55};
const CardState=createContext<PlayerCardState>('waiting');

// Games supply their own turn/fold/end facts. The visual state priority is shared.
export function playerCardState({active,paused,finished,folded=false,runtime}:{active:boolean;paused:boolean;finished:boolean;folded?:boolean;runtime?:SeatRuntime}):PlayerCardState{
  if(folded)return 'folded';
  if(finished)return 'finished';
  if(paused)return 'paused';
  if(!active)return 'waiting';
  if(runtime?.kind!=='human'&&runtime?.status==='thinking')return 'thinking';
  if(runtime?.kind!=='human'&&runtime?.status==='connecting')return 'connecting';
  return 'acting';
}

export function PlayerCard({state,children,...props}:Omit<FoilPanelProps,'illumination'>&{state:PlayerCardState}){
  return <CardState.Provider value={state}><FoilPanel {...props} data-player-state={state} illumination={illumination[state]}>{children}</FoilPanel></CardState.Provider>;
}

export function PlayerCardAvatar({kind,seat,showNumber=true}:{kind:string;seat:number;showNumber?:boolean}){
  const state=useContext(CardState);
  const openConversation=useContext(AgentConversationAccess);
  if(kind==='human')return <span className="participant-mark" aria-hidden="true">H</span>;
  return <span className="player-agent-avatar"><AgentStrands active={state==='thinking'} connecting={state==='connecting'} muted={state==='folded'} seat={seat} showNumber={showNumber}/>{openConversation&&<button type="button" className="agent-conversation-button" aria-label={`查看第 ${seat+1} 位 Agent 的对话`} title="查看这位 Agent 的完整对话" data-cursor-lens="off" onClick={()=>openConversation(seat)}/>}</span>;
}
