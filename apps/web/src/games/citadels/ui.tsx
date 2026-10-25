import {useEffect,useRef,useState} from 'react';
import type {ControlledView,GameUiProps,StoredRun} from '../../runtime/types';
import {PlayerCard,playerCardState} from '../../visuals/PlayerCard';
import {AgentPlayerCard} from '../AgentPlayerCard';
import {HumanPlayerCard} from '../HumanPlayerCard';
import {FoilPanel} from '../../visuals/FoilPanel';
import {GameLayout,GameTable,SpectatorTableActions,type BoardGamePanel} from '../GameLayout';
import {BoardGamePlayers} from '../BoardGamePlayers';
import {Modal} from '../../Modal';
import {Select} from '../../Select';
import {StatusTag} from '../../UiBits';
import {useEffectsPreference} from '../../visuals/preferences';
import {COLORS,ROLES,cardName,district,roleName,type Color,type District} from './cards';
import type {Action,CitadelsState,CitadelsView} from './engine';
import './style.css';

const PHASES={draft:'秘密选角',income:'先领取收入',keep:'选择保留建筑',main:'建造与使用技能',graveyard:'墓地收回',finished:'本局结算'};
function Building({card,selected,onClick,compact=false}:{card:District;selected?:boolean;onClick?:()=>void;compact?:boolean}){
  const d=district(card),body=<><span className="ct-building-top"><small>{COLORS[d.color]}</small><b>{d.cost}<i>金</i></b></span><strong>{d.name}</strong>{!compact&&<span className="ct-building-art" aria-hidden="true">{d.color==='yellow'?'♜':d.color==='blue'?'♱':d.color==='green'?'⚖':d.color==='red'?'⚔':'✧'}</span>}{!compact&&d.text&&<small className="ct-building-text">{d.text}</small>}</>;
  const props={className:`ct-building ${compact?'ct-compact':''} ${selected?'ct-selected':''}`,'data-color':d.color,title:`${d.name} · ${d.cost} 金币${d.text?` · ${d.text}`:''}`};
  return onClick?<button {...props} aria-pressed={selected} onClick={onClick}>{body}</button>:<div {...props}>{body}</div>;
}
function City({cards}:{cards:District[]}){return <div className="ct-city">{cards.length?cards.map(c=><Building key={c.id} card={c} compact/>):<span className="ct-empty">城区尚待奠基</span>}</div>;}
function CitySummary({cards}:{cards:District[]}){return <div className="ct-city-summary" aria-label="城区建筑数量">{(Object.keys(COLORS) as Color[]).map(color=><span key={color} data-color={color}>{COLORS[color]}<b>{cards.filter(card=>district(card).color===color).length}</b></span>)}</div>;}
function RoleBadges({player}:{player:Pick<CitadelsView['players'][number],'roles'|'roleCount'>}){
  const hidden=player.roleCount-player.roles.length;
  return <>{player.roles.map(rank=><StatusTag key={rank}>{roleName(rank)}</StatusTag>)}{hidden>0?<StatusTag>{hidden===1?'身份未公开':`${hidden} 个隐藏身份`}</StatusTag>:!player.roles.length&&<StatusTag>待选身份</StatusTag>}</>;
}
function Results({game}:{game:Pick<CitadelsView,'scores'|'winners'>&{players:Array<{name:string}>}}){return <section className="ct-results"><span className="identity-caption">MASTER BUILDERS.</span><h3>{game.winners.map(i=>game.players[i].name).join('、')}{game.winners.length>1?' 共享胜利':' 获胜'}</h3><table><thead><tr><th>玩家</th><th>建筑</th><th>五色</th><th>完工</th><th>特殊</th><th>总分</th></tr></thead><tbody>{game.scores?.map(s=><tr key={s.seat}><th>{game.players[s.seat].name}</th><td>{s.districts}</td><td>{s.colors}</td><td>{s.completion}</td><td>{s.special}</td><td><b>{s.total}</b></td></tr>)}</tbody></table><p>同分比较建筑费用，再比较金币；仍相同则共享胜利。</p></section>;}
export function Table({state,controller,onError,tableActions}:GameUiProps){
  const game=state.game as ControlledView<CitadelsView>,own=game.viewer===null?undefined:game.players[game.viewer];
  const [selected,setSelected]=useState<string[]>([]),[draftRole,setDraftRole]=useState<number|null>(null);
  const [citySelection,setCitySelection]=useState<{seat:number;card:string}|null>(null);
  const [panel,setPanel]=useState<BoardGamePanel>(own?'player':'table'),[actionId,setActionId]=useState('');
  const effects=useEffectsPreference(),[inventory,setInventory]=useState<{seat:number;zone:'hand'|'city'}|null>(null),[closing,setClosing]=useState(false),[filter,setFilter]=useState<Color|'all'>('all'),[inventoryNote,setInventoryNote]=useState('');
  const closeTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const inventoryEntry=useRef<HTMLButtonElement|null>(null);
  useEffect(()=>()=>clearTimeout(closeTimer.current),[]);
  useEffect(()=>{if(!inventory){const frame=requestAnimationFrame(()=>{if(inventoryEntry.current?.isConnected)inventoryEntry.current.focus({preventScroll:true});});return()=>cancelAnimationFrame(frame);}},[inventory]);
  useEffect(()=>{clearTimeout(closeTimer.current);setInventory(null);setClosing(false);},[game.id]);
  const openInventory=(seat:number,zone:'hand'|'city',entry:HTMLButtonElement)=>{inventoryEntry.current=entry;clearTimeout(closeTimer.current);setClosing(false);setFilter('all');setInventoryNote('');setInventory({seat,zone});};
  const closeInventory=()=>{if(closing)return;if(effects.reduced){setInventory(null);return;}setClosing(true);closeTimer.current=setTimeout(()=>{setInventory(null);setClosing(false);},180);};
  useEffect(()=>{setSelected([]);setCitySelection(null);setDraftRole(null);setActionId('');},[game.revision,game.id]);
  const active=!state.paused&&game.phase!=='finished'&&game.turn===game.viewer;
  useEffect(()=>{if(active)setPanel('player');},[active,game.id]);
  const act=(a:Action)=>{try{controller.humanAction(a);setInventoryNote(a.type==='build'?'已建造':a.type==='magic_cycle'?'已换牌':a.type==='laboratory'?'已获得 1 金币':'行动已完成');}catch(e:any){onError(e.message);}};
  const toggle=(id:string)=>setSelected(list=>list.includes(id)?list.filter(c=>c!==id):[...list,id]);
  const status=(p:typeof game.players[number])=>game.phase==='finished'?`累计 ${p.totalScore} 分 · ${p.wins} 胜`:game.turn===p.seat?state.paused?'已暂停':p.kind==='human'?PHASES[game.phase]:state.seats.find(s=>s.playerId===p.playerId)?.message??'正在思考':game.phase==='draft'?`已选 ${p.roleCount} 个身份`:'等待叫号';
  const visual=(p:typeof game.players[number])=>playerCardState({active:p.seat===game.turn,paused:state.paused,finished:game.phase==='finished',runtime:state.seats.find(s=>s.playerId===p.playerId)});
  const magic=active&&game.legalActions.some(a=>a.id==='magic-cycle');
  const hand=game.phase==='keep'&&active?game.pendingCards:own?.hand??[];
  const selection=game.phase==='keep'&&active||magic;
  const inventoryPlayer=inventory?game.players[inventory.seat]:undefined;
  const ownInventory=inventoryPlayer?.seat===game.viewer;
  const inventoryCards=inventoryPlayer?(inventory?.zone==='city'?inventoryPlayer.city:ownInventory&&game.phase==='keep'?game.pendingCards:inventoryPlayer.hand??[]):[];
  const inventorySelected=inventory?.zone==='city'?(citySelection?.seat===inventory.seat?[citySelection.card]:[]):selected;
  const inventoryActions=active&&inventoryPlayer?game.legalActions.filter(a=>inventorySelected.length===1&&('card' in a.action)&&a.action.card===inventorySelected[0]&&(inventory?.zone==='city'?a.action.type==='destroy'&&a.action.target===inventory.seat:ownInventory&&(a.action.type==='build'||a.action.type==='laboratory'))):[];
  const opponents=game.players.filter(p=>p.seat!==game.viewer);
  const availableActions=game.legalActions.filter(a=>!['choose','keep','magic_cycle','end'].includes(a.action.type)),actionChoice=availableActions.find(a=>a.id===actionId),endAction=game.legalActions.find(a=>a.action.type==='end');
  const playerActions=active&&<div className="ct-turn-controls">{game.phase==='draft'?<button className="button primary" disabled={draftRole===null} onClick={()=>draftRole&&act({type:'choose',role:draftRole})}>确认选择{draftRole?` · ${roleName(draftRole)}`:''}</button>:game.phase==='keep'?<button className="button primary" disabled={selected.length!==game.keepCount} onClick={()=>act({type:'keep',cards:selected})}>保留所选 {selected.length}/{game.keepCount} 张</button>:<>
    {availableActions.length>0&&<Select label="选择本回合行动" value={actionId} options={[{value:'',label:'选择行动',disabled:true},...availableActions.map(a=>({value:a.id,label:a.label,detail:a.group}))]} onChange={id=>{setActionId(id);const action=availableActions.find(a=>a.id===id)?.action;if(action?.type==='destroy')setCitySelection({seat:action.target,card:action.card});else if(action&&'card' in action)setSelected([action.card]);}}/>}
    <div className="ct-actions">{availableActions.length>0&&<button className="button primary" disabled={!actionChoice} onClick={()=>actionChoice&&act(actionChoice.action)}>确认行动</button>}{endAction&&<button className="button outline" onClick={()=>act(endAction.action)}>{endAction.label}</button>}{magic&&<button className="button outline" disabled={!selected.length} onClick={()=>act({type:'magic_cycle',cards:selected})}>所选 {selected.length} 张置底重抽</button>}</div>
  </>}</div>;
  return <GameLayout gameId="citadels" label="富饶之城牌桌" className="ct-layout" surfaceClassName="ct-main" viewport={{mode:own?'player':'spectator',panel,onPanelChange:setPanel,playerLabel:'我的城市',tableActions}} toolbar={<> <span>第 {game.gameNumber} 局 · 第 {game.round} 轮 · {game.players.length} 人</span><span>建筑牌库 {game.deckCount} 张</span> </>} score={<FoilPanel className="ct-progress"><span className="identity-caption">CITY CHRONICLE.</span><h3>本桌积分 · 城市进度</h3>{game.players.map(p=><div key={p.playerId}><span>{p.name}</span><b>{p.city.length} / 8</b><small>累计 {p.totalScore} 分 · {p.wins} 胜</small></div>)}<p>{game.firstCompleted===null?'率先建成八座后，完成本轮全部叫号再结算。':`${game.players[game.firstCompleted].name} 已率先完工，本轮结束后计分。`}</p>{game.phase==='finished'&&<Results game={game}/>}</FoilPanel>} events={game.events} eventPlayers={game.players} activityTitle="城中纪事" after={<> {inventory&&inventoryPlayer&&<Modal title={`${inventoryPlayer.name} · ${inventory.zone==='city'?'城区详情':'手牌背包'}`} subtitle={inventory.zone==='city'?'公开城区':ownInventory?'我的手牌':'公开手牌'} branded={false} wide className={`board-inventory-modal ct-inventory-modal ${closing?'ct-inventory-exit':'ct-inventory-enter'}`} dismissible={!closing} onClose={closeInventory}>
      <PlayerCard state={state.paused?'paused':'waiting'} primary={ownInventory} className="ct-inventory-frame" data-player-surface data-cursor-lens="off">
        <div className="ct-inventory-heading"><span>{inventoryCards.length} 张建筑牌</span><span>{inventoryPlayer.gold} 金币{ownInventory?` · ${active?PHASES[game.phase]:'当前只读'}`:''}</span></div>
        <div className="ct-inventory-filters" aria-label="建筑分类">{(['all',...Object.keys(COLORS)] as Array<Color|'all'>).map(color=><button key={color} aria-pressed={filter===color} data-color={color} onClick={()=>setFilter(color)}>{color==='all'?'全部':COLORS[color]} <b>{inventoryCards.filter(c=>color==='all'||district(c).color===color).length}</b></button>)}</div>
        <div className="ct-inventory-grid">{inventoryCards.filter(c=>filter==='all'||district(c).color===filter).map(c=><Building key={c.id} card={c} selected={inventorySelected.includes(c.id)} onClick={ownInventory||active&&inventory.zone==='city'?()=>{setInventoryNote('');if(inventory.zone==='city')setCitySelection(value=>value?.seat===inventory.seat&&value.card===c.id?null:{seat:inventory.seat,card:c.id});else if(selection)toggle(c.id);else setSelected(list=>list.includes(c.id)?[]:[c.id]);}:undefined}/>)}{!inventoryCards.some(c=>filter==='all'||district(c).color===filter)&&<p className="ct-empty">没有建筑</p>}</div>
        <div className="ct-inventory-footer"><div role="status"><strong>{inventoryNote||inventoryCards.filter(c=>inventorySelected.includes(c.id)).map(cardName).join('、')}</strong></div><div className="ct-actions">
          {inventoryActions.map(a=><button key={a.id} className="button primary" onClick={()=>act(a.action)}>{a.label}</button>)}
          {active&&ownInventory&&inventory.zone==='hand'&&game.phase==='keep'&&<button className="button primary" disabled={selected.length!==game.keepCount} onClick={()=>act({type:'keep',cards:selected})}>保留所选 {selected.length}/{game.keepCount} 张</button>}
          {magic&&ownInventory&&inventory.zone==='hand'&&<button className="button outline" disabled={!selected.length} onClick={()=>act({type:'magic_cycle',cards:selected})}>魔术师：所选 {selected.length} 张置底重抽</button>}
          <button className="button outline" onClick={closeInventory}>关闭</button>
        </div></div>
      </PlayerCard>
    </Modal>} </>}><GameTable className="ct-public-table"><div className="ct-public">
      <div className="ct-banner"><div><h2>{PHASES[game.phase]}</h2><p>{game.phase==='finished'?game.winners.map(seat=>game.players[seat].name).join('、')+' 获胜':game.phase==='draft'?`${game.players[game.turn].name} · 第 ${game.draftIndex+1}/${game.draftTotal} 次 · 暗弃 ${game.faceDownCount} · 明弃 ${game.faceUp.length?game.faceUp.map(roleName).join('、'):'无'}`:`${game.players[game.turn].name} · ${game.called} 号 ${roleName(game.called)}${game.phase==='graveyard'?' · 墓地收回建筑':''}`}</p></div><div className="ct-crown"><span>👑</span><div><small>王冠</small><b>{game.players[game.crown].name}</b></div></div></div>
      <div className="ct-call-track" role="list" aria-label="身份叫号顺序">{ROLES.map(r=>{
        const revealed=game.players.find(p=>p.revealed.includes(r.rank)),removed=game.faceUp.includes(r.rank),current=game.phase!=='draft'&&game.phase!=='finished'&&game.called===r.rank;
        return <FoilPanel key={r.rank} className="ct-role-card" illumination={current?(state.paused ? .4 : 1.85):0} interactive={current} role="listitem" aria-current={current?'step':undefined} data-current={current} data-called={game.phase!=='draft'&&game.called>=r.rank} title={r.text}><span>{r.symbol}</span><b>{r.rank} {r.name}</b><small>{removed?'明弃':game.assassinated===r.rank?'被刺杀':revealed?.name??(game.phase==='draft'?'未公开':game.called>=r.rank?'无人应答':'等待叫号')}</small></FoilPanel>;
      })}</div>
      </div></GameTable><BoardGamePlayers className="ct-opponents" minCardWidth={185} activeIndex={opponents.findIndex(p=>p.seat===game.turn)} activeName={game.players[game.turn].name}>{opponents.map(p=><AgentPlayerCard key={p.playerId} player={p} state={visual(p)} caption={`${game.crown===p.seat?'王冠 · ':''}手牌 ${p.handCount}`} badges={<RoleBadges player={p}/>} metrics={[{label:'金币',value:p.gold}]} status={status(p)} action={game.events.filter(e=>e.seat===p.seat&&e.round===game.round).at(-1)?.text??''}>
        <CitySummary cards={p.city}/><div className="ct-city-value"><span>{p.city.length}/8 座</span><span>建筑费用 {p.city.reduce((sum,card)=>sum+district(card).cost,0)}</span><span>特殊建筑 {p.city.filter(card=>district(card).color==='purple').length}</span></div>
        <div className="ct-card-entries"><button className="text-button" onClick={e=>openInventory(p.seat,'city',e.currentTarget)}>城区详情 · {p.city.length} 座 ↗</button>{p.hand&&<button className="text-button" onClick={e=>openInventory(p.seat,'hand',e.currentTarget)}>查看手牌 · {p.handCount} 张 ↗</button>}</div>
      </AgentPlayerCard>)}</BoardGamePlayers>
      {own?<HumanPlayerCard player={own} state={visual(own)} metrics={[{label:'金币',value:own.gold},{label:'城区',value:own.city.length}]} badges={<RoleBadges player={own}/>} status={status(own)} actions={playerActions} tableActions={tableActions} aria-label="我的城区、手牌与行动">
        <CitySummary cards={own.city}/><div className="ct-card-entries ct-own-entries"><button className="text-button" onClick={e=>openInventory(own.seat,'city',e.currentTarget)}>城区 · {own.city.length} 座 ↗</button><button className="text-button" onClick={e=>openInventory(own.seat,'hand',e.currentTarget)}>{game.phase==='keep'&&active?`收入牌 · 保留 ${game.keepCount} 张`:`手牌 · ${own.handCount} 张`} ↗</button></div>
        {active&&game.phase==='draft'?<div className="ct-draft"><Select label="秘密身份" value={draftRole===null?'':String(draftRole)} onChange={value=>setDraftRole(Number(value))} options={[{value:'',label:'选择身份',disabled:true},...game.available.map(rank=>{const role=ROLES[rank-1];return {value:String(rank),label:`${role.symbol} ${rank} · ${role.name}`,detail:role.text};})]}/></div>:<>
          {active&&game.phase==='keep'&&<div className="ct-hand">{hand.map(card=><Building key={card.id} card={card} compact selected={selected.includes(card.id)} onClick={()=>toggle(card.id)}/>)}</div>}
        </>}
        
      </HumanPlayerCard>:<SpectatorTableActions notice={`${game.phase==='finished'?'本局已结束':'观战中 · 点击 Agent 光球查看对话'}${game.phase==='draft'&&game.available.length?` · 当前候选：${game.available.map(roleName).join('、')}`:''}`}>{tableActions}</SpectatorTableActions>}
    </GameLayout>;
}
export function ConfigFields({value,onChange}:{value:{firstCrown:number};onChange:(v:any)=>void}){return <div className="ct-config"><p>经典八身份 · 3–7 人 · 八建筑终局。人数通过玩家名单增减；三人每位选两个身份。</p><label>初始王冠座位<input type="number" min="1" max="7" value={value.firstCrown} onChange={e=>onChange({...value,firstCrown:Number(e.target.value)})}/></label><small>请将年龄最大的玩家安排在该座位，座位不能超过实际人数。</small></div>;}
export function Replay({run}:{run:StoredRun<CitadelsState>}){
  const [step,setStep]=useState(run.state.events.length),events=run.state.events.slice(0,step),last=events.at(-1);
  const cities:District[][]=run.roster.map(()=>[]);
  for(const e of events){if(e.target===undefined||!e.cards)continue;if(e.kind==='build')cities[e.target].push(...e.cards);if(e.kind==='destroy')cities[e.target]=cities[e.target].filter(c=>!e.cards!.some(d=>d.id===c.id));}
  return <div className="ct-replay"><h2>富饶之城 · 第 {run.index} 局公开回放</h2><p>按公开事件还原选角、叫号与城区变化；未公开的身份、手牌和抽牌选择保密。</p><label>公开事件 {step}/{run.state.events.length}<input aria-label="回放进度" type="range" min="0" max={run.state.events.length} value={step} onChange={e=>setStep(Number(e.target.value))}/></label><div className="ct-replay-controls"><button className="button outline" disabled={step===0} onClick={()=>setStep(s=>s-1)}>上一步</button><p>{last?`第 ${last.round} 轮 · ${last.seat!==undefined?run.roster[last.seat].name+'：':''}${last.text}`:'开局前'}</p><button className="button outline" disabled={step===run.state.events.length} onClick={()=>setStep(s=>s+1)}>下一步</button></div><div className="ct-replay-cities">{run.roster.map((p,i)=><FoilPanel key={p.playerId}><h3>{p.name} · {cities[i].length} 座</h3><City cards={cities[i]}/></FoilPanel>)}</div>{step===run.state.events.length&&run.state.scores&&<FoilPanel><Results game={{...run.state,viewer:null,players:run.state.players} as unknown as CitadelsView}/></FoilPanel>}<details><summary>完整公开记录</summary>{events.map(e=><p key={e.seq}>#{e.seq} · 第 {e.round} 轮 · {e.seat!==undefined?run.roster[e.seat].name+'：':''}{e.text}</p>)}</details></div>;
}
