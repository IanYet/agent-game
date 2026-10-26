import {toolResult,type ToolDefinition} from '@agent-game/protocol';
import type {GameModule,StoredRun} from '../../runtime/types';
import {historyCursor,historyInstructions,incrementalObservation,agentObservation,checkRevision,decisionKey,decorateView,emptySchema,enginePlayers,readOnly,seatFor} from '../shared';
import {applyAction,createGame,getLegalActions,restoreState,viewGame,LEGAL_NOTE} from './engine';
import {label,teamName} from './cards';
import {GUANDAN_RULES} from './rules';
import type {GuandanState} from './types';

const descriptors:ToolDefinition[]=[
  {name:'game_get_state',description:'读取自己的手牌、级牌、队伍、贡还阶段、当前牌型与从本副发牌开始的完整公开 events。不会看到搭档或对手私牌。',inputSchema:emptySchema,annotations:readOnly},
  {name:'game_legal_actions',description:`分页读取合法行动及 actionId。${LEGAL_NOTE}`,inputSchema:{type:'object',properties:{offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}},additionalProperties:false},annotations:readOnly},
  {name:'game_act',description:'用当前 revision 和合法 actionId 出牌、不出、贡牌或还牌；成功后结束本次任务。',inputSchema:{type:'object',properties:{revision:{type:'integer',minimum:1},actionId:{type:'string',minLength:1,maxLength:500}},required:['revision','actionId'],additionalProperties:false},requiresDecision:true},
  {name:'game_play',description:'自行选择本人实体手牌并声明组合 key（如 pair:7:2 或 straight_flush:10:5:S）。用于代表行动外的同点花色选择；与真人使用相同的牌型、轮转及压牌校验。',inputSchema:{type:'object',properties:{revision:{type:'integer',minimum:1},cards:{type:'array',items:{type:'string'},minItems:1,maxItems:10,uniqueItems:true},combination:{type:'string',minLength:1,maxLength:80}},required:['revision','cards','combination'],additionalProperties:false},requiresDecision:true},
  {name:'game_rules',description:'读取四人对家常见贡牌版的全部规则、过 A 条件和版本依据。',inputSchema:emptySchema,annotations:readOnly},
];
function validateConfig(config:any){if(!config||config.ruleset!=='common-tribute'||Object.keys(config).some(k=>k!=='ruleset'))throw new Error('请选择四人对家常见贡牌版');}
const observe=(run:StoredRun<GuandanState>,actor:string|null)=>decorateView(viewGame(run.state,actor===null?null:seatFor(run,actor)),run.roster);
export const guandanModule:GameModule<GuandanState>={
  id:'guandan',version:'1.0.0',stateVersion:1,name:'掼蛋',description:'四人对家，两副牌。配牌、接风、贡还，一起打过 A。',tagline:'双副牌 · 对家升级',
  presentation:{english:'GUANDAN',symbol:'2',tone:'warm'},minPlayers:4,maxPlayers:4,defaultPlayers:4,defaultConfig:{ruleset:'common-tribute'},runNoun:'副',
  rules:()=>GUANDAN_RULES,validateConfig,lifecycle:{sessionScope:'run',eagerAgents:false},
  activity:run=>({phase:{tribute:'正在进贡',return:'正在还牌',playing:'对家掼蛋',finished:run.state.result?.matchWinner!==null?'本盘已过 A':'本副结束'}[run.state.phase],detail:`第 ${run.state.matchNumber} 盘 · 第 ${run.index} 副 · 打 ${label(run.state.level)}`}),
  create:(run,random)=>{validateConfig(run.config);return createGame(run.roomId,enginePlayers(run.roster),{random,round:run.index});},
  next:(previous,run,random)=>{validateConfig(run.config);return createGame(run.roomId,enginePlayers(run.roster),{random,round:run.index,previous:previous.state});},
  finished:s=>s.phase==='finished',observe,
  tableView:(run,actor,{revealHands})=>decorateView(viewGame(run.state,actor===null?null:seatFor(run,actor),revealHands),run.roster),
  decisions:run=>run.state.phase==='finished'?[]:[{decisionId:decisionKey(run,run.state.revision,run.state.turn),actorId:run.roster[run.state.turn].playerId,allowedTools:run.state.phase==='playing'?['game_act','game_play']:['game_act']}],
  tools:()=>descriptors,
  historyCursor,
  initializePrompt:(run,actor)=>`你是掼蛋玩家 ${run.roster[seatFor(run,actor)].name}，${teamName(seatFor(run,actor)%2)}。对面座位是搭档，只共享公开信息。\n${GUANDAN_RULES}\n仅使用游戏工具，不执行文件、网络或终端任务。此会话仅用于本副；events 记录本副公开行动，按 seq 递增。先读观察与合法行动，每次决策提交一次有效行动后结束任务。\n${historyInstructions}`,
  decisionPrompt:(run,decision,afterEvent=0)=>`掼蛋第 ${run.index} 副，决策 ${decision.decisionId}。先确认阶段和当前级牌；可分页获取合法行动。完成一次进贡、还牌、出牌或不出后结束任务。\n当前私有观察：${JSON.stringify(incrementalObservation(agentObservation(observe(run,decision.actorId)),afterEvent))}`,
  handleTool:(run,request)=>{
    try{
      const seat=seatFor(run,request.playerId),state=run.state;
      if(request.tool==='game_rules')return {result:toolResult({rules:GUANDAN_RULES})};
      if(request.tool==='game_get_state')return {result:toolResult(agentObservation(observe(run,request.playerId)))};
      if(request.tool==='game_legal_actions'){
        const offset=Number(request.args.offset??0),limit=Number(request.args.limit??60);
        if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw new Error('分页参数无效');
        const legal=getLegalActions(state,seat);return {result:toolResult({revision:state.revision,total:legal.length,offset,note:LEGAL_NOTE,actions:legal.slice(offset,offset+limit)})};
      }
      if(!['game_act','game_play'].includes(request.tool))throw new Error('掼蛋没有注册该工具');
      if(state.phase==='finished'||state.turn!==seat||request.decisionId!==decisionKey(run,state.revision,seat))throw new Error('决策已过期或不属于当前玩家');
      checkRevision(state,request.args);
      let action:unknown;
      if(request.tool==='game_act'){
        const choice=getLegalActions(state,seat).find(a=>a.id===request.args.actionId);if(!choice)throw new Error('actionId 不是当前合法行动');action=choice.action;
      }else action={type:'play',cards:request.args.cards,combination:request.args.combination};
      const next=applyAction(state,seat,action);
      return {state:next,result:toolResult({success:true,revision:next.revision,message:'行动完成，请结束本次任务。'})};
    }catch(error){return {result:toolResult({error:(error as Error).message},true)};}
  },
  humanAction:(run,actor,input)=>applyAction(run.state,seatFor(run,actor),input),restore:restoreState,
  summary:run=>{const s=run.state,r=s.result;return {id:run.roomId,gameId:'guandan',round:run.index,endedAt:s.events.at(-1)?.time??s.createdAt,title:`掼蛋 · ${teamName(r?.winner??0)}${r?.matchWinner!==null?'过 A':'升级'}`,subtitle:`第 ${s.matchNumber} 盘 · 第 ${run.index} 副 · 打 ${label(s.level)} · ${r?.doubleDown?'双下':`升 ${r?.advance} 级`}`,entries:run.roster.map((p,i)=>({label:`${p.name} · ${teamName(i%2)}`,value:r?.doubleDown&&r.order.indexOf(i)>=2?'双下':['头游','二游','三游','末游'][r?.order.indexOf(i)??3],positive:i%2===r?.winner}))};},
  planning:run=>({subtitle:run.state.result?.matchWinner!==null?`本盘已过 A · 下一副重新从 2 开始 · 累计盘分 ${run.state.matchWins.join(' : ')}`:`下一副打 ${label(run.state.result?.levelsAfter[run.state.result.winner]??run.state.level)} · 按名次贡还 · 本盘保持四人座位和队伍`}),
};
