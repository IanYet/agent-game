import {useEffect,useLayoutEffect,useMemo,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import type {ControlledView,GameUiProps,StoredRun} from '../../runtime/types';
import {playerCardState} from '../../visuals/PlayerCard';
import {AgentPlayerCard} from '../AgentPlayerCard';
import {HumanPlayerCard} from '../HumanPlayerCard';
import {FoilPanel} from '../../visuals/FoilPanel';
import {GameLayout,GameTable,SpectatorTableActions,type BoardGamePanel} from '../GameLayout';
import {BoardGamePlayers} from '../BoardGamePlayers';
import {Modal} from '../../Modal';
import {useEffectsPreference} from '../../visuals/preferences';
import {CARD_BY_ID,NOBLE_BY_ID} from './data';
import {cardName,emptyTokens,splendorEvents,tokenCount} from './engine';
import {GemIcon} from './gem';
import {HolographicCard} from '../../visuals/HolographicCard';
import {GEM_PALETTE} from './artwork';
import {RESERVED_BACK_PATTERN} from './reserve-artwork';
import {TableTransfers} from './transfers';
import {COLORS,GEMS,GEM_NAMES,type Action,type Card,type Color,type Cost,type Gem,type Noble,type SplendorState,type SplendorView,type Tokens} from './types';
import './style.css';

const LEVEL_NAMES={1:'一级',2:'二级',3:'三级'} as const;
const RESERVE_LABELS={market:'市场预留',deck:'暗抽预留'} as const;
type GemSelection={color:Gem;index:number};
type TableSelection={type:'gems';gems:GemSelection[]}|{type:'card';cardId:string}|{type:'deck';level:Card['level']};
const hasGem=(selection:GemSelection[],color:Gem,index:number)=>selection.some(gem=>gem.color===color&&gem.index===index);
function selectedTokens(selection:GemSelection[]):Tokens{const tokens=emptyTokens();for(const gem of selection)tokens[gem.color]++;return tokens;}
const describeCost=(cost:Partial<Cost>)=>COLORS.filter(color=>cost[color]).map(color=>`${GEM_NAMES[color]} ${cost[color]} 颗`).join('，')||'免费';
function CostRow({cost,label='费用',engraved=false}:{cost:Partial<Cost>;label?:string;engraved?:boolean}){
  const colors=COLORS.filter(color=>cost[color]);
  return <span className="sp-cost" role="img" aria-label={`${label}：${describeCost(cost)}`}>
    {colors.map(color=><span className="sp-cost-group" key={color} title={`${GEM_NAMES[color]} ${cost[color]} 颗`} aria-hidden="true">{Array.from({length:cost[color]!},(_,index)=><GemIcon key={index} color={color} engraved={engraved}/>)}</span>)}
  </span>;
}
function TokenRow({tokens,label}:{tokens:Tokens;label:string}){return <div className="sp-tokens" aria-label={label}>{GEMS.map(c=><span key={c} data-gem={c} title={`${GEM_NAMES[c]} ${tokens[c]}`}><GemIcon color={c}/><b>{tokens[c]}</b><small>{GEM_NAMES[c]}</small></span>)}</div>;}
function GemBank({tokens,selection,onSelect,canSelect}:{tokens:Tokens;selection:GemSelection[];onSelect?:(color:Color,index:number)=>void;canSelect:(color:Color,index:number)=>boolean}){
  return <section className="sp-bank" aria-label="公共银行">
    <h3>公共银行</h3>
    <div className="sp-bank-stocks">{GEMS.map(color=><div className="sp-bank-stock" key={color} data-sp-bank-color={color} role="group" aria-label={`${GEM_NAMES[color]}，剩余 ${tokens[color]} 枚`}>
      <span className="sp-bank-name">{GEM_NAMES[color]}</span>
      <div className="sp-bank-gems">{Array.from({length:tokens[color]},(_,index)=>onSelect&&color!=='gold'?<button type="button" key={index} className="sp-gem-choice" aria-label={`选择${GEM_NAMES[color]}第 ${index+1} 颗`} aria-pressed={hasGem(selection,color,index)} disabled={!canSelect(color,index)} onClick={()=>onSelect(color,index)}><GemIcon color={color}/></button>:<GemIcon key={index} color={color}/>)}{tokens[color]===0&&<small className="sp-bank-empty">已取完</small>}</div>
    </div>)}</div>
  </section>;
}
function Prestige({value}:{value:number}){
  return <span className="sp-card-points">{value>0&&<span className="sp-card-score" data-value={value} aria-label={`${value} 点声望`}>{value}</span>}</span>;
}
function Development({card,selected=false,onClick,inTransit=false}:{card:Card;selected?:boolean;onClick?:()=>void;inTransit?:boolean}){
  const description=`${cardName(card)}，永久折扣：${GEM_NAMES[card.bonus]}，费用：${describeCost(card.cost)}`;
  const body=<>
    <div className="sp-card-top" aria-hidden="true">
      <Prestige value={card.points}/>
      <span className="sp-card-bonus"><GemIcon color={card.bonus} engraved/></span>
    </div>
    <CostRow cost={card.cost} engraved/>
  </>;
  const appearance={glowColor:(card.bonus==='black'?'#bac2cc':GEM_PALETTE[card.bonus][1]) as `#${string}`,highlightColor:card.bonus==='white'?'#dce3ec':GEM_PALETTE[card.bonus][1],rainbow:card.bonus==='black',selected,width:'var(--sp-card-width,112px)',restingLight:(selected||inTransit?[.5,.5]:[.09,.09]) as readonly [number,number],tilt:!inTransit};
  return onClick?<HolographicCard as="button" className="sp-card" {...appearance} onClick={onClick} aria-pressed={selected} aria-label={`选择 ${description}`} title={description}>{body}</HolographicCard>:<HolographicCard className="sp-card" {...appearance} role="img" aria-label={description} title={description}>{body}</HolographicCard>;
}
function NobleTile({noble,eligible=false,selected=false,onClick,disabled=false}:{noble:Noble;eligible?:boolean;selected?:boolean;onClick?:()=>void;disabled?:boolean}){
  const description=`贵族 ${noble.id}，${noble.points} 点声望，所需永久折扣：${describeCost(noble.cost)}${eligible?'，已满足来访条件':''}`;
  const appearance={className:`sp-card sp-noble ${eligible?'eligible':''}`,pattern:'crowns' as const,glowColor:'#dfb86a' as const,highlightColor:'#9d7b45',trimColor:'#9d7b4566',width:'var(--sp-card-width,112px)',aspectRatio:1,selected};
  const body=<><div className="sp-card-top" aria-hidden="true"><Prestige value={noble.points}/></div><CostRow cost={noble.cost} label="所需永久折扣" engraved/></>;
  return onClick?<HolographicCard as="button" {...appearance} disabled={disabled} onClick={onClick} aria-pressed={selected} aria-label={`选择${description}`} title={description}>{body}</HolographicCard>:<HolographicCard {...appearance} role="img" aria-label={description} title={description}>{body}</HolographicCard>;
}
type View=ControlledView<SplendorView>;
function ReservedCardBack({level,inTransit=false}:{level:Card['level'];inTransit?:boolean}){
  const description=`${LEVEL_NAMES[level]}，${RESERVE_LABELS.deck}，牌面仅持有者可见`;
  return <HolographicCard className="sp-card sp-card-back" pattern={RESERVED_BACK_PATTERN} rainbow glowColor="#c3cbd6" width="var(--sp-card-width,112px)" restingLight={inTransit?[.5,.5]:[.09,.09]} tilt={!inTransit} role="img" aria-label={description} title={description}>
    <b aria-hidden="true">{LEVEL_NAMES[level]}</b>
    <svg className="sp-reserved-coin" viewBox="0 0 100 100" data-lens-svg aria-hidden="true" fill="none" strokeWidth="1.5"><circle cx="50" cy="51" r="44" stroke="#05070c"/><circle cx="50" cy="50" r="44" stroke="#9da6b2" opacity=".5"/></svg>
  </HolographicCard>;
}
function ReservedDevelopment({reserved,selected=false,onClick,status,origin}:{reserved:View['players'][number]['reserved'][number];selected?:boolean;onClick?:()=>void;status?:string;origin?:string}){
  const label=RESERVE_LABELS[reserved.source];
  return <figure className="sp-reserved-card" aria-label={label} data-sp-card-origin={origin}>
    {reserved.card?<Development card={reserved.card} selected={selected} onClick={onClick}/>:<ReservedCardBack level={reserved.level}/>}
    <figcaption className="sp-reserved-caption">{label}</figcaption>
    {status&&<small className="sp-reserved-status">{status}</small>}
  </figure>;
}
function PlayerContents({player,viewer,onInventory,purchaseCard,returns=[],returnCount=0,onReturn,canReturn}:{player:View['players'][number];viewer:boolean;onInventory:(trigger:HTMLButtonElement)=>void;purchaseCard?:Card;returns?:GemSelection[];returnCount?:number;onReturn?:(color:Gem,index:number)=>void;canReturn?:(color:Gem,index:number)=>boolean}){
  const held=GEMS.filter(color=>player.tokens[color]>0);
  return <div className="sp-player-contents">
    <section className="sp-resource-group" aria-label="持有宝石">
      <h4 className="sp-overview-heading"><span>持有宝石</span><small>{tokenCount(player.tokens)} / 10 枚</small>{returnCount>0&&<small>退还 {returns.length}/{returnCount}</small>}</h4>
      <div className="sp-held-gems" data-sp-held-seat={player.seat} role={onReturn?'group':'img'} aria-label={`${player.name}持有：${held.map(color=>`${GEM_NAMES[color]} ${player.tokens[color]} 枚`).join('，')||'暂无宝石'}${onReturn?`；选择 ${returnCount} 枚退还`:''}`}>
        {held.map(color=><span className="sp-held-gem-group" data-sp-held-gem={color} key={color} title={`${GEM_NAMES[color]} ${player.tokens[color]} 枚`} aria-hidden={onReturn?undefined:true}>{Array.from({length:player.tokens[color]},(_,index)=>onReturn?<button type="button" key={index} className="sp-gem-choice" aria-label={`退还${GEM_NAMES[color]}第 ${index+1} 颗`} aria-pressed={hasGem(returns,color,index)} disabled={!canReturn?.(color,index)} onClick={()=>onReturn(color,index)}><GemIcon color={color}/></button>:<GemIcon key={index} color={color}/>)}</span>)}
      </div>
    </section>
    <section className="sp-resource-group" aria-label="永久折扣">
      <h4 className="sp-overview-heading"><span>永久折扣</span></h4>
      <div className="sp-discounts">{COLORS.map(color=><span key={color} title={`${GEM_NAMES[color]}永久折扣 ${player.bonuses[color]}`} aria-label={`${GEM_NAMES[color]}永久折扣 ${player.bonuses[color]}`}><GemIcon color={color}/><b>{player.bonuses[color]}</b></span>)}</div>
    </section>
    {viewer&&<section className="sp-resource-group sp-discount-price" aria-label="折扣价格"><h4 className="sp-overview-heading"><span>折扣价格</span></h4>{purchaseCard?<div className="sp-discounts">{COLORS.map(color=>{const amount=Math.max(0,purchaseCard.cost[color]-player.bonuses[color]);return <span key={color} aria-label={`${GEM_NAMES[color]}折扣后 ${amount} 枚`}><GemIcon color={color}/><b>{amount}</b></span>;})}</div>:<small className="sp-discount-price-hint">选择卡牌后显示</small>}</section>}
    <button type="button" className="sp-inventory-entry" data-sp-bought-target={player.seat} aria-label={`打开${player.name}的卡牌背包`} onClick={event=>onInventory(event.currentTarget)}>{viewer?'我的背包':'查看背包'} ↗</button>
  </div>;
}
function ReservedCards({player,viewer,selectedCard,onChoose}:{player:View['players'][number];viewer:number|null;selectedCard:string;onChoose?:(card:Card)=>void}){
  return <div className="sp-reserved-hand" data-sp-reserved-seat={player.seat} role="group" aria-label={`${player.name}的预留卡牌，${player.reserved.length} / 3`}>
    {player.reserved.map((reserved,index)=><ReservedDevelopment key={reserved.card?.id??`hidden-${index}`} origin={`reserved:${player.seat}:${index}`} reserved={reserved} selected={player.seat===viewer&&selectedCard===reserved.card?.id} onClick={reserved.card&&player.seat===viewer&&onChoose?()=>onChoose(reserved.card!):undefined}/>)}
  </div>;
}
function InventoryCardGrid({children,count,square=false,captionHeight=0}:{children:ReactNode;count:number;square?:boolean;captionHeight?:number}){
  const root=useRef<HTMLDivElement>(null),[layout,setLayout]=useState({columns:1,width:112});
  useLayoutEffect(()=>{
    const element=root.current!;
    const fit=()=>{
      const {clientWidth:width,clientHeight:height}=element;
      if(!width||!height||!count)return;
      const gap=10,ratio=square?1:64/91;
      let best={columns:1,width:0};
      for(let columns=1;columns<=count;columns++){
        const rows=Math.ceil(count/columns);
        const cardWidth=Math.min(112,(width-10-gap*(columns-1))/columns,((height-10-gap*(rows-1))/rows-captionHeight)*ratio);
        if(cardWidth>best.width||Math.abs(cardWidth-best.width)<.01&&rows<Math.ceil(count/best.columns))best={columns,width:cardWidth};
      }
      const next={columns:best.columns,width:Math.max(1,Math.floor(best.width*100)/100)};
      setLayout(previous=>previous.columns===next.columns&&previous.width===next.width?previous:next);
    };
    const observer=new ResizeObserver(fit);observer.observe(element);fit();
    return()=>observer.disconnect();
  },[count,square,captionHeight]);
  return <div ref={root} className={`sp-inventory-grid${square?' sp-inventory-nobles':''}`} style={{'--sp-card-width':`${layout.width}px`,'--sp-inventory-columns':layout.columns} as CSSProperties}>{children}</div>;
}
function Inventory({player,game,onClose,onChoose}:{player:View['players'][number];game:View;onClose:()=>void;onChoose?:(card:Card)=>void}){
  const {reduced}=useEffectsPreference(),[closing,setClosing]=useState(false),closed=useRef(onClose);closed.current=onClose;
  useEffect(()=>{if(!closing)return;const timer=setTimeout(()=>closed.current(),reduced?0:220);return()=>clearTimeout(timer);},[closing,reduced]);
  const close=()=>setClosing(true);
  const [tab,setTab]=useState<'bought'|'reserved'|'nobles'>((onChoose||!player.bought.length)&&player.reserved.length?'reserved':'bought');
  const [filter,setFilter]=useState<Color|'all'>('all'),[selectedId,setSelectedId]=useState('');
  const available=tab==='bought'?player.bought:player.reserved.flatMap(r=>r.card?[r.card]:[]);
  const selected=available.find(c=>c.id===selectedId),cards=available.filter(c=>filter==='all'||c.bonus===filter);
  const reserved=player.reserved.filter(r=>!r.card||filter==='all'||r.card.bonus===filter),count=tab==='reserved'?reserved.length:cards.length;
  const buyable=selected&&game.legalActions.some(a=>a.action.type==='buy'&&a.action.cardId===selected.id);
  return <Modal branded={false} dismissible={!closing} className={`board-inventory-modal sp-inventory-modal ${closing?'is-closing':''} ${reduced?'sp-inventory-reduced':''} ${onChoose?'sp-inventory-own':''}`} title={`${player.name}的卡牌背包`} subtitle="收藏与预留" onClose={close} footer={<div className="sp-inventory-footer"><span>{onChoose&&selected&&tab==='reserved'?`${cardName(selected)} · ${buyable?'可购买':'暂时买不起'}`:''}</span><button className="button outline" disabled={closing} onClick={close}>关闭</button>{onChoose&&<button className="button primary" disabled={closing||!selected||tab!=='reserved'} onClick={()=>{if(selected){onChoose(selected);close();}}}>选择预留牌</button>}</div>}>
    <FoilPanel className="sp-inventory-sheet" illumination={.85} glass={false} inert={closing}>
    <div className="sp-inventory-summary"><strong>{player.points} 声望</strong><small>预留 {player.reserved.length}/3</small></div>
    <div className="sp-inventory-tabs" role="group" aria-label="背包分类">{(['bought','reserved','nobles'] as const).map((value,i)=><button key={value} aria-pressed={tab===value} onClick={()=>{setTab(value);setFilter('all');setSelectedId('');}}>{['已购发展牌','预留卡牌','贵族'][i]} <b>{[player.bought.length,player.reserved.length,player.nobles.length][i]}</b></button>)}</div>
    {tab==='nobles'?<InventoryCardGrid count={player.nobles.length} square>{player.nobles.map(n=><NobleTile key={n.id} noble={n}/>)}{!player.nobles.length&&<p>尚无贵族来访。</p>}</InventoryCardGrid>:<>
      <div className="sp-inventory-filters" role="group" aria-label="按折扣颜色筛选"><button aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>全部颜色</button>{COLORS.map(c=><button key={c} aria-pressed={filter===c} onClick={()=>setFilter(c)}><GemIcon color={c}/>{GEM_NAMES[c]}</button>)}</div>
      <InventoryCardGrid count={count} captionHeight={tab==='reserved'?(onChoose?44:22):0}>{tab==='reserved'?reserved.map((item,index)=><ReservedDevelopment key={item.card?.id??`hidden-${index}`} reserved={item} selected={selectedId===item.card?.id} onClick={item.card?()=>setSelectedId(item.card!.id):undefined} status={onChoose&&item.card?(game.legalActions.some(a=>a.action.type==='buy'&&a.action.cardId===item.card!.id)?'可购买':'暂时买不起'):undefined}/>):cards.map(card=><Development key={card.id} card={card} selected={selectedId===card.id} onClick={()=>setSelectedId(card.id)}/>)}</InventoryCardGrid>
      {!count&&<p className="sp-inventory-empty">没有卡牌</p>}
    </>}
    </FoilPanel>
  </Modal>;
}
export function SplendorTable({state,controller,onError,tableActions}:GameUiProps){
  const game=state.game as View,human=game.viewer,own=human===null?null:game.players[human],finished=game.phase==='finished';
  const ownTurn=!!own&&!finished&&!state.paused&&game.turn===human;
  const humanPhase=game.turn===human?game.phase:'action';
  const [panel,setPanel]=useState<BoardGamePanel>('table');
  const market=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(ownTurn)setPanel(humanPhase==='return'?'player':'table');},[ownTurn,humanPhase,game.id]);
  const status=(player:View['players'][number])=>finished?'本局结束':state.paused?'已暂停':game.turn===player.seat?player.kind==='human'?'轮到你了':state.seats.find(seat=>seat.playerId===player.playerId)?.message??'正在行动':'等待回合';
  const [selection,setSelection]=useState<TableSelection|null>(null),[returns,setReturns]=useState<GemSelection[]>([]),[nobleId,setNobleId]=useState('');
  const [inventorySeat,setInventorySeat]=useState<number|null>(null);
  const inventoryTrigger=useRef<HTMLButtonElement|null>(null);
  const openInventory=(seat:number,trigger:HTMLButtonElement)=>{inventoryTrigger.current=trigger;setInventorySeat(seat);};
  const closeInventory=()=>{setInventorySeat(null);requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!document.querySelector('.sp-inventory-modal')&&inventoryTrigger.current?.isConnected)inventoryTrigger.current.focus({preventScroll:true});}));};
  useEffect(()=>{setInventorySeat(null);},[game.id]);
  useEffect(()=>{setSelection(null);setReturns([]);setNobleId('');},[game.id,game.revision]);
  const act=(action:Action)=>{if(!ownTurn)return;try{controller.humanAction(action);}catch(error){onError((error as Error).message);}};
  const bankSelection=selection?.type==='gems'?selection.gems:[],bankTokens=selectedTokens(bankSelection),returnTokens=selectedTokens(returns);
  const selectedCard=selection?.type==='card'?selection.cardId:'';
  const selectedLevel=selection?.type==='deck'?selection.level:null;
  const takeChoices=game.legalActions.flatMap(choice=>{
    const tokens=emptyTokens();
    if(choice.action.type==='take')for(const color of choice.action.colors)tokens[color]++;
    else if(choice.action.type==='pair')tokens[choice.action.color]=2;
    else return [];
    return [{choice,tokens}];
  });
  const takeChoice=takeChoices.find(candidate=>GEMS.every(color=>candidate.tokens[color]===bankTokens[color]))?.choice;
  const buyChoice=game.legalActions.find(choice=>choice.action.type==='buy'&&choice.action.cardId===selectedCard);
  const reserveChoice=game.legalActions.find(choice=>choice.action.type==='reserve'&&choice.action.cardId===selectedCard);
  const deckChoice=game.legalActions.find(choice=>choice.action.type==='reserveDeck'&&choice.action.level===selectedLevel);
  const returnChoice=game.legalActions.find(({action})=>action.type==='return'&&GEMS.every(color=>(action.tokens[color]??0)===returnTokens[color]));
  const nobleChoice=game.legalActions.find(choice=>choice.action.type==='noble'&&choice.action.nobleId===nobleId);
  const passChoice=game.legalActions.find(choice=>choice.action.type==='pass');
  const canSelectGem=(color:Color,index:number)=>{
    if(!ownTurn||humanPhase!=='action')return false;
    if(hasGem(bankSelection,color,index))return true;
    const next=selectedTokens([...bankSelection,{color,index}]);
    return takeChoices.some(candidate=>GEMS.every(gem=>next[gem]<=candidate.tokens[gem]));
  };
  const selectGem=(color:Color,index:number)=>{
    if(!canSelectGem(color,index))return;
    const gems=hasGem(bankSelection,color,index)?bankSelection.filter(gem=>gem.color!==color||gem.index!==index):[...bankSelection,{color,index}];
    setSelection(gems.length?{type:'gems',gems}:null);
  };
  const canReturnGem=(color:Gem,index:number)=>ownTurn&&humanPhase==='return'&&(hasGem(returns,color,index)||returns.length<game.returnCount);
  const selectReturn=(color:Gem,index:number)=>{
    if(!canReturnGem(color,index))return;
    setReturns(current=>hasGem(current,color,index)?current.filter(gem=>gem.color!==color||gem.index!==index):[...current,{color,index}]);
  };
  const inspectCard=(card:Card)=>{if(!own||humanPhase!=='action')return;setSelection(current=>current?.type==='card'&&current.cardId===card.id?null:{type:'card',cardId:card.id});};
  const inspectDeck=(level:Card['level'])=>{if(!ownTurn||humanPhase!=='action')return;setSelection(current=>current?.type==='deck'&&current.level===level?null:{type:'deck',level});};
  const humanActions=own&&<fieldset className="sp-confirm-actions" disabled={!ownTurn} aria-label="确认当前行动">
    {humanPhase==='return'?<button type="button" className="button primary" disabled={!returnChoice} title={`需退还 ${game.returnCount} 枚，已选 ${returns.length} 枚`} onClick={()=>returnChoice&&act(returnChoice.action)}>退还</button>:
      humanPhase==='noble'?<button type="button" className="button primary" disabled={!nobleChoice} onClick={()=>nobleChoice&&act(nobleChoice.action)}>邀请贵族</button>:
      selection?.type==='card'?<>
        <button type="button" className="button primary" disabled={!buyChoice} title={buyChoice?.label??'当前宝石与折扣不足，无法购买'} onClick={()=>buyChoice&&act(buyChoice.action)}>购买</button>
        <button type="button" className="button outline" disabled={!reserveChoice} title={reserveChoice?.label??(own.reserved.length>=3?'预留已满（最多 3 张）':'只能预留市场中的卡牌')} onClick={()=>reserveChoice&&act(reserveChoice.action)}>预留</button>
      </>:selection?.type==='deck'?<button type="button" className="button primary" disabled={!deckChoice} title={deckChoice?.label??'预留已满或该等级牌库已空'} onClick={()=>deckChoice&&act(deckChoice.action)}>{RESERVE_LABELS.deck}</button>:
      <button type="button" className="button primary" disabled={!takeChoice} title={takeChoice?.label} onClick={()=>takeChoice&&act(takeChoice.action)}>拿取宝石</button>}
    {passChoice&&<button type="button" className="button outline" onClick={()=>act(passChoice.action)}>公开预留并跳过</button>}
  </fieldset>;
  const opponents=game.players.filter(p=>p.seat!==human);
  return <GameLayout gameId="splendor" label="璀璨宝石牌桌" className="sp-layout" surfaceClassName="sp-main" viewport={{mode:own?'player':'spectator',panel,onPanelChange:setPanel,playerLabel:'我的行动',tableActions}} toolbar={<> <span>第 {game.round} 局 · 第 {Math.min(...game.turnsTaken)+(finished?0:1)} 轮 · {game.players.length} 人</span><strong>{finished?'本局结束':game.finalRound?'最后一轮 · 等轮结束':'基础版 · 15 分触发最后一轮'}</strong> </>} score={<FoilPanel className="sp-standings"><h3>当局声望</h3>{game.players.map(p=><div key={p.playerId}><strong>{p.name}<small>已购 {p.bought.length} 张 · 贵族 {p.nobles.length} 位</small></strong><span><b className="sp-standing-prestige">{p.points}</b> 声望</span></div>)}{game.result&&<section className="sp-score-result"><h3>{game.result.winners.map(s=>game.players[s].name).join('、')}{game.result.winners.length>1?'共同获胜':'获胜'}</h3><p>声望最高；同分时已购发展牌较少者胜，仍相同共享胜利。</p>{game.players.map(p=><p key={p.playerId}>{p.name} · 累计 {p.wins} 胜 / {p.totalPoints} 声望</p>)}</section>}</FoilPanel>} events={game.events} eventPlayers={game.players} after={<>
      <TableTransfers game={game} market={market} renderCard={(card,level)=>card?<Development card={card} inTransit/>:<ReservedCardBack level={level} inTransit/>}/>
      {inventorySeat!==null&&game.players[inventorySeat]&&<Inventory key={game.players[inventorySeat].playerId} player={game.players[inventorySeat]} game={game} onClose={closeInventory} onChoose={inventorySeat===human&&ownTurn&&game.phase==='action'?inspectCard:undefined}/>}
    </>}>
    <GameTable className="sp-market-table" aria-label="宝石市场"><div ref={market} className="sp-market"><div className="sp-market-board">
      <div className="sp-patrons"><h3 className="sp-market-caption">贵族</h3><div className="sp-nobles" aria-label="本局贵族">{game.nobles.map(n=><NobleTile key={n.id} noble={n} eligible={game.eligibleNobles.includes(n.id)} selected={nobleId===n.id} onClick={own&&humanPhase==='noble'?()=>setNobleId(current=>current===n.id?'':n.id):undefined} disabled={!ownTurn||!game.eligibleNobles.includes(n.id)}/>)}{!game.nobles.length&&<p>贵族已全部来访</p>}</div></div>
      <div className="sp-market-rows">{([3,2,1] as const).map(level=><div className="sp-market-row" key={level} aria-label={`${LEVEL_NAMES[level]}发展牌`}><div className="sp-market-level"><h3 className="sp-market-caption">{LEVEL_NAMES[level]}</h3><button type="button" className="sp-deck" data-sp-card-origin={`deck:${level}`} aria-label={`${RESERVE_LABELS.deck} · ${LEVEL_NAMES[level]} · 余 ${game.deckCounts[level]} 张`} aria-pressed={selectedLevel===level} disabled={!ownTurn||humanPhase!=='action'||game.deckCounts[level]===0} onClick={()=>inspectDeck(level)}><span>{RESERVE_LABELS.deck}</span><small>余 {game.deckCounts[level]} 张</small></button></div>{game.market[level].map((card,i)=>{
        return <div className="sp-market-slot" key={i} data-sp-market-slot={`${level}:${i}`} data-sp-card-origin={card?`market:${card.id}`:undefined}>{card?<Development key={card.id} card={card} selected={selectedCard===card.id} onClick={own&&!finished&&humanPhase==='action'?()=>inspectCard(card):undefined}/>:<div className="sp-market-empty">已售罄</div>}</div>;
      })}</div>)}</div>
      <GemBank tokens={game.bank} selection={bankSelection} onSelect={own&&humanPhase==='action'?selectGem:undefined} canSelect={canSelectGem}/>
    </div></div></GameTable>
    <BoardGamePlayers className="sp-opponents" cardWidth={375} activeIndex={opponents.findIndex(p=>p.seat===game.turn)} activeName={game.players[game.turn].name}>{opponents.map(player=><div className="sp-player-seat" key={player.playerId}><ReservedCards player={player} viewer={human} selectedCard={selectedCard}/><AgentPlayerCard player={player} caption={game.firstSeat===player.seat?'先手':undefined} metrics={[{label:'声望',value:player.points}]} status={status(player)} action={game.events.filter(e=>e.seat===player.seat).at(-1)?.text??''} state={playerCardState({active:game.turn===player.seat,paused:state.paused,finished,runtime:state.seats[player.seat]})}><PlayerContents player={player} viewer={false} onInventory={trigger=>openInventory(player.seat,trigger)}/></AgentPlayerCard></div>)}</BoardGamePlayers>
    {own?<div className="sp-player-seat sp-human-seat"><ReservedCards player={own} viewer={human} selectedCard={selectedCard} onChoose={!finished&&humanPhase==='action'?inspectCard:undefined}/><HumanPlayerCard player={own} state={playerCardState({active:game.turn===human,paused:state.paused,finished,runtime:state.seats[human!]})} badges={game.firstSeat===own.seat?'先手':undefined} metrics={[{label:'声望',value:own.points}]} status={status(own)} actions={humanActions} tableActions={tableActions}><PlayerContents player={own} viewer purchaseCard={selectedCard?CARD_BY_ID[selectedCard]:undefined} onInventory={trigger=>openInventory(own.seat,trigger)} returns={returns} returnCount={humanPhase==='return'?game.returnCount:0} onReturn={humanPhase==='return'?selectReturn:undefined} canReturn={canReturnGem}/></HumanPlayerCard></div>:<SpectatorTableActions notice="观战中 · 点击 Agent 光球查看对话与可见思考">{tableActions}</SpectatorTableActions>}
  </GameLayout>;
}

export function SplendorConfigFields(){return <div className="sp-config"><strong>基础版 · 2024 周年版规则</strong><p>2–4 人；在玩家名单中新增或移除参与者。每局完整使用 90 张发展牌。</p><table><thead><tr><th>人数</th><th>每色宝石</th><th>黄金</th><th>贵族</th></tr></thead><tbody>{[[2,4,3],[3,5,4],[4,7,5]].map(([count,gems,nobles])=><tr key={count}><td>{count}</td><td>{gems}</td><td>5</td><td>{nobles}</td></tr>)}</tbody></table><p>15 分触发等轮结束。同桌下一局轮换先手，继承胜局和累计声望。</p></div>;}

export function SplendorReplay({run}:{run:StoredRun<SplendorState>}){
  const spectator=run.roster.every(player=>player.kind!=='human');
  const events=useMemo(()=>splendorEvents(run.state,spectator),[run.state,spectator]),[step,setStep]=useState(events.length);
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
  return <div className="sp-replay"><p>{spectator?'纯 Agent 对局回放包含暗抽牌面，记录保留“暗抽”标注。':'按公开记录回放；暗抽当时的牌面保密，购买或公开时再展示。'}</p><label>回放进度 {step} / {events.length}<input aria-label="回放进度" type="range" min={1} max={events.length} value={step} onChange={e=>setStep(Number(e.target.value))}/></label><div className="sp-replay-controls"><button className="button outline" disabled={step<=1} onClick={()=>setStep(s=>s-1)}>上一步</button><button className="button outline" disabled={step>=events.length} onClick={()=>setStep(s=>s+1)}>下一步</button><button className="button outline" onClick={()=>setStep(events.length)}>结算</button></div>
    <div className="sp-replay-scores">{run.roster.map((p,i)=><div key={p.playerId}><b>{p.name}</b><strong>{tally[i].points} 分 / {tally[i].cards} 张</strong><TokenRow tokens={tally[i].tokens} label={`${p.name}此时 token`}/></div>)}</div>
    {event&&<FoilPanel className="sp-replay-focus"><small>#{event.seq} {event.seat===undefined?'':run.roster[event.seat].name}</small><h3>{event.text}</h3><div>{event.cards?.map(id=><Development key={id} card={CARD_BY_ID[id]}/>)}</div>{event.nobleId&&<NobleTile noble={NOBLE_BY_ID[event.nobleId]}/>}</FoilPanel>}
    <div className="replay-events">{events.slice(0,step).map(e=><div key={e.seq}><span>{e.seq.toString().padStart(2,'0')}</span><p>{e.seat!==undefined&&<b>{run.roster[e.seat].name} </b>}{e.text}</p></div>)}</div>
  </div>;
}
