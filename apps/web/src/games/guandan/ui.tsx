import {useEffect,useState} from 'react';
import {SvgIcon} from '../../visuals/SvgIcon';
import type {Card} from '@agent-game/core';
import {ArrowRight,Sparkles} from 'lucide-react';
import type {ControlledView,GameUiProps,StoredRun} from '../../runtime/types';
import {playerCardState} from '../../visuals/PlayerCard';
import {StatusTag} from '../../UiBits';
import {FoilPanel} from '../../visuals/FoilPanel';

import {AgentPlayerCard} from '../AgentPlayerCard';
import {HumanPokerPlayerCard} from '../HumanPokerPlayerCard';
import {GameLayout,PlayerCardGrid,SpectatorTableActions} from '../GameLayout';
import {PokerTable} from '../PokerTable';
import {beats,classify,declaration} from './combinations';
import {cardsText,isWild,label,teamName} from './cards';
import type {Action,GameView,GuandanState} from './types';
import './style.css';

type View=ControlledView<GameView>;
function guandanCardMarker(card:Card,level:number){
  const wild=isWild(card,level);
  return card.rank===level?{symbol:wild?'配':'级',label:wild?'逢人配':'级牌'}:undefined;
}
const phaseName={tribute:'进贡',return:'还牌',playing:'出牌',finished:'已结束'};
export function ConfigFields(){return <div className="gd-config"><strong>四人对家 · 常见贡牌版</strong><p>1、3 座同队；2、4 座同队。每人 27 张，红桃级牌逢人配。双方从 2 打起，逐副贡还、升级，过 A 赢一盘。</p><p>A 必须打；本方打 A 时取得头游且搭档非末游才通关。无“三次不过退级”。本盘中途保留座位与玩家，过 A 后可调整阵容。</p><small>顺子五张、三连对三组、钢板两组三张；允许 A2345、AA2233、AAA222。详细贡还与配牌限制见游戏规则。</small></div>;}

export function GuandanTable({state,controller,onError,tableActions}:GameUiProps){
  const game=state.game as View,human=game.viewer,bottom=human??0;
  const [selected,setSelected]=useState<string[]>([]),[declared,setDeclared]=useState(''),[hintIndex,setHintIndex]=useState(0);
  const own=game.players[bottom],hand=own.hand??[],acting=human!==null&&game.turn===human&&game.phase!=='finished'&&!state.paused;
  const chosen=hand.filter(c=>selected.includes(c.id)),interpretations=classify(chosen,game.level),valid=interpretations.filter(c=>beats(c,game.lastPlay?.combination??null,game.level));
  const combo=interpretations.find(c=>c.key===declared)??valid[0]??interpretations[0];
  const exchangeAction=game.legalActions.find(a=>(a.action.type==='tribute'||a.action.type==='return')&&a.action.card===selected[0]);
  const selectedValid=acting&&(game.phase==='playing'?!!combo&&beats(combo,game.lastPlay?.combination??null,game.level):selected.length===1&&!!exchangeAction);
  useEffect(()=>{setSelected([]);setDeclared('');setHintIndex(0);},[game.revision,game.id,game.round]);
  function toggleCard(id:string){setDeclared('');setSelected(old=>game.phase==='playing'?old.includes(id)?old.filter(c=>c!==id):[...old,id]:old.includes(id)?[]:[id]);}
  function act(action:Action){try{controller.humanAction(action);}catch(error){onError((error as Error).message);}}
  function hint(){
    const choices=game.legalActions.filter(a=>a.action.type!=='pass');
    if(!choices.length){onError('没有可压过当前牌型的牌，请选择不出');return;}
    const choice=choices[hintIndex%choices.length];setSelected(choice.cards.map(c=>c.id));setDeclared(choice.combination?.key??'');setHintIndex(i=>i+1);
  }
  const runtime=(p:View['players'][number])=>state.seats.find(s=>s.playerId===p.playerId);
  const status=(p:View['players'][number])=>p.place||(state.paused?'已暂停':game.turn===p.seat?runtime(p)?.message??`正在${phaseName[game.phase]}`:'等待回合');
  function seatCard(seat:number){
    const p=game.players[seat],exchange=game.phase==='tribute'||game.phase==='return';
    const action=exchange?game.events.filter(e=>e.seat===seat&&e.type===game.phase).at(-1)?.text??'':game.lastActions[seat]?.label??'';
    return <AgentPlayerCard key={p.playerId} player={p} state={playerCardState({active:game.turn===seat&&game.phase!=='finished',paused:state.paused,finished:game.phase==='finished',runtime:runtime(p)})} caption={`${teamName(p.team)}${p.seat===(bottom+2)%4?' · 对家':''}${p.place?` · ${p.place}`:''}`} status={status(p)} action={action} hand={{count:p.count,cards:p.hand?.map(card=>({card,marker:guandanCardMarker(card,game.level)})),note:!p.hand&&p.knownCards.length?`已公开仍持有：${cardsText(p.knownCards)}`:undefined}}/>;
  }
  const displayLevels=game.result?.levelsAfter??game.levels;
  const publicActions=game.players.map(p=>{const a=game.lastActions[p.seat];if(game.phase==='tribute'||game.phase==='return'){const e=game.events.filter(e=>e.seat===p.seat&&e.type===game.phase).at(-1);return e?{label:phaseName[game.phase],cards:e.cards?.map(card=>({card,marker:guandanCardMarker(card,game.level)}))}:null;}return a?{label:a.label,pass:a.type==='pass',cards:a.cards.map(card=>({card,marker:guandanCardMarker(card,game.level)}))}:null;});
  const exchangeNotice=game.phase==='tribute'||game.phase==='return'?{title:`${game.players[game.turn].name}正在${phaseName[game.phase]}`,text:game.phase==='tribute'?'选除逢人配外最大的单张；同点可自选花色。':'还一张非级牌的 10 及以下；没有时还除逢人配外最小单张。',lines:game.tribute?.exchanges.map(e=>`${game.players[e.from].name} → ${game.players[e.to].name} · ${cardsText([e.tribute])}${e.returned?` · 还 ${cardsText([e.returned])}`:' · 待还牌'}`)}:undefined;
  return <GameLayout gameId="guandan" label="四人对家掼蛋牌桌" toolbar={<><span>第 {game.matchNumber} 盘 <i/>第 {game.round} 副 <i/> {phaseName[game.phase]}</span><span className="gd-level-pill">{teamName(game.levelTeam)}打 <b>{label(game.level)}</b><i/> <SvgIcon name="heart"/>{label(game.level)} 逢人配</span></>} score={<FoilPanel className="gd-score"><h3>队伍升级 <small>第 {game.matchNumber} 盘</small></h3>{([0,1] as const).map(t=><div className={`gd-score-team gd-team-${t}`} key={t}><span>{teamName(t)}<small>{game.players.filter(p=>p.team===t).map(p=>p.name).join(' / ')}</small></span><b>{label(displayLevels[t])}</b></div>)}<p>本桌盘分 <b>{game.matchWins.join(' : ')}</b></p><small>头游 + 对家二 / 三 / 末游<br/>分别升 3 / 2 / 1 级</small></FoilPanel>} events={game.events} eventPlayers={game.players} activityTitle="公开动态" renderEventDetail={event=>event.cards&&<span className="event-card-labels">{cardsText(event.cards)}</span>}>
    <PokerTable players={game.players} actions={publicActions} status={game.phase==='finished'?'本副已结束':state.paused?'牌局已暂停':`${game.players[game.turn].name}的回合`} notice={exchangeNotice} result={game.result?{title:`${teamName(game.result.winner)}${game.result.matchWinner!==null?'过 A 获胜':`升 ${game.result.advance} 级`}`,detail:game.result.order.map((seat,i)=>`${game.players[seat].name} · ${game.result!.doubleDown&&i>=2?'双下':['头游','二游','三游','末游'][i]}`).join('　'),note:game.result.matchWinner!==null?'下一副双方从 2 重开，盘分保留。':`下一副打 ${label(displayLevels[game.result.winner])}，按本副名次贡还牌。`}:undefined}/>
    <PlayerCardGrid count={human===null?4:3} columns={human===null?4:3} className="gd-agent-player-cards">{(human===null?[3,2,1,0]:[(bottom+3)%4,(bottom+2)%4,(bottom+1)%4]).map(seatCard)}</PlayerCardGrid>
    {human!==null?<HumanPokerPlayerCard state={playerCardState({active:acting,paused:state.paused,finished:game.phase==='finished',runtime:runtime(own)})} aria-label="我的掼蛋手牌与操作" player={own} badges={<StatusTag>{teamName(own.team)}{own.place?` · ${own.place}`:''}</StatusTag>} hand={hand.map(card=>({card,marker:guandanCardMarker(card,game.level),selected:selected.includes(card.id),disabled:!acting,onClick:()=>toggleCard(card.id)}))} status={game.phase==='finished'?'本副已结束':state.paused?'牌局已暂停':acting?`轮到你${phaseName[game.phase]}`:`等待 ${game.players[game.turn].name}${phaseName[game.phase]}`} emptyHand={game.phase==='finished'?'手牌已出完，本副已结算。':'手牌已出完，等待本副结算。'} actions={<><div className="selection-label">{selected.length>0?<><span>已选 {selected.length} 张</span>{game.phase==='playing'?(interpretations.length>1?<select className="poker-combination-select" aria-label="声明出牌牌型" value={combo?.key??''} onChange={e=>setDeclared(e.target.value)}>{interpretations.map(c=><option key={c.key} value={c.key}>{c.label}{beats(c,game.lastPlay?.combination??null,game.level)?'':' · 不能压牌'}</option>)}</select>:<b>{combo?.label??'牌型不成立'}</b>):<b>{exchangeAction?.label??'不是可选的贡还牌'}</b>}</>:<span>{game.phase==='finished'?'本副已保存到已完成记录':acting?game.phase==='playing'?'点击手牌选中，再声明牌型':'选择一张符合要求的牌':state.paused?'继续游戏后行动':`${game.players[game.turn].name} 正在${phaseName[game.phase]}`}</span>}</div>
        <div className="play-actions"><button className="text-button" disabled={!acting||!selected.length} onClick={()=>{setSelected([]);setDeclared('');}}>清空</button><button className="button outline" disabled={!acting} onClick={hint}><Sparkles size={13}/>提示</button>{game.phase==='playing'&&<button className="button outline" disabled={!acting||!game.lastPlay} onClick={()=>act({type:'pass'})}>不出</button>}<button className="button primary" disabled={!selectedValid} onClick={()=>{if(game.phase==='playing'&&combo)act({type:'play',cards:selected,combination:declaration(combo)});else if(exchangeAction)act(exchangeAction.action);}}>{game.phase==='tribute'?'进贡':game.phase==='return'?'还牌':'出牌'}<ArrowRight size={14}/></button></div>
      </>} tableActions={tableActions}/>:<SpectatorTableActions>{tableActions}</SpectatorTableActions>}
  </GameLayout>;
}
export function Replay({run}:{run:StoredRun<GuandanState>}){
  const s=run.state;return <div className="gd-replay"><p>第 {s.matchNumber} 盘 · 打 {label(s.level)} · 1、3 座一队，2、4 座二队。下列为本副从发牌开始的完整公开记录。</p><div className="replay-events">{s.events.map(e=><div key={e.seq}><span>{String(e.seq).padStart(2,'0')}</span><p>{e.seat!==undefined&&<b>{run.roster[e.seat].name} </b>}{e.text}{e.cards&&<small>{cardsText(e.cards)}</small>}</p></div>)}</div></div>;
}
