import {toolResult,type ToolDefinition} from '@agent-game/protocol';
import type {GameModule,StoredRun,PendingDecision} from '../../runtime/types';
import {enginePlayers,seatFor,decorateView,emptySchema,readOnly,checkRevision,agentObservation} from '../shared';
import {applyAction,createGame,createBaoDeck,legalActions,pendingSeats,viewGame} from './engine';
import {BAOHUANG_RULES} from './rules';
import type {BaoAction,BaoState,BaoView} from './types';

const tools:ToolDefinition[]=[
  {name:'game_get_state',description:'读取自己的手牌、可知身份、当前局全部公开events；暗保时不透露侍卫给其他玩家。',inputSchema:emptySchema,annotations:readOnly},
  {name:'game_legal_actions',description:'分页读取当前合法行动及actionId，offset从0开始，每页limit为1至100。不同普通花色的等效牌合并，皇牌和侍卫标记牌单独枚举。',inputSchema:{type:'object',properties:{offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}},additionalProperties:false},annotations:readOnly},
  {name:'game_act',description:'用当前revision和合法actionId完成当前决策；准备阶段自己的确认不公开身份。成功后结束本次任务。',inputSchema:{type:'object',properties:{revision:{type:'integer',minimum:1},actionId:{type:'string',minLength:1,maxLength:1000}},required:['revision','actionId'],additionalProperties:false},requiresDecision:true},
  {name:'game_rules',description:'读取本桌山东保皇的固定保规则、名次计分与下一局方式。',inputSchema:emptySchema,annotations:readOnly},
];
function validateConfig(config:any){if(config?.ruleset!=='jj-fixed168'||!Number.isInteger(config.baseScore)||config.baseScore<1||config.baseScore>100)throw new Error('请选择JJ标准固定保，底分须为1至100的整数');}
const observe=(run:StoredRun<BaoState>,actor:string|null)=>decorateView(viewGame(run.state,actor===null?null:seatFor(run,actor)),run.roster) as BaoView;
const decisions=(run:StoredRun<BaoState>):PendingDecision[]=>pendingSeats(run.state).map(seat=>({
  // Simultaneous confirmations stay valid when another player confirms.
  decisionId:run.state.phase==='declare'?`${run.runId}:declare:${run.roster[seat].playerId}`:`${run.runId}:${run.state.revision}:${run.roster[seat].playerId}`,
  actorId:run.roster[seat].playerId,allowedTools:['game_act'],
}));
export function restoreBao(data:unknown,version:number):BaoState{
  const s=data as BaoState,seat=(n:unknown)=>Number.isInteger(n)&&Number(n)>=0&&Number(n)<5;
  const fail=()=>{throw new Error('山东保皇存档格式或版本不受支持，请新建牌桌');};
  if(version!==1||!s||s.gameId!=='baohuang'||!Array.isArray(s.players)||s.players.length!==5||!Array.isArray(s.played)||!Array.isArray(s.events)||!['enthrone','declare','playing','finished'].includes(s.phase))return fail();
  if(!Number.isInteger(s.revision)||s.revision<1||!Number.isInteger(s.round)||s.round<1||!Number.isInteger(s.baseScore)||s.baseScore<1||s.baseScore>100||!seat(s.turn)||!seat(s.emperor)||!seat(s.guard)||!seat(s.initialEmperor)||!Number.isInteger(s.cedes)||s.cedes<0||s.cedes>5||typeof s.id!=='string'||typeof s.createdAt!=='string')return fail();
  if(!s.players.every((p,i)=>p&&p.seat===i&&typeof p.playerId==='string'&&typeof p.name==='string'&&['human','agent'].includes(p.kind)&&Number.isFinite(p.score)&&Array.isArray(p.hand)&&(p.rank===null||Number.isInteger(p.rank)&&p.rank>=1&&p.rank<=5))||new Set(s.players.map(p=>p.playerId)).size!==5||s.players.filter(p=>p.kind==='human').length>1)return fail();
  const all=[...s.players.flatMap(p=>p.hand),...s.played],deck=new Map(createBaoDeck().map(c=>[c.id,c]));
  if(all.length!==168||new Set(all.map(c=>c?.id)).size!==168||!all.every(c=>{const d=deck.get(c?.id);return d&&d.rank===c.rank&&d.suit===c.suit&&d.mark===c.mark;}))return fail();
  if(!Array.isArray(s.order)||new Set(s.order).size!==s.order.length||!s.order.every((at,i)=>seat(at)&&s.players[at].rank===i+1&&s.players[at].hand.length===0)||s.players.some(p=>p.rank!==null&&!s.order.includes(p.seat)))return fail();
  if(!Array.isArray(s.declarations)||s.declarations.length!==5||!s.declarations.every(v=>v===null||typeof v==='boolean')||s.declarations.some((v,i)=>v===true&&i!==s.guard)||typeof s.open!=='boolean'||typeof s.guardPublic!=='boolean'||!Array.isArray(s.responders)||new Set(s.responders).size!==s.responders.length||!s.responders.every(seat)||!Array.isArray(s.lastActions)||s.lastActions.length!==5||!Number.isInteger(s.trick))return fail();
  if(!s.events.every((e,i)=>e&&e.seq===i+1&&typeof e.text==='string'&&typeof e.type==='string'&&typeof e.time==='string'&&(e.seat===undefined||seat(e.seat))&&(e.cards===undefined||Array.isArray(e.cards)&&e.cards.every(c=>deck.has(c?.id)))))return fail();
  if(s.lastPlay&&(!seat(s.lastPlay.seat)||!Array.isArray(s.lastPlay.cards)||!s.lastPlay.cards.every(c=>s.played.some(d=>d.id===c.id))))return fail();
  if((s.phase==='finished')!==!!s.result||s.result&&(!Array.isArray(s.result.deltas)||s.result.deltas.length!==5||!s.result.deltas.every(Number.isFinite)||s.result.deltas.reduce((a,b)=>a+b,0)!==0||s.result.emperor!==s.emperor||s.result.guard!==s.guard))return fail();
  return structuredClone(s);
}
export const baohuangModule:GameModule<BaoState,BaoView>={
  id:'baohuang',version:'1.0.0',stateVersion:1,name:'山东保皇',description:'皇帝在明，侍卫在暗。五人四副牌，皇保与平民争先走完。',tagline:'五人 · 固定保 · 明暗博弈',
  presentation:{english:'BAOHUANG',symbol:'crown',tone:'warm'},minPlayers:5,maxPlayers:5,defaultPlayers:5,defaultConfig:{ruleset:'jj-fixed168',baseScore:1},runNoun:'局',
  validateConfig,rules:()=>BAOHUANG_RULES,lifecycle:{sessionScope:'run',eagerAgents:false},
  activity:run=>({phase:{enthrone:'决定皇帝',declare:'全体准备',playing:'行牌',finished:'已结算'}[run.state.phase],detail:`第${run.index}局 · JJ标准固定保 · ${run.state.baseScore}底分`}),
  create:(run,random)=>{validateConfig(run.config);return createGame(run.roomId,enginePlayers(run.roster),{random,round:run.index,baseScore:run.config.baseScore});},
  next:(previous,run,random)=>{
    if(previous.state.phase!=='finished')throw new Error('本局结束后才能开始下一局');validateConfig(run.config);
    return createGame(run.roomId,enginePlayers(run.roster),{random,round:run.index,baseScore:run.config.baseScore,
      dealStart:Math.max(0,run.roster.findIndex(p=>p.playerId===previous.roster[previous.state.emperor].playerId)),
      scores:run.roster.map(p=>previous.state.players.find(old=>old.playerId===p.playerId)?.score??0)});
  },
  finished:s=>s.phase==='finished',observe,tableView:(run,actor,{revealHands})=>decorateView(viewGame(run.state,actor===null?null:seatFor(run,actor),revealHands),run.roster),decisions,tools:()=>tools,
  initializePrompt:(run,actor)=>`你是山东保皇玩家${run.roster[seatFor(run,actor)].name}。\n${BAOHUANG_RULES}\n仅通过游戏工具行动，不能向其他玩家询问隐藏身份。events是本局全部公开事件。准备阶段全员同时确认，非侍卫只需ready；侍卫选择明或暗。普通副本等效，标记皇牌和侍卫牌可区别使用。\n初始观察：${JSON.stringify(agentObservation(observe(run,actor)))}`,
  decisionPrompt:(run,d)=>`保皇第${run.index}局，决策${d.decisionId}。读取状态与合法行动，选一个actionId调用game_act，成功后结束任务。如果其他玩家同时准备使revision更新，请重读再提交；你的准备决策仍有效。\n当前观察：${JSON.stringify(agentObservation(observe(run,d.actorId)))}`,
  handleTool:(run,request)=>{
    try{
      const seat=seatFor(run,request.playerId);
      if(request.tool==='game_get_state')return {result:toolResult(agentObservation(observe(run,request.playerId)))};
      if(request.tool==='game_rules')return {result:toolResult({rules:BAOHUANG_RULES})};
      const choices=legalActions(run.state,seat);
      if(request.tool==='game_legal_actions'){
        const offset=request.args.offset??0,limit=request.args.limit??60;
        if(!Number.isInteger(offset)||Number(offset)<0||!Number.isInteger(limit)||Number(limit)<1||Number(limit)>100)throw new Error('分页参数不正确');
        return {result:toolResult({revision:run.state.revision,total:choices.length,offset,actions:choices.slice(Number(offset),Number(offset)+Number(limit))})};
      }
      if(request.tool!=='game_act')throw new Error('未注册的保皇工具');
      if(!decisions(run).some(d=>d.actorId===request.playerId&&d.decisionId===request.decisionId))throw new Error('决策或玩家身份已失效');
      checkRevision(run.state,request.args);const choice=choices.find(c=>c.id===request.args.actionId);if(!choice)throw new Error('actionId不是当前合法行动');
      const state=applyAction(run.state,seat,choice.action);return {state,result:toolResult({success:true,revision:state.revision,message:'行动完成，请结束本次任务。'})};
    }catch(e){return {result:toolResult({error:e instanceof Error?e.message:String(e)},true)};}
  },
  humanAction:(run,actor,input)=>applyAction(run.state,seatFor(run,actor),input as BaoAction),restore:restoreBao,
  summary:run=>({id:run.roomId,gameId:'baohuang',round:run.index,endedAt:run.state.events.at(-1)?.time??run.state.createdAt,
    title:`山东保皇 · ${run.state.result?.winner==='royal'?'保皇派获胜':run.state.result?.winner==='civilian'?'平民获胜':'和局'}`,
    subtitle:`第${run.index}局 · ${run.state.result?.reason??''}`,entries:run.roster.map((p,i)=>({label:p.name,value:`${(run.state.result?.deltas[i]??0)>0?'+':''}${run.state.result?.deltas[i]??0}`,positive:(run.state.result?.deltas[i]??0)>0}))}),
  planning:run=>({subtitle:'五人重新洗牌确定皇保 · 按玩家身份继承积分 · 无进贡',balances:new Map(run.state.players.map(p=>[p.playerId,p.score])),newPlayerLabel:'初始积分0'}),
};
