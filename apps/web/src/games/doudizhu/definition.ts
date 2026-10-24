import {applyAction,createGame,viewGame,getLegalActions} from './engine';
import {DOUDIZHU_RULES} from './rules';
import type {DoudizhuState,GameAction} from './types';
import {toolResult} from '@agent-game/protocol';
import type {GameModule,StoredRun} from '../../runtime/types';
import {enginePlayers,seatFor,decorateView,emptySchema,readOnly,decisionKey,checkRevision,agentObservation} from '../shared';
const descriptors=[
 {name:'game_get_state',description:'读取自己的手牌与公开状态，隐藏其他玩家手牌。',inputSchema:emptySchema,annotations:readOnly},
 {name:'game_legal_actions',description:'分页获取当前玩家的合法叫分、出牌或不出，返回 actionId。',inputSchema:{type:'object' as const,properties:{offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}},additionalProperties:false},annotations:readOnly},
 {name:'game_act',description:'使用最新 revision 与合法 actionId 完成本次决策，然后结束任务。',inputSchema:{type:'object' as const,properties:{revision:{type:'integer',minimum:1},actionId:{type:'string',minLength:1,maxLength:300}},required:['revision','actionId'],additionalProperties:false},requiresDecision:true},
 {name:'game_rules',description:'读取斗地主规则和积分方法。',inputSchema:emptySchema,annotations:readOnly},
];
const observe=(run:StoredRun<DoudizhuState>,actor:string|null)=>decorateView(viewGame(run.state,actor===null?null:seatFor(run,actor)),run.roster);
export const doudizhuModule:GameModule<DoudizhuState>={
 presentation:{english:'DOUDIZHU',symbol:'3',tone:'warm'},
 id:'doudizhu',version:'1.0.0',stateVersion:1,name:'斗地主',description:'一位地主，两位农民。和 agents 过过招。',tagline:'经典三人局',minPlayers:3,maxPlayers:3,defaultPlayers:3,defaultConfig:{},runNoun:'局',
 activity:run=>({phase:run.state.phase==='finished'?'已结束':run.state.phase==='bidding'?'正在叫分':'对局中',detail:`第 ${run.index} 局`}),
 rules:()=>DOUDIZHU_RULES,lifecycle:{sessionScope:'run',eagerAgents:false},
 create:(run,random)=>createGame(run.roomId,enginePlayers(run.roster),{random,round:run.index}),
 next:(previous,run,random)=>createGame(run.roomId,enginePlayers(run.roster),{random,round:run.index,firstBidder:(previous.state.firstBidder+1)%3,scores:run.roster.map(p=>previous.state.players[previous.roster.findIndex(old=>old.playerId===p.playerId)]?.score??0)}),
 finished:s=>s.phase==='finished',observe,
 decisions:run=>run.state.phase==='finished'?[]:[{decisionId:decisionKey(run,run.state.revision,run.state.turn),actorId:run.roster[run.state.turn].playerId,allowedTools:['game_act']}],
 tools:()=>descriptors,
 initializePrompt:(run,actor)=>`你是斗地主玩家 ${run.roster[seatFor(run,actor)].name}。\n${DOUDIZHU_RULES}\n只通过游戏工具游玩；此会话仅用于本局。\n初始观察：${JSON.stringify(agentObservation(observe(run,actor)))}`,
 decisionPrompt:(run,d)=>`斗地主第 ${run.index} 局，决策 ${d.decisionId}。读取自己的状态，执行一次合法行动，然后结束任务。当前观察：${JSON.stringify(agentObservation(observe(run,d.actorId)))}`,
 handleTool:(run,request)=>{
   const seat=seatFor(run,request.playerId),state=run.state;
   if(request.tool==='game_rules')return{result:toolResult({rules:DOUDIZHU_RULES})};
   if(request.tool==='game_get_state')return{result:toolResult(agentObservation(observe(run,request.playerId)))};
   const legal=getLegalActions(state,seat);
   if(request.tool==='game_legal_actions'){const offset=Number(request.args.offset??0),limit=Number(request.args.limit??80);return{result:toolResult({revision:state.revision,total:legal.length,offset,actions:legal.slice(offset,offset+limit)})};}
   if(request.tool!=='game_act')throw new Error('斗地主没有注册该工具');
   checkRevision(state,request.args);const choice=legal.find(a=>a.id===request.args.actionId);if(!choice)throw new Error('actionId 不是当前合法行动');
   const next=applyAction(state,seat,choice.action);return{state:next,result:toolResult({success:true,revision:next.revision,message:'行动完成，结束本次任务。'})};
 },
 humanAction:(run,actor,input)=>applyAction(run.state,seatFor(run,actor),input as GameAction),
 restore:(data:any,version)=>{if(version!==1||data?.gameId!=='doudizhu'||data.players?.length!==3||!Array.isArray(data.events)||!data.players.every((p:any,i:number)=>p.seat===i&&Array.isArray(p.hand)))throw new Error('斗地主存档格式或版本不受支持');return data;},
 summary:run=>({id:run.roomId,gameId:'doudizhu',round:run.index,endedAt:run.state.events.at(-1)?.time??run.state.createdAt,title:`斗地主 · ${run.state.result?.winner==='landlord'?'地主':'农民'}获胜`,subtitle:`第 ${run.index} 局 · ${run.state.events.length} 次事件`,entries:run.roster.map((p,i)=>({label:p.name,value:String(run.state.result?.deltas[i]??0),positive:(run.state.result?.deltas[i]??0)>0}))}),
 planning:run=>({subtitle:'同一牌桌 · 积分继承 · 每局新会话'}),
};
