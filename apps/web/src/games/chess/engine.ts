import {Chess,DEFAULT_POSITION,type Color,type Move,type PieceSymbol,type Square} from 'chess.js';

export interface ChessOptions {firstWhite:'first'|'second'|'random';alternateColors:boolean}
export const DEFAULT_CHESS_OPTIONS:ChessOptions={firstWhite:'first',alternateColors:true};
export interface ChessPlayer {playerId:string;name:string;kind:'human'|'agent';seat:number;color:Color;score:number;wins:number;draws:number;losses:number}
export interface ChessMove {ply:number;seat:number;color:Color;uci:string;san:string;from:Square;to:Square;piece:PieceSymbol;captured?:PieceSymbol;promotion?:PieceSymbol;enPassant:boolean;castle:boolean;before:string;after:string;time:string}
export interface ChessEvent {seq:number;time:string;type:'start'|'move'|'offer'|'decline'|'accept'|'claim'|'resign'|'result';seat?:number;text:string;fen?:string;ply?:number;action?:ChessAction}
export type DrawClaim='threefold'|'fifty';
export type ChessAction={type:'move';uci:string;offerDraw?:boolean}|{type:'claim_draw';reason:DrawClaim;uci?:string}|{type:'accept_draw'}|{type:'decline_draw'}|{type:'resign'};
export type EndReason='checkmate'|'stalemate'|'insufficient'|'fivefold'|'seventy-five'|'threefold'|'fifty'|'agreement'|'resignation'|'resignation-no-mate';
export interface ChessResult {winner:number|null;outcome:'1-0'|'0-1'|'1/2-1/2';reason:EndReason;description:string;deltas:number[]}
export interface ChessState {gameId:'chess';id:string;round:number;revision:number;createdAt:string;options:ChessOptions;players:ChessPlayer[];initialFen:string;fen:string;turn:number;phase:'playing'|'finished';moves:ChessMove[];events:ChessEvent[];drawOffer:{by:number;ply:number}|null;result:ChessResult|null}
export interface LegalChessMove {uci:string;san:string;from:Square;to:Square;piece:PieceSymbol;captured?:PieceSymbol;promotion?:PieceSymbol;enPassant:boolean;castle:boolean;claimAfter:DrawClaim[]}
export interface ChessLegalAction {id:string;label:string;action:ChessAction}
export interface ChessView extends ChessState {viewer:number|null;board:Array<{square:Square;type:PieceSymbol;color:Color}>;check:boolean;checkSquare:Square|null;moveNumber:number;halfmoveClock:number;repetitions:number;legalMoves:LegalChessMove[];legalActions:ChessLegalAction[];claimable:DrawClaim[];captured:Record<Color,PieceSymbol[]>;pgn:string}
export const COLOR_NAMES:Record<Color,string>={w:'白方',b:'黑方'};
export const PIECE_NAMES:Record<PieceSymbol,string>={k:'王',q:'后',r:'车',b:'象',n:'马',p:'兵'};
export const END_NAMES:Record<EndReason,string>={checkmate:'将死',stalemate:'逼和',insufficient:'子力不足死局',fivefold:'五次重复局面','seventy-five':'75 回合规则',threefold:'申请三次重复和棋',fifty:'申请 50 回合和棋',agreement:'双方同意和棋',resignation:'认输','resignation-no-mate':'认输时对方无法将死'};
export const CHESS_RULES=`标准国际象棋 · 2 人 · 不计时。采用 FIDE 2023 的走子与计分，白方先行，新桌由名单1号玩家执白，之后双方交替走一步。棋盘从白方看，左到右为 a–h 线，近到远为 1–8 横排。白方后排 a1–h1 依次为车马象后王象马车、兵在第 2 排；黑方对应在第 8、7 排。目标是将死敌王。
王向任意方向一格；后沿直线或斜线任意格，车沿横竖直线任意格，象沿斜线任意格，三者不得越子；马走一线两格再垂直一格的 L 形，可越子。棋子不能落在己方棋子所在格，落在敌子格则吃子。兵向前直行一格（白方向横排号增大，黑方减小），起始排可直行两格，路径及终点须空；普通吃子为向前斜行一格，不能后退。
王不可被吃，任何走子都不能让自己的王受将军；被将军时须移动王、挡住攻击或吃掉攻击子来解将，双方王不能相邻。王车易位要求王与对应车从未移动、两者之间全空、王未被将军且不经过或落入受攻击格；王向车方向移动两格，车移到王越过的一格，同步完成一步。长易位不要求 b 线空格不受攻击。吃过路兵仅限对方兵刚从起始格前进两格后的紧接一步：本方相邻同排兵斜进到它越过的格，并移除该敌兵；同样不能暴露己王。兵到末排必须选择后、车、象或马，允许升变为已有的棋子。
将死获胜；无合法棋步且未被将军为逼和。王对王、王与单象或单马对王、仅有同色格象与王等子力不足死局自动和棋；双马对王不自动判和。复杂封闭死局不作自动证明，可由双方协议和棋。
同一局面包括轮到哪方、棋子位置、王车易位权与合法吃过路兵权。三次重复或双方连续 50 回合无兵移动且无吃子，可由当前行棋方申请；也可指定一着合法的预定棋步，在落子前申请该步将产生的三次重复或 50 回合和棋。未申请则继续。五次重复、双方连续 75 回合无兵移动且无吃子自动和棋；第 75 回合的将死优先。
提和随一着棋提交，对方可接受、拒绝或用走子拒绝。双方至少各走一步后才可协议和棋。认输与和棋申请在自己的决策回合操作；认输时对方仅剩王等无法将死的情况判和。本桌不使用棋钟、触子走子或线下裁判罚时。
胜 1 分、和棋各 0.5 分、负 0 分。下一局按玩家身份保留累计积分、胜和负；默认交换黑白，新增玩家从零分开始。所有棋子、棋谱与公开事件双方均可见，Agent 对话仍由公共好奇模式控制。`;

export function validateChessOptions(options:ChessOptions){
  if(!options||!['first','second','random'].includes(options.firstWhite)||typeof options.alternateColors!=='boolean')throw new Error('请选择首局白方与是否交换黑白');
}
const now=()=>new Date().toISOString();
const key=(fen:string)=>fen.split(' ').slice(0,4).join(' ');
const halfmoves=(fen:string)=>Number(fen.split(' ')[4]);
export function positionCount(state:ChessState,fen=state.fen){return [state.initialFen,...state.moves.map(m=>m.after)].filter(f=>key(f)===key(fen)).length;}
const seatOfColor=(state:ChessState,color:Color)=>state.players.findIndex(p=>p.color===color);
function event(state:ChessState,type:ChessEvent['type'],text:string,seat?:number,extra:Partial<ChessEvent>={}){state.events.push({seq:state.events.length+1,time:now(),type,text,...(seat===undefined?{}:{seat}),...extra});}

export function createChess(id:string,players:Array<{playerId:string;name:string;kind:'human'|'agent'}>,options:ChessOptions=DEFAULT_CHESS_OPTIONS,random:()=>number=Math.random,round=1,previous?:ChessState,initialFen=DEFAULT_POSITION):ChessState{
  validateChessOptions(options);
  if(players.length!==2||new Set(players.map(p=>p.playerId)).size!==2||players.some(p=>!p.playerId||!p.name))throw new Error('国际象棋需要两位不同身份的玩家');
  if(previous?.phase!=='finished') {if(previous)throw new Error('当前棋局尚未结束');}
  let white=options.firstWhite==='first'?0:options.firstWhite==='second'?1:random()<.5?0:1;
  if(previous){
    const previousWhite=previous.players.find(p=>p.color==='w')!;
    const whiteSeat=players.findIndex(p=>p.playerId===previousWhite.playerId);
    const previousBlack=previous.players.find(p=>p.color==='b')!;
    const blackSeat=players.findIndex(p=>p.playerId===previousBlack.playerId);
    if(options.alternateColors){if(whiteSeat>=0)white=1-whiteSeat;else if(blackSeat>=0)white=blackSeat;}
    else if(whiteSeat>=0)white=whiteSeat;else if(blackSeat>=0)white=1-blackSeat;
  }
  const chess=new Chess(initialFen),fen=chess.fen();
  const state:ChessState={gameId:'chess',id,round,revision:1,createdAt:now(),options:{...options},players:players.map((p,seat)=>{
    const old=previous?.players.find(o=>o.playerId===p.playerId);
    return {...p,seat,color:seat===white?'w':'b',score:old?.score??0,wins:old?.wins??0,draws:old?.draws??0,losses:old?.losses??0};
  }),initialFen:fen,fen,turn:0,phase:'playing',moves:[],events:[],drawOffer:null,result:null};
  state.turn=seatOfColor(state,chess.turn());
  event(state,'start',`第 ${round} 局开始 · ${state.players[white].name} 执白，${state.players[1-white].name} 执黑`,undefined,{fen});
  automaticResult(state,chess);
  return state;
}

function finish(state:ChessState,reason:EndReason,winner:number|null){
  if(state.phase==='finished')throw new Error('本局已经结算');
  const deltas=state.players.map((_,i)=>winner===null?.5:winner===i?1:0);
  const description=winner===null?`和棋 · ${END_NAMES[reason]}`:`${state.players[winner].name} 获胜 · ${END_NAMES[reason]}`;
  state.phase='finished';state.drawOffer=null;
  state.result={winner,reason,outcome:winner===null?'1/2-1/2':state.players[winner].color==='w'?'1-0':'0-1',description,deltas};
  state.players.forEach((p,i)=>{p.score+=deltas[i];if(winner===null)p.draws++;else if(winner===i)p.wins++;else p.losses++;});
  event(state,'result',description,undefined,{fen:state.fen});
}
function automaticResult(state:ChessState,chess:Chess){
  if(chess.isCheckmate())finish(state,'checkmate',1-state.turn);
  else if(chess.isStalemate())finish(state,'stalemate',null);
  else if(chess.isInsufficientMaterial())finish(state,'insufficient',null);
  else if(positionCount(state)>=5)finish(state,'fivefold',null);
  else if(halfmoves(state.fen)>=150)finish(state,'seventy-five',null);
}
function claims(state:ChessState,fen=state.fen,proposed=false):DrawClaim[]{
  return [...(positionCount(state,fen)+(proposed?1:0)>=3?['threefold' as const]:[]),...(halfmoves(fen)>=100?['fifty' as const]:[])];
}
function describeMove(move:Move):Omit<LegalChessMove,'claimAfter'>{return {uci:move.lan,san:move.san,from:move.from,to:move.to,piece:move.piece,...(move.captured?{captured:move.captured}:{}),...(move.promotion?{promotion:move.promotion}:{}),enPassant:move.isEnPassant(),castle:move.isKingsideCastle()||move.isQueensideCastle()};}
const moveCache=new WeakMap<ChessState,LegalChessMove[]>();
export function legalChessMoves(state:ChessState):LegalChessMove[]{
  if(state.phase==='finished')return [];
  let moves=moveCache.get(state);
  if(!moves){moves=new Chess(state.fen).moves({verbose:true}).map(move=>({...describeMove(move),claimAfter:claims(state,move.after,true)}));moveCache.set(state,moves);}
  return structuredClone(moves);
}
export function legalChessActions(state:ChessState,seat:number|null):ChessLegalAction[]{
  if(state.phase==='finished'||seat!==state.turn)return [];
  const moves=legalChessMoves(state);
  const actions:ChessLegalAction[]=moves.map(m=>({id:`move:${m.uci}`,label:`${m.san} · ${m.uci}`,action:{type:'move',uci:m.uci}}));
  const claimLabel=(reason:DrawClaim)=>reason==='threefold'?'三次重复':'50 回合';
  for(const reason of claims(state))actions.push({id:`claim:${reason}`,label:`申请${claimLabel(reason)}和棋`,action:{type:'claim_draw',reason}});
  for(const move of moves)for(const reason of move.claimAfter)actions.push({id:`claim:${reason}:${move.uci}`,label:`预定 ${move.san}，申请${claimLabel(reason)}和棋`,action:{type:'claim_draw',reason,uci:move.uci}});
  if(state.drawOffer&&state.drawOffer.by!==seat){
    if(state.moves.some(m=>m.color==='w')&&state.moves.some(m=>m.color==='b'))actions.push({id:'accept_draw',label:'接受和棋',action:{type:'accept_draw'}});
    actions.push({id:'decline_draw',label:'拒绝和棋，继续行棋',action:{type:'decline_draw'}});
  }
  actions.push({id:'resign',label:'认输',action:{type:'resign'}});
  return actions;
}
// A bare king cannot mate. Single minor pieces can mate only with suitable opposing blockers.
// Same-colour bishops cannot provide an escape-square blocker on the opposite colour.
function canMate(chess:Chess,color:Color){
  const board=chess.board().flat().filter(p=>p!==null),own=board.filter(p=>p.color===color&&p.type!=='k'),other=board.filter(p=>p.color!==color&&p.type!=='k');
  if(!own.length)return false;
  if(own.every(p=>p.type==='b')){
    const squareColor=(s:Square)=>(s.charCodeAt(0)+Number(s[1]))%2;
    const colors=new Set(own.map(p=>squareColor(p.square)));
    if(colors.size===1&&other.every(p=>p.type==='q'||p.type==='r'||p.type==='b'&&colors.has(squareColor(p.square))))return false;
  }
  if(own.length===1&&own[0].type==='n'&&(!other.length||other.every(p=>p.type==='q')))return false;
  return true;
}
function moveFromUci(chess:Chess,uci:unknown):Move {
  if(typeof uci!=='string'||!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))throw new Error('uci 须为起点和终点，如 e2e4；升变追加 q/r/b/n');
  const piece=chess.get(uci.slice(0,2) as Square);
  if(!piece)throw new Error(`起点 ${uci.slice(0,2)} 没有棋子`);
  if(piece.color!==chess.turn())throw new Error('只能移动自己的棋子');
  const promotion=piece.type==='p'&&['1','8'].includes(uci[3]);
  if(promotion&&!uci[4])throw new Error('兵到末排必须指定升变 q/r/b/n');
  if(!promotion&&uci[4])throw new Error('只有兵到末排才能指定升变');
  const destination=chess.get(uci.slice(2,4) as Square);
  if(destination?.color===piece.color)throw new Error('终点有己方棋子，不能移动到该格');
  try{return chess.move({from:uci.slice(0,2),to:uci.slice(2,4),...(uci[4]?{promotion:uci[4]}:{})});}
  catch{throw new Error(`${uci} 不是合法棋步：请检查该棋子的走法、路径阻挡与王的安全${chess.isCheck()?'，当前必须解除将军':''}`);}
}
export function applyChessAction(current:ChessState,seat:number,input:unknown):ChessState{
  if(current.phase==='finished')throw new Error('本局已结束');
  if(!Number.isInteger(seat)||seat!==current.turn)throw new Error('当前不是你的行棋回合');
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('行动须包含 type 与对应棋步或和棋参数');
  const action=input as ChessAction;
  if(!['move','claim_draw','accept_draw','decline_draw','resign'].includes(action.type))throw new Error('未知行动类型：请选择 move、claim_draw、accept_draw、decline_draw 或 resign');
  const keys=action.type==='move'?['type','uci','offerDraw']:action.type==='claim_draw'?['type','reason','uci']:['type'];
  if(Object.keys(action).some(k=>!keys.includes(k)))throw new Error(`行动 ${action.type} 只接受 ${keys.join('、')}`);
  if(action.type==='move'&&action.offerDraw!==undefined&&typeof action.offerDraw!=='boolean')throw new Error('提和标记必须为布尔值');
  if(action.type==='accept_draw'||action.type==='decline_draw'){
    if(!current.drawOffer||current.drawOffer.by===seat)throw new Error('当前没有对方的提和可以回应');
    if(action.type==='accept_draw'&&(!current.moves.some(m=>m.color==='w')||!current.moves.some(m=>m.color==='b')))throw new Error('双方至少各走一步后才能接受提和');
  }
  if(action.type==='claim_draw'){
    if(!['threefold','fifty'].includes(action.reason))throw new Error('和棋原因须为 threefold（三次重复）或 fifty（50 回合）');
    const fen=action.uci===undefined?current.fen:moveFromUci(new Chess(current.fen),action.uci).after;
    if(!claims(current,fen,action.uci!==undefined).includes(action.reason))throw new Error(`未满足${action.reason==='threefold'?'三次重复局面':'50 回合无兵移动且无吃子'}，请继续行棋或选择满足条件的预定棋步`);
  }
  const state=structuredClone(current),chess=new Chess(state.fen);state.revision++;
  if(action.type==='resign'){
    event(state,'resign','认输',seat,{action});finish(state,canMate(chess,state.players[1-seat].color)?'resignation':'resignation-no-mate',canMate(chess,state.players[1-seat].color)?1-seat:null);
  }else if(action.type==='accept_draw'){event(state,'accept','接受和棋',seat,{action});finish(state,'agreement',null);}
  else if(action.type==='decline_draw'){state.drawOffer=null;event(state,'decline','拒绝和棋，继续行棋',seat,{action});}
  else if(action.type==='claim_draw'){
    event(state,'claim',`申请${action.reason==='threefold'?'三次重复':'50 回合'}和棋${action.uci?` · 预定棋步 ${action.uci}（未落子）`:''}`,seat,{action});
    finish(state,action.reason,null);
  }else if(action.type==='move'){
    if(state.drawOffer){event(state,'decline','以走子拒绝和棋',seat);state.drawOffer=null;}
    const move=moveFromUci(chess,action.uci);
    const record:ChessMove={...describeMove(move),ply:state.moves.length+1,seat,color:move.color,before:state.fen,after:chess.fen(),time:now()};
    state.moves.push(record);state.fen=record.after;state.turn=seatOfColor(state,chess.turn());
    event(state,'move',`${COLOR_NAMES[move.color]} ${move.san}${record.castle?' · 王车易位':''}${record.enPassant?' · 吃过路兵':''}${record.promotion?` · 升变为${PIECE_NAMES[record.promotion]}`:''}${chess.isCheck()?' · 将军':''}`,seat,{fen:state.fen,ply:record.ply,action});
    automaticResult(state,chess);
    if(action.offerDraw&&state.phase==='playing'){state.drawOffer={by:seat,ply:record.ply};event(state,'offer','提出和棋，对方可接受或继续行棋',seat);}
  }
  return state;
}

const pgnCache=new WeakMap<ChessState,string>();
export function chessPgn(state:ChessState){
  const cached=pgnCache.get(state);if(cached!==undefined)return cached;
  const chess=new Chess(state.initialFen);for(const move of state.moves)chess.move({from:move.from,to:move.to,...(move.promotion?{promotion:move.promotion}:{})});
  chess.setHeader('Event','同桌国际象棋');chess.setHeader('White',state.players.find(p=>p.color==='w')!.name);chess.setHeader('Black',state.players.find(p=>p.color==='b')!.name);chess.setHeader('Round',String(state.round));chess.setHeader('Result',state.result?.outcome??'*');
  const pgn=chess.pgn();pgnCache.set(state,pgn);return pgn;
}
export function viewChess(state:ChessState,viewer:number|null,includeActions=true):ChessView{
  if(viewer!==null&&viewer!==0&&viewer!==1)throw new Error('未知玩家');
  const chess=new Chess(state.fen),board=chess.board().flat().filter(p=>p!==null);
  const captured:Record<Color,PieceSymbol[]>={w:[],b:[]};for(const move of state.moves)if(move.captured)captured[move.color].push(move.captured);
  return {...structuredClone(state),viewer,board,check:chess.isCheck(),checkSquare:chess.isCheck()?board.find(p=>p.type==='k'&&p.color===chess.turn())!.square:null,moveNumber:chess.moveNumber(),halfmoveClock:halfmoves(state.fen),repetitions:positionCount(state),legalMoves:includeActions?legalChessMoves(state):[],legalActions:includeActions?legalChessActions(state,viewer):[],claimable:state.phase==='playing'?claims(state):[],captured,pgn:chessPgn(state)};
}

export function restoreChess(data:unknown,version:number):ChessState{
  const fail=()=>{throw new Error('国际象棋存档格式或版本无效，请新建游戏');};
  if(version!==1||!data||typeof data!=='object')return fail();
  const s=data as ChessState;
  if(s.gameId!=='chess'||typeof s.id!=='string'||!Number.isSafeInteger(s.round)||s.round<1||!Number.isSafeInteger(s.revision)||s.revision<1||!Array.isArray(s.players)||s.players.length!==2||new Set(s.players.map(p=>p?.playerId)).size!==2||new Set(s.players.map(p=>p?.color)).size!==2||!Array.isArray(s.moves)||!Array.isArray(s.events)||!s.events.length||!['playing','finished'].includes(s.phase)||!Number.isFinite(Date.parse(s.createdAt)))return fail();
  validateChessOptions(s.options);
  for(const [seat,p] of s.players.entries())if(!p||p.seat!==seat||!p.playerId||typeof p.name!=='string'||!['human','agent'].includes(p.kind)||!['w','b'].includes(p.color)||![p.wins,p.draws,p.losses].every(n=>Number.isSafeInteger(n)&&n>=0)||p.score!==p.wins+p.draws*.5)return fail();
  if(s.events.some((e,i)=>!e||e.seq!==i+1||typeof e.text!=='string'||!Number.isFinite(Date.parse(e.time)))||s.moves.some(m=>!m||!Number.isFinite(Date.parse(m.time))))return fail();
  if(s.phase==='finished'&&(!s.result||![null,0,1].includes(s.result.winner)))return fail();
  // Reapply the public actions rather than trusting an isolated FEN or a claimed result.
  // Starting scores are the carried totals before this game's one settlement.
  let replay=createChess(s.id,s.players,{...s.options,firstWhite:s.players[0].color==='w'?'first':'second'},()=>0,s.round,undefined,s.initialFen);
  replay.options={...s.options};
  replay.players.forEach((p,i)=>{
    const saved=s.players[i],winner=s.result?.winner;
    const wins=saved.wins-(s.phase==='finished'&&winner===i?1:0),draws=saved.draws-(s.phase==='finished'&&winner===null?1:0),losses=saved.losses-(s.phase==='finished'&&winner!==null&&winner!==i?1:0);
    if([wins,draws,losses].some(n=>n<0))return fail();
    // An initial terminal position has already received its result in createChess.
    const initial=replay.phase==='finished'?replay.result:null;
    p.wins=wins+(initial?.winner===i?1:0);p.draws=draws+(initial?.winner===null?1:0);p.losses=losses+(initial&&initial.winner!==null&&initial.winner!==i?1:0);p.score=p.wins+p.draws*.5;
  });
  for(const e of s.events)if(e.action){if(e.seat===undefined)return fail();replay=applyChessAction(replay,e.seat,e.action);}
  const canonical=(value:unknown):unknown=>{
    if(Array.isArray(value))return value.map(canonical);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k,v])=>k!=='time'&&k!=='createdAt'&&v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
    return value;
  };
  if(JSON.stringify(canonical(replay))!==JSON.stringify(canonical(s)))return fail();
  return structuredClone(s);
}
