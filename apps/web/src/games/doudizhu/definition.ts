import {applyAction,createGame,viewGame} from './engine';
import {actionTool,ACTION_HELP} from './actions';
import {actionInstructions} from '../action-schema';
import {DOUDIZHU_RULES} from './rules';
import type {DoudizhuState,GameAction} from './types';
import {toolResult} from '@agent-game/protocol';
import type {GameModule,StoredRun} from '../../runtime/types';
import {historyCursor,historyInstructions,incrementalObservation,enginePlayers,seatFor,decorateView,emptySchema,readOnly,decisionKey,checkDecision,agentIdentity,agentObservation} from '../shared';
const descriptors=[
 {name:'game_get_state',description:'读取自己的手牌、公开状态及 events 中从本局发牌开始的完整记录。记录按 seq 递增，包含叫分、地主底牌、每次出牌的玩家与牌、牌型、不出和结算，不限制为最近几次行动；隐藏其他玩家尚未公开的手牌。',inputSchema:emptySchema,annotations:readOnly},
 actionTool,
 {name:'game_rules',description:'读取斗地主规则和积分方法。',inputSchema:emptySchema,annotations:readOnly},
];
const observe=(run:StoredRun<DoudizhuState>,actor:string|null)=>agentObservation(decorateView(viewGame(run.state,actor===null?null:seatFor(run,actor),false,false),run.roster));
export const doudizhuModule:GameModule<DoudizhuState>={
  setupOrderHint:"1 号玩家首先叫分，地主出第一手牌。",
 presentation:{english:'DOUDIZHU',symbol:'3',tone:'warm'},
 id:'doudizhu',version:'2.0.0',stateVersion:1,name:'斗地主',description:'一位地主，两位农民。和 agents 过过招。',tagline:'经典三人局',minPlayers:3,maxPlayers:3,defaultPlayers:3,defaultConfig:{},runNoun:'局',
 activity:run=>({phase:run.state.phase==='finished'?'已结束':run.state.phase==='bidding'?'正在叫分':'对局中',detail:`第 ${run.index} 局`}),
 rules:()=>DOUDIZHU_RULES,lifecycle:{sessionScope:'run',eagerAgents:false},
 create:(run,random)=>createGame(run.roomId,enginePlayers(run.roster),{random,round:run.index}),
 next:(previous,run,random)=>createGame(run.roomId,enginePlayers(run.roster),{random,round:run.index,firstBidder:(previous.state.firstBidder+1)%3,scores:run.roster.map(p=>previous.state.players[previous.roster.findIndex(old=>old.playerId===p.playerId)]?.score??0)}),
 finished:s=>s.phase==='finished',observe,
 tableView:(run,actor,{revealHands})=>decorateView(viewGame(run.state,actor===null?null:seatFor(run,actor),revealHands),run.roster),
 decisions:run=>run.state.phase==='finished'?[]:[{decisionId:decisionKey(run,run.state.revision,run.state.turn),actorId:run.roster[run.state.turn].playerId,allowedTools:['game_act']}],
 tools:()=>descriptors,
  historyCursor,
 initializePrompt:(run,actor)=>`你是斗地主玩家 ${agentIdentity(run,actor)}。\n${DOUDIZHU_RULES}\n${ACTION_HELP}\n${actionInstructions}\n只通过游戏工具游玩；此会话仅用于本局。\n${historyInstructions}`,
 decisionPrompt:(run,d,afterEvent=0)=>`斗地主第 ${run.index} 局，决策 ${d.decisionId}。根据局面构造 action，执行一次 game_act 成功后结束任务。当前观察：${JSON.stringify(incrementalObservation(observe(run,d.actorId),afterEvent))}`,
 handleTool:(run,request)=>{
   const seat=seatFor(run,request.playerId),state=run.state;
   if(request.tool==='game_rules')return{result:toolResult({rules:DOUDIZHU_RULES,actions:ACTION_HELP})};
   if(request.tool==='game_get_state')return{result:toolResult(observe(run,request.playerId))};
   if(request.tool!=='game_act')throw new Error('斗地主没有注册该工具');
   checkDecision(run,request,doudizhuModule.decisions(run));
   const next=applyAction(state,seat,request.args.action as GameAction);return{state:next,result:toolResult({success:true,revision:next.revision,message:'行动完成，结束本次任务。'})};
 },
 humanAction:(run,actor,input)=>applyAction(run.state,seatFor(run,actor),input as GameAction),
 restore:(data:any,version)=>{if(version!==1||data?.gameId!=='doudizhu'||data.players?.length!==3||!Array.isArray(data.events)||!data.players.every((p:any,i:number)=>p.seat===i&&Array.isArray(p.hand)))throw new Error('斗地主存档格式或版本不受支持');return data;},
 summary:run=>({id:run.roomId,gameId:'doudizhu',round:run.index,endedAt:run.state.events.at(-1)?.time??run.state.createdAt,title:`斗地主 · ${run.state.result?.winner==='landlord'?'地主':'农民'}获胜`,subtitle:`第 ${run.index} 局 · ${run.state.events.length} 次事件`,entries:run.roster.map((p,i)=>({label:p.name,value:String(run.state.result?.deltas[i]??0),positive:(run.state.result?.deltas[i]??0)>0}))}),
 planning:run=>({subtitle:'同一牌桌 · 积分继承 · 每局新会话'}),
};
