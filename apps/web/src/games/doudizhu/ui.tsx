import {useEffect,useState} from 'react';
import {ArrowRight,LockKeyhole,Sparkles} from 'lucide-react';
import {cardLabel,type Seat} from '@agent-game/core';
import {beats,classify} from './combinations';
import type {GameView} from './types';
import type {GameUiProps,SeatRuntime,ControlledView} from '../../runtime/types';
import {kindName} from '../../AgentModelFields';
import {FoilPanel} from '../../visuals/FoilPanel';
import {playerCardState} from '../../visuals/PlayerCard';
import {AgentPlayerCard} from '../AgentPlayerCard';
import {HumanPokerPlayerCard} from '../HumanPokerPlayerCard';
import {Avatar,StatusTag} from '../../UiBits';
import {GameLayout,PlayerCardGrid,SpectatorTableActions} from '../GameLayout';
import {PokerTable} from '../PokerTable';
import './style.css';


function playerStatus(player:ControlledView<GameView>['players'][number],runtime:SeatRuntime|undefined,active:boolean,paused:boolean,finished:boolean){
  return finished?'本局已结束':paused?'已暂停':active?player.kind==='human'?'轮到你了':runtime?.message??'等待行动':'等待回合';
}

export function DoudizhuTable({ state, controller, onError, tableActions }: GameUiProps) {
  const game = state.game as ControlledView<GameView>;
  const [selected, setSelected] = useState<string[]>([]);
  const [hintIndex, setHintIndex] = useState(0);
  const human = game.viewer;
  const bottomSeat = human ?? 0;
  const topSeats = [((bottomSeat + 1) % 3) as Seat, ((bottomSeat + 2) % 3) as Seat];
  const hand = game.players[bottomSeat].hand ?? [];
  const ownTurn = !state.paused && game.turn === human && game.phase !== 'finished';
  const chosen = hand.filter(c => selected.includes(c.id));
  const combination = classify(chosen);
  const canPlay = ownTurn && !!combination && beats(combination, game.lastPlay?.combination ?? null);
  const lastAction=(seat:number)=>{
    if(game.phase==='bidding'){const bid=game.bids[seat];return bid===null?'':bid?`叫 ${bid} 分`:'不叫';}
    const action=game.lastActions[seat];
    return action?.type==='pass'?'不出':action?classify(action.cards)?.label??`出 ${action.cards.length} 张`:'';
  };
  useEffect(() => { setSelected([]); setHintIndex(0); }, [game.revision, game.id, game.round]);
  const act = (action: Parameters<typeof controller.humanAction>[0]) => { try { controller.humanAction(action); } catch (error: any) { onError(error.message); } };
  const hint = () => { const choices = game.legalActions.filter(a => a.action.type === 'play'); if (!choices.length) { onError('没有能压过上家的牌，可以选择不出'); return; } setSelected(choices[hintIndex % choices.length].cards.map(c => c.id)); setHintIndex(i => i + 1); };
  const agentCard=(player:typeof game.players[number])=><AgentPlayerCard key={player.playerId} player={player} state={playerCardState({active:game.turn===player.seat,paused:state.paused,finished:game.phase==='finished',runtime:state.seats[player.seat]})} caption={player.role==='landlord'?'地主':player.role==='farmer'?'农民':undefined} status={playerStatus(player,state.seats[player.seat],game.turn===player.seat,state.paused,game.phase==='finished')} action={lastAction(player.seat)} hand={{count:player.count,cards:player.hand?.map(card=>({card}))}}/>;
  const publicActions=game.players.map(player=>game.phase==='bidding'?game.bids[player.seat]===null?null:{label:lastAction(player.seat)}:game.lastActions[player.seat]?{label:lastAction(player.seat),pass:game.lastActions[player.seat]!.type==='pass',cards:game.lastActions[player.seat]!.cards.map(card=>({card}))}:null);
  return <GameLayout gameId="doudizhu" label="斗地主中央牌桌" surfaceClassName="doudizhu-main" toolbar={<><span>第 <b>{game.round.toString().padStart(2, '0')}</b> 局 <i />底分 {game.highBid || '—'} <i />{game.multiplier} 倍</span><span><LockKeyhole size={12} />本机牌桌</span></>} score={<FoilPanel className="score-card"><h3>本桌积分<span>累计</span></h3>{game.players.map(p => <div key={p.seat}><Avatar kind={p.kind} seat={p.seat} /><span>{p.name}<small>{kindName[p.kind]}</small></span><b className={p.score > 0 ? 'positive' : ''}>{p.score > 0 ? '+' : ''}{p.score}</b></div>)}</FoilPanel>} events={game.events} eventPlayers={game.players} renderEventDetail={event=>event.cards&&<span className="event-card-labels">{event.cards.map(cardLabel).join(' ')}</span>}>
    <PokerTable players={game.players} actions={publicActions} status={game.phase==='finished'?'本局已结束':state.paused?'牌局已暂停':`${game.players[game.turn].name}${game.phase==='bidding'?'正在叫分':'的回合'}`} topCards={{label:'底牌',cards:game.bottom.length?game.bottom.map(card=>({card})):[{},{},{}]}} result={game.result?{title:game.result.winner==='landlord'?'地主获胜':'农民获胜',detail:`${game.result.spring?'春天 · ':''}底分 ${game.highBid} × ${game.multiplier} 倍`,scores:game.players.map(p=>({name:p.name,delta:game.result!.deltas[p.seat]})),note:'在下方「准备下一局」确认玩家后继续。'}:undefined}/>
    <PlayerCardGrid count={human===null?3:2} minCardWidth={320} className="doudizhu-player-cards" data-mode={human===null?'spectator':'player'} aria-label="玩家与手牌">{(human===null?game.players:topSeats.map(seat=>game.players[seat])).map(agentCard)}</PlayerCardGrid>
    {human!==null?<HumanPokerPlayerCard state={playerCardState({active:game.turn===bottomSeat,paused:state.paused,finished:game.phase==='finished',runtime:state.seats[bottomSeat]})} aria-label="我的手牌与操作" player={game.players[bottomSeat]} badges={game.players[bottomSeat].role&&<StatusTag tone={game.players[bottomSeat].role==='landlord'?'gold':''}>{game.players[bottomSeat].role==='landlord'?'地主':'农民'}</StatusTag>} hand={hand.map(card=>({card,selected:selected.includes(card.id),disabled:!ownTurn||game.phase!=='playing',onClick:human!==null&&game.phase!=='finished'?()=>setSelected(old=>old.includes(card.id)?old.filter(id=>id!==card.id):[...old,card.id]):undefined}))} status={game.phase==='finished'?'本局已结束':state.paused?'牌局已暂停':ownTurn?game.phase==='bidding'?'轮到你叫分':'轮到你出牌':'等待其他玩家行动'} actions={<>{ownTurn && game.phase === 'bidding' ? <div className="bid-actions">{game.legalActions.map(a => <button className={`button ${a.action.type === 'bid' && a.action.value === 3 ? 'primary' : 'outline'}`} key={a.id} onClick={() => act(a.action)}>{a.label}</button>)}</div> : ownTurn && game.phase === 'playing' ? <><div className="selection-label">{selected.length ? combination ? <><b>{combination.label}</b> · 已选 {selected.length} 张{!canPlay && ' · 需压过上家'}</> : `已选 ${selected.length} 张 · 牌型不成立` : '选择你要出的手牌'}</div><div className="play-actions"><button className="button outline" disabled={!game.legalActions.some(a => a.action.type === 'pass')} onClick={() => act({ type: 'pass' })}>不出</button><button className="button outline" onClick={hint}><Sparkles size={14} />提示</button><button className="button primary" disabled={!canPlay} onClick={() => act({ type: 'play', cards: selected })}>出牌{selected.length > 0 ? ` (${selected.length})` : ''}<ArrowRight size={15} /></button></div></> : <span className="waiting-label">{game.phase === 'finished' ? '对局已保存到本机记录' : state.paused ? '点击继续，回到牌桌' : `${game.players[game.turn].name} 正在${game.phase === 'bidding' ? '叫分' : '行动'}…`}</span>}</>} tableActions={tableActions}/>:<SpectatorTableActions>{tableActions}</SpectatorTableActions>}
  </GameLayout>;
}
