import {useEffect,useRef,useState} from 'react';
import {Chess,type Color,type PieceSymbol,type Square} from 'chess.js';
import {ArrowUpRight} from 'lucide-react';
import {Switch} from '../../Switch';
import type {ControlledView,GameUiProps,StoredRun} from '../../runtime/types';
import {playerCardState} from '../../visuals/PlayerCard';
import {AgentPlayerCard} from '../AgentPlayerCard';
import {HumanPlayerCard} from '../HumanPlayerCard';
import {StatusTag} from '../../UiBits';
import {FoilPanel} from '../../visuals/FoilPanel';
import {GameLayout,GameTable,PlayerCardGrid} from '../GameLayout';
import {COLOR_NAMES,PIECE_NAMES,type ChessAction,type ChessMove,type ChessOptions,type ChessState,type ChessView,type LegalChessMove} from './engine';
import './chess.css';

const GLYPHS:Record<Color,Record<PieceSymbol,string>>={w:{k:'♔',q:'♕',r:'♖',b:'♗',n:'♘',p:'♙'},b:{k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'}};
type BoardPiece={square:Square;type:PieceSymbol;color:Color};
function Piece({color,type}:{color:Color;type:PieceSymbol}){return <span className={`chess-piece chess-piece-${color}`} aria-hidden="true">{GLYPHS[color][type]+'\uFE0E'}</span>;}
function Board({pieces,black=false,selected=null,destination=null,targets=[],lastMove,checkSquare,onSquare,interactive=false}:{pieces:BoardPiece[];black?:boolean;selected?:Square|null;destination?:Square|null;targets?:Square[];lastMove?:Pick<ChessMove,'from'|'to'>;checkSquare?:Square|null;onSquare?:(square:Square)=>void;interactive?:boolean}){
  const ranks=black?[1,2,3,4,5,6,7,8]:[8,7,6,5,4,3,2,1],files=(black?'hgfedcba':'abcdefgh').split('');
  return <FoilPanel className="chess-board" radialGlare role="group" aria-label={`国际象棋棋盘 · ${black?'黑方':'白方'}视角`} data-cursor-lens="off">
    {ranks.flatMap((rank,row)=>files.map((file,col)=>{
      const square=`${file}${rank}` as Square,piece=pieces.find(p=>p.square===square),target=targets.includes(square),light=(file.charCodeAt(0)+rank)%2===1,source=square===selected,chosenDestination=square===destination;
      return <button type="button" key={square} className={`chess-square ${light?'light':'dark'} ${source?'selected-piece':''} ${chosenDestination?'chosen-destination':''} ${target?'legal-target':''} ${lastMove&&(square===lastMove.from||square===lastMove.to)?'last-move':''} ${checkSquare===square?'in-check':''}`} aria-label={`${square}${piece?` ${COLOR_NAMES[piece.color]}${PIECE_NAMES[piece.type]}`:' 空格'}${target?' · 合法落点':''}${source?' · 已选棋子':''}${chosenDestination?' · 已选落点':''}`} aria-pressed={source||chosenDestination} disabled={!interactive} onClick={()=>onSquare?.(square)}>
        {col===0&&<small className="chess-rank" aria-hidden="true">{rank}</small>}{row===7&&<small className="chess-file" aria-hidden="true">{file}</small>}{source&&<i className="chess-selection-frame" aria-hidden="true"/>}{chosenDestination?<i className={`chess-destination-mark${piece?' chess-destination-capture':''}`} aria-hidden="true"/>:target&&<i className={`chess-move-ring${piece?' chess-capture-ring':''}`} aria-hidden="true"/>}{piece&&<Piece color={piece.color} type={piece.type}/>}
      </button>;
    }))}
  </FoilPanel>;
}
function MoveList({moves,selected,onSelect}:{moves:ChessMove[];selected?:number;onSelect?:(ply:number)=>void}){
  const list=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(selected===undefined&&list.current)list.current.scrollTop=list.current.scrollHeight;},[moves.length,selected]);
  const rows:Array<{number:string;white?:ChessMove;black?:ChessMove}>=[];
  for(const move of moves){const number=move.before.split(' ')[5];let row=rows.at(-1);if(!row||row.number!==number){row={number};rows.push(row);}if(move.color==='w')row.white=move;else row.black=move;}
  return <div ref={list} className="chess-move-list" aria-label="行棋记录"><div className="chess-move-columns"><span>回合</span><span>白方</span><span>黑方</span></div>{rows.map((row,i)=><div className="chess-move-row" key={i}><small>{row.number}.</small>{[row.white,row.black].map((m,j)=>m?<button type="button" disabled={!onSelect} aria-label={`第 ${row.number} 回合${j===0?'白方':'黑方'} ${m.san}`} className={m.ply===selected?'current':''} key={j} title={m.uci} onClick={()=>onSelect?.(m.ply)}>{m.san}</button>:<span key={j}>—</span>)}</div>)}{!moves.length&&<p className="chess-empty">白方先行，等待第一步。</p>}</div>;
}
export function ConfigFields({value,onChange}:{value:ChessOptions;onChange:(value:ChessOptions)=>void}){return <div className="chess-options"><label>首局白方<select aria-label="首局白方" value={value.firstWhite} onChange={e=>onChange({...value,firstWhite:e.target.value as ChessOptions['firstWhite']})}><option value="first">名单第 1 位</option><option value="second">名单第 2 位</option><option value="random">随机分配</option></select></label><Switch label="下一局交换黑白" checked={value.alternateColors} onChange={alternateColors=>onChange({...value,alternateColors})}/><p>2 人标准对弈，不计时。胜 1 分，和棋各 0.5 分，积分随同桌下一局保留。</p></div>;}

export function Table({state,controller,onError,tableActions}:GameUiProps){
  const game=state.game as ControlledView<ChessView>,own=game.viewer===null?undefined:game.players[game.viewer];
  const [selected,setSelected]=useState<Square|null>(null),[candidates,setCandidates]=useState<LegalChessMove[]>([]),[chosen,setChosen]=useState<LegalChessMove|null>(null),[offer,setOffer]=useState(false),[flip,setFlip]=useState(false);
  const humanTurn=!!own&&game.turn===own.seat&&game.phase==='playing'&&!state.paused;
  const black=(own?.color==='b')!==flip,finished=game.phase==='finished';
  useEffect(()=>{setSelected(null);setCandidates([]);setChosen(null);setOffer(false);},[game.revision,game.id]);
  const act=(action:ChessAction)=>{try{controller.humanAction(action);}catch(e:any){onError(e.message);}};
  const status=(seat:number)=>finished?game.result?.description??'本局结束':state.paused?'棋局已暂停':game.turn===seat?`${game.check?'将军 · ':''}${game.players[seat].kind==='human'?'轮到你行棋':state.seats.find(s=>s.seat===seat)?.message??'正在思考'}`:'等待对方行棋';
  const visual=(seat:number)=>playerCardState({active:game.turn===seat,paused:state.paused,finished,runtime:state.seats.find(s=>s.seat===seat)});
  const squareClick=(square:Square)=>{
    if(!humanTurn&&own)return;
    const options=game.legalMoves.filter(m=>m.from===selected&&m.to===square);
    if(options.length){
      if(humanTurn&&chosen&&chosen.from===selected&&chosen.to===square){act({type:'move',uci:chosen.uci,offerDraw:offer});return;}
      setCandidates(options);setChosen(options.length===1?options[0]:null);return;
    }
    const piece=game.board.find(p=>p.square===square);
    setSelected(piece?.color===(own?.color??game.players[game.turn].color)&&selected!==square?square:null);setCandidates([]);setChosen(null);
  };
  const currentClaims=game.legalActions.filter(a=>a.action.type==='claim_draw'&&(a.action.uci===undefined||a.action.uci===chosen?.uci));
  const capturedPieces=(p:typeof game.players[number])=><div className="chess-captured" aria-label={`${p.name}吃掉的棋子`}><small>已吃子</small>{game.captured[p.color].length?game.captured[p.color].map((type,i)=><Piece key={i} color={p.color==='w'?'b':'w'} type={type}/>):<span className="chess-captured-empty">暂无</span>}</div>;
  const moveInstruction=humanTurn?chosen?`已选 ${chosen.from.toUpperCase()} → ${chosen.to.toUpperCase()}，再点该格即可落子。`:candidates.length>1?'在棋盘下方选择升变棋子，再点该格即可落子。':selected?'点击细圈选择落点。':'点选棋子，再选择落点。':'细角框标出选中棋子，细圈表示可落点。';
  const controls=own&&<div className="chess-human-controls">
    <div className="chess-move-options"><p className="chess-move-hint" title={moveInstruction}>{moveInstruction}</p><Switch label="随本步提和" checked={offer} onChange={setOffer} disabled={!humanTurn}/><button className="text-button chess-resign" disabled={!humanTurn} onClick={()=>act({type:'resign'})}>认输<ArrowUpRight size={14}/></button></div>
    {humanTurn&&<>
      {game.drawOffer&&game.drawOffer.by!==own.seat&&<div className="chess-draw-offer"><strong>对方提出和棋</strong>{game.legalActions.some(a=>a.id==='accept_draw')?<button className="button outline" onClick={()=>act({type:'accept_draw'})}>接受和棋</button>:<small>双方各走一步后可接受</small>}<button className="text-button" onClick={()=>act({type:'decline_draw'})}>拒绝，继续行棋</button><small>直接走子也会拒绝。</small></div>}
      {currentClaims.map(a=><button className="button outline chess-claim" key={a.id} onClick={()=>act(a.action)}>{a.label}</button>)}
    </>}
  </div>;
  const promotion=humanTurn&&candidates.length>1&&<fieldset className="chess-promotion"><legend>升变选择</legend>{candidates.map(m=><button type="button" aria-label={`升变为${PIECE_NAMES[m.promotion!]}`} aria-pressed={chosen?.uci===m.uci} className={chosen?.uci===m.uci?'active':''} key={m.uci} onClick={()=>setChosen(m)}><Piece color={own!.color} type={m.promotion!}/><small>{PIECE_NAMES[m.promotion!]}</small></button>)}</fieldset>;
  const board=<div className="chess-board-stage"><Board pieces={game.board} black={black} selected={selected} destination={candidates[0]?.to} targets={game.legalMoves.filter(m=>m.from===selected).map(m=>m.to)} lastMove={game.moves.at(-1)} checkSquare={game.checkSquare} interactive={humanTurn||(!own&&!finished)} onSquare={squareClick}/><div className="chess-board-foot"><span>第 {game.moveNumber} 回合 · 已行 {game.moves.length} 步</span><button type="button" className="text-button" onClick={()=>setFlip(v=>!v)}>翻转棋盘 ↕</button></div>{promotion}</div>;
  return <GameLayout gameId="chess" label="国际象棋棋桌" className="chess-layout" surfaceClassName="chess-main" toolbar={<> <span>第 {game.round} 局 · 标准对弈</span><span>{finished?'本局结束':state.paused?'棋局已暂停':`${COLOR_NAMES[game.players[game.turn].color]}行棋${game.check?' · 将军':''}`} · 不计时</span> </>} score={<FoilPanel className="score-card chess-standings"><h3>本桌积分 <span>累计</span></h3>{game.players.map(p=><div key={p.playerId}><span><strong>{p.name}</strong><small>{COLOR_NAMES[p.color]} · {p.wins} 胜 · {p.draws} 和 · {p.losses} 负</small></span><b>{p.score}</b></div>)}{finished&&<div className="chess-score-result"><strong>{game.result?.outcome}</strong><p>{game.result?.description}</p>{game.players.map(p=><small key={p.playerId}>{p.name} +{game.result?.deltas[p.seat]} · 累计 {p.score}</small>)}</div>}</FoilPanel>} events={game.events}>
    <GameTable className="chess-table">{board}</GameTable>
    <PlayerCardGrid className="chess-players" count={2} columns={own?'minmax(0,2fr) minmax(0,1fr)':'repeat(2,minmax(0,1fr))'}>
      {own&&<HumanPlayerCard player={own} state={visual(own.seat)} badges={<StatusTag>{COLOR_NAMES[own.color]}</StatusTag>} status={status(own.seat)} actions={controls} tableActions={tableActions} aria-label="我的玩家卡与行棋操作">{capturedPieces(own)}</HumanPlayerCard>}
      {game.players.filter(p=>p.seat!==game.viewer).map(p=><AgentPlayerCard key={p.playerId} player={p} state={visual(p.seat)} caption={COLOR_NAMES[p.color]} status={status(p.seat)} action={game.events.filter(e=>e.seat===p.seat&&e.type!=='offer').at(-1)?.text??''}>{capturedPieces(p)}</AgentPlayerCard>)}
    </PlayerCardGrid>
    {!own&&<div className="spectator-table-actions"><p>{finished?'本局已结束，可在已完成记录中回放。':'观战中 · 点击 Agent 光球查看对话，点选棋子查看合法落点。'}</p>{tableActions}</div>}
  </GameLayout>;
}
export function Replay({run}:{run:StoredRun<ChessState>}){
  const [index,setIndex]=useState(0),[flip,setFlip]=useState(false),events=run.state.events,event=events[index],ply=events.slice(0,index+1).reduce((n,e)=>e.type==='move'?e.ply!:n,0),move=run.state.moves[ply-1];
  const chess=new Chess(move?.after??run.state.initialFen),pieces=chess.board().flat().filter(p=>p!==null),king=pieces.find(p=>p.type==='k'&&p.color===chess.turn());
  useEffect(()=>setIndex(0),[run.runId]);
  const download=()=>{const v=new Chess(run.state.initialFen);for(const m of run.state.moves)v.move({from:m.from,to:m.to,...(m.promotion?{promotion:m.promotion}:{})});v.setHeader('White',run.state.players.find(p=>p.color==='w')!.name);v.setHeader('Black',run.state.players.find(p=>p.color==='b')!.name);v.setHeader('Result',run.state.result?.outcome??'*');const url=URL.createObjectURL(new Blob([v.pgn()],{type:'application/x-chess-pgn;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`TongZhuo-Chess-${run.index}.pgn`;a.click();URL.revokeObjectURL(url);};
  return <div className="chess-replay" data-cursor-lens="off"><div className="chess-replay-board"><Board pieces={pieces} black={flip} lastMove={move} checkSquare={chess.isCheck()?king?.square:null}/><div className="chess-replay-controls"><button className="button outline" disabled={index===0} onClick={()=>setIndex(0)}>开局</button><button className="button outline" disabled={index===0} onClick={()=>setIndex(i=>i-1)}>上一步</button><span>{index+1} / {events.length}</span><button className="button outline" disabled={index===events.length-1} onClick={()=>setIndex(i=>i+1)}>下一步</button><button className="button outline" disabled={index===events.length-1} onClick={()=>setIndex(events.length-1)}>终局</button></div><input aria-label="回放进度" type="range" min="0" max={events.length-1} value={index} onChange={e=>setIndex(Number(e.target.value))}/><p className="chess-replay-event">{event?.seat!==undefined?run.roster[event.seat].name+' · ':''}{event?.text}</p><div className="chess-replay-bottom"><button className="text-button" onClick={()=>setFlip(v=>!v)}>翻转棋盘 ↕</button><button className="text-button" onClick={download}>下载 PGN ↗</button></div></div><div><MoveList moves={run.state.moves} selected={ply} onSelect={p=>setIndex(events.findIndex(e=>e.type==='move'&&e.ply===p))}/><p>{run.state.result?.description}</p></div></div>;
}
