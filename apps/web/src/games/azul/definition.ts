import {toolResult,type ToolDefinition} from '@agent-game/protocol';
import type {GameModule,StoredRun} from '../../runtime/types';
import {decorateView,decisionKey,emptySchema,enginePlayers,readOnly,seatFor,checkRevision} from '../shared';
import {AZUL_RULES,applyAzul,createAzul,legalActions,restoreAzul,viewAzul,type AzulState} from './engine';

const descriptors:ToolDefinition[]=[
  {name:'game_get_state',description:'读取完整公开花砖局面、所有玩家板、当前轮次、袋内数量和从开局开始的全部公开 events。袋内顺序及随机状态始终隐藏。',inputSchema:emptySchema,annotations:readOnly},
  {name:'game_legal_actions',description:'读取当前全部合法选砖行动，含来源、颜色、目的行、可放数量、溢出地板数量、额外地板扣分和是否拿先手。source=0 是中央，1 起是工厂盘；row=0 是全部放地板，1–5 是图案行。',inputSchema:emptySchema,annotations:readOnly},
  {name:'game_act',description:'执行一次合法选砖。传入 game_legal_actions 中的 actionId 和当前 revision。成功后结束本次任务。',inputSchema:{type:'object',properties:{revision:{type:'integer',minimum:1},actionId:{type:'string',minLength:1,maxLength:80}},required:['revision','actionId'],additionalProperties:false},requiresDecision:true},
  {name:'game_rules',description:'读取原版有色墙规则及本桌跨局方式。',inputSchema:emptySchema,annotations:readOnly},
];
const observe=(run:StoredRun<AzulState>,actor:string|null)=>decorateView(viewAzul(run.state,actor===null?null:seatFor(run,actor)),run.roster);
const decision=(run:StoredRun<AzulState>)=>({decisionId:decisionKey(run,run.state.revision,run.state.turn),actorId:run.roster[run.state.turn].playerId,allowedTools:['game_act']});
export const azulModule:GameModule<AzulState>={
  id:'azul',version:'1.0.0',stateVersion:1,name:'花砖物语',description:'从工厂盘挑选花砖，把每一片铺进你的宫殿。',tagline:'有色墙 · 原版',presentation:{english:'AZUL',symbol:'tiles',tone:'cool'},
  minPlayers:2,maxPlayers:4,defaultPlayers:2,defaultConfig:{},runNoun:'局',
  validateConfig:config=>{if(!config||typeof config!=='object'||Array.isArray(config)||Object.keys(config).length)throw new Error('花砖物语使用原版标准有色墙，无额外配置');},
  lifecycle:{sessionScope:'run',eagerAgents:false},rules:()=>AZUL_RULES,
  activity:run=>({phase:run.state.phase==='finished'?'终局已结算':'选砖',detail:`第 ${run.index} 局 · 第 ${run.state.round} 轮`}),
  create:(run,random)=>{azulModule.validateConfig!(run.config);return createAzul(run.runId,enginePlayers(run.roster),random,run.index);},
  next:(previous,run,random)=>{azulModule.validateConfig!(run.config);return createAzul(run.runId,enginePlayers(run.roster),random,run.index,previous.state);},
  finished:s=>s.phase==='finished',observe,tableView:(run,actor)=>observe(run,actor),
  decisions:run=>run.state.phase==='finished'?[]:[decision(run)],tools:()=>descriptors,
  initializePrompt:(run,actor)=>`你是花砖物语玩家 ${run.roster[seatFor(run,actor)].name}。\n${AZUL_RULES}\n工具列表在本局固定。每次唤醒可先读取 game_legal_actions，然后用当前 revision 和 actionId 调用 game_act 一次。所有板面公开，但袋内顺序不可见。events 是从开局开始的完整公开记录。初始观察：${JSON.stringify(observe(run,actor))}`,
  decisionPrompt:(run,d)=>`花砖物语第 ${run.index} 局，第 ${run.state.round} 轮，决策 ${d.decisionId}。完成一次合法选砖后结束本次任务。优先完成图案行、连接墙砖并避免地板溢出；也可考虑对手需求与先手。当前公开观察：${JSON.stringify(observe(run,d.actorId))}`,
  handleTool:(run,request)=>{
    try{
      const seat=seatFor(run,request.playerId);
      if(request.scopeId!==run.runId)throw new Error('工具授权不属于当前局');
      if(request.tool==='game_get_state')return {result:toolResult(observe(run,request.playerId))};
      if(request.tool==='game_rules')return {result:toolResult({rules:AZUL_RULES})};
      const actions=legalActions(run.state,seat);
      if(request.tool==='game_legal_actions')return {result:toolResult({revision:run.state.revision,total:actions.length,actions})};
      if(request.tool!=='game_act')throw new Error('花砖物语没有注册该工具');
      if(run.state.phase==='finished'||request.decisionId!==decision(run).decisionId||request.playerId!==decision(run).actorId)throw new Error('决策身份不匹配或已完成');
      checkRevision(run.state,request.args);
      const action=actions.find(a=>a.id===request.args.actionId)?.action;if(!action)throw new Error('actionId 不是当前合法行动');
      const state=applyAzul(run.state,seat,action);return {state,result:toolResult({success:true,revision:state.revision,message:'选砖完成，请结束本次任务。'})};
    }catch(error){return {result:toolResult({error:(error as Error).message},true)};}
  },
  humanAction:(run,actor,input)=>applyAzul(run.state,seatFor(run,actor),input),
  restore:(data,version)=>{if(version!==1)throw new Error('花砖物语存档版本不受支持，请新建游戏');return restoreAzul(data);},
  summary:run=>({id:run.roomId,gameId:'azul',round:run.index,endedAt:run.state.events.at(-1)?.time??run.state.createdAt,title:`花砖物语 · ${run.state.result?.winners.map(s=>run.roster[s].name).join('、')??''}获胜`,subtitle:`有色墙 · ${run.state.players.length} 人 · ${run.state.round} 轮`,entries:run.state.players.map(p=>({label:p.name,value:`${p.score} 分 · 累计 ${p.totalScore} · ${p.wins} 胜`,positive:run.state.result?.winners.includes(p.seat)}))}),
  planning:run=>({subtitle:'重新洗入全部 100 片花砖；本局分数归零，原玩家累计得分与胜场保留。上一局末轮先手座位顺延，可调整为 2–4 人。',balances:new Map(run.state.players.map(p=>[p.playerId,p.totalScore])),newPlayerLabel:'累计 0 分 · 0 胜'}),
};
