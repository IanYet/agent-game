import {useEffect,useRef,useState} from 'react';
import {Chess,type Color,type PieceSymbol,type Square} from 'chess.js';
import type {ControlledView,GameUiProps,StoredRun} from '../../runtime/types';
import {PlayerCard,PlayerCardAvatar,playerCardState} from '../../visuals/PlayerCard';
import {FoilPanel} from '../../visuals/FoilPanel';
import {kindName,effortLabel} from '../../AgentModelFields';
import {COLOR_NAMES,PIECE_NAMES,type ChessAction,type ChessMove,type ChessOptions,type ChessState,type ChessView,type LegalChessMove} from './engine';
import './chess.css';

const GLYPHS:Record<Color,Record<PieceSymbol,string>>={w:{k:'♔',q:'♕',r:'♖',b:'♗',n:'♘',p:'♙'},b:{k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'}};
type BoardPiece={square:Square;type:PieceSymbol;color:Color};
function Piece({color,type}:{color:Color;type:PieceSymbol}){return <span className={`chess-piece chess-piece-${color}`} aria-hidden="true">{GLYPHS[color][type]}</span>;}
function Board({pieces,black=false,selected=null,targets=[],lastMove,checkSquare,onSquare,interactive=false}:{pieces:BoardPiece[];black?:boolean;selected?:Square|null;targets?:Square[];lastMove?:Pick<ChessMove,'from'|'to'>;checkSquare?:Square|null;onSquare?:(square:Square)=>void;interactive?:boolean}){
  const ranks=black?[1,2,3,4,5,6,7,8]:[8,7,6,5,4,3,2,1],files=(black?'hgfedcba':'abcdefgh').split('');
  return <div className="chess-board" role="group" aria-label={`国际象棋棋盘 · ${black?'黑方':'白方'}视角`} data-cursor-lens="off">
    {ranks.flatMap((rank,row)=>files.map((file,col)=>{
      const square=`${file}${rank}` as Square,piece=pieces.find(p=>p.square===square),target=targets.includes(square),light=(file.charCodeAt(0)+rank)%2===1;
      return <button type="button" key={square} className={`chess-square ${light?'light':'dark'} ${selected===square?'selected':''} ${target?'legal-target':''} ${lastMove&&(square===lastMove.from||square===lastMove.to)?'last-move':''} ${checkSquare===square?'in-check':''}`} aria-label={`${square}${piece?` ${COLOR_NAMES[piece.color]}${PIECE_NAMES[piece.type]}`:' 空格'}${target?' · 合法落点':''}`} aria-pressed={selected===square} disabled={!interactive} onClick={()=>onSquare?.(square)}>
        {col===0&&<small className="chess-rank" aria-hidden="true">{rank}</small>}{row===7&&<small className="chess-file" aria-hidden="true">{file}</small>}{piece&&<Piece color={piece.color} type={piece.type}/>}{target&&<i className={piece?'chess-capture-ring':'chess-move-dot'} aria-hidden="true"/>}
      </button>;
    }))}
  </div>;
}
function MoveList({moves,selected,onSelect}:{moves:ChessMove[];selected?:number;onSelect?:(ply:number)=>void}){
  const list=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(selected===undefined&&list.current)list.current.scrollTop=list.current.scrollHeight;},[moves.length,selected]);
  const rows:Array<{number:string;white?:ChessMove;black?:ChessMove}>=[];
  for(const move of moves){const number=move.before.split(' ')[5];let row=rows.at(-1);if(!row||row.number!==number){row={number};rows.push(row);}if(move.color==='w')row.white=move;else row.black=move;}
  return <div ref={list} className="chess-move-list" aria-label="行棋记录"><div className="chess-move-columns"><span>回合</span><span>白方</span><span>黑方</span></div>{rows.map((row,i)=><div className="chess-move-row" key={i}><small>{row.number}.</small>{[row.white,row.black].map((m,j)=>m?<button type="button" disabled={!onSelect} aria-label={`第 ${row.number} 回合${j===0?'白方':'黑方'} ${m.san}`} className={m.ply===selected?'current':''} key={j} title={m.uci} onClick={()=>onSelect?.(m.ply)}>{m.san}</button>:<span key={j}>—</span>)}</div>)}{!moves.length&&<p className="chess-empty">白方先行，等待第一步。</p>}</div>;
}
export function ConfigFields({value,onChange}:{value:ChessOptions;onChange:(value:ChessOptions)=>void}){return <div className="chess-options"><label>首局白方<select aria-label="首局白方" value={value.firstWhite} onChange={e=>onChange({...value,firstWhite:e.target.value as ChessOptions['firstWhite']})}><option value="first">名单第 1 位</option><option value="second">名单第 2 位</option><option value="random">随机分配</option></select></label><label className="chess-check"><input type="checkbox" checked={value.alternateColors} onChange={e=>onChange({...value,alternateColors:e.target.checked})}/>下一局交换黑白</label><p>2 人标准对弈，不计时。胜 1 分，和棋各 0.5 分，积分随同桌下一局保留。</p></div>;}

export function Table({state,controller,onError,tableActions}:GameUiProps){
  const game=state.game as ControlledView<ChessView>,own=game.viewer===null?undefined:game.players[game.viewer];
  const [selected,setSelected]=useState<Square|null>(null),[candidates,setCandidates]=useState<LegalChessMove[]>([]),[chosen,setChosen]=useState<LegalChessMove|null>(null),[offer,setOffer]=useState(false),[flip,setFlip]=useState(false),[resigning,setResigning]=useState(false);
  const humanTurn=!!own&&game.turn===own.seat&&game.phase==='playing'&&!state.paused;
  const black=(own?.color==='b')!==flip,finished=game.phase==='finished';
  useEffect(()=>{setSelected(null);setCandidates([]);setChosen(null);setOffer(false);setResigning(false);},[game.revision,game.id]);
  const act=(action:ChessAction)=>{try{controller.humanAction(action);}catch(e:any){onError(e.message);}};
  const status=(seat:number)=>finished?game.result?.description??'本局结束':state.paused?'棋局已暂停':game.turn===seat?`${game.check?'将军 · ':''}${game.players[seat].kind==='human'?'轮到你行棋':state.seats.find(s=>s.seat===seat)?.message??'正在思考'}`:'等待对方行棋';
  const visual=(seat:number)=>playerCardState({active:game.turn===seat,paused:state.paused,finished,runtime:state.seats.find(s=>s.seat===seat)});
  const squareClick=(square:Square)=>{
    if(!humanTurn&&own)return;
    const options=game.legalMoves.filter(m=>m.from===selected&&m.to===square);
    if(options.length){setCandidates(options);setChosen(options.length===1?options[0]:null);return;}
    const piece=game.board.find(p=>p.square===square);
    setSelected(piece?.color===(own?.color??game.players[game.turn].color)&&selected!==square?square:null);setCandidates([]);setChosen(null);
  };
  const currentClaims=game.legalActions.filter(a=>a.action.type==='claim_draw'&&(a.action.uci===undefined||a.action.uci===chosen?.uci));
  const controls=<div className="chess-human-controls">
    <div className="chess-control-heading"><span className="identity-caption">{humanTurn?'YOUR MOVE.':finished?'WELL PLAYED.':'AT THE BOARD.'}</span><span data-player-status>{own?status(own.seat):finished?'本局结束':'观战中'}</span></div>
    {own?<>
      <div className="chess-own-identity"><PlayerCardAvatar kind={own.kind} seat={own.seat} showNumber={false}/><div><strong>{own.name}</strong><small>{COLOR_NAMES[own.color]} · 累计 {own.score} 分</small></div><span className={`chess-color-badge ${own.color}`}>{own.color==='w'?'○':'●'}</span></div>
      <p className="chess-instruction">{finished?game.result?.description:state.paused?'准备好后继续棋局。':humanTurn?chosen?`已选 ${chosen.san}，确认后落子。`:candidates.length>1?'选择升变棋子后确认落子。':'点选己方棋子，再选择标记的落点。':'等待对方，双方棋子与棋谱均公开。'}</p>
      {humanTurn&&<>
        {candidates.length>1&&<fieldset className="chess-promotion"><legend>升变选择</legend>{candidates.map(m=><button type="button" aria-label={`升变为${PIECE_NAMES[m.promotion!]}`} aria-pressed={chosen?.uci===m.uci} className={chosen?.uci===m.uci?'active':''} key={m.uci} onClick={()=>setChosen(m)}><Piece color={own.color} type={m.promotion!}/><small>{PIECE_NAMES[m.promotion!]}</small></button>)}</fieldset>}
        {chosen&&<div className="chess-chosen"><strong>{chosen.san}</strong><code>{chosen.uci}</code>{chosen.castle&&<small>王车易位</small>}{chosen.enPassant&&<small>吃过路兵</small>}</div>}
        <button type="button" className="button primary chess-confirm" disabled={!chosen} onClick={()=>chosen&&act({type:'move',uci:chosen.uci,offerDraw:offer})}>确认落子 {chosen?.san??''}<span>↗</span></button>
        <label className="chess-check"><input type="checkbox" checked={offer} onChange={e=>setOffer(e.target.checked)}/>随本步提出和棋</label>
        {game.drawOffer&&game.drawOffer.by!==own.seat&&<div className="chess-draw-offer"><strong>对方提出和棋</strong>{game.legalActions.some(a=>a.id==='accept_draw')?<button className="button outline" onClick={()=>act({type:'accept_draw'})}>接受和棋</button>:<small>双方各走一步后可接受</small>}<button className="text-button" onClick={()=>act({type:'decline_draw'})}>拒绝，继续行棋</button><small>直接走子也会拒绝。</small></div>}
        {currentClaims.map(a=><button className="button outline chess-claim" key={a.id} onClick={()=>act(a.action)}>{a.label}</button>)}
        {resigning?<div className="chess-resign-confirm"><span>确认认输并结束本局？</span><button className="button outline" onClick={()=>act({type:'resign'})}>确认认输</button><button className="text-button" onClick={()=>setResigning(false)}>取消</button></div>:<button className="text-button chess-resign" onClick={()=>setResigning(true)}>认输</button>}
      </>}
    </>:<p className="chess-instruction">{finished?'本局已结束，可查看棋谱与结果。':'观战中 · 点击 Agent 光球查看对话。点选当前方棋子可查看合法落点。'}</p>}
    <div className="chess-table-actions">{tableActions}</div>
  </div>;
  const board=<div className="chess-board-stage"><div className="chess-board-caption"><span>{finished?game.result?.outcome:`${COLOR_NAMES[game.players[game.turn].color]}行棋`}{game.check&&!finished?' · 将军':''}</span><button type="button" className="text-button" onClick={()=>setFlip(v=>!v)}>翻转棋盘 ↕</button></div><Board pieces={game.board} black={black} selected={selected} targets={game.legalMoves.filter(m=>m.from===selected).map(m=>m.to)} lastMove={game.moves.at(-1)} checkSquare={game.checkSquare} interactive={humanTurn||(!own&&!finished)} onSquare={squareClick}/><div className="chess-board-foot"><span>第 {game.moveNumber} 回合 · 已行 {game.moves.length} 步</span><span>{game.legalMoves.length} 着合法棋步</span></div></div>;
  return <div className="table-layout chess-layout"><section className="game-surface chess-main" data-game-surface="chess" aria-label="国际象棋棋桌"><div className="table-toolbar"><span>第 {game.round} 局 · 标准对弈</span><span>公开棋局 · 不计时</span></div>
    {own?<PlayerCard primary state={visual(own.seat)} className="chess-primary" data-player-surface data-cursor-lens="off" aria-label="我的棋盘与操作">{board}{controls}</PlayerCard>:<FoilPanel className="chess-primary chess-spectator">{board}{controls}</FoilPanel>}
  </section><aside className="table-rail chess-rail">
    {game.players.filter(p=>p.seat!==game.viewer).map(p=><PlayerCard key={p.playerId} state={visual(p.seat)} className="chess-opponent"><span className="identity-caption">{COLOR_NAMES[p.color]} / {p.color==='w'?'WHITE':'BLACK'}</span><div className="chess-opponent-identity"><PlayerCardAvatar kind={p.kind} seat={p.seat} showNumber={false}/><div><strong>{p.name}</strong><small>{kindName[p.kind]}{p.model?` · ${p.model}`:''}{p.reasoningEffort?` · ${effortLabel(p.reasoningEffort)}`:''}</small></div></div><span data-player-status>{status(p.seat)}</span><div className="chess-player-score"><b>{p.score}<small>分</small></b><span>{p.wins} 胜 · {p.draws} 和 · {p.losses} 负</span></div><div className="chess-captured" aria-label={`${p.name}吃掉的棋子`}>{game.captured[p.color].map((type,i)=><Piece key={i} color={p.color==='w'?'b':'w'} type={type}/>)}</div></PlayerCard>)}
    {finished&&<FoilPanel className="chess-result"><span className="identity-caption">RESULT</span><strong>{game.result?.outcome}</strong><p>{game.result?.description}</p>{game.players.map(p=><small key={p.playerId}>{p.name} +{game.result?.deltas[p.seat]} · 累计 {p.score}</small>)}</FoilPanel>}
    <FoilPanel className="chess-notation"><div className="event-heading"><h3>行棋记录</h3><span>SAN</span></div><MoveList moves={game.moves}/><details className="chess-position-info"><summary>局面与和棋条件</summary><p>当前局面出现 {game.repetitions} 次；连续 {game.halfmoveClock} 半回合无吃子、无兵移动。</p><p>三次重复 / 100 半回合可申请；五次重复 / 150 半回合自动和棋。</p><code>{game.fen}</code></details></FoilPanel>
    <details className="chess-public-events"><summary>全部公开事件 · {game.events.length}</summary>{[...game.events].reverse().map(e=><p key={e.seq}><small>{e.seq}.</small> {e.seat!==undefined?game.players[e.seat].name+' · ':''}{e.text}</p>)}</details>
  </aside></div>;
}

export function Replay({run}:{run:StoredRun<ChessState>}){
  const [index,setIndex]=useState(0),[flip,setFlip]=useState(false),events=run.state.events,event=events[index],ply=events.slice(0,index+1).reduce((n,e)=>e.type==='move'?e.ply!:n,0),move=run.state.moves[ply-1];
  const chess=new Chess(move?.after??run.state.initialFen),pieces=chess.board().flat().filter(p=>p!==null),king=pieces.find(p=>p.type==='k'&&p.color===chess.turn());
  useEffect(()=>setIndex(0),[run.runId]);
  const download=()=>{const v=new Chess(run.state.initialFen);for(const m of run.state.moves)v.move({from:m.from,to:m.to,...(m.promotion?{promotion:m.promotion}:{})});v.setHeader('White',run.state.players.find(p=>p.color==='w')!.name);v.setHeader('Black',run.state.players.find(p=>p.color==='b')!.name);v.setHeader('Result',run.state.result?.outcome??'*');const url=URL.createObjectURL(new Blob([v.pgn()],{type:'application/x-chess-pgn;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`TongZhuo-Chess-${run.index}.pgn`;a.click();URL.revokeObjectURL(url);};
  return <div className="chess-replay" data-cursor-lens="off"><div className="chess-replay-board"><Board pieces={pieces} black={flip} lastMove={move} checkSquare={chess.isCheck()?king?.square:null}/><div className="chess-replay-controls"><button className="button outline" disabled={index===0} onClick={()=>setIndex(0)}>开局</button><button className="button outline" disabled={index===0} onClick={()=>setIndex(i=>i-1)}>上一步</button><span>{index+1} / {events.length}</span><button className="button outline" disabled={index===events.length-1} onClick={()=>setIndex(i=>i+1)}>下一步</button><button className="button outline" disabled={index===events.length-1} onClick={()=>setIndex(events.length-1)}>终局</button></div><input aria-label="回放进度" type="range" min="0" max={events.length-1} value={index} onChange={e=>setIndex(Number(e.target.value))}/><p className="chess-replay-event">{event?.seat!==undefined?run.roster[event.seat].name+' · ':''}{event?.text}</p><div className="chess-replay-bottom"><button className="text-button" onClick={()=>setFlip(v=>!v)}>翻转棋盘 ↕</button><button className="text-button" onClick={download}>下载 PGN ↗</button></div></div><div><MoveList moves={run.state.moves} selected={ply} onSelect={p=>setIndex(events.findIndex(e=>e.type==='move'&&e.ply===p))}/><p>{run.state.result?.description}</p></div></div>;
}
