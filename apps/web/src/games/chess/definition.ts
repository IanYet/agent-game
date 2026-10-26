import {toolResult} from '@agent-game/protocol';
import {Chess} from 'chess.js';
import type {GameModule,StoredRun} from '../../runtime/types';
import {decorateView,decisionKey,emptySchema,enginePlayers,readOnly,seatFor,checkRevision} from '../shared';
import {applyChessAction,CHESS_RULES,COLOR_NAMES,createChess,DEFAULT_CHESS_OPTIONS,legalChessActions,restoreChess,validateChessOptions,viewChess,type ChessState} from './engine';

const tools=[
  {name:'game_get_state',description:'读取完整公开棋局：FEN、棋盘、轮到哪方、将军状态、逐步棋谱、所有公开 events、和棋提议、当前方合法棋步和自己的合法行动。国际象棋没有隐藏棋子；不会返回其他 Agent 的对话。',inputSchema:emptySchema,annotations:readOnly},
  {name:'game_legal_actions',description:'读取全部合法行动及可解析 UCI 棋步（如 e2e4，升变 a7a8n）。actionId 直接用于 game_act。claim:* 表示落子前申请和棋；move:* 才实际落子。',inputSchema:emptySchema,annotations:readOnly},
  {name:'game_act',description:'提交当前合法列表的 actionId 与 revision。只在 move:* 时可提供 offerDraw=true，随本步提和。不得省略升变后缀。走子自动拒绝对方提和。',inputSchema:{type:'object' as const,properties:{revision:{type:'integer',minimum:1},actionId:{type:'string',minLength:1,maxLength:80},offerDraw:{type:'boolean'}},required:['revision','actionId'],additionalProperties:false},requiresDecision:true},
  {name:'game_rules',description:'读取本桌标准国际象棋规则、和棋申请与自动结束条件、跨局积分和实现边界。',inputSchema:emptySchema,annotations:readOnly},
];
const observe=(run:StoredRun<ChessState>,actor:string|null)=>viewChess(run.state,actor===null?null:seatFor(run,actor));
// Keep every public event and legal action available; only avoid duplicating the full state in prompts.
function promptView(run:StoredRun<ChessState>,actor:string){const v=observe(run,actor);return {revision:v.revision,you:actor,color:v.players[v.viewer!].color,turn:v.turn,players:v.players,fen:v.fen,board:v.board,check:v.check,phase:v.phase,drawOffer:v.drawOffer,claimable:v.claimable,halfmoveClock:v.halfmoveClock,repetitions:v.repetitions,events:v.events,legalActions:v.legalActions};}
export const definition:GameModule<ChessState>={
  id:'chess',version:'1.0.0',stateVersion:1,name:'国际象棋',description:'黑白之间，步步为营。交换先后，在同一张桌上继续较量。',tagline:'标准对弈',presentation:{english:'CHESS',symbol:'chess-pawn',tone:'cool'},
  minPlayers:2,maxPlayers:2,defaultPlayers:2,defaultConfig:DEFAULT_CHESS_OPTIONS,runNoun:'局',validateConfig:validateChessOptions,
  rules:()=>CHESS_RULES,lifecycle:{sessionScope:'run',eagerAgents:false},
  activity:run=>({phase:run.state.phase==='finished'?'本局已结束':new Chess(run.state.fen).isCheck()?'将军':'行棋中',detail:`第 ${run.index} 局 · ${COLOR_NAMES[run.state.players[run.state.turn].color]}行棋`}),
  create:(run,random)=>createChess(run.runId,enginePlayers(run.roster),run.config,random,run.index),
  next:(old,run,random)=>createChess(run.runId,enginePlayers(run.roster),old.state.options,random,run.index,old.state),
  finished:state=>state.phase==='finished',observe,
  tableView:(run,actor)=>decorateView(observe(run,actor),run.roster),
  decisions:run=>run.state.phase==='finished'?[]:[{decisionId:decisionKey(run,run.state.revision,run.state.turn),actorId:run.roster[run.state.turn].playerId,allowedTools:['game_act']}],
  tools:()=>tools,
  initializePrompt:(run,actor)=>`你是国际象棋玩家 ${run.roster[seatFor(run,actor)].name}，执${COLOR_NAMES[run.state.players[seatFor(run,actor)].color]}。\n${CHESS_RULES}\n所有棋子公开。请认真争胜，不为尽快结束而随意认输。通过 game_legal_actions 取得当前可靠棋步；只使用列表中的 actionId。完成一个行动后结束本次任务。初始观察：${JSON.stringify(promptView(run,actor))}`,
  decisionPrompt:(run,d)=>`国际象棋第 ${run.index} 局，决策 ${d.decisionId}。选择当前合法 actionId，调用 game_act 完成行动，然后结束任务。预定棋步的和棋申请不会落子，拒绝提和后仍由你走棋。观察：${JSON.stringify(promptView(run,d.actorId))}`,
  handleTool:(run,request)=>{
    const seat=seatFor(run,request.playerId),state=run.state;
    if(request.tool==='game_rules')return {result:toolResult({rules:CHESS_RULES})};
    if(request.tool==='game_get_state')return {result:toolResult({...observe(run,request.playerId)})};
    if(request.tool==='game_legal_actions')return {result:toolResult({revision:state.revision,actions:legalChessActions(state,seat)})};
    if(request.tool!=='game_act')throw new Error('国际象棋没有注册该工具');
    if(request.decisionId!==decisionKey(run,state.revision,state.turn)||seat!==state.turn||state.phase==='finished')throw new Error('该行棋决策已失效或不属于你');
    checkRevision(state,request.args);
    const action=legalChessActions(state,seat).find(a=>a.id===request.args.actionId)?.action;
    if(!action)throw new Error('actionId 不是当前合法行动');
    if(request.args.offerDraw!==undefined&&action.type!=='move')throw new Error('只有走子时可附带提和');
    const next=applyChessAction(state,seat,action.type==='move'?{...action,...(request.args.offerDraw!==undefined?{offerDraw:request.args.offerDraw}:{})}:action);
    return {state:next,result:toolResult({success:true,revision:next.revision,fen:next.fen,result:next.result,message:'行动完成，结束本次任务。'})};
  },
  humanAction:(run,actor,input)=>applyChessAction(run.state,seatFor(run,actor),input),restore:restoreChess,
  summary:run=>({id:run.roomId,gameId:'chess',round:run.index,endedAt:run.state.events.at(-1)?.time??run.state.createdAt,title:`国际象棋 · ${run.state.result?.description??'未结算'}`,subtitle:`第 ${run.index} 局 · ${run.state.moves.length} 步 · ${run.state.result?.outcome??'*'}`,entries:run.state.players.map(p=>({label:`${p.name} · ${COLOR_NAMES[p.color]}`,value:`+${run.state.result?.deltas[p.seat]??0} · 累计 ${p.score}`,positive:(run.state.result?.deltas[p.seat]??0)>0}))}),
  planning:run=>({subtitle:`同一棋桌 · ${run.state.options.alternateColors?'下一局交换黑白':'保持原有黑白'} · 胜 1 分，和棋 0.5 分`,balances:new Map(run.state.players.map(p=>[p.playerId,p.score])),newPlayerLabel:'新玩家从 0 分开始'}),
};
