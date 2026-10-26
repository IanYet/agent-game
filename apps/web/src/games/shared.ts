import type { StablePlayer, StoredRun, PendingDecision } from '../runtime/types';
import type {BrowserToolRequest} from '@agent-game/protocol';
export const enginePlayers=(roster:StablePlayer[])=>roster.map(p=>({playerId:p.playerId,name:p.name,kind:p.kind==='human'?'human' as const:'agent' as const}));
export const seatFor=(run:StoredRun,actorId:string)=>{const seat=run.roster.findIndex(p=>p.playerId===actorId);if(seat<0)throw new Error('玩家身份不属于当前游戏');return seat;};
export const decorateView=(view:any,roster:StablePlayer[])=>({...view,players:view.players.map((p:any,i:number)=>({...p,...roster[i]}))});
export const emptySchema={type:'object' as const,additionalProperties:false};
export const readOnly={readOnlyHint:true,destructiveHint:false,openWorldHint:false};
export const agentObservation=(view:any)=>{const {legalActions:_,legalMoves:__,...observation}=view;return observation;};
export const agentIdentity=(run:StoredRun,actor:string)=>`${run.roster[seatFor(run,actor)].name}（playerId=${actor}，seat=${seatFor(run,actor)}）`;
export const historyCursor=(run:StoredRun<{events:{seq:number}[]}>)=>run.state.events.at(-1)?.seq??0;
export const historyInstructions='首次消息提供当前可见局面和本局完整公开记录；后续消息保留当前局面，events 仅含 eventsAfter 之后的新记录，eventsThrough 是本次记录截止序号。需要完整历史时调用 game_get_state。技能通知仅供知悉，无需回复或行动，等待决策消息再操作。';
export function incrementalObservation<T extends {events:{seq:number}[];notifications?:{seq:number}[]}>(view:T,afterEvent=0){
  return {...view,eventsAfter:afterEvent,eventsThrough:view.events.at(-1)?.seq??0,events:view.events.filter(e=>e.seq>afterEvent),...(view.notifications?{notifications:view.notifications.filter(n=>n.seq>afterEvent)}:{})};
}
export const decisionKey=(run:StoredRun,revision:number,seat:number)=>`${run.runId}:${revision}:${run.roster[seat].playerId}`;
export function checkRevision(state:{revision:number},args:Record<string,unknown>){if(args.revision!==state.revision)throw new Error('状态已更新，请重新读取当前决策');}
export function checkDecision(run:StoredRun,request:BrowserToolRequest,decisions:PendingDecision[]){
  if(request.scopeId!==run.runId)throw new Error('工具授权不属于当前局');
  if(!decisions.some(d=>d.actorId===request.playerId&&d.decisionId===request.decisionId&&(!d.allowedTools||d.allowedTools.includes(request.tool))))throw new Error('决策已过期、已完成或不属于当前玩家');
  checkRevision(run.state,request.args);
}
