import {toolResult} from '@agent-game/protocol';
import type {GameModule, StoredRun} from '../../runtime/types';
import {historyCursor,historyInstructions,incrementalObservation,agentObservation,agentIdentity,checkDecision,decisionKey,decorateView,emptySchema,enginePlayers,readOnly,seatFor} from '../shared';
import {applyAction, assertSplendor, createSplendor, nextSplendor, points, viewSplendor} from './engine';
import {SPLENDOR_RULES} from './rules';
import type {SplendorState} from './types';
import {actionTool,ACTION_HELP} from './actions';
import {actionInstructions} from '../action-schema';

const descriptors=[
  {name:'game_get_state',description:'读取完整市场、银行、贵族、公开玩家资源、所有市场预留、自己的暗抽预留及从开局开始的全部公开 events。对手尚未公开的暗抽牌与暗库顺序隐藏。',inputSchema:emptySchema,annotations:readOnly},
  actionTool,
  {name:'game_rules',description:'读取璀璨宝石基础版完整中文规则、资源、隐私与跨局计分说明。',inputSchema:emptySchema,annotations:readOnly},
];
const observe=(run:StoredRun<SplendorState>,actor:string|null)=>agentObservation(decorateView(viewSplendor(run.state,actor===null?null:seatFor(run,actor),false,false),run.roster));
const decisions=(run:StoredRun<SplendorState>)=>run.state.phase==='finished'?[]:[{decisionId:decisionKey(run,run.state.revision,run.state.turn),actorId:run.roster[run.state.turn].playerId,allowedTools:['game_act']}];
const validateConfig=(config:any)=>{if(!config||Array.isArray(config)||config.edition!=='base-2024'||Object.keys(config).some(k=>k!=='edition'))throw Error('璀璨宝石使用固定的 2024 基础版规则');};
export const splendorModule:GameModule<SplendorState>={
  id:'splendor',version:'2.0.0',stateVersion:1,name:'璀璨宝石',description:'收集宝石，建立商路，赢得贵族的青睐。',tagline:'基础版 · 宝石与声望',presentation:{english:'SPLENDOR',symbol:'gem',tone:'warm'},
  minPlayers:2,maxPlayers:4,defaultPlayers:2,defaultConfig:{edition:'base-2024'},runNoun:'局',
  validateConfig,
  lifecycle:{sessionScope:'run',eagerAgents:false},rules:()=>SPLENDOR_RULES,
  activity:run=>({phase:({action:'收集与发展',return:'归还超额宝石',noble:'选择贵族',finished:'本局已结算'})[run.state.phase],detail:`第 ${run.index} 局${run.state.finalRound?' · 最后一轮':''}`}),
  create:(run,random)=>{validateConfig(run.config);return createSplendor(run.runId,enginePlayers(run.roster),{random,round:run.index});},
  next:(previous,run,random)=>{validateConfig(run.config);return nextSplendor(previous.state,run.runId,enginePlayers(run.roster),random,run.index);},
  finished:state=>state.phase==='finished',observe,
  tableView:(run,actor,{revealHands})=>decorateView(viewSplendor(run.state,actor===null?null:seatFor(run,actor),revealHands),run.roster),
  decisions,tools:()=>descriptors,
  historyCursor,
  initializePrompt:(run,actor)=>`你是璀璨宝石玩家 ${agentIdentity(run,actor)}。\n${SPLENDOR_RULES}\n${ACTION_HELP}\n${actionInstructions}\n只使用本局固定的游戏工具，不调用终端或文件。目标是在等轮结束时胜出；归还和贵族选择会另行唤醒。${historyInstructions}`,
  decisionPrompt:(run,d,afterEvent=0)=>`璀璨宝石第 ${run.index} 局，阶段 ${run.state.phase}，决策 ${d.decisionId}。根据局面构造 action，执行一次 game_act 成功后结束任务。当前观察：${JSON.stringify(incrementalObservation(observe(run,d.actorId),afterEvent))}`,
  handleTool:(run,request)=>{
    const seat=seatFor(run,request.playerId);
    if(request.scopeId!==run.runId)throw Error('该工具请求不属于当前局');
    if(request.tool==='game_rules')return {result:toolResult({rules:SPLENDOR_RULES,actions:ACTION_HELP})};
    if(request.tool==='game_get_state')return {result:toolResult(observe(run,request.playerId))};
    if(request.tool!=='game_act')throw Error('璀璨宝石未注册该工具');
    checkDecision(run,request,decisions(run));
    const state=applyAction(run.state,seat,request.args.action);return {state,result:toolResult({success:true,revision:state.revision,phase:state.phase,message:'本次决策已完成，请结束任务。'})};
  },
  humanAction:(run,actor,input)=>applyAction(run.state,seatFor(run,actor),input),
  restore:(data,version)=>{if(version!==1)throw Error('璀璨宝石存档版本不受支持');try{assertSplendor(data as SplendorState);}catch(e){throw Error('璀璨宝石存档无效：'+(e as Error).message);}return data as SplendorState;},
  summary:run=>({id:run.roomId,gameId:'splendor',round:run.index,endedAt:run.state.events.at(-1)?.time??run.state.createdAt,title:`璀璨宝石 · ${run.state.result?.winners.map(seat=>run.roster[seat].name).join('、')??'未结算'}获胜`,subtitle:`第 ${run.index} 局 · ${run.roster.length} 人 · 基础版`,entries:run.state.players.map(p=>({label:p.name,value:`${points(p)} 分 / ${p.bought.length} 张`,positive:run.state.result?.winners.includes(p.seat)}))}),
  planning:()=>({subtitle:'基础版 · 重新洗牌与配置资源 · 轮换先手 · 继承累计胜局和总声望'}),
};
