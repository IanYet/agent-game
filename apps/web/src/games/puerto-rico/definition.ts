import {toolResult,type ToolDefinition} from '@agent-game/protocol';
import type {GameModule,StoredRun} from '../../runtime/types';
import {actionInstructions} from '../action-schema';
import {agentIdentity,checkDecision,decisionKey,decorateView,emptySchema,enginePlayers,historyCursor,historyInstructions,incrementalObservation,readOnly,seatFor} from '../shared';
import {applyPuertoRico,createPuertoRico,restorePuertoRico,viewPuertoRico,type Phase,type PuertoRicoState} from './engine';
import {actionTool,ACTION_HELP} from './actions';
import {RULES} from './rules';
export const PHASE_NAMES:Record<Phase,string>={role:'选择角色',settler:'拓荒与种植',mayor_recruit:'确认领取人员',mayor:'分配人员',builder:'购买建筑',craftsman:'生产商品',craftsman_bonus:'工匠额外商品',trader:'贸易所出售',captain:'船运',storage:'仓储与弃货',finished:'本局已结算'};
const tools:ToolDefinition[]=[
  {name:'game_get_state',description:'读取最新完整可见局面和本局全部公开事件。只显示自己的累计船运暗分，其他人终局前隐藏；种植园暗堆顺序及随机状态永不显示。',inputSchema:emptySchema,annotations:readOnly},
  actionTool,
  {name:'game_rules',description:'读取 2002 经典基础版 3–5 人完整中文规则、23 种建筑、行动参数以及市长拒领的明确边界。',inputSchema:emptySchema,annotations:readOnly},
];
const validateConfig=(c:any)=>{if(!c||typeof c!=='object'||Array.isArray(c)||c.edition!=='classic-2002'||Object.keys(c).some(k=>k!=='edition'))throw Error('波多黎各采用固定的 2002 经典基础版，支持 3–5 人');};
const observe=(run:StoredRun<PuertoRicoState>,actor:string|null)=>decorateView(viewPuertoRico(run.state,actor===null?null:seatFor(run,actor)),run.roster);
export const puertoRicoModule:GameModule<PuertoRicoState>={
  id:'puerto-rico',version:'1.0.0',stateVersion:1,name:'波多黎各',description:'选择角色，经营岛屿，让每一桶货物找到商路。',tagline:'经典基础版 · 角色与商路',presentation:{english:'PUERTO RICO',symbol:'puerto-ship',tone:'warm'},
  minPlayers:3,maxPlayers:5,defaultPlayers:3,defaultConfig:{edition:'classic-2002'},runNoun:'局',validateConfig,lifecycle:{sessionScope:'run',eagerAgents:false},rules:()=>RULES,
  activity:run=>({phase:PHASE_NAMES[run.state.phase],detail:`第 ${run.state.round} 轮${run.state.finalReasons.length?' · 最后一轮':''}`}),
  create:(run,random)=>{validateConfig(run.config);return createPuertoRico(run.runId,enginePlayers(run.roster),random,run.index);},
  next:(previous,run,random)=>{validateConfig(run.config);return createPuertoRico(run.runId,enginePlayers(run.roster),random,run.index,previous.state);},
  finished:s=>s.phase==='finished',observe,
  tableView:(run,actor,{revealHands})=>decorateView(viewPuertoRico(run.state,actor===null?null:seatFor(run,actor),revealHands),run.roster),
  decisions:run=>run.state.phase==='finished'?[]:[{decisionId:decisionKey(run,run.state.revision,run.state.turn),actorId:run.roster[run.state.turn].playerId,allowedTools:['game_act']}],
  tools:()=>tools,historyCursor,
  initializePrompt:(run,actor)=>`你是波多黎各玩家 ${agentIdentity(run,actor)}。\n${RULES}\n${ACTION_HELP}\n${actionInstructions}\n${historyInstructions}`,
  decisionPrompt:(run,d,afterEvent=0)=>`波多黎各第 ${run.state.round} 轮，${PHASE_NAMES[run.state.phase]}，决策 ${d.decisionId}。根据当前局面自行构造 action，并调用 game_act 完成当前决策。成功一次后结束任务；只回复文字不会推进对局。无需重复读取已经随消息提供的最新局面。当前私有观察：${JSON.stringify(incrementalObservation(observe(run,d.actorId),afterEvent))}`,
  handleTool:(run,request)=>{
    try{const seat=seatFor(run,request.playerId);if(request.scopeId!==run.runId)throw Error('工具授权不属于当前局');
      if(request.tool==='game_get_state')return {result:toolResult(observe(run,request.playerId))};
      if(request.tool==='game_rules')return {result:toolResult({rules:RULES,actions:ACTION_HELP})};
      if(request.tool!=='game_act')throw Error('波多黎各未注册该工具');checkDecision(run,request,puertoRicoModule.decisions(run));
      const state=applyPuertoRico(run.state,seat,request.args.action);return {state,result:toolResult({success:true,revision:state.revision,phase:state.phase,message:'行动已完成，请结束本次任务，等待下一次决策。'})};
    }catch(e){return {result:toolResult({error:(e as Error).message},true)};}
  },
  humanAction:(run,actor,input)=>applyPuertoRico(run.state,seatFor(run,actor),input),
  restore:(data,version)=>{if(version!==1)throw Error('波多黎各存档版本不受支持，请新建游戏');return restorePuertoRico(data);},
  summary:run=>({id:run.roomId,gameId:'puerto-rico',round:run.index,endedAt:run.state.events.at(-1)?.time??run.state.createdAt,title:`波多黎各 · ${run.state.result?.winners.map(i=>run.roster[i].name).join('、')??''}获胜`,subtitle:`经典基础版 · ${run.roster.length} 人 · ${run.state.round} 轮`,entries:run.state.players.map(p=>({label:p.name,value:`${run.state.result?.scores[p.seat].total??0} 分 · 累计 ${p.totalScore} · ${p.wins} 胜`,positive:run.state.result?.winners.includes(p.seat)}))}),
  planning:run=>({subtitle:'重置全部种植园、建筑、人员、商品、金币与船运分。按稳定身份保留累计分及胜场，轮换初始总督，可调整为 3–5 人。',balances:new Map(run.state.players.map(p=>[p.playerId,p.totalScore])),newPlayerLabel:'累计 0 分 · 0 胜'}),
};
