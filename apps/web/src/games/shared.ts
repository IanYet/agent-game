import type { StablePlayer, StoredRun } from '../runtime/types';
export const enginePlayers=(roster:StablePlayer[])=>roster.map(p=>({playerId:p.playerId,name:p.name,kind:p.kind==='human'?'human' as const:'agent' as const}));
export const seatFor=(run:StoredRun,actorId:string)=>{const seat=run.roster.findIndex(p=>p.playerId===actorId);if(seat<0)throw new Error('玩家身份不属于当前游戏');return seat;};
export const decorateView=(view:any,roster:StablePlayer[])=>({...view,players:view.players.map((p:any,i:number)=>({...p,...roster[i]}))});
export const emptySchema={type:'object' as const,additionalProperties:false};
export const readOnly={readOnlyHint:true,destructiveHint:false,openWorldHint:false};
export const agentObservation=(view:any)=>({...view,legalActionCount:view.legalActions.length,legalActions:view.legalActions.slice(0,12)});
export const decisionKey=(run:StoredRun,revision:number,seat:number)=>`${run.runId}:${revision}:${run.roster[seat].playerId}`;
export function checkRevision(state:{revision:number},args:Record<string,unknown>){if(args.revision!==state.revision)throw new Error('状态已更新，请重新读取当前决策');}
