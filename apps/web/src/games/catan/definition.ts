import {toolResult} from '@agent-game/protocol';
import type {GameModule,StoredRun} from '../../runtime/types';
import {agentIdentity,checkDecision,decorateView,emptySchema,enginePlayers,historyCursor,historyInstructions,incrementalObservation,readOnly,seatFor} from '../shared';
import {actionInstructions} from '../action-schema';
import {createCatan,nextCatan,applyCatan,assertCatan,viewCatan,actors,publicScore} from './engine';
import type {CatanState} from './types';
import {RULES} from './rules';
import {ACTION_HELP,actionTool} from './actions';

export const DEFAULT_CONFIG={edition:'base-2025'};
const observe=(run:StoredRun<CatanState>,actor:string|null)=>decorateView(viewCatan(run.state,actor===null?null:seatFor(run,actor)),run.roster);
const phaseNames={setup_settlement:'初始定居点',setup_road:'初始道路',roll:'生产 · 掷骰前',action:'交易与建造',discard:'七点弃牌',robber:'移动强盗',free_roads:'修路卡结算',trade_reply:'交易协商 · 等待回应',trade_choose:'交易协商 · 确认成交',finished:'本局结束'};
const tools=[
  {name:'game_get_state',description:'读取完整公共地图、建筑道路、港口、公开计数与记录，以及自己的资源组成和发展卡；隐藏对手私牌、随机源与牌堆顺序。',inputSchema:emptySchema,annotations:readOnly},
  actionTool,
  {name:'game_rules',description:'读取卡坦岛2025第六版3–4人基础版完整中文规则、来源、交易协商和全部行动字段。',inputSchema:emptySchema,annotations:readOnly},
];
export const definition:GameModule<CatanState>={
  setupOrderHint:"1 号玩家首先布置；初始布置依次进行正序与逆序两轮。",
  id:'catan',version:'1.0.0',stateVersion:1,name:'卡坦岛',description:'掷骰收获，协商交易，在岛上修路建城。',tagline:'随机岛屿 · 3–4 人',presentation:{english:'CATAN',symbol:'island',tone:'warm'},minPlayers:3,maxPlayers:4,defaultPlayers:3,defaultConfig:DEFAULT_CONFIG,runNoun:'局',
  validateConfig(config){if(!config||Array.isArray(config)||config.edition!=='base-2025'||Object.keys(config).some(k=>k!=='edition'))throw Error('卡坦岛使用固定的 2025 第六版基础版规则和随机布置');},
  lifecycle:{sessionScope:'run',eagerAgents:false},rules:()=>RULES,
  activity:run=>({phase:phaseNames[run.state.phase],detail:`第 ${run.index} 局 · ${run.state.phase.startsWith('setup')?'正逆序初始布置':`第 ${run.state.turnNumber} 回合`}`}),
  create:(run,random)=>{definition.validateConfig!(run.config);return createCatan(run.runId,enginePlayers(run.roster),{random,round:run.index,firstSeat:0});},
  next:(previous,run,random)=>{definition.validateConfig!(run.config);return nextCatan(previous.state,run.runId,enginePlayers(run.roster),random,run.index);},
  finished:s=>s.phase==='finished',observe,
  tableView:(run,actor,{revealHands})=>decorateView(viewCatan(run.state,actor===null?null:seatFor(run,actor),revealHands),run.roster),
  decisions:run=>actors(run.state).map(seat=>({actorId:run.roster[seat].playerId,allowedTools:['game_act'],
    // Concurrent discard and quote replies keep their own window when another player responds.
    decisionId:`${run.runId}:${run.state.phase==='discard'?`discard:${run.state.turnNumber}`:run.state.phase==='trade_reply'?`trade:${run.state.trade!.id}`:run.state.revision}:${run.roster[seat].playerId}`})),
  tools:()=>tools,historyCursor,
  initializePrompt:(run,actor)=>`你是卡坦岛玩家 ${agentIdentity(run,actor)}。\n${RULES}\n${ACTION_HELP}\n${actionInstructions}\n只能用游戏工具；地图顶点和边含邻接关系，自行推理建造位置。行动阶段可多次行动，每次成功由新决策继续；计划好后用 end_turn。交易回应必须接受、拒绝或还价，别等待聊天消息。\n${historyInstructions}`,
  decisionPrompt:(run,d,afterEvent=0)=>`卡坦岛第 ${run.state.turnNumber} 回合 · ${phaseNames[run.state.phase]} · 决策 ${d.decisionId}。按当前 phase 自行构造一次 action，成功后结束本次任务。${run.state.phase==='trade_reply'?'你正在回应当前回合玩家的交易邀请；counter 的 give/want 从你自己的视角填写。':''}\n当前私有观察：${JSON.stringify(incrementalObservation(observe(run,d.actorId),afterEvent))}`,
  handleTool:(run,request)=>{
    const seat=seatFor(run,request.playerId);if(request.scopeId!==run.runId)throw Error('工具授权不属于当前局');
    if(request.tool==='game_rules')return {result:toolResult({rules:RULES,actions:ACTION_HELP})};
    if(request.tool==='game_get_state')return {result:toolResult(observe(run,request.playerId))};
    if(request.tool!=='game_act')throw Error('卡坦岛没有注册此工具');checkDecision(run,request,definition.decisions(run));
    const state=applyCatan(run.state,seat,request.args.action);return {state,result:toolResult({success:true,revision:state.revision,phase:state.phase,message:'本次行动已完成，结束任务并等待下一条决策。'})};
  },
  humanAction:(run,actor,action)=>applyCatan(run.state,seatFor(run,actor),action),
  restore:(data:any,version)=>{if(version!==1||data?.gameId!=='catan')throw Error('卡坦岛存档格式或版本不受支持');try{assertCatan(data);}catch(error){throw Error(`卡坦岛存档损坏：${(error as Error).message}`);}return structuredClone(data);},
  summary:run=>({id:run.roomId,gameId:'catan',round:run.index,endedAt:run.state.endedAt??run.state.createdAt,title:`卡坦岛 · ${run.state.result?run.roster[run.state.result.winner].name+'获胜':'进行中'}`,subtitle:`第 ${run.index} 局 · ${run.state.turnNumber} 回合 · 2025 基础版`,entries:run.state.players.map(p=>({label:p.name,value:`${p.seat===run.state.result?.winner?run.state.result.scores[p.seat]:publicScore(run.state,p.seat)} 公开分 · 累计 ${p.wins} 胜`,positive:p.seat===run.state.result?.winner}))}),
  planning:run=>({subtitle:'下一局重新随机地图、洗牌并掷骰决定先手，按玩家身份保留累计胜局。支持 3–4 人。',balances:new Map(run.state.players.map(p=>[p.playerId,p.wins])),newPlayerLabel:'累计胜局从 0 开始'}),
};
