import {toolResult,type BrowserToolRequest} from '@agent-game/protocol';
import type {GameModule,StoredRun} from '../../runtime/types';
import {historyCursor,historyInstructions,incrementalObservation,checkDecision,decisionKey,decorateView,emptySchema,enginePlayers,readOnly,seatFor,agentObservation,agentIdentity} from '../shared';
import {applyCitadels,assertCitadels,createCitadels,DEFAULT_CONFIG,nextCitadels,validateConfig,viewCitadels,type Action,type CitadelsState} from './engine';
import {roleName} from './cards';
import {RULES} from './rules';
import {actionTool,ACTION_HELP} from './actions';
import {actionInstructions} from '../action-schema';
const tools=[
  {name:'game_get_state',description:'读取你的私有手牌、自己的身份、当前候选身份、城区、金币、技能使用状态、本局从发牌起的全部公开 events，以及仅发给你的技能 notifications；隐藏其他人的未公开身份、手牌和牌库顺序。',inputSchema:emptySchema,annotations:readOnly},
  actionTool,
  {name:'game_rules',description:'读取本桌采用的 FFG 经典八身份 3–7 人规则、特殊建筑与计分。',inputSchema:emptySchema,annotations:readOnly},
];
const observe=(run:StoredRun<CitadelsState>,actor:string|null)=>agentObservation(decorateView(viewCitadels(run.state,actor===null?null:seatFor(run,actor),false,false),run.roster));
function actTool(run:StoredRun<CitadelsState>,request:BrowserToolRequest){
  const seat=seatFor(run,request.playerId),s=run.state;
  if(request.tool==='game_rules')return {result:toolResult({rules:RULES,actions:ACTION_HELP})};
  if(request.tool==='game_get_state')return {result:toolResult(observe(run,request.playerId))};
  if(request.tool!=='game_act')throw new Error('富饶之城没有注册该工具');
  checkDecision(run,request,definition.decisions(run));
  const next=applyCitadels(s,seat,request.args.action as Action);return {state:next,result:toolResult({success:true,revision:next.revision,message:'行动已完成。结束本次任务，等待新决策。'})};
}
export const definition:GameModule<CitadelsState>={
  id:'citadels',version:'2.0.0',stateVersion:2,name:'富饶之城',description:'暗选身份，依序叫号。让城里的每一枚金币都有去处。',tagline:'经典八身份 · 3–7 人',presentation:{english:'CITADELS',symbol:'castle',tone:'warm'},
  minPlayers:3,maxPlayers:7,defaultPlayers:4,defaultConfig:DEFAULT_CONFIG,runNoun:'局',validateConfig,
  rules:()=>RULES,lifecycle:{sessionScope:'run',eagerAgents:false},
  activity:run=>({phase:({draft:'秘密选角',income:'正常收入',keep:'保留收入牌',main:'建造与技能',graveyard:'墓地收回',finished:'本局已结算'})[run.state.phase],detail:`第 ${run.state.round} 轮${run.state.phase==='draft'?'':` · ${roleName(run.state.called)}`}`}),
  create:(run,random)=>createCitadels(run.runId,enginePlayers(run.roster),run.config,random,run.index),
  next:(previous,run,random)=>nextCitadels(previous.state,run.runId,enginePlayers(run.roster),random),
  finished:s=>s.phase==='finished',observe,
  tableView:(run,actor,{revealHands})=>decorateView(viewCitadels(run.state,actor===null?null:seatFor(run,actor),revealHands),run.roster),
  decisions:run=>run.state.phase==='finished'?[]:[{decisionId:decisionKey(run,run.state.revision,run.state.turn),actorId:run.roster[run.state.turn].playerId,allowedTools:['game_act']}],
  tools:()=>tools,
  historyCursor,
  initializePrompt:(run,actor)=>`你是富饶之城玩家 ${agentIdentity(run,actor)}。\n${RULES}\n${ACTION_HELP}\n${actionInstructions}\n技能可以不使用；每个身份回合必须收入并最终 end，军阀 destroy 自动结束回合。${historyInstructions}`,
  decisionPrompt:(run,d,afterEvent=0)=>`富饶之城第 ${run.state.round} 轮，决策 ${d.decisionId}。根据当前阶段和可见局面自行构造 action，执行一次 game_act 成功后结束任务。当前私有观察：${JSON.stringify(incrementalObservation(observe(run,d.actorId),afterEvent))}`,
  notificationPrompt:(run,actor,afterEvent)=>{
    if(!run.state.notifications.some(n=>n.recipient===seatFor(run,actor)&&n.seq>afterEvent))return null;
    const view=incrementalObservation(observe(run,actor),afterEvent);
    return `富饶之城 · 私有技能通知。notifications 仅发送给你；其中的 round、seq 和 hand 对应技能发生时，当前局面以本条观察为准。这不是决策请求，无需回复，不调用工具或采取行动，直接结束本次任务。之后收到决策消息再行动。当前私有观察：${JSON.stringify(view)}`;
  },
  handleTool:actTool,
  humanAction:(run,actor,input)=>applyCitadels(run.state,seatFor(run,actor),input as Action),
  restore:(data:any,version)=>{
    if(version!==2||data?.gameId!=='citadels'||!['draft','income','keep','main','graveyard','finished'].includes(data.phase)||!Array.isArray(data.players)||data.players.length<3||data.players.length>7||!Array.isArray(data.events)||!Array.isArray(data.deck)||!Number.isSafeInteger(data.rng)||!Number.isSafeInteger(data.revision)||data.revision<1||!Number.isInteger(data.turn)||data.turn<0||data.turn>=data.players.length)throw new Error('富饶之城存档格式或版本不受支持');
    validateConfig(data.config);assertCitadels(data);return data;
  },
  summary:run=>({id:run.roomId,gameId:'citadels',round:run.index,endedAt:run.state.endedAt??run.state.createdAt,title:`富饶之城 · ${run.state.winners.map(i=>run.roster[i].name).join('、')}获胜`,subtitle:`第 ${run.index} 局 · ${run.state.round} 轮 · 经典八身份`,entries:run.roster.map((p,i)=>({label:p.name,value:`${run.state.scores?.[i].total??0} 分 · 累计 ${run.state.players[i].totalScore}`,positive:run.state.winners.includes(i)}))}),
  planning:run=>({subtitle:'下一局重新发牌；保留累计得分与胜局数，王冠向下一座传递。可调整为 3–7 人。',balances:new Map(run.state.players.map(p=>[p.playerId,p.totalScore])),newPlayerLabel:'累计得分从 0 开始'}),
};
