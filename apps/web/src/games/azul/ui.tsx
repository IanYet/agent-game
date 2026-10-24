import {useEffect,useMemo,useState} from 'react';
import type {ControlledView,GameUiProps,StoredRun} from '../../runtime/types';
import {playerCardState} from '../../visuals/PlayerCard';
import {HumanPlayerCard} from '../HumanPlayerCard';
import {AgentPlayerCard} from '../AgentPlayerCard';
import {FoilPanel} from '../../visuals/FoilPanel';
import {GameLayout,GameTable,SpectatorTableActions,type BoardGamePanel} from '../GameLayout';
import {BoardGamePlayers} from '../BoardGamePlayers';
import {Modal} from '../../Modal';
import {COLORS,COLOR_NAMES,FLOOR_PENALTIES,RULES_URL,adjacentScore,replayAzul,wallColor,wallColumn,type AzulFrame,type AzulPlayer,type AzulState,type AzulView,type Color,type FloorToken,type LegalAction} from './engine';
import {TILE_IMAGES} from './artwork';
import './azul.css';

function Tile({color,ghost=false}:{color:FloorToken;ghost?:boolean}){return <img draggable={false} className={`azul-tile${ghost?' ghost':''}`} src={TILE_IMAGES[color==='first'?5:COLORS.indexOf(color)]} alt={color==='first'?'先手标记':COLOR_NAMES[color]}/>;}
type Selection={source:number;color:Color};
function Market({game,selection,onSelect}:{game:Omit<AzulFrame,'players'>&{players:Array<Pick<AzulPlayer,'name'>>};selection?:Selection|null;onSelect?:(value:Selection)=>void}){
  const tiles=(colors:Color[],source:number)=>colors.map((color,i)=><button type="button" key={i} disabled={!onSelect} className={`azul-source-tile${selection?.source===source&&selection.color===color?' selected':''}`} aria-label={`选择${source?`工厂 ${source}`:'中央'}的${COLOR_NAMES[color]}，共 ${colors.filter(c=>c===color).length} 片`} aria-pressed={selection?.source===source&&selection.color===color} onClick={()=>onSelect?.({source,color})}><Tile color={color}/></button>);
  return <div className="azul-market" aria-label="工厂盘与中央区">
    <div className="azul-factories">{game.factories.map((factory,i)=><div className={`azul-factory${!factory.length?' empty':''}`} key={i}><span>工厂 {i+1}</span><div>{tiles(factory,i+1)}</div></div>)}</div>
    <div className="azul-center"><div className="azul-center-label"><strong>中央区</strong><small>{game.markerInCenter?'首次拿砖需带走先手标记':`下轮先手：${game.players[game.firstOwner??game.turn].name}`}</small></div><div className="azul-center-tiles">{game.markerInCenter&&<Tile color="first"/>}{COLORS.map(color=>{const count=game.center.filter(tile=>tile===color).length;return count>0&&<button type="button" key={color} disabled={!onSelect} className={`azul-center-choice${selection?.source===0&&selection.color===color?' selected':''}`} aria-label={`选择中央的${COLOR_NAMES[color]}，共 ${count} 片`} aria-pressed={selection?.source===0&&selection.color===color} onClick={()=>onSelect?.({source:0,color})}><Tile color={color}/><b>×{count}</b></button>;})}{!game.center.length&&<span className="azul-muted">工厂余砖会流入这里</span>}</div></div>
  </div>;
}
function Board({player,selection,row,choices,onRow}:{player:Omit<AzulPlayer,'kind'>;selection?:Selection|null;row?:number|null;choices?:LegalAction[];onRow?:(row:number)=>void}){
  const allowed=(r:number)=>!!choices?.some(a=>a.action.row===r);
  return <div className="azul-board" aria-label={`${player.name}的花砖板`}>
    <div className="azul-board-labels"><span>图案行</span><span>宫殿墙面</span></div>
    <div className="azul-board-rows">{player.pattern.map((line,i)=>{
      const capacity=i+1,choice=choices?.find(a=>a.action.row===capacity),col=selection?wallColumn(i,selection.color):-1;
      const cells=<><small>{capacity}</small><span className="azul-pattern-spaces">{Array.from({length:capacity},(_,j)=>{const filled=j>=capacity-line.length;return <span className="azul-space" key={j}>{filled?<Tile color={line[0]}/>:row===capacity&&selection&&j>=capacity-line.length-(choice?.placed??0)?<span className="azul-preview"><Tile color={selection.color}/></span>:null}</span>;})}</span></>;
      return <div className="azul-board-row" key={i}>
        {onRow?<button type="button" aria-label={`放入图案行 ${capacity}${choice?`，放 ${choice.placed} 片，溢出 ${choice.overflow} 片`:'，不可放置'}`} disabled={!allowed(capacity)} aria-pressed={row===capacity} className={`azul-pattern${row===capacity?' selected':''}`} onClick={()=>onRow(capacity)}>{cells}</button>:<div className="azul-pattern">{cells}</div>}
        <span className="azul-arrow">›</span><div className="azul-wall">{player.wall[i].map((color,j)=><span className={`azul-space${row===capacity&&col===j?' target':''}`} key={j}>{<Tile color={color??wallColor(i,j)} ghost={!color}/>}</span>)}</div>
      </div>;
    })}</div>
    <div className="azul-floor"><div className="azul-floor-heading">{onRow?<button type="button" disabled={!allowed(0)} aria-pressed={row===0} onClick={()=>onRow(0)} className={row===0?'selected':''}>全部放地板 ↓</button>:<span>地板</span>}</div><div className="azul-floor-spaces">{FLOOR_PENALTIES.map((penalty,i)=><div key={i}><small>−{penalty}</small><span className="azul-space">{player.floor[i]&&<Tile color={player.floor[i]}/>}</span></div>)}</div></div>
  </div>;
}
function PatternLines({player,row,choices,onRow}:{player:Omit<AzulPlayer,'kind'>;row?:number|null;choices?:LegalAction[];onRow?:(row:number)=>void}){
  return <div className="azul-pattern-lines" aria-label="图案行需求">{player.pattern.map((line,i)=>{
    const capacity=i+1,choice=choices?.find(action=>action.action.row===capacity),color=line[0]??choice?.action.color;
    const contents=<><small>{capacity} 行</small><span>{color?<Tile color={color}/>:<i className="azul-empty-color"/>}<b>{line.length}/{capacity}</b></span><small>{choice?`放 ${choice.placed}${choice.overflow?` · 落地 ${choice.overflow}`:''}`:line.length===capacity?'待铺墙':line.length?`缺 ${capacity-line.length}`:'空行'}</small></>;
    const label=`图案行 ${capacity}，${line.length?COLOR_NAMES[line[0]]:'空行'}，已有 ${line.length}，容量 ${capacity}${choice?`，本次放 ${choice.placed}，溢出 ${choice.overflow}`:''}`;
    return onRow?<button type="button" key={i} className="azul-pattern-line" aria-label={label} disabled={!choice} aria-pressed={row===capacity} onClick={()=>onRow(capacity)}>{contents}</button>:<div key={i} className="azul-pattern-line" aria-label={label}>{contents}</div>;
  })}</div>;
}
const floorPenalty=(player:Pick<AzulPlayer,'floor'>)=>FLOOR_PENALTIES.slice(0,player.floor.length).reduce((sum,value)=>sum+value,0);
function WallProgress({player}:{player:Omit<AzulPlayer,'kind'>}){
  const filled=player.wall.map(line=>line.filter(Boolean).length),complete=filled.filter(count=>count===5).length;
  return <div className="azul-wall-progress"><span>地板 −{floorPenalty(player)}</span><span>{complete?`已完成 ${complete} 行`:`距成行 ${5-Math.max(...filled)} 格`}</span></div>;
}
export function AzulTable({state,controller,onError,tableActions}:GameUiProps){
  const game=state.game as ControlledView<AzulView>,[selection,setSelection]=useState<Selection|null>(null),[row,setRow]=useState<number|null>(null);
  const [panel,setPanel]=useState<BoardGamePanel>('table'),[boardSeat,setBoardSeat]=useState<number|null>(null);
  useEffect(()=>{setBoardSeat(null);setPanel('table');},[game.id]);
  useEffect(()=>{setSelection(null);setRow(null);},[game.id,game.revision]);
  const own=game.viewer===null?null:game.players[game.viewer],ownTurn=!!own&&!state.paused&&game.turn===game.viewer&&game.phase!=='finished';
  const choices=ownTurn&&selection?game.legalActions.filter(a=>a.action.source===selection.source&&a.action.color===selection.color):[];
  const chosen=choices.find(a=>a.action.row===row);
  const selectedCount=selection?(selection.source?game.factories[selection.source-1]??[]:game.center).filter(color=>color===selection.color).length:0;
  const choose=(value:Selection)=>{setSelection(value);setRow(null);setPanel('player');};
  const status=(p:typeof game.players[number])=>game.phase==='finished'?game.result?.winners.includes(p.seat)?'本局获胜':'本局已结算':state.paused?'已暂停':p.seat===game.turn?p.kind==='human'?'轮到你选砖':state.seats.find(s=>s.playerId===p.playerId)?.message??'正在选砖':'等待回合';
  const cardState=(p:typeof game.players[number])=>playerCardState({active:game.turn===p.seat,paused:state.paused,finished:game.phase==='finished',runtime:state.seats.find(s=>s.playerId===p.playerId)});
  const agentStatus=(p:typeof game.players[number])=>`${status(p)}${game.firstOwner===p.seat?' · 下轮先手':''}`;
  const previewPoints=()=>{
    if(!own||!chosen||!row||own.pattern[row-1].length+chosen.placed!==row)return null;
    const wall=own.wall.map(r=>[...r]),col=wallColumn(row-1,chosen.action.color);wall[row-1][col]=chosen.action.color;return adjacentScore(wall,row-1,col);
  };
  const points=previewPoints();
  const act=()=>{if(!chosen)return;try{controller.humanAction(chosen.action);setBoardSeat(null);setPanel('table');}catch(error){onError((error as Error).message);}};
  const opponents=game.players.filter(p=>p.seat!==game.viewer),boardPlayer=boardSeat===null?undefined:game.players[boardSeat];
  return <GameLayout gameId="azul" label="花砖物语牌桌" className="azul-layout" surfaceClassName="azul-main" viewport={{mode:own?'player':'spectator',panel,onPanelChange:setPanel,playerLabel:'我的宫殿',tableActions}} toolbar={<> <span>有色墙 · 第 {game.match} 局 · 第 {game.round} 轮</span><span>袋内 {game.bagCount} · 回收盒 {Object.values(game.discardCounts).reduce((s,n)=>s+n,0)} 片</span> </>} score={<FoilPanel className="azul-standings"><h3>本桌积分 <small>累计</small></h3>{game.players.map(p=><div className="azul-standing-row" key={p.playerId}><span><strong>{p.name}</strong><small>{p.wins} 胜 · 累计 {p.totalScore} 分</small></span><b>{p.score}<small>本局</small></b></div>)}{game.result&&<section className="azul-score-result"><h3>{game.result.winners.map(s=>game.players[s].name).join('、')}{game.result.winners.length>1?'共享胜利':'获胜'}</h3><p>按最高分、完整横行数比较；仍相同则共享胜利。</p>{game.players.map((p,i)=>{const b=game.result!.bonuses[i];return <div className="azul-result-row" key={p.playerId}><strong>{p.name} · {p.score} 分</strong><span>铺墙 +{p.wallPoints} · 地板 −{p.floorLoss}</span><small>横行 {b.rows}×2 · 竖列 {b.columns}×7 · 同色 {b.colors}×10 = +{b.points}</small></div>;})}</section>}</FoilPanel>} events={game.events} eventPlayers={game.players} activityTitle="花砖动态" after={boardPlayer&&<Modal branded={false} className="board-inventory-modal azul-board-modal" title={`${boardPlayer.name}的宫殿`} subtitle={`${boardPlayer.score} 分 · 地板 ${boardPlayer.floor.length} 片`} onClose={()=>setBoardSeat(null)}><FoilPanel className="azul-board-detail"><Board player={boardPlayer} selection={boardSeat===game.viewer?selection:undefined} row={boardSeat===game.viewer?row:undefined} choices={boardSeat===game.viewer?choices:undefined} onRow={boardSeat===game.viewer&&ownTurn?setRow:undefined}/></FoilPanel></Modal>}>
      <GameTable className="azul-public-table"><div className="azul-public"><h3>{game.phase==='finished'?'本局已结束':state.paused?'游戏已暂停':`${game.players[game.turn].name} 的回合`}</h3><Market game={game} selection={own?selection:undefined} onSelect={ownTurn?choose:undefined}/></div></GameTable>
      {own&&<HumanPlayerCard player={own} state={cardState(own)} metrics={[{label:'本局得分',value:own.score}]} badges={selection&&<span className="azul-selection-badge" title={selection.source?`工厂 ${selection.source}`:'中央'} aria-label={`${COLOR_NAMES[selection.color]} ${selectedCount} 片`}><Tile color={selection.color}/><b>×{selectedCount}</b></span>} status={agentStatus(own)} tableActions={tableActions} aria-label="我的宫殿与选砖操作" actions={ownTurn&&<div className="azul-turn-action">{chosen&&<small>{row?`行 ${row} · 放 ${chosen.placed} 片`:'全部放地板'}{chosen.overflow?` · 落地 ${chosen.overflow}`:''}<br/>扣分 +{chosen.floorCost}{points!==null?` · 铺墙预计 +${points}`:''}</small>}<button type="button" className="button primary" disabled={!chosen} onClick={act}>确认放砖 ↗</button></div>}>
        <div className="azul-player-plan">
          <PatternLines player={own} row={row} choices={choices} onRow={ownTurn?setRow:undefined}/>
          <div className="azul-floor-action">{ownTurn?<button type="button" className="button outline" disabled={!choices.some(choice=>choice.action.row===0)} aria-pressed={row===0} onClick={()=>setRow(0)}>全部放地板</button>:<span>地板 {own.floor.length}/7</span>}<WallProgress player={own}/></div>
          <div className="azul-card-entries">{ownTurn&&<button type="button" className="text-button" onClick={()=>setPanel('table')}>{selection?`${selection.source?`工厂 ${selection.source}`:'中央'} · 重选`:'选择花砖'} ↗</button>}<button type="button" className="text-button" onClick={()=>setBoardSeat(own.seat)}>墙面与地板 ↗</button></div>
        </div>
      </HumanPlayerCard>}
      <BoardGamePlayers className="azul-opponents" activeIndex={opponents.findIndex(p=>p.seat===game.turn)} activeName={game.players[game.turn].name}>{opponents.map(p=><AgentPlayerCard key={p.playerId} player={p} state={cardState(p)} caption={game.firstOwner===p.seat?'下轮先手':undefined} metrics={[{label:'本局得分',value:p.score}]} status={agentStatus(p)} action={game.events.filter(e=>e.seat===p.seat&&e.kind==='draft'&&e.round===game.round).at(-1)?.text??''}><PatternLines player={p}/><WallProgress player={p}/><button type="button" className="text-button azul-board-entry" onClick={()=>setBoardSeat(p.seat)}>墙面与地板 ↗</button></AgentPlayerCard>)}</BoardGamePlayers>
      {!own&&<SpectatorTableActions>{tableActions}</SpectatorTableActions>}
    </GameLayout>;
}
export function AzulConfig(){return <div className="azul-config"><strong>原版标准有色墙 · 2–4 人</strong><p>五种花砖各 20 片；2／3／4 人分别使用 5／7／9 个工厂盘。每盘 4 片。首局随机先手。</p><p>完成横行的轮次结束后结算奖励；最高分获胜，同分比较完整横行数。下一局保留累计分与胜场。</p><a href={RULES_URL} target="_blank" rel="noreferrer">发行商原版规则书 ↗</a></div>;}
export function AzulReplay({run}:{run:StoredRun<AzulState>}){
  const [step,setStep]=useState(run.state.events.length);const frame=useMemo(()=>replayAzul(run.state,step),[run,step]);
  const event=run.state.events[step-1];
  return <div className="azul-replay"><div className="azul-replay-controls"><button className="button outline" disabled={step<=1} onClick={()=>setStep(s=>s-1)}>上一步</button><label>公开事件 {step} / {run.state.events.length}<input aria-label="回放进度" type="range" min={1} max={run.state.events.length} value={step} onChange={e=>setStep(Number(e.target.value))}/></label><button className="button outline" disabled={step>=run.state.events.length} onClick={()=>setStep(s=>s+1)}>下一步</button></div><p className="azul-replay-caption">第 {event?.round} 轮 · {event?.seat!==undefined?`${run.roster[event.seat].name} · `:''}{event?.text}</p><Market game={frame}/><div className="azul-replay-boards">{frame.players.map(p=><div className="azul-replay-board" key={p.playerId}><h3>{p.name}<span>{p.score} 分</span></h3><Board player={p}/></div>)}</div><div className="azul-replay-log">{run.state.events.map(e=><button type="button" key={e.seq} aria-current={step===e.seq?'step':undefined} onClick={()=>setStep(e.seq)}><small>{e.seq} · 第 {e.round} 轮</small><span>{e.seat!==undefined?`${run.roster[e.seat].name} · `:''}{e.text}</span></button>)}</div></div>;
}
