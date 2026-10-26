import {toolResult} from '@agent-game/protocol';
import {Chess} from 'chess.js';
import type {GameModule,StoredRun} from '../../runtime/types';
import {historyCursor,historyInstructions,incrementalObservation,decorateView,decisionKey,emptySchema,enginePlayers,readOnly,seatFor,checkDecision,agentObservation,agentIdentity} from '../shared';
import {applyChessAction,CHESS_RULES,COLOR_NAMES,createChess,DEFAULT_CHESS_OPTIONS,restoreChess,validateChessOptions,viewChess,type ChessState} from './engine';
import {actionTool,ACTION_HELP} from './actions';
import {actionInstructions} from '../action-schema';

const tools=[
  {name:'game_get_state',description:'读取完整公开棋局：FEN、棋盘、轮到哪方、将军状态、逐步棋谱、所有公开 events、和棋提议及无进展和重复计数。国际象棋没有隐藏棋子；不会返回其他 Agent 的对话。',inputSchema:emptySchema,annotations:readOnly},
  actionTool,
  {name:'game_rules',description:'读取本桌标准国际象棋规则、和棋申请与自动结束条件、跨局积分和实现边界。',inputSchema:emptySchema,annotations:readOnly},
];
const observe=(run:StoredRun<ChessState>,actor:string|null)=>agentObservation(viewChess(run.state,actor===null?null:seatFor(run,actor),false));
// The current board and incremental events suffice; game_get_state retains the full score sheet.
function promptView(run:StoredRun<ChessState>,actor:string){const v=observe(run,actor);return {revision:v.revision,you:actor,viewer:v.viewer,color:v.players[v.viewer].color,turn:v.turn,players:v.players,initialFen:v.initialFen,fen:v.fen,board:v.board,check:v.check,phase:v.phase,drawOffer:v.drawOffer,claimable:v.claimable,halfmoveClock:v.halfmoveClock,repetitions:v.repetitions,events:v.events};}
export const definition:GameModule<ChessState>={
  id:'chess',version:'2.0.0',stateVersion:1,name:'国际象棋',description:'黑白之间，步步为营。交换先后，在同一张桌上继续较量。',tagline:'标准对弈',presentation:{english:'CHESS',symbol:'chess-pawn',tone:'cool'},
  minPlayers:2,maxPlayers:2,defaultPlayers:2,defaultConfig:DEFAULT_CHESS_OPTIONS,runNoun:'局',validateConfig:validateChessOptions,
  rules:()=>CHESS_RULES,lifecycle:{sessionScope:'run',eagerAgents:false},
  activity:run=>({phase:run.state.phase==='finished'?'本局已结束':new Chess(run.state.fen).isCheck()?'将军':'行棋中',detail:`第 ${run.index} 局 · ${COLOR_NAMES[run.state.players[run.state.turn].color]}行棋`}),
  create:(run,random)=>createChess(run.runId,enginePlayers(run.roster),run.config,random,run.index),
  next:(old,run,random)=>createChess(run.runId,enginePlayers(run.roster),old.state.options,random,run.index,old.state),
  finished:state=>state.phase==='finished',observe,
  tableView:(run,actor)=>decorateView(viewChess(run.state,actor===null?null:seatFor(run,actor)),run.roster),
  decisions:run=>run.state.phase==='finished'?[]:[{decisionId:decisionKey(run,run.state.revision,run.state.turn),actorId:run.roster[run.state.turn].playerId,allowedTools:['game_act']}],
  tools:()=>tools,
  historyCursor,
  initializePrompt:(run,actor)=>`你是国际象棋玩家 ${agentIdentity(run,actor)}，执${COLOR_NAMES[run.state.players[seatFor(run,actor)].color]}。\n${CHESS_RULES}\n${ACTION_HELP}\n${actionInstructions}\n请认真争胜，不为尽快结束而随意认输。${historyInstructions}`,
  decisionPrompt:(run,d,afterEvent=0)=>`国际象棋第 ${run.index} 局，决策 ${d.decisionId}。根据棋盘自行构造 action，执行一次 game_act 成功后结束任务。预定棋步的和棋申请不会落子，拒绝提和后仍由你走棋。观察：${JSON.stringify(incrementalObservation(promptView(run,d.actorId),afterEvent))}`,
  handleTool:(run,request)=>{
    const seat=seatFor(run,request.playerId),state=run.state;
    if(request.tool==='game_rules')return {result:toolResult({rules:CHESS_RULES,actions:ACTION_HELP})};
    if(request.tool==='game_get_state')return {result:toolResult({...observe(run,request.playerId)})};
    if(request.tool!=='game_act')throw new Error('国际象棋没有注册该工具');
    checkDecision(run,request,definition.decisions(run));
    const next=applyChessAction(state,seat,request.args.action);
    return {state:next,result:toolResult({success:true,revision:next.revision,fen:next.fen,result:next.result,message:'行动完成，结束本次任务。'})};
  },
  humanAction:(run,actor,input)=>applyChessAction(run.state,seatFor(run,actor),input),restore:restoreChess,
  summary:run=>({id:run.roomId,gameId:'chess',round:run.index,endedAt:run.state.events.at(-1)?.time??run.state.createdAt,title:`国际象棋 · ${run.state.result?.description??'未结算'}`,subtitle:`第 ${run.index} 局 · ${run.state.moves.length} 步 · ${run.state.result?.outcome??'*'}`,entries:run.state.players.map(p=>({label:`${p.name} · ${COLOR_NAMES[p.color]}`,value:`+${run.state.result?.deltas[p.seat]??0} · 累计 ${p.score}`,positive:(run.state.result?.deltas[p.seat]??0)>0}))}),
  planning:run=>({subtitle:`同一棋桌 · ${run.state.options.alternateColors?'下一局交换黑白':'保持原有黑白'} · 胜 1 分，和棋 0.5 分`,balances:new Map(run.state.players.map(p=>[p.playerId,p.score])),newPlayerLabel:'新玩家从 0 分开始'}),
};
