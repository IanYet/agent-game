import {useEffect,useState} from 'react';
import {cardLabel} from '@agent-game/core';
import type {ControlledView,GameUiProps,StoredRun} from '../../runtime/types';
import {playerCardState} from '../../visuals/PlayerCard';
import {StatusTag} from '../../UiBits';
import {FoilPanel} from '../../visuals/FoilPanel';
import {PokerTable} from '../PokerTable';
import {AgentPlayerCard} from '../AgentPlayerCard';
import {HumanPokerPlayerCard} from '../HumanPokerPlayerCard';
import {GameLayout,PlayerCardGrid,SpectatorTableActions} from '../GameLayout';
import {baoCardMarker} from './card-marker';
import {beats,classify,rankName} from './engine';
import type {BaoAction,BaoRole,BaoState,BaoView} from './types';
import './style.css';

const roles:Record<Exclude<BaoRole,null>,string>={emperor:'👑 皇帝',guard:'⚔ 侍卫',solo:'👑 独保',civilian:'♟ 平民'};
const phases={enthrone:'决定皇帝',declare:'全体准备',playing:'行牌',finished:'已结算'};
export function BaoConfigFields({value,onChange}:{value:any;onChange:(value:any)=>void}){
  return <div className="bao-config"><p><b>JJ标准固定保 · 五人四副168张</b><br/>标记大王定皇帝，标记小王定侍卫；明暗保、独保。去3/4/5，无进贡、憋六、造反或烤牌。</p><label>计分底分 <input aria-label="保皇计分底分" type="number" min="1" max="100" step="1" value={value.baseScore??1} onChange={e=>onChange({...value,ruleset:'jj-fixed168',baseScore:Number(e.target.value)})}/></label><small>标准分数乘以此数；同桌下一局继承累计积分。</small></div>;
}
export function BaoTable({state,controller,onError,tableActions}:GameUiProps){
  const game=state.game as ControlledView<BaoView>,[selected,setSelected]=useState<string[]>([]),[hintIndex,setHintIndex]=useState(0);
  const own=game.viewer===null?undefined:game.players[game.viewer],finished=game.phase==='finished';
  const active=(seat:number)=>!finished&&(game.phase==='declare'?!game.ready.includes(seat):game.turn===seat);
  const ownTurn=!!own&&active(own.seat)&&!state.paused;
  const chosen=(own?.hand??[]).filter(c=>selected.includes(c.id)),combination=classify(chosen),canPlay=ownTurn&&game.phase==='playing'&&beats(chosen,game.lastPlay?.cards??null);
  useEffect(()=>{setSelected(old=>old.filter(id=>own?.hand?.some(c=>c.id===id)));setHintIndex(0);},[game.revision,game.id,game.round]);
  useEffect(()=>{setSelected([]);},[game.id,game.round]);
  const act=(a:BaoAction)=>{try{controller.humanAction(a);}catch(e:any){onError(e.message);}};
  const visual=(p:typeof game.players[number])=>playerCardState({active:active(p.seat),paused:state.paused,finished,runtime:state.seats.find(s=>s.playerId===p.playerId)});
  const status=(p:typeof game.players[number])=>p.rank?rankName(p.rank):finished?'未走完':state.paused?'已暂停':game.phase==='declare'&&game.ready.includes(p.seat)?'已确认':active(p.seat)?p.kind==='human'?'轮到你了':state.seats.find(s=>s.playerId===p.playerId)?.message??(game.phase==='declare'?'等待确认':'等待行动'):'等待回合';
  const last=(seat:number)=>{const a=game.lastActions[seat];return a==='pass'?'让过':a?a.label:game.phase==='enthrone'||game.phase==='declare'?game.events.filter(e=>e.seat===seat).at(-1)?.text??'':'';};
  const role=(p:typeof game.players[number])=>p.role?roles[p.role]:'身份未公开';
  const hint=()=>{const choices=game.legalActions.filter(c=>c.action.type==='play');if(!choices.length){onError('没有能逐张压过上家的牌，请让过');return;}setSelected(choices[hintIndex%choices.length].cards!.map(c=>c.id));setHintIndex(i=>i+1);};
  const select=(id:string)=>setSelected(old=>old.includes(id)?old.filter(c=>c!==id):[...old,id]);
  const publicActions=game.players.map(p=>{const a=game.lastActions[p.seat];return a==='pass'?{label:'让过',pass:true}:a?{label:a.label,cards:a.cards.map(card=>({card,marker:baoCardMarker(card)}))}:game.phase==='declare'&&game.ready.includes(p.seat)?{label:'已确认'}:null;});
  const publicRoles=`👑 ${game.players[game.emperor].name} · ${game.guardPublic?(game.guard===game.emperor?'独保':`⚔ ${game.players[game.guard!].name}`):'侍卫身份未公开'} · ${game.open?'明保 ×2':'暗保 ×1'}`;
  const preparation=game.phase==='enthrone'?{title:`${game.players[game.emperor].name}决定皇位`,text:'皇牌可向上家传递，不贴牌；五次让位后原持有人登基。'}:game.phase==='declare'?{title:`全体确认开局 · ${game.ready.length} / 5`,text:'侍卫选择与其他人的准备同时提交，保护暗保身份。'}:undefined;
  return <GameLayout gameId="baohuang" label="山东保皇牌桌" toolbar={<><span>第 <b>{game.round}</b> 局 · JJ标准固定保 · 底分 {game.baseScore}</span><span>{game.phase==='playing'?`第${game.trick}轮 · `:''}{phases[game.phase]} · 逆时针 1 → 5</span></>} score={<FoilPanel className="bao-scores"><h3>本桌积分 <small>累计</small></h3>{game.players.map(p=><div key={p.playerId}><span><b>{p.name}</b><small>{role(p)}</small></span><strong className={p.score>0?'positive':''}>{p.score>0?'+':''}{p.score}</strong></div>)}</FoilPanel>} events={game.events} eventPlayers={game.players} renderEventDetail={event=>event.cards&&<span className="event-card-labels">{event.cards.map(c=>`${cardLabel(c)}${c.mark==='emperor'?'👑':c.mark==='guard'?'⚔':''}`).join(' ')}</span>}>
    <PokerTable players={game.players} actions={publicActions} status={finished?'本局已结束':state.paused?'牌局已暂停':game.phase==='declare'?'等待全体确认':`${game.players[game.turn??game.emperor].name}的回合`} caption={publicRoles} notice={preparation} result={game.result?{title:game.result.winner==='royal'?'保皇派获胜':game.result.winner==='civilian'?'平民获胜':'和局',detail:`${game.result.reason} · ${game.result.solo?(game.result.open?'明独保':'暗独保'):game.result.open?'明保':'暗保'}`,scores:game.players.map(p=>({name:p.name,delta:game.result!.deltas[p.seat],detail:p.rank?rankName(p.rank):`未走（${game.order.length+1}–5名）`}))}:undefined}/>
    <PlayerCardGrid count={own?4:5}>{game.players.filter(p=>p.seat!==game.viewer).map(p=><AgentPlayerCard key={p.playerId} player={p} state={visual(p)} caption={role(p)} status={status(p)} action={last(p.seat)} hand={{count:p.count,cards:p.hand?.map(card=>({card,marker:baoCardMarker(card)}))}}/>)}</PlayerCardGrid>
    {own?<HumanPokerPlayerCard state={visual(own)} aria-label="我的保皇手牌与操作" player={own} badges={<StatusTag>{role(own)}</StatusTag>} hand={(own.hand??[]).map(card=>({card,marker:baoCardMarker(card),selected:selected.includes(card.id),disabled:!ownTurn||game.phase!=='playing',onClick:()=>select(card.id)}))} status={`${status(own)} · 累计 ${own.score}`} actions={<>{ownTurn&&game.phase!=='playing'?<><div className="selection-label">{game.phase==='declare'&&own.hand?.some(c=>c.mark==='guard')?'你持有侍卫牌。明保会公开身份并翻倍；暗保私下辅佐皇帝。':game.phase==='declare'?'你的准备不会宣布自己是否为侍卫。':'登基后由你首引；让位只交出皇牌。'}</div><div className="play-actions">{game.legalActions.map(a=><button key={a.id} className={`button ${a.id==='open'||a.id==='cede'?'outline':'primary'}`} onClick={()=>act(a.action)}>{a.label}</button>)}</div></>:ownTurn&&game.phase==='playing'?<><div className="selection-label">{selected.length?(combination?`${combination.label}${canPlay?' · 可以出牌':' · 不能压过上一手'}`:'选牌须为同点套牌，可挂大小王'):'点击手牌选择；提示可循环合法组合'}</div><div className="play-actions"><button className="button outline" disabled={!game.lastPlay} onClick={()=>act({type:'pass'})}>让过</button><button className="button outline" onClick={hint}>提示</button><button className="button outline" disabled={!selected.length} onClick={()=>setSelected([])}>清空</button><button className="button primary" disabled={!canPlay} onClick={()=>act({type:'play',cards:selected})}>出牌{selected.length?` (${selected.length})`:''}</button></div></>:<div className="selection-label">{finished?'本局已保存，准备下一局后重新洗牌。':state.paused?'继续后恢复当前回合。':'等待其他玩家行动。'}</div>}</>} tableActions={tableActions}/>:<SpectatorTableActions notice="观战中 · 点击 Agent 光球查看对话 · 身份栏按公开信息展示">{tableActions}</SpectatorTableActions>}
  </GameLayout>;
}export function BaoReplay({run}:{run:StoredRun<BaoState>}){return <><p>JJ标准固定保 · {run.state.result?.reason} · 底分 {run.state.baseScore}</p><div className="replay-events">{run.state.events.map(e=><div key={e.seq}><span>{String(e.seq).padStart(2,'0')}</span><p>{e.seat!==undefined&&<b>{run.roster[e.seat].name} </b>}{e.text}{e.cards&&<small>{e.cards.map(c=>`${cardLabel(c)}${c.mark==='emperor'?'👑':c.mark==='guard'?'⚔':''}`).join(' ')}</small>}</p></div>)}</div></>;}
