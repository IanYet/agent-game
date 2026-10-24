import {useEffect,useState,type CSSProperties} from 'react';
import type {Card} from '@agent-game/core';
import {cardLabel,SUIT_LABELS} from '@agent-game/core';
import {ArrowRight,Sparkles} from 'lucide-react';
import type {ControlledView,GameUiProps,StoredRun} from '../../runtime/types';
import {PlayerCard,PlayerCardAvatar,playerCardState} from '../../visuals/PlayerCard';
import {FoilPanel} from '../../visuals/FoilPanel';
import {beats,classify} from './combinations';
import {cardsText,isWild,label,teamName} from './cards';
import {HandPanel} from './hand-panel';
import type {Action,GameView,GuandanState} from './types';
import './style.css';

type View=ControlledView<GameView>;
function CardFace({card,level,small=false,selected=false,onClick,disabled=false}:{card:Card;level:number;small?:boolean;selected?:boolean;onClick?:()=>void;disabled?:boolean}){
  const wild=isWild(card,level),red=card.suit==='H'||card.suit==='D'||card.rank===17;
  const cls=`gd-card ${small?'gd-mini':''} ${red?'gd-red':''} ${card.rank===level?'gd-level-card':''} ${selected?'gd-selected':''}`;
  const content=<><b>{label(card.rank)}</b><i>{SUIT_LABELS[card.suit]}</i>{card.rank===level&&<em>{wild?'配':'级'}</em>}<span>{card.rank>14?'★':SUIT_LABELS[card.suit]}</span></>;
  return onClick?<button type="button" className={cls} aria-label={`${cardLabel(card)}${wild?' 逢人配':card.rank===level?' 级牌':''}`} aria-pressed={selected} onClick={onClick} disabled={disabled}>{content}</button>:<span className={cls} aria-label={cardLabel(card)}>{content}</span>;
}
const phaseName={tribute:'进贡',return:'还牌',playing:'出牌',finished:'已结束'};
export function ConfigFields(){return <div className="gd-config"><strong>四人对家 · 常见贡牌版</strong><p>1、3 座同队；2、4 座同队。每人 27 张，红桃级牌逢人配。双方从 2 打起，逐副贡还、升级，过 A 赢一盘。</p><p>A 必须打；本方打 A 时取得头游且搭档非末游才通关。无“三次不过退级”。本盘中途保留座位与玩家，过 A 后可调整阵容。</p><small>顺子五张、三连对三组、钢板两组三张；允许 A2345、AA2233、AAA222。详细贡还与配牌限制见游戏规则。</small></div>;}

export function GuandanTable({state,controller,onError,tableActions}:GameUiProps){
  const game=state.game as View,human=game.viewer,bottom=human??0;
  const [selected,setSelected]=useState<string[]>([]),[declared,setDeclared]=useState(''),[hintIndex,setHintIndex]=useState(0);
  const [handPanelSeat,setHandPanelSeat]=useState<number|null>(null),[handPanelOpen,setHandPanelOpen]=useState(false);
  const own=game.players[bottom],hand=own.hand??[],acting=human!==null&&game.turn===human&&game.phase!=='finished'&&!state.paused;
  const chosen=hand.filter(c=>selected.includes(c.id)),interpretations=classify(chosen,game.level),valid=interpretations.filter(c=>beats(c,game.lastPlay?.combination??null,game.level));
  const combo=interpretations.find(c=>c.key===declared)??valid[0]??interpretations[0];
  const exchangeAction=game.legalActions.find(a=>(a.action.type==='tribute'||a.action.type==='return')&&a.action.card===selected[0]);
  const selectedValid=acting&&(game.phase==='playing'?!!combo&&beats(combo,game.lastPlay?.combination??null,game.level):selected.length===1&&!!exchangeAction);
  useEffect(()=>{setSelected([]);setDeclared('');setHintIndex(0);},[game.revision,game.id,game.round]);
  useEffect(()=>{setHandPanelOpen(false);setHandPanelSeat(null);},[game.id,game.round]);
  const panelPlayer=handPanelSeat===null?null:game.players[handPanelSeat],ownPanel=human!==null&&handPanelSeat===human;
  useEffect(()=>{if(panelPlayer&&!panelPlayer.hand)setHandPanelOpen(false);},[panelPlayer]);
  function openHandPanel(seat:number){setHandPanelSeat(seat);setHandPanelOpen(true);}
  function toggleCard(id:string){setDeclared('');setSelected(old=>game.phase==='playing'?old.includes(id)?old.filter(c=>c!==id):[...old,id]:old.includes(id)?[]:[id]);}
  function act(action:Action){try{controller.humanAction(action);}catch(error){onError((error as Error).message);}}
  function hint(){
    const choices=game.legalActions.filter(a=>a.action.type!=='pass');
    if(!choices.length){onError('没有可压过当前牌型的牌，请选择不出');return;}
    const choice=choices[hintIndex%choices.length];setSelected(choice.cards.map(c=>c.id));setDeclared(choice.combination?.key??'');setHintIndex(i=>i+1);
  }
  const runtime=(p:View['players'][number])=>state.seats.find(s=>s.playerId===p.playerId);
  function identity(p:View['players'][number]){return <div className="gd-identity"><PlayerCardAvatar kind={p.kind} seat={p.seat} showNumber={false}/><div><small>{p.seat+1} 座 · {teamName(p.team)}{p.seat===(bottom+2)%4?' · 对家':''}</small><strong>{p.name}<em>{p.place}</em></strong><span data-player-status>{p.place||(state.paused?'已暂停':game.turn===p.seat?`等待${phaseName[game.phase]}`:'等待回合')}</span></div><b className="gd-count">{p.count}<small>张</small></b></div>;}
  function seatCard(seat:number){
    const p=game.players[seat],spectating=human===null;
    return <PlayerCard key={p.playerId} className={`gd-player gd-team-${p.team} ${spectating?'gd-spectating':''}`} state={playerCardState({active:game.turn===seat&&game.phase!=='finished',paused:state.paused,finished:game.phase==='finished',runtime:runtime(p)})} aria-label={`${p.name} · ${teamName(p.team)} · ${p.count} 张`}>
      {identity(p)}
      {p.hand&&<><div className="gd-visible-hand">{p.hand.map(c=><CardFace key={c.id} card={c} level={game.level} small/>)}</div>{p.hand.length>0&&<button className="gd-browse-hand" onClick={()=>openHandPanel(seat)}>展开手牌 · {p.count} 张 ↗</button>}</>}
      {!p.hand&&<div className="gd-hidden-hand"><span>{p.knownCards.length?`已公开仍持有：${cardsText(p.knownCards)}`:'手牌仅本人可见'}</span></div>}
      {game.lastActions[seat]&&<div className="gd-player-last">{game.lastActions[seat]?.label}</div>}
    </PlayerCard>;
  }
  const displayLevels=game.result?.levelsAfter??game.levels;
  return <div className="table-layout gd-layout"><section className="game-surface gd-surface" data-game-surface="guandan" aria-label="四人对家掼蛋牌桌">
    <div className="table-toolbar"><span>第 {game.matchNumber} 盘 <i/>第 {game.round} 副 <i/> {phaseName[game.phase]}</span><span className="gd-level-pill">{teamName(game.levelTeam)}打 <b>{label(game.level)}</b><i/> ♥{label(game.level)} 逢人配</span></div>
    <div className={`gd-opponents ${human===null?'gd-all-agents':''}`}>{(human===null?[3,2,1,0]:[(bottom+3)%4,(bottom+2)%4,(bottom+1)%4]).map(seatCard)}</div>
    <div className="gd-center" aria-live="polite">
      {game.phase==='finished'&&game.result?<div className="gd-result"><span className="gd-kicker">{game.result.matchWinner!==null?'PASSED A · 本盘完成':'ROUND COMPLETE'}</span><h2>{teamName(game.result.winner)}{game.result.matchWinner!==null?'过 A 获胜':`升 ${game.result.advance} 级`}</h2><p>{game.result.order.map((seat,i)=>`${game.players[seat].name} · ${game.result!.doubleDown&&i>=2?'双下':['头游','二游','三游','末游'][i]}`).join('　')}</p><small>{game.result.matchWinner!==null?'下一副双方从 2 重开，盘分保留。':`下一副打 ${label(displayLevels[game.result.winner])}，按本副名次贡还牌。`}</small></div>:
      game.phase==='tribute'||game.phase==='return'?<div className="gd-tribute-stage"><span className="gd-kicker">EXCHANGE · 公开贡还</span><h2>{game.players[game.turn].name} 正在{phaseName[game.phase]}</h2><p>{game.phase==='tribute'?'选除逢人配外最大的单张；同点可自选花色。':'还一张非级牌的 10 及以下；没有时还除逢人配外最小单张。'}</p><div>{game.tribute?.exchanges.length?game.tribute.exchanges.map(e=><span key={e.from}>{game.players[e.from].name} → {game.players[e.to].name} <b>{cardsText([e.tribute])}</b>{e.returned?` · 还 ${cardsText([e.returned])}`:' · 待还牌'}</span>):game.tribute?.donors.map(seat=><span key={seat}>{game.players[seat].name}：{game.tribute?.offers.find(o=>o.seat===seat)?cardsText([game.tribute.offers.find(o=>o.seat===seat)!.card]):'待选贡牌'}</span>)}</div></div>:
      <><span className="gd-kicker">{game.lastPlay?`${game.players[game.lastPlay.seat].name} 的出牌`:'新一圈 · 自由领出'}</span><h2>{game.lastPlay?.combination.label??`${game.players[game.turn].name} 领出`}</h2><div className="gd-played">{game.lastPlay?.cards.map(c=><CardFace key={c.id} card={c} level={game.level}/>)}</div><p>{state.paused?'牌局已暂停':`${game.players[game.turn].name} 的回合`}{game.passed.length?` · ${game.passed.map(s=>game.players[s].name).join('、')} 不出`:''}</p></>}
    </div>
    {human!==null?<PlayerCard primary className={`gd-own gd-team-${own.team}`} data-player-surface data-cursor-lens="off" aria-label="我的掼蛋手牌与操作" state={playerCardState({active:acting,paused:state.paused,finished:game.phase==='finished',runtime:runtime(own)})}>
      <div className="gd-own-heading">{identity(own)}{hand.length>0&&<button className="button outline gd-open-hand" onClick={()=>openHandPanel(bottom)}>展开手牌 · {hand.length} 张 ↗</button>}</div>
      <div className={`gd-hand ${hand.length?'': 'gd-hand-empty'}`} style={{'--gd-count':Math.max(1,hand.length)} as CSSProperties}>{hand.length?hand.map(c=><CardFace key={c.id} card={c} level={game.level} selected={selected.includes(c.id)} onClick={()=>toggleCard(c.id)} disabled={!acting}/>):<span>{game.phase==='finished'?'手牌已出完，本副已结算。':'手牌已出完，等待本副结算。'}</span>}</div>
      <div className="gd-controls"><div className="gd-selection">{selected.length>0?<><span>已选 {selected.length} 张</span>{game.phase==='playing'?(interpretations.length>1?<select aria-label="声明出牌牌型" value={combo?.key??''} onChange={e=>setDeclared(e.target.value)}>{interpretations.map(c=><option key={c.key} value={c.key}>{c.label}{beats(c,game.lastPlay?.combination??null,game.level)?'':' · 不能压牌'}</option>)}</select>:<b>{combo?.label??'牌型不成立'}</b>):<b>{exchangeAction?.label??'不是可选的贡还牌'}</b>}</>:<span>{game.phase==='finished'?'本副已保存到已完成记录':acting?game.phase==='playing'?'点击手牌选中，再声明牌型':'选择一张符合要求的牌':state.paused?'继续游戏后行动':`${game.players[game.turn].name} 正在${phaseName[game.phase]}`}</span>}</div>
        <div className="gd-play-actions"><button className="button outline" disabled={!acting} onClick={hint}><Sparkles size={13}/>提示</button>{game.phase==='playing'&&<button className="button outline" disabled={!acting||!game.lastPlay} onClick={()=>act({type:'pass'})}>不出</button>}<button className="button primary" disabled={!selectedValid} onClick={()=>{if(game.phase==='playing'&&combo)act({type:'play',cards:selected,combination:combo.key});else if(exchangeAction)act(exchangeAction.action);}}>{game.phase==='tribute'?'进贡':game.phase==='return'?'还牌':'出牌'}<ArrowRight size={14}/></button></div>
      </div><div className="gd-table-actions">{tableActions}</div>
    </PlayerCard>:<div className="spectator-table-actions"><p>全 Agent 观战 · 点击光球查看对话</p>{tableActions}</div>}
  </section><aside className="table-rail"><FoilPanel className="gd-score"><h3>队伍升级 <small>第 {game.matchNumber} 盘</small></h3>{([0,1] as const).map(t=><div className={`gd-score-team gd-team-${t}`} key={t}><span>{teamName(t)}<small>{game.players.filter(p=>p.team===t).map(p=>p.name).join(' / ')}</small></span><b>{label(displayLevels[t])}</b></div>)}<p>本桌盘分 <b>{game.matchWins.join(' : ')}</b></p><small>头游 + 对家二 / 三 / 末游<br/>分别升 3 / 2 / 1 级</small></FoilPanel>
    <FoilPanel className="event-card gd-events"><div className="event-heading"><h3>公开动态</h3><span>完整记录 {game.events.length}</span></div><div className="event-list">{[...game.events].reverse().slice(0,45).map(e=><div className={`game-event ${e.type==='finish'?'finish-event':''}`} key={e.seq}><span className="event-time">#{e.seq}</span><p>{e.seat!==undefined&&<b>{game.players[e.seat].name} </b>}{e.text}</p>{e.cards&&<span className="event-card-labels">{cardsText(e.cards)}</span>}</div>)}</div></FoilPanel>
  </aside><HandPanel open={handPanelOpen&&!!panelPlayer?.hand} title={`${panelPlayer?.name??''}的手牌`} subtitle={`${panelPlayer?.seat===undefined?'':`${panelPlayer.seat+1} 座 · ${teamName(panelPlayer.team)} · `}共 ${panelPlayer?.count??0} 张 · 本副打 ${label(game.level)} · ♥${label(game.level)} 逢人配`} state={playerCardState({active:ownPanel&&acting,paused:state.paused,finished:game.phase==='finished',runtime:panelPlayer?runtime(panelPlayer):undefined})} onClose={()=>setHandPanelOpen(false)} onClear={ownPanel?()=>{setSelected([]);setDeclared('');}:undefined} canClear={selected.length>0&&acting} summary={ownPanel?<><span>已选 {selected.length} 张</span><b>{selected.length?game.phase==='playing'?combo?.label??'牌型不成立':exchangeAction?.label??'不是可选的贡还牌':acting?'选择后回到主卡确认行动':state.paused?'已暂停，可浏览手牌':'当前未轮到你，可浏览手牌'}</b></>:<span>查看牌桌已允许展示的手牌</span>}>
    {ready=><div className="gd-hand-grid">{panelPlayer?.hand?.map(c=><CardFace key={c.id} card={c} level={game.level} selected={ownPanel&&selected.includes(c.id)} onClick={ownPanel?()=>toggleCard(c.id):undefined} disabled={!ready||!acting}/>)}</div>}
  </HandPanel></div>;
}

export function Replay({run}:{run:StoredRun<GuandanState>}){
  const s=run.state;return <div className="gd-replay"><p>第 {s.matchNumber} 盘 · 打 {label(s.level)} · 1、3 座一队，2、4 座二队。下列为本副从发牌开始的完整公开记录。</p><div className="replay-events">{s.events.map(e=><div key={e.seq}><span>{String(e.seq).padStart(2,'0')}</span><p>{e.seat!==undefined&&<b>{run.roster[e.seat].name} </b>}{e.text}{e.cards&&<small>{cardsText(e.cards)}</small>}</p></div>)}</div></div>;
}
