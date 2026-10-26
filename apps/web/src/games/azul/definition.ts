import {toolResult,type ToolDefinition} from '@agent-game/protocol';
import type {GameModule,StoredRun} from '../../runtime/types';
import {historyCursor,historyInstructions,incrementalObservation,decorateView,decisionKey,emptySchema,enginePlayers,readOnly,seatFor,checkDecision,agentObservation,agentIdentity} from '../shared';
import {AZUL_RULES,applyAzul,createAzul,restoreAzul,viewAzul,type AzulState} from './engine';
import {actionTool,ACTION_HELP} from './actions';
import {actionInstructions} from '../action-schema';

const descriptors:ToolDefinition[]=[
  {name:'game_get_state',description:'读取完整公开花砖局面、所有玩家板、当前轮次、袋内数量和从开局开始的全部公开 events。袋内顺序及随机状态始终隐藏。',inputSchema:emptySchema,annotations:readOnly},
  actionTool,
  {name:'game_rules',description:'读取原版有色墙规则及本桌跨局方式。',inputSchema:emptySchema,annotations:readOnly},
];
const observe=(run:StoredRun<AzulState>,actor:string|null)=>agentObservation(decorateView(viewAzul(run.state,actor===null?null:seatFor(run,actor),false),run.roster));
const decision=(run:StoredRun<AzulState>)=>({decisionId:decisionKey(run,run.state.revision,run.state.turn),actorId:run.roster[run.state.turn].playerId,allowedTools:['game_act']});
export const azulModule:GameModule<AzulState>={
  id:'azul',version:'2.0.0',stateVersion:1,name:'花砖物语',description:'从工厂盘挑选花砖，把每一片铺进你的宫殿。',tagline:'有色墙 · 原版',presentation:{english:'AZUL',symbol:'tiles',tone:'cool'},
  minPlayers:2,maxPlayers:4,defaultPlayers:2,defaultConfig:{},runNoun:'局',
  validateConfig:config=>{if(!config||typeof config!=='object'||Array.isArray(config)||Object.keys(config).length)throw new Error('花砖物语使用原版标准有色墙，无额外配置');},
  lifecycle:{sessionScope:'run',eagerAgents:false},rules:()=>AZUL_RULES,
  activity:run=>({phase:run.state.phase==='finished'?'终局已结算':'选砖',detail:`第 ${run.index} 局 · 第 ${run.state.round} 轮`}),
  create:(run,random)=>{azulModule.validateConfig!(run.config);return createAzul(run.runId,enginePlayers(run.roster),random,run.index);},
  next:(previous,run,random)=>{azulModule.validateConfig!(run.config);return createAzul(run.runId,enginePlayers(run.roster),random,run.index,previous.state);},
  finished:s=>s.phase==='finished',observe,tableView:(run,actor)=>decorateView(viewAzul(run.state,actor===null?null:seatFor(run,actor)),run.roster),
  decisions:run=>run.state.phase==='finished'?[]:[decision(run)],tools:()=>descriptors,
  historyCursor,
  initializePrompt:(run,actor)=>`你是花砖物语玩家 ${agentIdentity(run,actor)}。\n${AZUL_RULES}\n${ACTION_HELP}\n${actionInstructions}\n${historyInstructions}`,
  decisionPrompt:(run,d,afterEvent=0)=>`花砖物语第 ${run.index} 局，第 ${run.state.round} 轮，决策 ${d.decisionId}。完成一次合法选砖后结束本次任务。优先完成图案行、连接墙砖并避免地板溢出；也可考虑对手需求与先手。当前公开观察：${JSON.stringify(incrementalObservation(observe(run,d.actorId),afterEvent))}`,
  handleTool:(run,request)=>{
    try{
      const seat=seatFor(run,request.playerId);
      if(request.scopeId!==run.runId)throw new Error('工具授权不属于当前局');
      if(request.tool==='game_get_state')return {result:toolResult(observe(run,request.playerId))};
      if(request.tool==='game_rules')return {result:toolResult({rules:AZUL_RULES,actions:ACTION_HELP})};
      if(request.tool!=='game_act')throw new Error('花砖物语没有注册该工具');
      checkDecision(run,request,azulModule.decisions(run));
      const state=applyAzul(run.state,seat,request.args.action);return {state,result:toolResult({success:true,revision:state.revision,message:'选砖完成，请结束本次任务。'})};
    }catch(error){return {result:toolResult({error:(error as Error).message},true)};}
  },
  humanAction:(run,actor,input)=>applyAzul(run.state,seatFor(run,actor),input),
  restore:(data,version)=>{if(version!==1)throw new Error('花砖物语存档版本不受支持，请新建游戏');return restoreAzul(data);},
  summary:run=>({id:run.roomId,gameId:'azul',round:run.index,endedAt:run.state.events.at(-1)?.time??run.state.createdAt,title:`花砖物语 · ${run.state.result?.winners.map(s=>run.roster[s].name).join('、')??''}获胜`,subtitle:`有色墙 · ${run.state.players.length} 人 · ${run.state.round} 轮`,entries:run.state.players.map(p=>({label:p.name,value:`${p.score} 分 · 累计 ${p.totalScore} · ${p.wins} 胜`,positive:run.state.result?.winners.includes(p.seat)}))}),
  planning:run=>({subtitle:'重新洗入全部 100 片花砖；本局分数归零，原玩家累计得分与胜场保留。上一局末轮先手座位顺延，可调整为 2–4 人。',balances:new Map(run.state.players.map(p=>[p.playerId,p.totalScore])),newPlayerLabel:'累计 0 分 · 0 胜'}),
};
