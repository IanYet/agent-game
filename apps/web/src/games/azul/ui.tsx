import {useEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import type {ControlledView,GameUiProps,StoredRun} from '../../runtime/types';
import {playerCardState} from '../../visuals/PlayerCard';
import {HumanPlayerCard} from '../HumanPlayerCard';
import {AgentPlayerCard} from '../AgentPlayerCard';
import {FoilPanel} from '../../visuals/FoilPanel';
import {GameLayout,GameTable,SpectatorTableActions,type BoardGamePanel} from '../GameLayout';
import {BoardGamePlayers} from '../BoardGamePlayers';
import {COLORS,COLOR_NAMES,FLOOR_PENALTIES,RULES_URL,adjacentScore,replayAzul,wallColor,wallColumn,type AzulFrame,type AzulPlayer,type AzulState,type AzulView,type Color,type FloorToken,type LegalAction} from './engine';
import {TILE_IMAGES} from './artwork';
import {TileTransfers,useAzulDraftFrame} from './transfers';
import './azul.css';

function Tile({color,ghost=false,origin}:{color:FloorToken;ghost?:boolean;origin?:string}){return <img draggable={false} className={`azul-tile${ghost?' ghost':''}`} data-azul-origin={origin} src={TILE_IMAGES[color==='first'?5:COLORS.indexOf(color)]} alt={color==='first'?'先手标记':COLOR_NAMES[color]}/>;}
type Selection={source:number;color:Color};
function Market({game,selection,onSelect}:{game:Omit<AzulFrame,'players'>&{players:Array<Pick<AzulPlayer,'name'>>};selection?:Selection|null;onSelect?:(value:Selection)=>void}){
  const tiles=(colors:Color[],source:number)=>colors.map((color,i)=><button type="button" key={`${source}:${color}:${i}`} data-azul-origin={`source:${source}:${color}:${colors.slice(0,i).filter(tile=>tile===color).length}`} disabled={!onSelect} className={`azul-source-tile${selection?.source===source&&selection.color===color?' selected':''}`} aria-label={`选择${source?`工厂 ${source}`:'中央'}的${COLOR_NAMES[color]}，共 ${colors.filter(c=>c===color).length} 片`} aria-pressed={selection?.source===source&&selection.color===color} onClick={()=>onSelect?.({source,color})}><Tile color={color}/></button>);
  return <div className="azul-market" aria-label="工厂盘与中央区">
    <div className="azul-orbit">
      <div className="azul-factories">{game.factories.map((factory,i)=>{
        const angle=i*Math.PI*2/game.factories.length-Math.PI/2;
        return <div className="azul-factory" key={i} aria-label={`工厂 ${i+1}`} style={{'--factory-x':Math.cos(angle),'--factory-y':Math.sin(angle)} as CSSProperties}><div>{tiles(factory,i+1)}</div></div>;
      })}</div>
      <div className="azul-center"><div className="azul-center-label"><strong>中央区</strong><small>{game.markerInCenter?'首次拿砖需带走先手标记':`下轮先手：${game.players[game.firstOwner??game.turn].name}`}</small></div><div className="azul-center-tiles">{game.markerInCenter&&<Tile color="first" origin="first"/>}{COLORS.flatMap(color=>tiles(game.center.filter(tile=>tile===color),0))}</div></div>
    </div>
  </div>;
}
function Board({player,selection,row,choices,onRow}:{player:Omit<AzulPlayer,'kind'>;selection?:Selection|null;row?:number|null;choices?:LegalAction[];onRow?:(row:number)=>void}){
  const allowed=(r:number)=>!!choices?.some(a=>a.action.row===r);
  const floorCells=<span className="azul-floor-spaces">{FLOOR_PENALTIES.map((penalty,i)=><span className="azul-floor-space" key={i}><span className="azul-space" data-azul-floor-cell={i}>{player.floor[i]&&<Tile color={player.floor[i]}/>}</span><small>−{penalty}</small></span>)}</span>;
  return <div className="azul-board" data-azul-board={player.seat} aria-label={`${player.name}的花砖板`}>
    <div className="azul-board-labels"><span>图案行</span><span>宫殿墙面</span></div>
    <div className="azul-board-rows">{player.pattern.map((line,i)=>{
      const capacity=i+1,choice=choices?.find(a=>a.action.row===capacity),col=selection?wallColumn(i,selection.color):-1,pendingCol=line.length===capacity?wallColumn(i,line[0]):-1;
      const cells=<><small>{capacity}</small><span className="azul-pattern-spaces">{Array.from({length:capacity},(_,j)=>{const filled=j>=capacity-line.length;return <span className="azul-space" data-azul-pattern-cell={`${capacity}:${j}`} key={j}>{filled?<Tile color={line[0]}/>:row===capacity&&selection&&j>=capacity-line.length-(choice?.placed??0)?<span className="azul-preview"><Tile color={selection.color}/></span>:null}</span>;})}</span></>;
      return <div className="azul-board-row" key={i}>
        {onRow?<button type="button" aria-label={`放入图案行 ${capacity}${choice?`，放 ${choice.placed} 片，溢出 ${choice.overflow} 片`:'，不可放置'}`} disabled={!allowed(capacity)} aria-pressed={row===capacity} className={`azul-pattern${row===capacity?' selected':''}`} onClick={()=>onRow(capacity)}>{cells}</button>:<div className="azul-pattern">{cells}</div>}
        <span className="azul-arrow">›</span><div className="azul-wall">{player.wall[i].map((color,j)=>{
          const pending=!color&&pendingCol===j;
          return <span className={`azul-space${pending?' pending':''}${row===capacity&&col===j?' target':''}`} key={j} title={pending?`${COLOR_NAMES[line[0]]}：图案行已满，待轮末铺墙`:undefined}><Tile color={color??wallColor(i,j)} ghost={!color&&!pending}/></span>;
        })}</div>
      </div>;
    })}<div className="azul-board-row azul-floor">
      {onRow?<button type="button" aria-label="全部放地板" disabled={!allowed(0)} aria-pressed={row===0} onClick={()=>onRow(0)} className={`azul-pattern azul-floor-track${row===0?' selected':''}`}>{floorCells}</button>:<div className="azul-pattern azul-floor-track">{floorCells}</div>}
      <span className="azul-floor-label">地板行</span>
    </div></div>
  </div>;
}
const floorPenalty=(player:Pick<AzulPlayer,'floor'>)=>FLOOR_PENALTIES.slice(0,player.floor.length).reduce((sum,value)=>sum+value,0);
function estimatedRoundScore(player:Omit<AzulPlayer,'kind'>){
  const wall=player.wall.map(line=>[...line]);let points=0;
  player.pattern.forEach((tiles,row)=>{
    if(tiles.length!==row+1)return;
    const color=tiles[0],col=wallColumn(row,color);wall[row][col]=color;points+=adjacentScore(wall,row,col);
  });
  const loss=Math.min(player.score+points,floorPenalty(player));
  return points-loss;
}
export function AzulTable({state,controller,onError,tableActions}:GameUiProps){
  const {game,settling}=useAzulDraftFrame(state.game as ControlledView<AzulView>),market=useRef<HTMLDivElement>(null);
  const [selection,setSelection]=useState<Selection|null>(null),[row,setRow]=useState<number|null>(null);
  const [panel,setPanel]=useState<BoardGamePanel>('table');
  useEffect(()=>{setPanel('table');},[game.id]);
  useEffect(()=>{setSelection(null);setRow(null);},[game.id,game.revision]);
  const own=game.viewer===null?null:game.players[game.viewer],ownTurn=!!own&&!settling&&!state.paused&&game.turn===game.viewer&&game.phase!=='finished';
  const choices=ownTurn&&selection?game.legalActions.filter(a=>a.action.source===selection.source&&a.action.color===selection.color):[];
  const chosen=choices.find(a=>a.action.row===row);
  const selectedCount=selection?(selection.source?game.factories[selection.source-1]??[]:game.center).filter(color=>color===selection.color).length:0;
  const choose=(value:Selection)=>{setSelection(value);setRow(null);setPanel('player');};
  const status=(p:typeof game.players[number])=>game.phase==='finished'?game.result?.winners.includes(p.seat)?'本局获胜':'本局已结算':state.paused?'已暂停':p.seat===game.turn?p.kind==='human'?'轮到你选砖':state.seats.find(s=>s.playerId===p.playerId)?.message??'正在选砖':'等待回合';
  const cardState=(p:typeof game.players[number])=>playerCardState({active:game.turn===p.seat,paused:state.paused,finished:game.phase==='finished',runtime:state.seats.find(s=>s.playerId===p.playerId)});
  const scoreMetric=(p:typeof game.players[number])=>game.phase==='finished'?{label:'本局得分',value:p.score}:{label:'本轮预估',value:estimatedRoundScore(p)};
  const agentStatus=(p:typeof game.players[number])=>`${status(p)}${game.firstOwner===p.seat?' · 下轮先手':''}`;
  const previewPoints=()=>{
    if(!own||!chosen||!row||own.pattern[row-1].length+chosen.placed!==row)return null;
    const wall=own.wall.map(r=>[...r]),col=wallColumn(row-1,chosen.action.color);wall[row-1][col]=chosen.action.color;return adjacentScore(wall,row-1,col);
  };
  const points=previewPoints();
  const act=()=>{if(!ownTurn||!chosen)return;try{controller.humanAction(chosen.action);setPanel('table');}catch(error){onError((error as Error).message);}};
  const opponents=game.players.filter(p=>p.seat!==game.viewer);
  const toolbar=<><span>有色墙 · 第 {game.match} 局 · 第 {game.round} 轮</span><span>袋内 {game.bagCount} · <span data-azul-discard>回收盒 {Object.values(game.discardCounts).reduce((s,n)=>s+n,0)} 片</span></span></>;
  return <GameLayout gameId="azul" label="花砖物语牌桌" className="azul-layout" surfaceClassName="azul-main" viewport={{mode:own?'player':'spectator',panel,onPanelChange:setPanel,playerLabel:'我的宫殿',tableActions}} toolbar={toolbar} score={<FoilPanel className="azul-standings"><h3>本桌积分 <small>轮末结算</small></h3>{game.players.map(p=><div className="azul-standing-row" key={p.playerId}><span><strong>{p.name}</strong><small>{p.wins} 胜 · 累计 {p.totalScore} 分</small></span><b>{p.score}<small>本局</small></b></div>)}{game.result&&<section className="azul-score-result"><h3>{game.result.winners.map(s=>game.players[s].name).join('、')}{game.result.winners.length>1?'共享胜利':'获胜'}</h3><p>按最高分、完整横行数比较；仍相同则共享胜利。</p>{game.players.map((p,i)=>{const b=game.result!.bonuses[i];return <div className="azul-result-row" key={p.playerId}><strong>{p.name} · {p.score} 分</strong><span>铺墙 +{p.wallPoints} · 地板 −{p.floorLoss}</span><small>横行 {b.rows}×2 · 竖列 {b.columns}×7 · 同色 {b.colors}×10 = +{b.points}</small></div>;})}</section>}</FoilPanel>} events={game.events} eventPlayers={game.players} activityTitle="花砖动态" after={<TileTransfers game={game} market={market} renderTile={color=><Tile color={color}/>}/>}>
      <GameTable className="azul-public-table"><div ref={market} className="azul-public"><h3>{game.phase==='finished'?'本局已结束':state.paused?'游戏已暂停':`${game.players[game.turn].name} 的回合`}</h3><Market game={game} selection={own?selection:undefined} onSelect={ownTurn?choose:undefined}/></div></GameTable>
      {own&&<HumanPlayerCard player={own} state={cardState(own)} metrics={[scoreMetric(own)]} badges={selection&&<span className="azul-selection-badge" title={selection.source?`工厂 ${selection.source}`:'中央'} aria-label={`${COLOR_NAMES[selection.color]} ${selectedCount} 片`}><Tile color={selection.color}/><b>×{selectedCount}</b></span>} status={agentStatus(own)} tableActions={tableActions} aria-label="我的宫殿与选砖操作" actions={<div className="azul-turn-action"><small>{ownTurn&&chosen&&<><span>{row?`${row} 行 · 放 ${chosen.placed}`:'全部放地板'}{chosen.overflow?` · 落地 ${chosen.overflow}`:''}</span><span>地板 −{chosen.floorCost}{points!==null?` · 铺墙 +${points}`:''}</span></>}</small><button type="button" className="button primary" disabled={!ownTurn||!chosen} onClick={act}>确认放砖 ↗</button></div>}>
        <Board player={own} selection={selection} row={row} choices={choices} onRow={setRow}/>
      </HumanPlayerCard>}
      <BoardGamePlayers className="azul-opponents" cardWidth={320} activeIndex={opponents.findIndex(p=>p.seat===game.turn)} activeName={game.players[game.turn].name}>{opponents.map(p=><AgentPlayerCard key={p.playerId} player={p} state={cardState(p)} caption={game.firstOwner===p.seat?'下轮先手':undefined} metrics={[scoreMetric(p)]} status={agentStatus(p)} action={game.events.filter(e=>e.seat===p.seat&&e.kind==='draft'&&e.round===game.round).at(-1)?.text??''}><Board player={p}/></AgentPlayerCard>)}</BoardGamePlayers>
      {!own&&<SpectatorTableActions>{tableActions}</SpectatorTableActions>}
    </GameLayout>;
}
export function AzulConfig(){return <div className="azul-config"><strong>原版标准有色墙 · 2–4 人</strong><p>五种花砖各 20 片；2／3／4 人分别使用 5／7／9 个工厂盘。每盘 4 片。首局随机先手。</p><p>完成横行的轮次结束后结算奖励；最高分获胜，同分比较完整横行数。下一局保留累计分与胜场。</p><a href={RULES_URL} target="_blank" rel="noreferrer">发行商原版规则书 ↗</a></div>;}
export function AzulReplay({run}:{run:StoredRun<AzulState>}){
  const [step,setStep]=useState(run.state.events.length);const frame=useMemo(()=>replayAzul(run.state,step),[run,step]);
  const event=run.state.events[step-1];
  return <div className="azul-replay"><div className="azul-replay-controls"><button className="button outline" disabled={step<=1} onClick={()=>setStep(s=>s-1)}>上一步</button><label>公开事件 {step} / {run.state.events.length}<input aria-label="回放进度" type="range" min={1} max={run.state.events.length} value={step} onChange={e=>setStep(Number(e.target.value))}/></label><button className="button outline" disabled={step>=run.state.events.length} onClick={()=>setStep(s=>s+1)}>下一步</button></div><p className="azul-replay-caption">第 {event?.round} 轮 · {event?.seat!==undefined?`${run.roster[event.seat].name} · `:''}{event?.text}</p><Market game={frame}/><div className="azul-replay-boards">{frame.players.map(p=><div className="azul-replay-board" key={p.playerId}><h3>{p.name}<span>{p.score} 分</span></h3><Board player={p}/></div>)}</div><div className="azul-replay-log">{run.state.events.map(e=><button type="button" key={e.seq} aria-current={step===e.seq?'step':undefined} onClick={()=>setStep(e.seq)}><small>{e.seq} · 第 {e.round} 轮</small><span>{e.seat!==undefined?`${run.roster[e.seat].name} · `:''}{e.text}</span></button>)}</div></div>;
}
