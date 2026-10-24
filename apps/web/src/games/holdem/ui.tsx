import type {HoldemView} from './engine';
import {useEffect,useState} from 'react';
import {ShieldCheck} from 'lucide-react';
import {cardLabel,rankLabel,SUIT_LABELS,type Card} from '@agent-game/core';
import {modelsForHarness} from '@agent-game/protocol';
import type {ControlledView,GameUiProps} from '../../runtime/types';
import type {GameController} from '../../controller';
import {effortLabel,kindName} from '../../AgentModelFields';
import {PlayerCard,PlayerCardAvatar,playerCardState} from '../../visuals/PlayerCard';
import {FoilPanel} from '../../visuals/FoilPanel';

const phases={preflop:'翻牌前',flop:'翻牌',turn:'转牌',river:'河牌',finished:'本手已结算'};
function PokerCard({card}:{card?:Card}){
  return <div aria-label={card?cardLabel(card):'隐藏底牌'} className={`playing-card mini ${!card?'card-back':''} ${card&&['H','D'].includes(card.suit)?'red':''}`}>
    {card?<><span className="card-corner"><b>{rankLabel(card.rank)}</b><i>{SUIT_LABELS[card.suit]}</i></span><span className="card-pip">{SUIT_LABELS[card.suit]}</span></>:<span className="card-back-pattern">✦</span>}
  </div>;
}
export function HoldemTable({state,controller,onError,tableActions}:GameUiProps){
  const game=state.game as ControlledView<HoldemView>,[raise,setRaise]=useState('');
  const own=game.viewer===null?undefined:game.players[game.viewer];
  const opponents=game.players.filter(p=>p.seat!==game.viewer);
  const cardState=(p:typeof game.players[number])=>playerCardState({active:game.turn===p.seat,paused:state.paused,finished:game.phase==='finished',folded:p.folded,runtime:state.seats.find(s=>s.playerId===p.playerId)});
  const modelName=(p:typeof game.players[number])=>modelsForHarness(state.connector,p.kind).find(m=>m.id===p.model)?.name??p.model;
  const ownTurn=!state.paused&&game.viewer===game.turn&&game.phase!=='finished',betting=game.betting;
  useEffect(()=>{setRaise(betting?String(Math.min(betting.minRaiseTo,betting.maxRaiseTo)):'');},[game.revision,game.handId]);
  const act=(action:Parameters<GameController['humanAction']>[0])=>{try{controller.humanAction(action);}catch(e:any){onError(e.message);}};
  const status=(p:typeof game.players[number])=>game.phase==='finished'?game.result?.ranks[p.seat]?.label??(p.folded?'已弃牌':'未摊牌'):p.folded?'已弃牌':p.allIn?'全下':game.turn===p.seat?state.paused?'已暂停':p.kind==='human'?'轮到你了':state.seats[p.seat]?.message??'等待行动':`本轮下注 ${p.streetBet}`;
  const tags=(seat:number)=><span className="position-tags">{game.dealer===seat&&<b title="庄家">D</b>}{game.smallBlindSeat===seat&&<b title="小盲">SB</b>}{game.bigBlindSeat===seat&&<b title="大盲">BB</b>}</span>;
  const validRaise=!!betting&&Number.isInteger(Number(raise))&&Number(raise)>=Math.min(betting.minRaiseTo,betting.maxRaiseTo)&&Number(raise)<=betting.maxRaiseTo;
  return <div className="table-layout holdem-layout">
    <section className="game-surface holdem-main" data-game-surface="holdem" data-player-count={game.players.length} aria-label="德州扑克中央牌桌">
      <div className="table-toolbar"><span>牌桌 {game.id.slice(0,8)} · 第 {game.round} 手</span><span><ShieldCheck size={12}/>筹码总额 {game.totalChips}</span></div>
      <div className="poker-public-table">
        <div className="poker-felt"><span className="poker-phase">{phases[game.phase]}</span><div className="community-cards">{Array.from({length:5},(_,i)=><PokerCard key={i} card={game.board[i]}/>)}</div><div className="pot-amount"><small>{game.phase==='finished'?'本手底池':'底池'}</small><strong>{game.phase==='finished'?game.result?.pots.reduce((s,p)=>s+p.amount,0):game.pot}</strong></div><span className="poker-turn">{game.phase==='finished'?game.result?.winners.map(s=>game.players[s].name).join('、')+' 赢得底池':state.paused?'牌局已暂停':`${game.players[game.turn].name} 的回合`}</span></div>
        <div className="poker-seats" data-opponents={opponents.length}>{opponents.map(p=><PlayerCard key={p.playerId} state={cardState(p)} className="poker-seat">
          <span className="identity-caption">AT THE TABLE.</span><div className="poker-player-heading"><PlayerCardAvatar kind={p.kind} seat={p.seat} showNumber={false}/><span className="poker-player-number">{String(p.seat+1).padStart(2,'0')}</span><strong title={p.name}>{p.name}</strong>{tags(p.seat)}</div>
          <small className="poker-model">{kindName[p.kind]}{p.model?` · ${modelName(p)}`:''}{p.reasoningEffort?` · ${effortLabel(p.reasoningEffort)}`:''}</small>
          <div className="poker-seat-body"><div className="hole-cards">{[0,1].map(i=><PokerCard key={i} card={p.hand?.[i]}/>)}</div><div className="poker-balance"><small>可用筹码</small><strong>{p.chips}</strong><small>已投入 {p.committed}</small></div></div><div className="poker-seat-status" data-player-status>{status(p)}</div>
        </PlayerCard>)}</div>
      </div>
      {own?<PlayerCard state={cardState(own)} primary className={`holdem-player ${ownTurn?'is-your-turn':''}`} data-player-surface data-cursor-lens="off" aria-label="我的底牌与操作">
        <div className="holdem-player-body"><div className="holdem-own-cards"><header><div><span className="identity-caption">YOU ARE IN.</span><div className="holdem-own-name"><span className="poker-player-number">{String(own.seat+1).padStart(2,'0')}</span><strong>{own.name}</strong>{tags(own.seat)}</div></div><span className="own-turn-state" data-player-status>{status(own)}</span></header><div className="own-cards-balance"><div className="hole-cards">{[0,1].map(i=><PokerCard key={i} card={own.hand?.[i]}/>)}</div><div className="poker-balance"><small>可用筹码</small><strong>{own.chips}</strong><small>已投入 {own.committed}</small></div></div></div>
          <div className="holdem-own-actions"><span className="identity-caption">{ownTurn?'YOUR MOVE.':'YOUR NEXT MOVE.'}</span>
            {ownTurn&&betting?<div className="poker-controls"><div className="poker-basic-actions">{game.legalActions.filter(a=>a.action.type!=='raise').map(a=><button className={`button ${a.id==='fold'?'outline':'primary'}`} key={a.id} onClick={()=>act(a.action)}>{a.label}</button>)}</div>
              {betting.canRaise&&<div className="poker-raise"><label>本轮下注到<input aria-label="加注到" type="number" min={Math.min(betting.minRaiseTo,betting.maxRaiseTo)} max={betting.maxRaiseTo} step="1" value={raise} onChange={e=>setRaise(e.target.value)}/></label><button className="button outline" disabled={!validRaise} onClick={()=>act({type:'raise',amount:Number(raise)})}>加注至 {raise||'—'}</button><div className="raise-presets">{game.legalActions.filter(a=>a.action.type==='raise').map(a=><button key={a.id} onClick={()=>a.action.type==='raise'&&setRaise(String(a.action.amount))}>{a.label}</button>)}</div><small>{betting.shortAllInOnly?'筹码不足最小加注，只能全下':`最小加注到 ${betting.minRaiseTo}，最多 ${betting.maxRaiseTo}`}</small></div>}
            </div>:<p className="poker-waiting">{game.phase==='finished'?'本手已结束，确认玩家后开始下一手。':state.paused?'游戏已暂停，准备好后继续。':own.folded?'本手已弃牌，等待结算。':own.allIn?'你已全下，等待摊牌。':'等待其他玩家行动。'}</p>}
          </div></div>
        <div className="player-table-actions">{tableActions}</div>
      </PlayerCard>:<div className="spectator-table-actions"><p>{game.phase==='finished'?'本手已结束，可查看结算。':'观战中 · 点击 Agent 光球查看对话'}</p>{tableActions}</div>}
    </section>
    <aside className="table-rail">{game.phase==='finished'&&<FoilPanel className="poker-result"><h3>本手结算</h3><div className="poker-results">{game.players.map((p,i)=><div key={p.playerId}><strong>{p.name}</strong><span>{p.startingChips} → {p.chips}</span><b className={(game.result?.deltas[i]??0)>0?'positive':''}>{(game.result?.deltas[i]??0)>0?'+':''}{game.result?.deltas[i]}</b></div>)}</div>{game.result?.pots.map((pot,i)=><p key={i}>{i===0?'主池':`边池 ${i}`} {pot.amount} · {pot.awards.map(a=>`${game.players[a.seat].name} +${a.amount}`).join('，')}</p>)}<p>在下方「准备下一手」确认玩家后继续。</p><small>筹码留在这张牌桌；下一手为每位 Agent 创建全新会话。</small></FoilPanel>}
      <FoilPanel className="event-card"><div className="event-heading"><h3>牌桌动态</h3><span>第 {game.round} 手</span></div><div className="event-list">{[...game.events].reverse().map(e=><div className="game-event" key={e.seq}><span className="event-time">{new Date(e.time).toLocaleTimeString('zh-CN',{hour12:false})}</span><p>{e.seat!==undefined&&<b>{game.players[e.seat].name} </b>}{e.text}</p>{e.cards&&<span>{e.cards.map(cardLabel).join(' ')}</span>}</div>)}</div></FoilPanel>
      <FoilPanel className="poker-ledger"><h3>本桌买入 / 离桌</h3><p>累计买入 {game.ledger.filter(e=>e.type==='buy-in').reduce((s,e)=>s+e.amount,0)} · 离桌兑现 {game.ledger.filter(e=>e.type==='cash-out').reduce((s,e)=>s+e.amount,0)}</p>{[...game.ledger].reverse().slice(0,12).map((e,i)=><div key={i}><span>{e.name}</span><small>第 {e.round} 手 · {e.type==='buy-in'?'买入':'离桌'}</small><b>{e.amount}</b></div>)}</FoilPanel>
    </aside>
  </div>;
}
