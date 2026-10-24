import {useEffect,useMemo,useState} from 'react';
import type {ControlledView,GameUiProps,StoredRun} from '../../runtime/types';
import {PlayerCard,PlayerCardAvatar,playerCardState} from '../../visuals/PlayerCard';
import {FoilPanel} from '../../visuals/FoilPanel';
import {COLORS,COLOR_NAMES,FLOOR_PENALTIES,RULES_URL,adjacentScore,replayAzul,wallColor,wallColumn,type AzulFrame,type AzulPlayer,type AzulState,type AzulView,type Color,type FloorToken,type LegalAction} from './engine';
import {TILE_IMAGES} from './artwork';
import './azul.css';

function Tile({color,ghost=false}:{color:FloorToken;ghost?:boolean}){return <img draggable={false} className={`azul-tile${ghost?' ghost':''}`} src={TILE_IMAGES[color==='first'?5:COLORS.indexOf(color)]} alt={color==='first'?'先手标记':COLOR_NAMES[color]}/>;}
type Selection={source:number;color:Color};
function Market({game,selection,onSelect}:{game:Omit<AzulFrame,'players'>&{players:Array<Pick<AzulPlayer,'name'>>};selection?:Selection|null;onSelect?:(value:Selection)=>void}){
  const tiles=(colors:Color[],source:number)=>colors.map((color,i)=><button type="button" key={i} disabled={!onSelect} className={`azul-source-tile${selection?.source===source&&selection.color===color?' selected':''}`} aria-label={`选择${source?`工厂 ${source}`:'中央'}的${COLOR_NAMES[color]}，共 ${colors.filter(c=>c===color).length} 片`} aria-pressed={selection?.source===source&&selection.color===color} onClick={()=>onSelect?.({source,color})}><Tile color={color}/></button>);
  return <div className="azul-market" aria-label="工厂盘与中央区">
    <div className="azul-factories">{game.factories.map((factory,i)=><div className={`azul-factory${!factory.length?' empty':''}`} key={i}><span>工厂 {i+1}</span><div>{tiles(factory,i+1)}</div></div>)}</div>
    <div className="azul-center"><div className="azul-center-label"><strong>中央区</strong><small>{game.markerInCenter?'首次拿砖需带走先手标记':`下轮先手：${game.players[game.firstOwner??game.turn].name}`}</small></div><div className="azul-center-tiles">{game.markerInCenter&&<Tile color="first"/>}{tiles(game.center,0)}{!game.center.length&&<span className="azul-muted">工厂余砖会流入这里</span>}</div></div>
  </div>;
}
function Board({player,selection,row,choices,onRow}:{player:Omit<AzulPlayer,'kind'>;selection?:Selection|null;row?:number|null;choices?:LegalAction[];onRow?:(row:number)=>void}){
  const allowed=(r:number)=>!!choices?.some(a=>a.action.row===r);
  return <div className="azul-board" aria-label={`${player.name}的花砖板`}>
    <div className="azul-board-labels"><span>图案行 · 右起放置</span><span>宫殿墙面</span></div>
    <div className="azul-board-rows">{player.pattern.map((line,i)=>{
      const capacity=i+1,choice=choices?.find(a=>a.action.row===capacity),col=selection?wallColumn(i,selection.color):-1;
      const cells=<><small>{capacity}</small><span className="azul-pattern-spaces">{Array.from({length:capacity},(_,j)=>{const filled=j>=capacity-line.length;return <span className="azul-space" key={j}>{filled?<Tile color={line[0]}/>:row===capacity&&selection&&j>=capacity-line.length-(choice?.placed??0)?<span className="azul-preview"><Tile color={selection.color}/></span>:null}</span>;})}</span></>;
      return <div className="azul-board-row" key={i}>
        {onRow?<button type="button" aria-label={`放入图案行 ${capacity}${choice?`，放 ${choice.placed} 片，溢出 ${choice.overflow} 片`:'，不可放置'}`} disabled={!allowed(capacity)} aria-pressed={row===capacity} className={`azul-pattern${row===capacity?' selected':''}`} onClick={()=>onRow(capacity)}>{cells}</button>:<div className="azul-pattern">{cells}</div>}
        <span className="azul-arrow">›</span><div className="azul-wall">{player.wall[i].map((color,j)=><span className={`azul-space${row===capacity&&col===j?' target':''}`} key={j}>{<Tile color={color??wallColor(i,j)} ghost={!color}/>}</span>)}</div>
      </div>;
    })}</div>
    <div className="azul-floor"><div className="azul-floor-heading">{onRow?<button type="button" disabled={!allowed(0)} aria-pressed={row===0} onClick={()=>onRow(0)} className={row===0?'selected':''}>全部放地板 ↓</button>:<span>地板</span>}<small>最低扣至 0 分</small></div><div className="azul-floor-spaces">{FLOOR_PENALTIES.map((penalty,i)=><div key={i}><small>−{penalty}</small><span className="azul-space">{player.floor[i]&&<Tile color={player.floor[i]}/>}</span></div>)}</div></div>
  </div>;
}
export function AzulTable({state,controller,onError,tableActions}:GameUiProps){
  const game=state.game as ControlledView<AzulView>,[selection,setSelection]=useState<Selection|null>(null),[row,setRow]=useState<number|null>(null);
  useEffect(()=>{setSelection(null);setRow(null);},[game.id,game.revision]);
  const own=game.viewer===null?null:game.players[game.viewer],ownTurn=!!own&&!state.paused&&game.turn===game.viewer&&game.phase!=='finished';
  const choices=ownTurn&&selection?game.legalActions.filter(a=>a.action.source===selection.source&&a.action.color===selection.color):[];
  const chosen=choices.find(a=>a.action.row===row);
  const choose=(value:Selection)=>{setSelection(value);setRow(null);};
  const status=(p:typeof game.players[number])=>game.phase==='finished'?game.result?.winners.includes(p.seat)?'本局获胜':'本局已结算':state.paused?'已暂停':p.seat===game.turn?p.kind==='human'?'轮到你选砖':state.seats.find(s=>s.playerId===p.playerId)?.message??'正在选砖':'等待回合';
  const cardState=(p:typeof game.players[number])=>playerCardState({active:game.turn===p.seat,paused:state.paused,finished:game.phase==='finished',runtime:state.seats.find(s=>s.playerId===p.playerId)});
  const heading=(p:typeof game.players[number])=><header className="azul-player-heading"><PlayerCardAvatar seat={p.seat} kind={p.kind} showNumber={false}/><div><span className="identity-caption">{p.kind==='human'?'YOUR PALACE.':'AT THE TABLE.'}</span><strong>{String(p.seat+1).padStart(2,'0')} · {p.name}</strong><small data-player-status>{status(p)}{game.firstOwner===p.seat?' · 下轮先手':''}</small></div><div className="azul-score"><strong>{p.score}</strong><small>本局得分</small></div></header>;
  const previewPoints=()=>{
    if(!own||!chosen||!row||own.pattern[row-1].length+chosen.placed!==row)return null;
    const wall=own.wall.map(r=>[...r]),col=wallColumn(row-1,chosen.action.color);wall[row-1][col]=chosen.action.color;return adjacentScore(wall,row-1,col);
  };
  const points=previewPoints();
  const act=()=>{if(!chosen)return;try{controller.humanAction(chosen.action);}catch(error){onError((error as Error).message);}};
  return <div className="azul-layout" data-game-surface="azul">
    <section className="azul-main"><div className="azul-toolbar"><span>有色墙 · 第 {game.match} 局 · 第 {game.round} 轮</span><span>袋内 {game.bagCount} · 回收盒 {Object.values(game.discardCounts).reduce((s,n)=>s+n,0)} 片</span></div>
      {own?<PlayerCard state={cardState(own)} primary className="azul-own" data-player-surface data-cursor-lens="off" aria-label="我的宫殿与选砖操作">
        {heading(own)}<Market game={game} selection={selection} onSelect={ownTurn?choose:undefined}/>
        <div className="azul-own-bottom"><Board player={own} selection={selection} row={row} choices={choices} onRow={ownTurn?setRow:undefined}/>
          <div className="azul-controls"><span className="identity-caption">YOUR NEXT TILE.</span><h3>{game.phase==='finished'?'宫殿落成':state.paused?'游戏已暂停':ownTurn?'挑一组花砖':'等待其他玩家'}</h3>
            {ownTurn?<><p className="azul-help">{!selection?'① 点工厂盘或中央的一种花砖':row===null?'② 点左侧图案行或地板':'③ 确认这一组全部放入'}</p>
              {selection&&<p className="azul-selection"><Tile color={selection.color}/><span>{selection.source?`工厂 ${selection.source}`:'中央'} · {COLOR_NAMES[selection.color]}<b>共 {choices[0]?.count??0} 片{choices[0]?.takesFirst?' + 先手标记':''}</b></span></p>}
              {chosen&&<div className="azul-placement"><p>{row?`图案行 ${row} 放 ${chosen.placed} 片`:'全部放地板'}{chosen.overflow?` · ${chosen.overflow} 片落地`:''}</p><p>增加地板扣分 {chosen.floorCost}{points!==null?` · 铺墙预计 +${points}`:''}</p>{points!==null&&<small>预计值按当前墙面计算，实际从上到下铺墙。</small>}</div>}
              <button type="button" className="button primary" disabled={!chosen} onClick={act}>确认放砖 {chosen?'↗':''}</button>
            </>:<p className="azul-muted">{game.phase==='finished'?'本局已完成，可查看右侧奖励与完整回放。':state.paused?'准备好后继续，当前局面会保留。':`现在是 ${game.players[game.turn].name} 的回合。所有板面公开，可观察对手的图案行。`}</p>}
            <div className="azul-total">已结算累计 {own.totalScore} 分 · {own.wins} 胜</div><div className="player-table-actions">{tableActions}</div>
          </div></div>
      </PlayerCard>:<><FoilPanel className="azul-public"><h3>{game.phase==='finished'?'本局已结束':state.paused?'观战已暂停':`${game.players[game.turn].name} 的回合`}</h3><Market game={game}/><div className="spectator-table-actions"><p>观战中 · 点击 Agent 光球查看对话</p>{tableActions}</div></FoilPanel><div className="azul-spectator-boards">{game.players.map(p=><PlayerCard key={p.playerId} state={cardState(p)} className="azul-opponent">{heading(p)}<Board player={p}/><small>已结算累计 {p.totalScore} 分 · {p.wins} 胜</small></PlayerCard>)}</div></>}
    </section>
    <aside className="azul-rail">{own&&game.players.filter(p=>p.seat!==game.viewer).map(p=><PlayerCard key={p.playerId} state={cardState(p)} className="azul-opponent">{heading(p)}<Board player={p}/><small className="azul-total">已结算累计 {p.totalScore} 分 · {p.wins} 胜</small></PlayerCard>)}
      {game.result&&<FoilPanel className="azul-result"><span className="identity-caption">PALACE COMPLETE.</span><h3>{game.result.winners.map(s=>game.players[s].name).join('、')}{game.result.winners.length>1?'共享胜利':'获胜'}</h3><p>按最高分、完整横行数比较；仍相同则共享胜利。</p>{game.players.map((p,i)=>{const b=game.result!.bonuses[i];return <div className="azul-result-row" key={p.playerId}><strong>{p.name} · {p.score} 分</strong><span>铺墙 +{p.wallPoints} · 地板 −{p.floorLoss}</span><small>横行 {b.rows}×2 · 竖列 {b.columns}×7 · 同色 {b.colors}×10 = +{b.points}</small></div>;})}</FoilPanel>}
      <FoilPanel className="azul-events"><div className="event-heading"><h3>花砖动态</h3><span>完整公开记录</span></div><div className="event-list">{[...game.events].reverse().map(e=><div className="game-event" key={e.seq}><span className="event-time">{String(e.seq).padStart(2,'0')} · 第 {e.round} 轮</span><p>{e.seat!==undefined&&<b>{game.players[e.seat].name} </b>}{e.text}</p></div>)}</div></FoilPanel>
    </aside>
  </div>;
}
export function AzulConfig(){return <div className="azul-config"><strong>原版标准有色墙 · 2–4 人</strong><p>五种花砖各 20 片；2／3／4 人分别使用 5／7／9 个工厂盘。每盘 4 片。首局随机先手。</p><p>完成横行的轮次结束后结算奖励；最高分获胜，同分比较完整横行数。下一局保留累计分与胜场。</p><a href={RULES_URL} target="_blank" rel="noreferrer">发行商原版规则书 ↗</a></div>;}
export function AzulReplay({run}:{run:StoredRun<AzulState>}){
  const [step,setStep]=useState(run.state.events.length);const frame=useMemo(()=>replayAzul(run.state,step),[run,step]);
  const event=run.state.events[step-1];
  return <div className="azul-replay"><div className="azul-replay-controls"><button className="button outline" disabled={step<=1} onClick={()=>setStep(s=>s-1)}>上一步</button><label>公开事件 {step} / {run.state.events.length}<input aria-label="回放进度" type="range" min={1} max={run.state.events.length} value={step} onChange={e=>setStep(Number(e.target.value))}/></label><button className="button outline" disabled={step>=run.state.events.length} onClick={()=>setStep(s=>s+1)}>下一步</button></div><p className="azul-replay-caption">第 {event?.round} 轮 · {event?.seat!==undefined?`${run.roster[event.seat].name} · `:''}{event?.text}</p><Market game={frame}/><div className="azul-replay-boards">{frame.players.map(p=><div className="azul-replay-board" key={p.playerId}><h3>{p.name}<span>{p.score} 分</span></h3><Board player={p}/></div>)}</div><div className="azul-replay-log">{run.state.events.map(e=><button type="button" key={e.seq} aria-current={step===e.seq?'step':undefined} onClick={()=>setStep(e.seq)}><small>{e.seq} · 第 {e.round} 轮</small><span>{e.seat!==undefined?`${run.roster[e.seat].name} · `:''}{e.text}</span></button>)}</div></div>;
}
