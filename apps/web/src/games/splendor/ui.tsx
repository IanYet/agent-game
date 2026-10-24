import {useEffect,useMemo,useRef,useState} from 'react';
import type {ControlledView,GameUiProps,StoredRun} from '../../runtime/types';
import {PlayerCard,PlayerCardAvatar,playerCardState} from '../../visuals/PlayerCard';
import {FoilPanel} from '../../visuals/FoilPanel';
import {Modal} from '../../Modal';
import {useEffectsPreference} from '../../visuals/preferences';
import {CARD_BY_ID,NOBLE_BY_ID} from './data';
import {cardName,emptyTokens,tokenCount} from './engine';
import {GemIcon} from './gem';
import {COLORS,GEMS,GEM_NAMES,type Action,type Card,type Color,type Cost,type Noble,type SplendorState,type SplendorView,type Tokens} from './types';
import './style.css';

function CostRow({cost}:{cost:Partial<Cost>}){return <span className="sp-cost">{COLORS.filter(c=>cost[c]).map(c=><span key={c} title={`${GEM_NAMES[c]} ${cost[c]}`}><GemIcon color={c}/><b>{cost[c]}</b></span>)}</span>;}
function TokenRow({tokens,label}:{tokens:Tokens;label:string}){return <div className="sp-tokens" aria-label={label}>{GEMS.map(c=><span key={c} data-gem={c} title={`${GEM_NAMES[c]} ${tokens[c]}`}><GemIcon color={c}/><b>{tokens[c]}</b><small>{GEM_NAMES[c]}</small></span>)}</div>;}
function Development({card,selected=false,onClick,compact=false}:{card:Card;selected?:boolean;onClick?:()=>void;compact?:boolean}){
  const body=<><div className="sp-card-top"><b>{card.points||'·'}<small>{card.points?'声望':'发展'}</small></b><GemIcon color={card.bonus}/></div>
    <svg className="sp-card-scene" viewBox="0 0 200 68" aria-hidden="true"><path d={card.level===1?'M0 68L44 18L69 45L111 4L180 68Z':card.level===2?'M0 62H200M29 60L48 21H157L181 60M57 24V2M151 24V6M60 9L137 21H60Z':'M20 64V28H180V64M36 26L99 3L164 26ZM57 61V36M84 61V36M114 61V36M142 61V36'}/><path d="M0 67H200M5 63H192"/></svg>
    <CostRow cost={card.cost}/><small className="sp-card-id">{card.id}</small></>;
  const className=`sp-card sp-${card.bonus} ${selected?'selected':''} ${compact?'compact':''}`;
  return onClick?<button className={className} onClick={onClick} aria-pressed={selected} aria-label={`查看 ${cardName(card)}`}>{body}</button>:<div className={className} aria-label={cardName(card)}>{body}</div>;
}
function NobleTile({noble,eligible=false}:{noble:Noble;eligible?:boolean}){return <div className={`sp-noble ${eligible?'eligible':''}`}><span><b>♛</b><strong>{noble.id}</strong><em>3 分</em></span><CostRow cost={noble.cost}/></div>;}
type View=ControlledView<SplendorView>;
function PlayerContents({player,viewer,game,paused,onInventory}:{player:View['players'][number];viewer:boolean;game:View;paused:boolean;onInventory:(trigger:HTMLButtonElement)=>void}){
  return <><header className="sp-player-heading"><PlayerCardAvatar kind={player.kind} seat={player.seat} showNumber={false}/><div><small>PLAYER {String(player.seat+1).padStart(2,'0')}{game.firstSeat===player.seat?' · 先手':''}</small><strong>{player.name}</strong><span data-player-status>{game.phase==='finished'?'本局结束':paused?'已暂停':game.turn===player.seat?(viewer?'轮到你了':'正在行动'):'等待回合'}</span></div><div className="sp-prestige"><b>{player.points}</b><small>声望 / 15</small></div></header>
    <TokenRow tokens={player.tokens} label={`${player.name}持有的 token`}/>
    <div className="sp-bonus-row"><span>永久折扣</span>{COLORS.map(c=><span key={c}><GemIcon color={c}/><b>{player.bonuses[c]}</b></span>)}<small>已购 {player.bought.length} 张</small></div>
    <button className="sp-inventory-entry" aria-label={`打开${player.name}的卡牌背包`} onClick={event=>onInventory(event.currentTarget)}><span>{viewer?'卡牌背包':'查看收藏'} ↗</span><small>已购 {player.bought.length} · 预留 {player.reserved.length}/3 · 贵族 {player.nobles.length}</small></button>
  </>;
}
function Inventory({player,game,onClose,onChoose}:{player:View['players'][number];game:View;onClose:()=>void;onChoose?:(card:Card)=>void}){
  const {reduced}=useEffectsPreference(),[closing,setClosing]=useState(false),closed=useRef(onClose);closed.current=onClose;
  useEffect(()=>{if(!closing)return;const timer=setTimeout(()=>closed.current(),reduced?0:220);return()=>clearTimeout(timer);},[closing,reduced]);
  const close=()=>setClosing(true);
  const [tab,setTab]=useState<'bought'|'reserved'|'nobles'>((onChoose||!player.bought.length)&&player.reserved.length?'reserved':'bought');
  const [filter,setFilter]=useState<Color|'all'>('all'),[selectedId,setSelectedId]=useState('');
  const available=tab==='bought'?player.bought:player.reserved.flatMap(r=>r.card?[r.card]:[]);
  const selected=available.find(c=>c.id===selectedId),cards=available.filter(c=>filter==='all'||c.bonus===filter),hidden=tab==='reserved'?player.reserved.filter(r=>!r.card):[];
  const buyable=selected&&game.legalActions.some(a=>a.action.type==='buy'&&a.action.cardId===selected.id);
  return <Modal branded={false} dismissible={!closing} className={`sp-inventory-modal ${closing?'is-closing':''} ${reduced?'sp-inventory-reduced':''} ${onChoose?'sp-inventory-own':''}`} title={`${player.name}的卡牌背包`} subtitle="收藏与预留 / CARD INVENTORY" onClose={close} footer={<div className="sp-inventory-footer"><span>{onChoose?selected&&tab==='reserved'?`已选 ${cardName(selected)} · ${buyable?'可购买':'查看费用后再规划'}`:'选择一张自己的预留牌，返回主卡确认支付。':'只展示当前规则允许查看的卡牌。'}</span><button className="button outline" disabled={closing} onClick={close}>关闭背包</button>{onChoose&&<button className="button primary" disabled={closing||!selected||tab!=='reserved'} onClick={()=>{if(selected){onChoose(selected);close();}}}>返回主卡支付</button>}</div>}>
    <FoilPanel className="sp-inventory-sheet" illumination={.85} inert={closing}>
    <div className="sp-inventory-summary"><GemIcon color="red"/><span><strong>{player.points} 声望</strong><small>已购 {player.bought.length} 张 · 预留 {player.reserved.length}/3 · 贵族 {player.nobles.length} 位</small></span><span className="sp-inventory-owner">PLAYER {String(player.seat+1).padStart(2,'0')}</span></div>
    <div className="sp-inventory-tabs" role="group" aria-label="背包分类">{(['bought','reserved','nobles'] as const).map((value,i)=><button key={value} aria-pressed={tab===value} onClick={()=>{setTab(value);setFilter('all');setSelectedId('');}}>{['已购发展牌','预留卡牌','贵族'][i]} <b>{[player.bought.length,player.reserved.length,player.nobles.length][i]}</b></button>)}</div>
    {tab==='nobles'?<div className="sp-inventory-nobles">{player.nobles.map(n=><NobleTile key={n.id} noble={n}/>)}{!player.nobles.length&&<p>尚无贵族来访。</p>}</div>:<>
      <div className="sp-inventory-filters" role="group" aria-label="按折扣颜色筛选"><button aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>全部颜色</button>{COLORS.map(c=><button key={c} aria-pressed={filter===c} onClick={()=>setFilter(c)}><GemIcon color={c}/>{GEM_NAMES[c]}</button>)}</div>
      <p className="sp-inventory-note">{tab==='bought'?`已购 ${player.bought.length} 张；每张永久提供 1 枚对应颜色的折扣。`:`预留 ${player.reserved.length} / 3；预留牌只有购买后才提供折扣与声望。`}{hidden.length>0?'对手未公开的预留只显示层级。':''}</p>
      <div className="sp-inventory-grid">{cards.map(card=><div key={card.id}><Development card={card} selected={selectedId===card.id} onClick={()=>setSelectedId(card.id)}/><small>{GEM_NAMES[card.bonus]} · {card.points} 声望{tab==='reserved'&&onChoose?game.legalActions.some(a=>a.action.type==='buy'&&a.action.cardId===card.id)?' · 可购买':' · 暂时买不起':''}</small></div>)}{hidden.map((r,i)=><div className="sp-inventory-hidden" key={'hidden-'+i}><span className="sp-card-back">{'●'.repeat(r.level)}<br/>{r.level} 级预留 · 未公开</span><small>身份保密</small></div>)}</div>
      {!cards.length&&!hidden.length&&<p className="sp-inventory-empty">{filter==='all'?'这个分类还没有卡牌。':'没有这个折扣颜色的卡牌。'}</p>}
      {selected&&<div className="sp-inventory-selection"><strong>已选择 {cardName(selected)}</strong><span>印刷费用 <CostRow cost={selected.cost}/></span>{tab==='reserved'&&onChoose&&<p>返回主卡查看永久折扣、选择彩色宝石或黄金，再确认购买。</p>}</div>}
    </>}
    </FoilPanel>
  </Modal>;
}
export function SplendorTable({state,controller,onError,tableActions}:GameUiProps){
  const game=state.game as View,human=game.viewer,own=human===null?null:game.players[human],finished=game.phase==='finished';
  const ownTurn=!!own&&!finished&&!state.paused&&game.turn===human;
  const [mode,setMode]=useState<'take'|'buy'|'reserve'>('take'),[pair,setPair]=useState(false),[colors,setColors]=useState<Color[]>([]),[pairColor,setPairColor]=useState<Color|null>(null);
  const [selectedCard,setSelectedCard]=useState<string>(''),[reserveTarget,setReserveTarget]=useState<string>(''),[payment,setPayment]=useState<Partial<Tokens>|null>(null),[returns,setReturns]=useState<Tokens>(emptyTokens);
  const [inventorySeat,setInventorySeat]=useState<number|null>(null);
  const inventoryTrigger=useRef<HTMLButtonElement|null>(null);
  const openInventory=(seat:number,trigger:HTMLButtonElement)=>{inventoryTrigger.current=trigger;setInventorySeat(seat);};
  const closeInventory=()=>{setInventorySeat(null);requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!document.querySelector('.sp-inventory-modal')&&inventoryTrigger.current?.isConnected)inventoryTrigger.current.focus({preventScroll:true});}));};
  useEffect(()=>{setInventorySeat(null);},[game.id]);
  useEffect(()=>{setMode('take');setColors([]);setPairColor(null);setSelectedCard('');setReserveTarget('');setPayment(null);setReturns(emptyTokens());},[game.id,game.revision]);
  const act=(action:Action)=>{try{controller.humanAction(action);}catch(error){onError((error as Error).message);}};
  const inspectCard=(card:Card)=>{if(!own)return;setSelectedCard(card.id);setPayment(null);setMode('buy');};
  const buyChoices=game.legalActions.filter(a=>a.action.type==='buy'),reserveChoices=game.legalActions.filter(a=>a.action.type==='reserve'||a.action.type==='reserveDeck');
  const selected=selectedCard?CARD_BY_ID[selectedCard]:null,buyChoice=buyChoices.find(a=>a.action.type==='buy'&&a.action.cardId===selectedCard);
  const effective=Object.fromEntries(COLORS.map(c=>[c,selected&&own?Math.max(0,selected.cost[c]-own.bonuses[c]):0])) as Cost;
  const selectedPayment=payment??(buyChoice?.action.type==='buy'?buyChoice.action.payment:undefined)??emptyTokens();
  const gold=COLORS.reduce((n,c)=>n+effective[c]-(selectedPayment[c]??0),0),canPay=!!buyChoice&&!!own&&gold<=own.tokens.gold&&gold>=0&&COLORS.every(c=>Number.isInteger(selectedPayment[c]??0)&&(selectedPayment[c]??0)>=0&&(selectedPayment[c]??0)<=Math.min(own.tokens[c],effective[c]));
  const takeChoice=game.legalActions.find(a=>pair?a.action.type==='pair'&&a.action.color===pairColor:a.action.type==='take'&&a.action.colors.length===colors.length&&a.action.colors.every(c=>colors.includes(c)));
  const reserveChoice=reserveChoices.find(a=>a.id===reserveTarget),available=COLORS.filter(c=>game.bank[c]>0).length;
  const humanActions=own&&<section className="sp-action-box" aria-label="我的行动">
    {!ownTurn?<p className="sp-waiting">{finished?'结果已保存，可准备下一局。':state.paused?'游戏已暂停，继续后行动。':`${game.players[game.turn].name}正在${game.phase==='return'?'归还超额 token':game.phase==='noble'?'选择贵族':'行动'}。`}</p>:game.phase==='return'?<>
      <h3>归还 {game.returnCount} 枚 token</h3><p>含黄金最多保留 10 枚。可归还刚拿到的 token。</p><div className="sp-amounts">{GEMS.map(c=><label key={c}><GemIcon color={c}/><span>{GEM_NAMES[c]}</span><input aria-label={`归还${GEM_NAMES[c]}`} type="number" min={0} max={own.tokens[c]} value={returns[c]} onChange={e=>setReturns({...returns,[c]:Number(e.target.value)})}/><small>持有 {own.tokens[c]}</small></label>)}</div>
      <button className="button primary" disabled={tokenCount(returns)!==game.returnCount||GEMS.some(c=>returns[c]<0||returns[c]>own.tokens[c]||!Number.isInteger(returns[c]))} onClick={()=>act({type:'return',tokens:returns})}>确认归还 {tokenCount(returns)} / {game.returnCount}</button>
    </>:game.phase==='noble'?<><h3>选择一位贵族来访</h3><p>你同时满足多位贵族的折扣要求，本回合必须选择一位。</p><div className="sp-noble-choices">{game.eligibleNobles.map(id=><button key={id} onClick={()=>act({type:'noble',nobleId:id})} aria-label={`邀请贵族 ${id}`}><NobleTile noble={NOBLE_BY_ID[id]} eligible/><span>邀请 {id} · +3 分</span></button>)}</div></>:<>
      <div className="sp-tabs" role="group" aria-label="主要行动">{(['take','buy','reserve'] as const).map((value,i)=><button key={value} aria-pressed={mode===value} onClick={()=>setMode(value)}>{['拿取宝石','购买发展牌','预留卡牌'][i]}</button>)}</div>
      {mode==='take'?<><div className="sp-take-mode"><button aria-pressed={!pair} onClick={()=>setPair(false)}>不同色 · 各 1 枚</button><button aria-pressed={pair} onClick={()=>setPair(true)}>同色 · 2 枚</button></div>
        <div className="sp-token-choices">{COLORS.map(c=><button key={c} aria-pressed={pair?pairColor===c:colors.includes(c)} disabled={pair?game.bank[c]<4:game.bank[c]===0} onClick={()=>pair?setPairColor(c):setColors(old=>old.includes(c)?old.filter(x=>x!==c):old.length<Math.min(3,available)?[...old,c]:old)}><GemIcon color={c}/><strong>{GEM_NAMES[c]}</strong><small>银行 {game.bank[c]}</small></button>)}</div>
        <div className="sp-action-footer"><p>{pair?'拿取前该色须至少有 4 枚。':`本次须选 ${Math.min(3,available)} 种不同颜色。`}{tokenCount(own.tokens)+(pair?2:Math.min(3,available))>10?'随后需归还超额 token。':''}</p><button className="button primary" disabled={!takeChoice} onClick={()=>takeChoice&&act(takeChoice.action)}>确认拿取</button></div>
      </>:mode==='buy'?<><label className="sp-target"><span>选择市场卡或自己的预留卡</span><select aria-label="选择购买卡牌" value={selectedCard} onChange={e=>{setSelectedCard(e.target.value);setPayment(null);}}><option value="">请选择，也可点击上方市场</option>{[...Object.values(game.market).flat().filter((c):c is Card=>c!==null),...own.reserved.flatMap(r=>r.card?[r.card]:[])].map(card=><option key={card.id} value={card.id}>{cardName(card)}{buyChoices.some(a=>a.action.type==='buy'&&a.action.cardId===card.id)?' · 可购买':' · 暂时买不起'}</option>)}</select></label>
        {selected&&<><div className="sp-purchase-detail"><Development card={selected} compact/><div><p>折扣后费用</p><CostRow cost={effective}/>{!COLORS.some(c=>effective[c])&&<b>免费购买</b>}<p>{buyChoice?'默认优先彩色宝石，可将部分数量改为 0 来用黄金支付。':'现有 token 与黄金不足，可预留以后购买。'}</p></div></div>
          {buyChoice&&<div className="sp-amounts sp-payment">{COLORS.filter(c=>effective[c]>0).map(c=><label key={c}><GemIcon color={c}/><span>支付{GEM_NAMES[c]}</span><input type="number" aria-label={`支付${GEM_NAMES[c]}`} min={0} max={Math.min(own.tokens[c],effective[c])} value={selectedPayment[c]??0} onChange={e=>setPayment({...selectedPayment,[c]:Number(e.target.value)})}/><small>费用 {effective[c]} / 持有 {own.tokens[c]}</small></label>)}<div className="sp-gold-pay"><GemIcon color="gold"/><b>{gold} 黄金</b><small>持有 {own.tokens.gold}</small></div></div>}
          <div className="sp-action-footer"><button className="button outline" disabled={!game.legalActions.some(a=>a.action.type==='reserve'&&a.action.cardId===selectedCard)} onClick={()=>{setReserveTarget('reserve:'+selectedCard);setMode('reserve');}}>改为预留</button><button className="button primary" disabled={!canPay} onClick={()=>act({type:'buy',cardId:selectedCard,payment:{...selectedPayment,gold}})}>确认购买</button></div>
        </>}
      </>:<><label className="sp-target"><span>预留 {own.reserved.length} / 3 · 银行黄金 {game.bank.gold}</span><select aria-label="选择预留卡牌" value={reserveTarget} disabled={!reserveChoices.length} onChange={e=>setReserveTarget(e.target.value)}><option value="">选择公开卡或暗抽层级</option>{reserveChoices.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}</select></label><p>公开市场立即补牌；暗抽的卡只有自己能看。{game.bank.gold?'预留获得 1 黄金。':'黄金用尽，仍可预留。'}预留卡只能通过购买移出。</p><button className="button primary" disabled={!reserveChoice} onClick={()=>reserveChoice&&act(reserveChoice.action)}>确认预留{game.bank.gold?'并拿黄金':''}</button></>}
      {game.legalActions.some(a=>a.action.type==='pass')&&<button className="button outline" onClick={()=>act({type:'pass'})}>无合法行动 · 公开预留并跳过</button>}
    </>}
  </section>;
  return <div className={`sp-layout${own?' sp-has-human':''}`} data-game-surface="splendor"><section className="sp-main">
    <div className="sp-table-meta"><span>第 {game.round} 局 · 第 {Math.min(...game.turnsTaken)+(finished?0:1)} 轮 · {game.players.length} 人</span><strong>{finished?'本局结束':game.finalRound?'最后一轮 · 等轮结束':'基础版 · 15 分触发最后一轮'}</strong></div>
    <FoilPanel className="sp-market"><header><div><span className="eyebrow">DEVELOPMENT MARKET</span><h2>宝石市场</h2></div><span>点击卡牌查看费用</span></header>
      <div className="sp-nobles" aria-label="本局贵族">{game.nobles.map(n=><NobleTile key={n.id} noble={n} eligible={game.eligibleNobles.includes(n.id)}/>)}{!game.nobles.length&&<p>贵族已全部来访</p>}</div>
      <div className="sp-market-rows">{([3,2,1] as const).map(level=><div className="sp-market-row" key={level}><div className={`sp-deck sp-level-${level}`} aria-label={`${level} 级暗库剩余 ${game.deckCounts[level]} 张`}><span>{'●'.repeat(level)}</span><b>{game.deckCounts[level]}</b><small>{level} 级暗库</small></div>{game.market[level].map((card,i)=>card?<Development key={card.id} card={card} selected={selectedCard===card.id&&mode==='buy'} onClick={own&&!finished?()=>inspectCard(card):undefined}/>:<div className="sp-market-empty" key={'empty'+i}>该层已用尽</div>)}</div>)}</div>
      <div className="sp-bank"><h3>公共银行<small>所有数量公开</small></h3><TokenRow tokens={game.bank} label="公共银行 token 库存"/></div>
    </FoilPanel>
    <div className="sp-opponents">{game.players.filter(p=>p.seat!==human).map(player=><PlayerCard key={player.playerId} className="sp-player" state={playerCardState({active:game.turn===player.seat,paused:state.paused,finished,runtime:state.seats[player.seat]})}><PlayerContents player={player} viewer={false} game={game} paused={state.paused} onInventory={trigger=>openInventory(player.seat,trigger)}/></PlayerCard>)}</div>
    {own?<PlayerCard primary className="sp-player sp-own" data-player-surface data-cursor-lens="off" state={playerCardState({active:game.turn===human,paused:state.paused,finished,runtime:state.seats[human!]})}><PlayerContents player={own} viewer game={game} paused={state.paused} onInventory={trigger=>openInventory(own.seat,trigger)}/>{humanActions}<div className="sp-table-actions">{tableActions}</div></PlayerCard>:<FoilPanel className="sp-watch"><p>观战中 · 点击 Agent 光球查看对话与可见思考</p>{tableActions}</FoilPanel>}
  </section><aside className="sp-rail">
    {game.result&&<FoilPanel className="sp-result"><GemIcon color="red"/><h2>{game.result.winners.map(s=>game.players[s].name).join('、')}{game.result.winners.length>1?'共同获胜':'获胜'}</h2><p>声望最高；同分时已购发展牌较少者胜，仍相同共享胜利。</p>{game.players.map(p=><div key={p.playerId}><strong>{p.name}</strong><span>{p.points} 分 · {p.bought.length} 张</span></div>)}</FoilPanel>}
    <FoilPanel className="sp-standings"><h3>本桌累计</h3>{game.players.map(p=><div key={p.playerId}><strong>{p.name}</strong><span>{p.wins} 胜<small>累计 {p.totalPoints} 声望</small></span></div>)}</FoilPanel>
    <FoilPanel className="sp-log"><h3>牌桌动态 <small>公开记录</small></h3><div>{game.events.slice(-32).reverse().map(event=><article key={event.seq}><small>#{event.seq} {event.seat!==undefined?game.players[event.seat].name:''}</small><p>{event.text}</p></article>)}</div></FoilPanel>
  </aside>{inventorySeat!==null&&game.players[inventorySeat]&&<Inventory key={game.players[inventorySeat].playerId} player={game.players[inventorySeat]} game={game} onClose={closeInventory} onChoose={inventorySeat===human&&game.phase==='action'?inspectCard:undefined}/>}</div>;
}

export function SplendorConfigFields(){return <div className="sp-config"><strong>基础版 · 2024 周年版规则</strong><p>2–4 人；在玩家名单中新增或移除参与者。每局完整使用 90 张发展牌。</p><table><thead><tr><th>人数</th><th>每色宝石</th><th>黄金</th><th>贵族</th></tr></thead><tbody>{[[2,4,3],[3,5,4],[4,7,5]].map(([count,gems,nobles])=><tr key={count}><td>{count}</td><td>{gems}</td><td>5</td><td>{nobles}</td></tr>)}</tbody></table><p>15 分触发等轮结束。同桌下一局轮换先手，继承胜局和累计声望。</p></div>;}

export function SplendorReplay({run}:{run:StoredRun<SplendorState>}){
  const events=run.state.events,[step,setStep]=useState(events.length);
  const tally=useMemo(()=>{
    const players=run.roster.map(()=>({points:0,cards:0,tokens:emptyTokens(),bonuses:{white:0,blue:0,green:0,red:0,black:0}}));
    for(const event of events.slice(0,step)){
      if(event.seat===undefined)continue;const p=players[event.seat];
      if(event.type==='buy')for(const id of event.cards??[]){p.points+=CARD_BY_ID[id].points;p.cards++;p.bonuses[CARD_BY_ID[id].bonus]++;}
      if(event.type==='noble')p.points+=3;
      if(event.tokens)for(const c of GEMS)p.tokens[c]+=(event.type==='buy'||event.type==='return'?-1:1)*(event.tokens[c]??0);
    }return players;
  },[events,run.roster,step]);
  const event=events[step-1];
  return <div className="sp-replay"><p>仅使用公开记录回放。暗库顺序与未公开预留不会出现在记录中。</p><label>回放进度 {step} / {events.length}<input aria-label="回放进度" type="range" min={1} max={events.length} value={step} onChange={e=>setStep(Number(e.target.value))}/></label><div className="sp-replay-controls"><button className="button outline" disabled={step<=1} onClick={()=>setStep(s=>s-1)}>上一步</button><button className="button outline" disabled={step>=events.length} onClick={()=>setStep(s=>s+1)}>下一步</button><button className="button outline" onClick={()=>setStep(events.length)}>结算</button></div>
    <div className="sp-replay-scores">{run.roster.map((p,i)=><div key={p.playerId}><b>{p.name}</b><strong>{tally[i].points} 分 / {tally[i].cards} 张</strong><TokenRow tokens={tally[i].tokens} label={`${p.name}此时 token`}/></div>)}</div>
    {event&&<FoilPanel className="sp-replay-focus"><small>#{event.seq} {event.seat===undefined?'':run.roster[event.seat].name}</small><h3>{event.text}</h3><div>{event.cards?.map(id=><Development key={id} card={CARD_BY_ID[id]} compact/>)}</div>{event.nobleId&&<NobleTile noble={NOBLE_BY_ID[event.nobleId]}/>}</FoilPanel>}
    <div className="replay-events">{events.slice(0,step).map(e=><div key={e.seq}><span>{e.seq.toString().padStart(2,'0')}</span><p>{e.seat!==undefined&&<b>{run.roster[e.seat].name} </b>}{e.text}</p></div>)}</div>
  </div>;
}
