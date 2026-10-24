import {useEffect,useRef,useState} from 'react';
import type {ControlledView,GameUiProps,StoredRun} from '../../runtime/types';
import {PlayerCard,PlayerCardAvatar,playerCardState} from '../../visuals/PlayerCard';
import {FoilPanel} from '../../visuals/FoilPanel';
import {Modal} from '../../Modal';
import {useEffectsPreference} from '../../visuals/preferences';
import {COLORS,ROLES,cardName,district,roleName,type Color,type District} from './cards';
import type {Action,CitadelsState,CitadelsView} from './engine';
import './style.css';

const PHASES={draft:'秘密选角',income:'先领取收入',keep:'选择保留建筑',main:'建造与使用技能',graveyard:'墓地收回',finished:'本局结算'};
function Building({card,selected,onClick,compact=false}:{card:District;selected?:boolean;onClick?:()=>void;compact?:boolean}){
  const d=district(card),body=<><span className="ct-building-top"><small>{COLORS[d.color]}</small><b>{d.cost}<i>金</i></b></span><strong>{d.name}</strong>{!compact&&<span className="ct-building-art" aria-hidden="true">{d.color==='yellow'?'♜':d.color==='blue'?'♱':d.color==='green'?'⚖':d.color==='red'?'⚔':'✧'}</span>}{!compact&&<small className="ct-building-text">{d.text??`${COLORS[d.color]}建筑 · 终局 ${d.cost} 分`}</small>}</>;
  const props={className:`ct-building ${compact?'ct-compact':''} ${selected?'ct-selected':''}`,'data-color':d.color,title:`${d.name} · ${d.cost} 金币${d.text?` · ${d.text}`:''}`};
  return onClick?<button {...props} aria-pressed={selected} onClick={onClick}>{body}</button>:<div {...props}>{body}</div>;
}
function City({cards}:{cards:District[]}){return <div className="ct-city">{cards.length?cards.map(c=><Building key={c.id} card={c} compact/>):<span className="ct-empty">城区尚待奠基</span>}</div>;}
function Results({game}:{game:Pick<CitadelsView,'scores'|'winners'>&{players:Array<{name:string}>}}){return <FoilPanel className="ct-results"><span className="identity-caption">MASTER BUILDERS.</span><h3>{game.winners.map(i=>game.players[i].name).join('、')}{game.winners.length>1?' 共享胜利':' 获胜'}</h3><table><thead><tr><th>玩家</th><th>建筑</th><th>五色</th><th>完工</th><th>特殊</th><th>总分</th></tr></thead><tbody>{game.scores?.map(s=><tr key={s.seat}><th>{game.players[s.seat].name}</th><td>{s.districts}</td><td>{s.colors}</td><td>{s.completion}</td><td>{s.special}</td><td><b>{s.total}</b></td></tr>)}</tbody></table><p>同分比较建筑费用，再比较金币；仍相同则共享胜利。</p></FoilPanel>;}
export function Table({state,controller,onError,tableActions}:GameUiProps){
  const game=state.game as ControlledView<CitadelsView>,own=game.viewer===null?undefined:game.players[game.viewer];
  const [selected,setSelected]=useState<string[]>([]),[draftRole,setDraftRole]=useState<number|null>(null);
  const effects=useEffectsPreference(),[inventory,setInventory]=useState<{seat:number;zone:'hand'|'city'}|null>(null),[closing,setClosing]=useState(false),[filter,setFilter]=useState<Color|'all'>('all'),[inventoryNote,setInventoryNote]=useState('');
  const closeTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const inventoryEntry=useRef<HTMLButtonElement|null>(null);
  useEffect(()=>()=>clearTimeout(closeTimer.current),[]);
  useEffect(()=>{if(!inventory){const frame=requestAnimationFrame(()=>{if(inventoryEntry.current?.isConnected)inventoryEntry.current.focus({preventScroll:true});});return()=>cancelAnimationFrame(frame);}},[inventory]);
  useEffect(()=>{clearTimeout(closeTimer.current);setInventory(null);setClosing(false);},[game.id]);
  const openInventory=(seat:number,zone:'hand'|'city',entry:HTMLButtonElement)=>{inventoryEntry.current=entry;clearTimeout(closeTimer.current);setClosing(false);setFilter('all');setInventoryNote('');setInventory({seat,zone});};
  const closeInventory=()=>{if(closing)return;if(effects.reduced){setInventory(null);return;}setClosing(true);closeTimer.current=setTimeout(()=>{setInventory(null);setClosing(false);},180);};
  useEffect(()=>{setSelected([]);setDraftRole(null);},[game.revision,game.id]);
  const active=!state.paused&&game.phase!=='finished'&&game.turn===game.viewer;
  const act=(a:Action)=>{try{controller.humanAction(a);setInventoryNote(a.type==='build'?'建筑已加入城区，金币与剩余手牌已更新。':a.type==='magic_cycle'?'换牌完成，新的手牌已放入背包。':a.type==='laboratory'?'实验室已将所选牌置底，并获得 1 金币。':'行动已完成，当前状态已更新。');}catch(e:any){onError(e.message);}};
  const toggle=(id:string)=>setSelected(list=>list.includes(id)?list.filter(c=>c!==id):[...list,id]);
  const status=(p:typeof game.players[number])=>game.phase==='finished'?`累计 ${p.totalScore} 分 · ${p.wins} 胜`:game.turn===p.seat?state.paused?'已暂停':p.kind==='human'?PHASES[game.phase]:state.seats.find(s=>s.playerId===p.playerId)?.message??'正在思考':game.phase==='draft'?`已选 ${p.roleCount} 个身份`:'等待叫号';
  const visual=(p:typeof game.players[number])=>playerCardState({active:p.seat===game.turn,paused:state.paused,finished:game.phase==='finished',runtime:state.seats.find(s=>s.playerId===p.playerId)});
  const magic=active&&game.legalActions.some(a=>a.id==='magic-cycle');
  const hand=game.phase==='keep'&&active?game.pendingCards:own?.hand??[];
  const selection=game.phase==='keep'&&active||magic;
  const manyCards=hand.length>6,inventoryPlayer=inventory?game.players[inventory.seat]:undefined;
  const ownInventory=inventoryPlayer?.seat===game.viewer;
  const inventoryCards=inventoryPlayer?(inventory?.zone==='city'?inventoryPlayer.city:ownInventory&&game.phase==='keep'?game.pendingCards:inventoryPlayer.hand??[]):[];
  const inventoryActions=active&&ownInventory?game.legalActions.filter(a=>selected.length===1&&('card' in a.action)&&a.action.card===selected[0]&&(inventory?.zone==='city'?a.action.type==='destroy'&&a.action.target===game.viewer:a.action.type==='build'||a.action.type==='laboratory')):[];
  return <div className="table-layout ct-layout">
    <section className="game-surface ct-main" data-game-surface="citadels" aria-label="富饶之城牌桌">
      <div className="table-toolbar"><span>第 {game.gameNumber} 局 · 第 {game.round} 轮 · {game.players.length} 人</span><span>建筑牌库 {game.deckCount} 张</span></div>
      <div className="ct-banner"><div><span className="identity-caption">CITADELS / CLASSIC.</span><h2>{PHASES[game.phase]}</h2><p>{game.phase==='finished'?'八座建筑之后，一座城市的价值才真正显现。':game.phase==='draft'?`${game.players[game.turn].name} 秘密选角 · 第 ${game.draftIndex+1}/${game.draftTotal} 次`:`${game.players[game.turn].name} · ${game.called} 号 ${roleName(game.called)}${game.phase==='graveyard'?'的拆除后，墓地可收回建筑':''}`}</p></div><div className="ct-crown"><span>👑</span><small>王冠</small><b>{game.players[game.crown].name}</b></div></div>
      <div className="ct-call-track" aria-label="身份叫号顺序">{ROLES.map(r=>{
        const revealed=game.players.find(p=>p.revealed.includes(r.rank)),removed=game.faceUp.includes(r.rank);
        return <div key={r.rank} data-current={game.phase!=='draft'&&game.phase!=='finished'&&game.called===r.rank} data-called={game.phase!=='draft'&&game.called>=r.rank} title={r.text}><span>{r.symbol}</span><b>{r.rank} {r.name}</b><small>{removed?'明弃':game.assassinated===r.rank?'被刺杀':revealed?.name??(game.phase==='draft'?'未公开':game.called>=r.rank?'无人应答':'等待叫号')}</small></div>;
      })}</div>
      {game.phase==='draft'&&<p className="ct-draft-note">暗弃 {game.faceDownCount} 张 · 明弃 {game.faceUp.length?game.faceUp.map(roleName).join('、'):'无'}{game.players.length===3?' · 每人选两个身份，共用一座城市':game.players.length===7?' · 最后一位可从首张暗弃牌与剩余牌中选一张':''}。身份在叫号前保密。</p>}
      <div className="ct-opponents" data-count={game.players.length}>{game.players.filter(p=>p.seat!==game.viewer).map(p=><PlayerCard key={p.playerId} state={visual(p)} className="ct-player">
        <div className="ct-player-heading"><PlayerCardAvatar kind={p.kind} seat={p.seat} showNumber={false}/><div><small>{String(p.seat+1).padStart(2,'0')} {game.crown===p.seat?'· 王冠':''}</small><h3>{p.name}</h3><span data-player-status>{status(p)}</span></div><div className="ct-resources"><b>{p.gold}<small>金币</small></b><b>{p.handCount}<small>手牌</small></b></div></div>
        <div className="ct-role-label">{p.roles.length?p.roles.map(r=>`${ROLES[r-1].symbol} ${roleName(r)}`).join(' / '):'身份未公开'}{p.roleCount>p.roles.length?` · ${p.roleCount-p.roles.length} 个隐藏身份`:''}<span>{p.city.length}/8 座</span></div><City cards={p.city}/>
        <div className="ct-card-entries"><button className="text-button" onClick={e=>openInventory(p.seat,'city',e.currentTarget)}>城区详情 · {p.city.length} 座 ↗</button>{p.hand&&<button className="text-button" onClick={e=>openInventory(p.seat,'hand',e.currentTarget)}>查看手牌 · {p.handCount} 张 ↗</button>}</div>
      </PlayerCard>)}</div>
      {own?<PlayerCard primary state={visual(own)} className="ct-own" data-player-surface data-cursor-lens="off" aria-label="我的城区、手牌与行动">
        <header className="ct-own-header"><PlayerCardAvatar kind={own.kind} seat={own.seat} showNumber={false}/><div><span className="identity-caption">YOUR CITY. YOUR MOVE.</span><h3>{own.name} <small>{own.roles.map(roleName).join(' / ')||'等待选角'}</small></h3></div><div className="ct-resources"><b>{own.gold}<small>金币</small></b><b>{own.city.length}<small>城区</small></b></div><span data-player-status>{status(own)}</span></header>
        <City cards={own.city}/><div className="ct-card-entries"><button className="text-button" onClick={e=>openInventory(own.seat,'city',e.currentTarget)}>城区详情 · {own.city.length} 座 ↗</button></div>
        {active&&game.phase==='draft'?<div className="ct-draft"><p>选择你的秘密身份。{game.players.length===3?'每轮有两个独立身份回合。':'未叫号的身份不会向其他玩家展示。'}</p><div className="ct-role-options">{game.available.map(rank=>{const r=ROLES[rank-1];return <button key={rank} className={draftRole===rank?'ct-role-option ct-selected':'ct-role-option'} aria-pressed={draftRole===rank} onClick={()=>setDraftRole(rank)}><span>{r.symbol}</span><b>{rank} · {r.name}</b><small>{r.text}</small></button>;})}</div><button className="button primary" disabled={draftRole===null} onClick={()=>draftRole&&act({type:'choose',role:draftRole})}>确认选择{draftRole?` · ${roleName(draftRole)}`:''}</button></div>:<>
          <div className="ct-hand-heading"><div><strong>{game.phase==='keep'&&active?`收入牌：请选择 ${game.keepCount} 张保留`:`我的手牌 · ${own.handCount} 张`}</strong><small>{manyCards?'背包里可放大浏览、分类与选牌':'手牌仅自己可见'}</small></div><button className="button outline" onClick={e=>openInventory(own.seat,'hand',e.currentTarget)}>打开{game.phase==='keep'?'收入候选牌':'手牌背包'} · {hand.length} 张 ↗</button></div>
          <div className="ct-hand">{hand.slice(0,manyCards?3:hand.length).map(c=><Building key={c.id} card={c} selected={selected.includes(c.id)} onClick={selection?()=>toggle(c.id):undefined}/>)}{manyCards&&<button className="ct-more-cards" onClick={e=>openInventory(own.seat,'hand',e.currentTarget)}><b>+{hand.length-3}</b><span>展开手牌背包</span><small>金币 {own.gold} · 完整能力与合法建造</small></button>}{!hand.length&&<p className="ct-empty">当前没有手牌</p>}</div>
          <div className="ct-actions">{active?<>
            {game.phase==='keep'?<button className="button primary" disabled={selected.length!==game.keepCount} onClick={()=>act({type:'keep',cards:selected})}>保留所选 {selected.length}/{game.keepCount} 张</button>:game.legalActions.filter(a=>a.group!=='换牌'&&(!manyCards||a.action.type!=='build'&&a.action.type!=='laboratory')).map(a=><button key={a.id} className={`button ${a.group==='结束'?'outline':a.group==='收入'||a.group==='建造'?'primary':'subtle'}`} onClick={()=>act(a.action)}>{a.label}</button>)}
            {manyCards&&game.legalActions.some(a=>a.action.type==='build'||a.action.type==='laboratory')&&<button className="button primary" onClick={e=>openInventory(own.seat,'hand',e.currentTarget)}>从背包选择建筑 / 实验室用牌 ↗</button>}
            {magic&&<div className="ct-magic"><button className="button outline" disabled={!selected.length} onClick={()=>act({type:'magic_cycle',cards:selected})}>魔术师：所选 {selected.length} 张置底重抽</button><small>也可使用上方的整手交换技能，二选一。</small></div>}
          </>:<p className="ct-waiting">{game.phase==='finished'?'本局已结算，可查看记录或准备下一局。':state.paused?'游戏已暂停，继续后才能行动。':`等待 ${game.players[game.turn].name} ${PHASES[game.phase]}。`}</p>}</div>
        </>}
        <div className="player-table-actions">{tableActions}</div>
      </PlayerCard>:<div className="spectator-table-actions"><p>{game.phase==='finished'?'本局已结束':'观战中 · 点击 Agent 光球查看对话'}{game.phase==='draft'&&game.available.length?` · 当前候选：${game.available.map(roleName).join('、')}`:''}</p>{tableActions}</div>}
    </section>
    <aside className="table-rail ct-rail">{game.phase==='finished'&&<Results game={game}/>}<FoilPanel className="ct-progress"><span className="identity-caption">CITY CHRONICLE.</span><h3>城市进度</h3>{game.players.map(p=><div key={p.playerId}><span>{p.name}</span><b>{p.city.length} / 8</b><small>累计 {p.totalScore} 分</small></div>)}<p>{game.firstCompleted===null?'率先建成八座后，完成本轮全部叫号再结算。':`${game.players[game.firstCompleted].name} 已率先完工，本轮结束后计分。`}</p></FoilPanel><FoilPanel className="event-card"><div className="event-heading"><h3>城中纪事</h3><span>完整公开记录 · {game.events.length}</span></div><div className="event-list">{[...game.events].reverse().map(e=><div className="game-event" key={e.seq}><span className="event-time">#{e.seq} · 第 {e.round} 轮</span><p>{e.seat!==undefined&&<b>{game.players[e.seat].name} </b>}{e.text}</p></div>)}</div></FoilPanel></aside>
    {inventory&&inventoryPlayer&&<Modal title={`${inventoryPlayer.name} · ${inventory.zone==='city'?'城区详情':'手牌背包'}`} subtitle={inventory.zone==='city'?'CITY ARCHIVE / 公开城区':ownInventory?'PRIVATE CARDS / 仅你可见':'观战 / 终局好奇模式'} branded={false} wide className={`ct-inventory-modal ${closing?'ct-inventory-exit':'ct-inventory-enter'}`} dismissible={!closing} onClose={closeInventory}>
      <PlayerCard state={state.paused?'paused':'waiting'} primary={ownInventory} className="ct-inventory-frame" data-player-surface data-cursor-lens="off">
        <div className="ct-inventory-heading"><span className="ct-inventory-mark">{inventory.zone==='city'?'🏰':'✦'}</span><div><span className="identity-caption">{inventory.zone==='city'?'YOUR CITY ARCHIVE.':'A HAND OF POSSIBILITIES.'}</span><h3>{inventory.zone==='city'?'每一座建筑，都有自己的价值。':ownInventory?'下一步，从这里选择。':'已公开给观战者的手牌。'}</h3><p>{inventoryCards.length} 张建筑牌 · {inventoryPlayer.gold} 金币{ownInventory?` · ${active?PHASES[game.phase]:'当前只读'}`:''}</p></div></div>
        <div className="ct-inventory-filters" aria-label="建筑分类">{(['all',...Object.keys(COLORS)] as Array<Color|'all'>).map(color=><button key={color} aria-pressed={filter===color} data-color={color} onClick={()=>setFilter(color)}>{color==='all'?'全部':COLORS[color]} <b>{inventoryCards.filter(c=>color==='all'||district(c).color===color).length}</b></button>)}</div>
        <div className="ct-inventory-grid">{inventoryCards.filter(c=>filter==='all'||district(c).color===filter).map(c=><Building key={c.id} card={c} selected={ownInventory&&selected.includes(c.id)} onClick={ownInventory?()=>{setInventoryNote('');selection&&inventory.zone==='hand'?toggle(c.id):setSelected(list=>list.includes(c.id)?[]:[c.id]);}:undefined}/>)}{!inventoryCards.some(c=>filter==='all'||district(c).color===filter)&&<p className="ct-empty">这个分类暂时没有建筑。</p>}</div>
        <div className="ct-inventory-footer"><div role="status"><strong>{inventoryNote|| (ownInventory?`已选 ${inventoryCards.filter(c=>selected.includes(c.id)).length} 张`:'浏览公开信息')}</strong><small>{ownInventory&&inventoryCards.filter(c=>selected.includes(c.id)).map(cardName).join('、')||'分类与滚动只影响浏览，卡牌不会移出当前牌区。'}</small></div><div className="ct-actions">
          {inventoryActions.map(a=><button key={a.id} className="button primary" onClick={()=>act(a.action)}>{a.label}</button>)}
          {active&&ownInventory&&inventory.zone==='hand'&&game.phase==='keep'&&<button className="button primary" disabled={selected.length!==game.keepCount} onClick={()=>act({type:'keep',cards:selected})}>保留所选 {selected.length}/{game.keepCount} 张</button>}
          {magic&&ownInventory&&inventory.zone==='hand'&&<button className="button outline" disabled={!selected.length} onClick={()=>act({type:'magic_cycle',cards:selected})}>魔术师：所选 {selected.length} 张置底重抽</button>}
          <button className="button outline" onClick={closeInventory}>返回牌桌</button>
        </div></div>
      </PlayerCard>
    </Modal>}
  </div>;
}
export function ConfigFields({value,onChange}:{value:{firstCrown:number};onChange:(v:any)=>void}){return <div className="ct-config"><p>经典八身份 · 3–7 人 · 八建筑终局。人数通过玩家名单增减；三人每位选两个身份。</p><label>初始王冠座位<input type="number" min="1" max="7" value={value.firstCrown} onChange={e=>onChange({...value,firstCrown:Number(e.target.value)})}/></label><small>请将年龄最大的玩家安排在该座位，座位不能超过实际人数。</small></div>;}
export function Replay({run}:{run:StoredRun<CitadelsState>}){
  const [step,setStep]=useState(run.state.events.length),events=run.state.events.slice(0,step),last=events.at(-1);
  const cities:District[][]=run.roster.map(()=>[]);
  for(const e of events){if(e.target===undefined||!e.cards)continue;if(e.kind==='build')cities[e.target].push(...e.cards);if(e.kind==='destroy')cities[e.target]=cities[e.target].filter(c=>!e.cards!.some(d=>d.id===c.id));}
  return <div className="ct-replay"><h2>富饶之城 · 第 {run.index} 局公开回放</h2><p>按公开事件还原选角、叫号与城区变化；未公开的身份、手牌和抽牌选择保密。</p><label>公开事件 {step}/{run.state.events.length}<input aria-label="回放进度" type="range" min="0" max={run.state.events.length} value={step} onChange={e=>setStep(Number(e.target.value))}/></label><div className="ct-replay-controls"><button className="button outline" disabled={step===0} onClick={()=>setStep(s=>s-1)}>上一步</button><p>{last?`第 ${last.round} 轮 · ${last.seat!==undefined?run.roster[last.seat].name+'：':''}${last.text}`:'开局前'}</p><button className="button outline" disabled={step===run.state.events.length} onClick={()=>setStep(s=>s+1)}>下一步</button></div><div className="ct-replay-cities">{run.roster.map((p,i)=><FoilPanel key={p.playerId}><h3>{p.name} · {cities[i].length} 座</h3><City cards={cities[i]}/></FoilPanel>)}</div>{step===run.state.events.length&&run.state.scores&&<Results game={{...run.state,viewer:null,players:run.state.players} as unknown as CitadelsView}/>}<details><summary>完整公开记录</summary>{events.map(e=><p key={e.seq}>#{e.seq} · 第 {e.round} 轮 · {e.seat!==undefined?run.roster[e.seat].name+'：':''}{e.text}</p>)}</details></div>;
}
