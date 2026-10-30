import type {HoldemView} from './engine';
import {useEffect,useState,type CSSProperties} from 'react';
import {ShieldCheck} from 'lucide-react';
import {cardLabel} from '@agent-game/core';
import type {ControlledView,GameUiProps} from '../../runtime/types';
import type {GameController} from '../../controller';
import {playerCardState} from '../../visuals/PlayerCard';
import {HumanPokerPlayerCard} from '../HumanPokerPlayerCard';
import {AgentPlayerCard} from '../AgentPlayerCard';
import {FoilPanel} from '../../visuals/FoilPanel';
import {PlayingCard,PlayingCardGroup} from '../PlayingCard';
import {GameLayout,GameTable} from '../GameLayout';
import './style.css';

const phases={preflop:'翻牌前',flop:'翻牌',turn:'转牌',river:'河牌',finished:'本手已结算'};
export function HoldemTable({state,controller,onError,tableActions}:GameUiProps){
  const game=state.game as ControlledView<HoldemView>,[raise,setRaise]=useState('');
  const own=game.viewer===null?undefined:game.players[game.viewer];
  const opponents=game.players.filter(p=>p.seat!==game.viewer);
  const cardState=(p:typeof game.players[number])=>playerCardState({active:game.turn===p.seat,paused:state.paused,finished:game.phase==='finished',folded:p.folded,runtime:state.seats.find(s=>s.playerId===p.playerId)});
  const ownTurn=!state.paused&&game.viewer===game.turn&&game.phase!=='finished',betting=game.betting;
  useEffect(()=>{setRaise(betting?String(Math.min(betting.minRaiseTo,betting.maxRaiseTo)):'');},[game.revision,game.handId]);
  const act=(action:Parameters<GameController['humanAction']>[0])=>{try{controller.humanAction(action);}catch(e:any){onError(e.message);}};
  const status=(p:typeof game.players[number])=>game.phase==='finished'?game.result?.ranks[p.seat]?.label??(p.folded?'已弃牌':'未摊牌'):p.folded?'已弃牌':p.allIn?'全下':game.turn===p.seat?state.paused?'已暂停':p.kind==='human'?'轮到你了':state.seats[p.seat]?.message??'等待行动':`本轮下注 ${p.streetBet}`;
  const streetStart=game.events.filter(e=>e.type==='street').at(-1)?.seq??0;
  const lastAction=(seat:number)=>game.events.filter(e=>e.seat===seat&&e.seq>streetStart&&['fold','check','call','raise'].includes(e.type)).at(-1)?.text??(game.players[seat].folded?'弃牌':'');
  const tags=(seat:number)=><span className="position-tags">{game.dealer===seat&&<b title="庄家">D</b>}{game.smallBlindSeat===seat&&<b title="小盲">SB</b>}{game.bigBlindSeat===seat&&<b title="大盲">BB</b>}</span>;
  const validRaise=!!betting&&Number.isInteger(Number(raise))&&Number(raise)>=Math.min(betting.minRaiseTo,betting.maxRaiseTo)&&Number(raise)<=betting.maxRaiseTo;
  const agentCard=(p:typeof game.players[number])=><AgentPlayerCard key={p.playerId} player={p} state={cardState(p)} caption={[game.dealer===p.seat?'庄家':'',game.smallBlindSeat===p.seat?'小盲':'',game.bigBlindSeat===p.seat?'大盲':''].filter(Boolean).join(' · ')} metrics={[{label:'筹码',value:p.chips}]} status={status(p)} action={lastAction(p.seat)} hand={{count:2,cards:p.hand?.map(card=>({card}))}}><p className="agent-player-note">已投入 {p.committed}</p></AgentPlayerCard>;
  return <GameLayout gameId="holdem" label="德州扑克中央牌桌" className="holdem-layout" surfaceClassName="holdem-main" toolbar={<> <span>牌桌 {game.id.slice(0,8)} · 第 {game.round} 手</span><span><ShieldCheck size={12}/>筹码总额 {game.totalChips}</span> </>} score={<FoilPanel className="poker-score"><h3>本桌筹码 <span>第 {game.round} 手</span></h3><div className="poker-score-rows">{game.players.map(p=><div key={p.playerId}><span><strong>{p.name}</strong><small>{game.phase==='finished'?`本手 ${p.startingChips} → ${p.chips}`:`已投入 ${p.committed}`}</small></span><b>{p.chips}</b></div>)}</div>{game.phase==='finished'&&<section className="poker-score-result"><h3>本手结算</h3>{game.players.map(p=><p key={p.playerId}>{p.name}<b className={(game.result?.deltas[p.seat]??0)>0?'positive':''}>{(game.result?.deltas[p.seat]??0)>0?'+':''}{game.result?.deltas[p.seat]}</b></p>)}{game.result?.pots.map((pot,i)=><small key={i}>{i===0?'主池':`边池 ${i}`} {pot.amount} · {pot.awards.map(a=>`${game.players[a.seat].name} +${a.amount}`).join('，')}</small>)}</section>}<details className="poker-ledger"><summary>本桌买入 / 离桌</summary><p>累计买入 {game.ledger.filter(e=>e.type==='buy-in').reduce((s,e)=>s+e.amount,0)} · 离桌兑现 {game.ledger.filter(e=>e.type==='cash-out').reduce((s,e)=>s+e.amount,0)}</p>{[...game.ledger].reverse().map((e,i)=><div key={i}><span>{e.name}</span><small>第 {e.round} 手 · {e.type==='buy-in'?'买入':'离桌'}</small><b>{e.amount}</b></div>)}</details></FoilPanel>} events={game.events} eventPlayers={game.players} renderEventDetail={event=>event.cards&&<span className="event-card-labels">{event.cards.map(cardLabel).join(' ')}</span>}>
      <GameTable className="poker-public-table">
        <div className="poker-felt"><span className="poker-phase">{phases[game.phase]}</span><PlayingCardGroup className="community-cards">{Array.from({length:5},(_,i)=><PlayingCard key={i} card={game.board[i]}/>)}</PlayingCardGroup><div className="pot-amount"><small>{game.phase==='finished'?'本手底池':'底池'}</small><strong>{game.phase==='finished'?game.result?.pots.reduce((s,p)=>s+p.amount,0):game.pot}</strong></div><span className="poker-turn">{game.phase==='finished'?game.result?.winners.map(s=>game.players[s].name).join('、')+' 赢得底池':state.paused?'牌局已暂停':`${game.players[game.turn].name} 的回合`}</span></div>
      </GameTable>
      {own?<div className="holdem-player-area">
        <HumanPokerPlayerCard player={{...own,count:2}} state={cardState(own)} badges={tags(own.seat)} metrics={[{label:'筹码',value:own.chips}]} status={status(own)} hand={(own.hand??[]).map(card=>({card}))} actions={<>{ownTurn&&betting?<div className="poker-controls"><div className="poker-basic-actions">{game.legalActions.filter(a=>a.action.type!=='raise').map(a=><button className={`button ${a.id==='fold'?'outline':'primary'}`} key={a.id} onClick={()=>act(a.action)}>{a.label}</button>)}</div>
              {betting.canRaise&&<div className="poker-raise"><label>本轮下注到<input aria-label="加注到" type="number" min={Math.min(betting.minRaiseTo,betting.maxRaiseTo)} max={betting.maxRaiseTo} step="1" value={raise} onChange={e=>setRaise(e.target.value)}/></label><button className="button outline" disabled={!validRaise} onClick={()=>act({type:'raise',amount:Number(raise)})}>加注至 {raise||'—'}</button><div className="raise-presets">{game.legalActions.filter(a=>a.action.type==='raise').map(a=><button key={a.id} onClick={()=>a.action.type==='raise'&&setRaise(String(a.action.amount))}>{a.label}</button>)}</div><small>{betting.shortAllInOnly?'筹码不足最小加注，只能全下':`最小加注到 ${betting.minRaiseTo}，最多 ${betting.maxRaiseTo}`}</small></div>}
            </div>:<p className="poker-waiting">{game.phase==='finished'?'本手已结束，确认玩家后开始下一手。':state.paused?'游戏已暂停，准备好后继续。':own.folded?'本手已弃牌，等待结算。':own.allIn?'你已全下，等待摊牌。':'等待其他玩家行动。'}</p>}</>} tableActions={tableActions} aria-label="我的底牌与操作"><p className="human-player-note">已投入 {own.committed}</p></HumanPokerPlayerCard>
        <div className="holdem-agent-seats" role="group" aria-label="Agent 玩家，固定八个席位">
          {Array.from({length:8},(_,index)=>opponents[index]?agentCard(opponents[index]):<div key={`empty-${index}`} className="holdem-empty-seat" aria-hidden="true"/>)}
        </div>
      </div>:<>
        <div className="holdem-spectator-seats" role="group" aria-label="Agent 玩家，最多两排，优先排列在下排">
          <div className="holdem-agent-seats" data-mode="spectator" style={{'--holdem-min-columns':Math.ceil(opponents.length/2)} as CSSProperties}>{opponents.map(agentCard)}</div>
        </div>
        <div className="spectator-table-actions"><p>{game.phase==='finished'?'本手已结束，可查看结算。':'观战中 · 点击 Agent 光球查看对话'}</p>{tableActions}</div>
      </>}
    </GameLayout>;
}
