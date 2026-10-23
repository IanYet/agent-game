// Contract fixture, intentionally absent from the production registry. It never supplies an Agent.
import {toolResult,type BrowserToolRequest,type ToolDefinition} from '@agent-game/protocol';
import type {GameModule,StoredRun} from '../../runtime/types';
export interface AuctionState {window:string;revision:number;startedAt:number;deadline?:number;members:Record<string,{budget:number;draft:number|null;confirmed:boolean}>;closed:boolean}
const peek:ToolDefinition={name:'auction.peek',description:'Read only your sealed offer and budget. Other participants remain private until settlement.',inputSchema:{type:'object',additionalProperties:false},annotations:{readOnlyHint:true},outputSchema:{type:'object',properties:{budget:{type:'integer'},offer:{type:['integer','null']},confirmed:{type:'boolean'},revision:{type:'integer'},waiting:{type:'integer'}},required:['budget','offer','confirmed','revision','waiting'],additionalProperties:false}};
const offer:ToolDefinition={name:'auction.offer',description:'Stage or revise a sealed offer. This does not complete the decision; confirm separately.',requiresDecision:true,inputSchema:{$schema:'https://json-schema.org/draft/2020-12/schema',type:'object',properties:{credits:{type:'integer',minimum:0,maximum:100}},required:['credits'],additionalProperties:false}};
const confirm:ToolDefinition={name:'auction.confirm',description:'Confirm your staged offer and finish this decision.',requiresDecision:true,inputSchema:{type:'object',additionalProperties:false},outputSchema:{type:'object',properties:{accepted:{const:true},closed:{type:'boolean'}},required:['accepted','closed'],additionalProperties:false}};
const finish=(state:AuctionState)=>{state.closed=Object.values(state.members).every(m=>m.confirmed);return state;};
function transition(run:StoredRun<AuctionState>,actor:string,input:unknown):AuctionState{
 const state=structuredClone(run.state),member=state.members[actor],value=input as {credits?:number;confirm?:boolean};
 if(!member||member.confirmed||state.closed)throw new Error('Offer window has closed for this participant');
 if(value.confirm){if(member.draft===null)throw new Error('Stage an offer before confirming');member.confirmed=true;}
 else {if(!Number.isInteger(value.credits)||value.credits!<0||value.credits!>member.budget)throw new Error('Offer exceeds your budget');member.draft=value.credits!;}
 state.revision++;return finish(state);
}
export const auctionModule:GameModule<AuctionState>={
 id:'sealed-auction-fixture',version:'1.0.0',stateVersion:1,name:'密封竞价',description:'所有参与者同时报价、分别确认。',tagline:'同时决策示例',minPlayers:2,maxPlayers:20,defaultPlayers:12,defaultConfig:{},runNoun:'轮',
 lifecycle:{sessionScope:'room',eagerAgents:false},rules:()=> 'Each participant has 100 credits. Stage an integer offer, revise freely, then confirm. Do not reveal other offers.',
 create:run=>({window:run.runId,revision:1,startedAt:Date.now(),...(run.config.durationMs?{deadline:Date.now()+run.config.durationMs}:{}),members:Object.fromEntries(run.roster.map(p=>[p.playerId,{budget:100,draft:null,confirmed:false}])),closed:false}),
 next:(_old,run)=>auctionModule.create(run,Math.random),
 finished:s=>s.closed,
 observe:(run,actor)=>actor?{...run.state.members[actor],revision:run.state.revision,waiting:Object.values(run.state.members).filter(m=>!m.confirmed).length}:{closed:run.state.closed,waiting:Object.values(run.state.members).filter(m=>!m.confirmed).length},
 decisions:run=>run.state.closed?[]:run.roster.filter(p=>!run.state.members[p.playerId].confirmed).map(p=>({decisionId:`${run.state.window}:${p.playerId}`,actorId:p.playerId,allowedTools:['auction.offer','auction.confirm'],deadline:run.state.deadline})),
 tools:()=>[peek,offer,confirm],
 initializePrompt:(run,actor)=>`Sealed auction. You are ${actor}. ${auctionModule.rules()} Your observation: ${JSON.stringify(auctionModule.observe(run,actor))}`,
 decisionPrompt:(run,d)=>`Decision ${d.decisionId}. Inspect, stage or revise using auction.offer, then auction.confirm. The decision survives other participants' changes. ${JSON.stringify(auctionModule.observe(run,d.actorId))}`,
 handleTool:(run,request:BrowserToolRequest)=>{
   if(request.tool==='auction.peek'){const member=run.state.members[request.playerId];return{result:toolResult({budget:member.budget,offer:member.draft,confirmed:member.confirmed,revision:run.state.revision,waiting:Object.values(run.state.members).filter(m=>!m.confirmed).length})};}
   if(!['auction.offer','auction.confirm'].includes(request.tool))throw new Error('Unregistered auction tool');
   const state=transition(run,request.playerId,request.tool==='auction.confirm'?{confirm:true}:request.args);
   if(request.tool==='auction.confirm')return{state,result:toolResult({accepted:true,closed:state.closed})};
   return{state,result:{...toolResult({staged:state.members[request.playerId].draft}),content:[{type:'text',text:'Offer staged; confirm when ready.'},{type:'image',mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5xkAAAAASUVORK5CYII='}]}};
 },
 humanAction:(run,actor,input)=>transition(run,actor,input),
 timeout:(run,d)=>{const state=structuredClone(run.state);state.members[d.actorId].draft??=0;state.members[d.actorId].confirmed=true;state.revision++;return finish(state);},
 restore:(data:any,version)=>{if(version!==1||typeof data?.window!=='string'||typeof data?.closed!=='boolean'||!data.members)throw new Error('Unsupported auction state');return data;},
 summary:run=>({id:run.roomId,gameId:'sealed-auction-fixture',round:run.index,endedAt:new Date(run.state.startedAt).toISOString(),title:'密封竞价已结束',subtitle:`${run.roster.length} 位参与者`,entries:run.roster.map(p=>({label:p.name,value:String(run.state.members[p.playerId].draft)}))}),
};
