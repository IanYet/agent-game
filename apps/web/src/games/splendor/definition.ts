import {toolResult} from '@agent-game/protocol';
import type {GameModule, StoredRun} from '../../runtime/types';
import {agentObservation, checkRevision, decisionKey, decorateView, emptySchema, enginePlayers, readOnly, seatFor} from '../shared';
import {applyAction, assertSplendor, createSplendor, legalActions, nextSplendor, points, viewSplendor} from './engine';
import {SPLENDOR_RULES} from './rules';
import {GEMS, type SplendorState} from './types';

const descriptors=[
  {name:'game_get_state',description:'读取自己可见的完整市场、银行、贵族、所有公开玩家资源、自己的预留及从开局开始的全部公开 events。对手未公开预留和暗库顺序隐藏。',inputSchema:emptySchema,annotations:readOnly},
  {name:'game_legal_actions',description:'分页读取当前阶段全部合法行动，包括拿取、购买、明暗预留、超额归还与贵族选择。购买的 action.payment 是优先使用彩色宝石的默认支付，可通过 game_act.payment 改用黄金。',inputSchema:{type:'object' as const,properties:{offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}},additionalProperties:false},annotations:readOnly},
  {name:'game_act',description:'用最新 revision 和合法 actionId 完成当前阶段的一次决策，然后结束任务。超额归还/多位贵族会产生新的决策。只有 buy 行动可提供 payment 覆盖默认支付：各色及黄金的实际支付数量，省略颜色为 0，须恰好覆盖折扣后费用。',inputSchema:{type:'object' as const,properties:{revision:{type:'integer',minimum:1},actionId:{type:'string',minLength:1,maxLength:300},payment:{type:'object',properties:Object.fromEntries(GEMS.map(c=>[c,{type:'integer',minimum:0,maximum:10}])),additionalProperties:false}},required:['revision','actionId'],additionalProperties:false},requiresDecision:true},
  {name:'game_rules',description:'读取璀璨宝石基础版完整中文规则、资源、隐私与跨局计分说明。',inputSchema:emptySchema,annotations:readOnly},
];
const observe=(run:StoredRun<SplendorState>,actor:string|null)=>decorateView(viewSplendor(run.state,actor===null?null:seatFor(run,actor)),run.roster);
const decisions=(run:StoredRun<SplendorState>)=>run.state.phase==='finished'?[]:[{decisionId:decisionKey(run,run.state.revision,run.state.turn),actorId:run.roster[run.state.turn].playerId,allowedTools:['game_act']}];
const validateConfig=(config:any)=>{if(!config||Array.isArray(config)||config.edition!=='base-2024'||Object.keys(config).some(k=>k!=='edition'))throw Error('璀璨宝石使用固定的 2024 基础版规则');};
export const splendorModule:GameModule<SplendorState>={
  id:'splendor',version:'1.0.0',stateVersion:1,name:'璀璨宝石',description:'收集宝石，建立商路，赢得贵族的青睐。',tagline:'基础版 · 宝石与声望',presentation:{english:'SPLENDOR',symbol:'💎',tone:'warm'},
  minPlayers:2,maxPlayers:4,defaultPlayers:2,defaultConfig:{edition:'base-2024'},runNoun:'局',
  validateConfig,
  lifecycle:{sessionScope:'run',eagerAgents:false},rules:()=>SPLENDOR_RULES,
  activity:run=>({phase:({action:'收集与发展',return:'归还超额宝石',noble:'选择贵族',finished:'本局已结算'})[run.state.phase],detail:`第 ${run.index} 局${run.state.finalRound?' · 最后一轮':''}`}),
  create:(run,random)=>{validateConfig(run.config);return createSplendor(run.runId,enginePlayers(run.roster),{random,round:run.index});},
  next:(previous,run,random)=>{validateConfig(run.config);return nextSplendor(previous.state,run.runId,enginePlayers(run.roster),random,run.index);},
  finished:state=>state.phase==='finished',observe,
  tableView:(run,actor,{revealHands})=>decorateView(viewSplendor(run.state,actor===null?null:seatFor(run,actor),revealHands),run.roster),
  decisions,tools:()=>descriptors,
  initializePrompt:(run,actor)=>`你是璀璨宝石玩家 ${run.roster[seatFor(run,actor)].name}。\n${SPLENDOR_RULES}\n只使用本局固定的游戏工具，不调用终端或文件。观察包含全部公开事件和合法行动摘要；用 game_legal_actions 分页读全。先比较可负担的购买和长期折扣，目标是在等轮结束时胜出。每次唤醒成功执行一次 game_act 后结束任务；归还和贵族选择会另行唤醒。初始观察：${JSON.stringify(agentObservation(observe(run,actor)))}`,
  decisionPrompt:(run,d)=>`璀璨宝石第 ${run.index} 局，阶段 ${run.state.phase}，决策 ${d.decisionId}。执行一次合法 game_act 并结束任务。完整公开记录及当前观察：${JSON.stringify(agentObservation(observe(run,d.actorId)))}`,
  handleTool:(run,request)=>{
    const seat=seatFor(run,request.playerId);
    if(request.scopeId!==run.runId)throw Error('该工具请求不属于当前局');
    if(request.tool==='game_rules')return {result:toolResult({rules:SPLENDOR_RULES})};
    if(request.tool==='game_get_state')return {result:toolResult(agentObservation(observe(run,request.playerId)))};
    const legal=legalActions(run.state,seat);
    if(request.tool==='game_legal_actions'){
      const offset=request.args.offset??0,limit=request.args.limit??80;
      if(!Number.isSafeInteger(offset)||(offset as number)<0||!Number.isSafeInteger(limit)||(limit as number)<1||(limit as number)>100)throw Error('分页范围无效');
      return {result:toolResult({revision:run.state.revision,total:legal.length,offset,actions:legal.slice(offset as number,(offset as number)+(limit as number))})};
    }
    if(request.tool!=='game_act')throw Error('璀璨宝石未注册该工具');
    const decision=decisions(run)[0];if(!decision||decision.actorId!==request.playerId||decision.decisionId!==request.decisionId)throw Error('该玩家没有当前决策的行动权限');
    checkRevision(run.state,request.args);
    const choice=legal.find(a=>a.id===request.args.actionId);if(!choice)throw Error('actionId 不是当前合法行动');
    if(request.args.payment!==undefined&&choice.action.type!=='buy')throw Error('只有购买可指定 payment');
    const action=choice.action.type==='buy'&&request.args.payment!==undefined?{...choice.action,payment:request.args.payment as any}:choice.action;
    const state=applyAction(run.state,seat,action);return {state,result:toolResult({success:true,revision:state.revision,phase:state.phase,message:'本次决策已完成，请结束任务。'})};
  },
  humanAction:(run,actor,input)=>applyAction(run.state,seatFor(run,actor),input),
  restore:(data,version)=>{if(version!==1)throw Error('璀璨宝石存档版本不受支持');try{assertSplendor(data as SplendorState);}catch(e){throw Error('璀璨宝石存档无效：'+(e as Error).message);}return data as SplendorState;},
  summary:run=>({id:run.roomId,gameId:'splendor',round:run.index,endedAt:run.state.events.at(-1)?.time??run.state.createdAt,title:`璀璨宝石 · ${run.state.result?.winners.map(seat=>run.roster[seat].name).join('、')??'未结算'}获胜`,subtitle:`第 ${run.index} 局 · ${run.roster.length} 人 · 基础版`,entries:run.state.players.map(p=>({label:p.name,value:`${points(p)} 分 / ${p.bought.length} 张`,positive:run.state.result?.winners.includes(p.seat)}))}),
  planning:()=>({subtitle:'基础版 · 重新洗牌与配置资源 · 轮换先手 · 继承累计胜局和总声望'}),
};
