import {useEffect,useState} from 'react';
import {cardLabel,rankLabel,SUIT_LABELS} from '@agent-game/core';
import type {ControlledView,GameUiProps,StoredRun} from '../../runtime/types';
import {PlayerCard,PlayerCardAvatar,playerCardState} from '../../visuals/PlayerCard';
import {FoilPanel} from '../../visuals/FoilPanel';
import {beats,classify,rankName} from './engine';
import type {BaoAction,BaoCard,BaoRole,BaoState,BaoView} from './types';
import './style.css';

const roles:Record<Exclude<BaoRole,null>,string>={emperor:'👑 皇帝',guard:'⚔ 侍卫',solo:'👑 独保',civilian:'♟ 平民'};
const phases={enthrone:'决定皇帝',declare:'全体准备',playing:'行牌',finished:'已结算'};
export function BaoPlayingCard({card,selected=false,onClick,disabled=false,small=false}:{card:BaoCard;selected?:boolean;onClick?:()=>void;disabled?:boolean;small?:boolean}){
  const label=`${cardLabel(card)}${card.mark==='emperor'?' · 皇牌':card.mark==='guard'?' · 侍卫牌':''}`;
  const content=<><b>{card.rank>=16?(card.rank===17?'大王':'小王'):rankLabel(card.rank)}</b><span>{card.mark==='emperor'?'👑':card.mark==='guard'?'⚔':SUIT_LABELS[card.suit]}</span></>;
  const cls=`bao-card ${small?'bao-card-small':''} ${['H','D'].includes(card.suit)||card.rank===17?'bao-red':''} ${card.mark?'bao-marked':''} ${selected?'bao-selected':''}`;
  return onClick?<button className={cls} title={label} aria-label={label} aria-pressed={selected} disabled={disabled} onClick={onClick}>{content}</button>:<span className={cls} title={label} aria-label={label}>{content}</span>;
}
export function BaoConfigFields({value,onChange}:{value:any;onChange:(value:any)=>void}){
  return <div className="bao-config"><p><b>JJ标准固定保 · 五人四副168张</b><br/>标记大王定皇帝，标记小王定侍卫；明暗保、独保。去3/4/5，无进贡、憋六、造反或烤牌。</p><label>计分底分 <input aria-label="保皇计分底分" type="number" min="1" max="100" step="1" value={value.baseScore??1} onChange={e=>onChange({...value,ruleset:'jj-fixed168',baseScore:Number(e.target.value)})}/></label><small>标准分数乘以此数；同桌下一局继承累计积分。</small></div>;
}
export function BaoTable({state,controller,onError,tableActions}:GameUiProps){
  const game=state.game as ControlledView<BaoView>,[selected,setSelected]=useState<string[]>([]),[hintIndex,setHintIndex]=useState(0);
  const own=game.viewer===null?undefined:game.players[game.viewer],finished=game.phase==='finished';
  const active=(seat:number)=>!finished&&(game.phase==='declare'?!game.ready.includes(seat):game.turn===seat);
  const ownTurn=!!own&&active(own.seat)&&!state.paused;
  const chosen=(own?.hand??[]).filter(c=>selected.includes(c.id)),combination=classify(chosen),canPlay=ownTurn&&game.phase==='playing'&&beats(chosen,game.lastPlay?.cards??null);
  useEffect(()=>{setSelected([]);setHintIndex(0);},[game.revision,game.id,game.round]);
  const act=(a:BaoAction)=>{try{controller.humanAction(a);}catch(e:any){onError(e.message);}};
  const visual=(p:typeof game.players[number])=>playerCardState({active:active(p.seat),paused:state.paused,finished,runtime:state.seats.find(s=>s.playerId===p.playerId)});
  const status=(p:typeof game.players[number])=>p.rank?rankName(p.rank):finished?'未走完':game.phase==='declare'?(game.ready.includes(p.seat)?'已确认':'等待确认'):active(p.seat)?state.paused?'已暂停':p.kind==='human'?'轮到你了':state.seats.find(s=>s.playerId===p.playerId)?.message??'等待行动':'等待回合';
  const last=(seat:number)=>{const a=game.lastActions[seat];return a==='pass'?'让过':a?a.label:'—';};
  const role=(p:typeof game.players[number])=>p.role?roles[p.role]:'身份未公开';
  const hint=()=>{const choices=game.legalActions.filter(c=>c.action.type==='play');if(!choices.length){onError('没有能逐张压过上家的牌，请让过');return;}setSelected(choices[hintIndex%choices.length].cards!.map(c=>c.id));setHintIndex(i=>i+1);};
  return <div className="table-layout bao-layout"><section className="game-surface bao-main" data-game-surface="baohuang" aria-label="山东保皇牌桌">
    <div className="table-toolbar"><span>第 <b>{game.round}</b> 局 · JJ标准固定保 · 底分 {game.baseScore}</span><span>{game.phase==='playing'?`第${game.trick}轮 · `:''}{phases[game.phase]} · 逆时针 1 → 5</span></div>
    <div className="bao-seats" data-count={own?4:5}>{game.players.filter(p=>p.seat!==game.viewer).map(p=><PlayerCard key={p.playerId} state={visual(p)} className="bao-seat" aria-label={`${p.name}的玩家卡`}>
      <div className="bao-player-top"><PlayerCardAvatar kind={p.kind} seat={p.seat} showNumber={false}/><div><small>SEAT {String(p.seat+1).padStart(2,'0')}</small><strong title={p.name}>{p.name}</strong></div><b className="bao-count">{p.count}<small>张</small></b></div>
      <div className={`bao-role ${p.role==='emperor'||p.role==='solo'?'bao-royal':''}`}>{role(p)}</div><p data-player-status>{status(p)}</p>
      {p.hand&&<div className="bao-mini-hand" aria-label={`${p.name}的观战手牌`}>{p.hand.map(c=><BaoPlayingCard key={c.id} card={c} small/>)}</div>}
      <div className="bao-seat-last">{last(p.seat)}</div>
    </PlayerCard>)}</div>
    <div className="bao-arena"><div className="bao-court-mark" aria-hidden="true">♛</div><span className="identity-caption">THE CROWN & THE SECRET.</span>
      <h2>{finished?(game.result?.winner==='royal'?'保皇派获胜':game.result?.winner==='civilian'?'平民获胜':'和局'):state.paused?'牌局已暂停':game.phase==='enthrone'?`${game.players[game.emperor].name}决定皇位`:game.phase==='declare'?'全体同时确认开局':`${game.players[game.turn!].name}${game.lastPlay?'跟牌':'领牌'}`}</h2>
      <p className="bao-public-status">👑 {game.players[game.emperor].name} · {game.guardPublic?(game.guard===game.emperor?'独保':`⚔ ${game.players[game.guard!].name}`):'侍卫身份未公开'} · {game.open?'明保 ×2':'暗保 ×1'}</p>
      {game.lastPlay?<div className="bao-last-play"><small>{game.players[game.lastPlay.seat].name} · {game.lastPlay.label}</small><div>{game.lastPlay.cards.map(c=><BaoPlayingCard key={c.id} card={c}/>)}</div></div>:<p className="bao-arena-help">{game.phase==='enthrone'?'皇牌可向上家传递，不贴牌；五次让位后原持有人登基。':game.phase==='declare'?`已确认 ${game.ready.length} / 5 · 侍卫选择与其他人的准备同时提交，保护暗保身份。`:'领牌可出任意套牌 · 跟牌同张数且逐张严格变大'}</p>}
      <div className="bao-ranking">{game.order.length?game.order.map((at,i)=><span key={at}><b>{rankName(i+1)}</b> {game.players[at].name}</span>):<span>尚无玩家走完</span>}</div>
      {finished&&<div className="bao-result"><p>{game.result?.reason} · {game.result?.solo?(game.result.open?'明独保':'暗独保'):game.result?.open?'明保':'暗保'}</p><div>{game.players.map(p=><span key={p.playerId}>{p.name}<b className={(game.result?.deltas[p.seat]??0)>0?'positive':''}>{(game.result?.deltas[p.seat]??0)>0?'+':''}{game.result?.deltas[p.seat]}</b><small>{p.rank?rankName(p.rank):`未走（${game.order.length+1}–5名）`}</small></span>)}</div></div>}
    </div>
    {own?<PlayerCard state={visual(own)} primary className="bao-own" data-player-surface data-cursor-lens="off" aria-label="我的保皇手牌与操作">
      <div className="bao-own-heading"><PlayerCardAvatar kind={own.kind} seat={own.seat}/><strong>{own.name}</strong><span className="bao-role">{role(own)}</span><span>{own.count}张 · 累计 {own.score}</span><small data-player-status>{status(own)}</small></div>
      <div className="bao-hand" aria-label="我的手牌">{own.hand?.map(c=><BaoPlayingCard key={c.id} card={c} selected={selected.includes(c.id)} disabled={!ownTurn||game.phase!=='playing'} onClick={()=>setSelected(old=>old.includes(c.id)?old.filter(id=>id!==c.id):[...old,c.id])}/>)}</div>
      <div className="bao-controls">{ownTurn&&game.phase!=='playing'?<><p>{game.phase==='declare'&&own.hand?.some(c=>c.mark==='guard')?'你持有侍卫牌。明保会公开身份并翻倍；暗保私下辅佐皇帝。':game.phase==='declare'?'你的准备不会宣布自己是否为侍卫。':'登基后由你首引；让位只交出皇牌。'}</p><div>{game.legalActions.map(a=><button key={a.id} className={`button ${a.id==='open'||a.id==='cede'?'outline':'primary'}`} onClick={()=>act(a.action)}>{a.label}</button>)}</div></>:ownTurn&&game.phase==='playing'?<><p>{selected.length?(combination?`${combination.label}${canPlay?' · 可以出牌':' · 不能压过上一手'}`:'选牌须为同点套牌，可挂大小王'):'点击手牌选择；提示可循环合法组合'}</p><div><button className="button outline" disabled={!game.lastPlay} onClick={()=>act({type:'pass'})}>让过</button><button className="button outline" onClick={hint}>提示</button><button className="button outline" disabled={!selected.length} onClick={()=>setSelected([])}>清空</button><button className="button primary" disabled={!canPlay} onClick={()=>act({type:'play',cards:selected})}>出牌{selected.length?` (${selected.length})`:''}</button></div></>:<p>{finished?'本局已保存，准备下一局后重新洗牌。':state.paused?'继续后恢复当前回合。':'等待其他玩家行动。'}</p>}</div><div className="player-table-actions">{tableActions}</div>
    </PlayerCard>:<div className="spectator-table-actions"><p>观战 · 点击 Agent 光球查看对话 · 身份栏按公开信息展示</p>{tableActions}</div>}
  </section><aside className="table-rail"><FoilPanel className="bao-scores"><h3>本桌积分 <small>累计</small></h3>{game.players.map(p=><div key={p.playerId}><span><b>{p.name}</b><small>{role(p)}</small></span><strong className={p.score>0?'positive':''}>{p.score>0?'+':''}{p.score}</strong></div>)}</FoilPanel><FoilPanel className="event-card"><div className="event-heading"><h3>牌桌动态</h3><span>{game.events.length} 条</span></div><div className="event-list">{game.events.slice(-35).reverse().map(e=><div className="game-event" key={e.seq}><span className="event-time">{e.seq.toString().padStart(2,'0')}</span><p>{e.seat!==undefined&&<b>{game.players[e.seat].name} </b>}{e.text}</p>{e.cards&&<small>{e.cards.map(c=>`${cardLabel(c)}${c.mark==='emperor'?'👑':c.mark==='guard'?'⚔':''}`).join(' ')}</small>}</div>)}</div></FoilPanel></aside></div>;
}
export function BaoReplay({run}:{run:StoredRun<BaoState>}){return <><p>JJ标准固定保 · {run.state.result?.reason} · 底分 {run.state.baseScore}</p><div className="replay-events">{run.state.events.map(e=><div key={e.seq}><span>{String(e.seq).padStart(2,'0')}</span><p>{e.seat!==undefined&&<b>{run.roster[e.seat].name} </b>}{e.text}{e.cards&&<small>{e.cards.map(c=>`${cardLabel(c)}${c.mark==='emperor'?'👑':c.mark==='guard'?'⚔':''}`).join(' ')}</small>}</p></div>)}</div></>;}
