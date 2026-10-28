import {toolResult,type ToolDefinition} from '@agent-game/protocol';
import type {GameModule,StoredRun} from '../../runtime/types';
import {historyCursor,historyInstructions,incrementalObservation,agentIdentity,checkDecision,decisionKey,decorateView,emptySchema,enginePlayers,readOnly,seatFor} from '../shared';
import {actionInstructions} from '../action-schema';
import {applyBurgundy,createBurgundy,restoreBurgundy,validateBurgundyConfig,viewBurgundy} from './engine';
import {BURGUNDY_RULES} from './rules';
import {ACTION_HELP,actionTool} from './actions';
import {PHASES} from './data';
import type {BurgundyState} from './types';

const descriptors:ToolDefinition[]=[
  {name:'game_get_state',description:'读取全部公开庄园、仓库、暂存、骰子、资源、当前立即效果和本局完整公开事件；自己的已售货物明细也可见。暗供应顺序、未来货物及随机状态隐藏。',inputSchema:emptySchema,annotations:readOnly},
  actionTool,
  {name:'game_rules',description:'读取 2011 alea 原版 2–4 人完整规则、八种建筑、全部 26 种知识及自然行动字段。',inputSchema:emptySchema,annotations:readOnly},
];
const observe=(run:StoredRun<BurgundyState>,actor:string|null)=>decorateView(viewBurgundy(run.state,actor===null?null:seatFor(run,actor)),run.roster);
const decisions=(run:StoredRun<BurgundyState>)=>run.state.phase==='finished'?[]:[{decisionId:decisionKey(run,run.state.revision,run.state.turn),actorId:run.roster[run.state.turn].playerId,allowedTools:['game_act']}];
export const burgundyModule:GameModule<BurgundyState>={
  id:'castles-of-burgundy',version:'1.0.0',stateVersion:1,name:'勃艮第城堡',description:'调度骰子与工人，将城堡、河流和城市铺入自己的庄园。',tagline:'2011 原版 · 骰子与庄园',presentation:{english:'BURGUNDY',symbol:'fleur-de-lis',tone:'warm'},
  minPlayers:2,maxPlayers:4,defaultPlayers:2,defaultConfig:{setup:'classic'},runNoun:'局',validateConfig:validateBurgundyConfig,lifecycle:{sessionScope:'run',eagerAgents:false},rules:()=>BURGUNDY_RULES,
  activity:run=>({phase:run.state.phase==='setup'?'选择庄园与起始城堡':run.state.phase==='finished'?'终局已结算':run.state.pending?'处理立即效果':'骰子行动',detail:`第 ${run.index} 局${run.state.round?` · ${PHASES[run.state.phaseIndex]} 阶段 · 第 ${run.state.round}/5 轮`:''}`}),
  create:(run,random)=>{validateBurgundyConfig(run.config);return createBurgundy(run.runId,enginePlayers(run.roster),random,run.config,run.index);},
  next:(previous,run,random)=>{validateBurgundyConfig(run.config);return createBurgundy(run.runId,enginePlayers(run.roster),random,run.config,run.index,previous.state);},
  finished:s=>s.phase==='finished',observe,tableView:(run,actor)=>decorateView(viewBurgundy(run.state,actor===null?null:seatFor(run,actor),true),run.roster),decisions,tools:()=>descriptors,historyCursor,
  initializePrompt:(run,actor)=>`你是勃艮第城堡玩家 ${agentIdentity(run,actor)}。\n${BURGUNDY_RULES}\n${ACTION_HELP}\n${actionInstructions}\n${historyInstructions}\n仅使用本局固定的三个游戏工具。根据可见信息规划区域完成、知识与建筑连锁，兼顾工人、银币和后续轮次顺序。`,
  decisionPrompt:(run,d,afterEvent=0)=>`勃艮第城堡第 ${run.index} 局，决策 ${d.decisionId}。本次只完成一次合法 game_act，成功即结束任务；立即效果与剩余骰子会再次唤醒。当前可见局面：${JSON.stringify(incrementalObservation(observe(run,d.actorId),afterEvent))}`,
  handleTool:(run,request)=>{try{
    const seat=seatFor(run,request.playerId);if(request.scopeId!==run.runId)throw Error('工具授权不属于当前局');
    if(request.tool==='game_get_state')return {result:toolResult(observe(run,request.playerId))};
    if(request.tool==='game_rules')return {result:toolResult({rules:BURGUNDY_RULES,actions:ACTION_HELP})};
    if(request.tool!=='game_act')throw Error('勃艮第城堡没有注册该工具');checkDecision(run,request,decisions(run));
    const state=applyBurgundy(run.state,seat,request.args.action);return {state,result:toolResult({success:true,revision:state.revision,message:'本次行动已完成，请结束任务，等待下一步决策。'})};
  }catch(error){return {result:toolResult({error:(error as Error).message},true)};}},
  humanAction:(run,actor,input)=>applyBurgundy(run.state,seatFor(run,actor),input),
  restore:(data,version)=>{if(version!==1)throw Error('勃艮第城堡存档版本不受支持，请新建游戏');return restoreBurgundy(data);},
  summary:run=>({id:run.roomId,gameId:'castles-of-burgundy',round:run.index,endedAt:run.state.events.at(-1)?.time??run.state.createdAt,title:`勃艮第城堡 · ${run.state.result?.winners.map(seat=>run.roster[seat].name).join('、')??'未结算'}${run.state.result?'获胜':''}`,subtitle:`2011 原版 · ${run.roster.length} 人 · ${run.config.setup==='advanced'?'进阶庄园':'1 号庄园'}`,entries:run.state.players.map(p=>({label:p.name,value:`${p.score} 分 · 累计 ${p.totalScore} · ${p.wins} 胜`,positive:run.state.result?.winners.includes(p.seat)}))}),
  planning:run=>({subtitle:'重新洗入全部板块与货物、随机决定先手。原玩家保留累计得分与胜场；本局庄园和资源重新配置。',balances:new Map(run.state.players.map(p=>[p.playerId,p.totalScore])),newPlayerLabel:'累计 0 分 · 0 胜'}),
};
