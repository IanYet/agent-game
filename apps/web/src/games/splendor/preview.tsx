import {useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../styles.css';
import type {GameController} from '../../controller';
import type {AppSnapshot,ControlledView,StablePlayer} from '../../runtime/types';
import {GameChrome} from '../../GameChrome';
import {Logo} from '../../UiBits';
import {EffectsControls} from '../../visuals/EffectsControls';
import {GameBackground} from '../../visuals/GameBackground';
import {VisualExperience} from '../../visuals/VisualExperience';
import {useEffectsPreference} from '../../visuals/preferences';
import {CARDS,CARD_BY_ID,NOBLES} from './data';
import {applyAction,assertSplendor,cardName,createSplendor,defaultPayment,emptyTokens,legalActions,viewSplendor} from './engine';
import {COLORS,LEVELS,type Action,type Card,type Event,type LegalAction,type SplendorView} from './types';
import {SplendorTable} from './ui';
import {AgentRuntimeContext} from '../AgentPlayerCard';

type BoundaryCase=''|'screenshot'|'gems'|'return';
const boundaryCases:Array<{value:BoundaryCase;label:string}>=[{value:'',label:'满载背包'},{value:'screenshot',label:'五枚宝石与拿取说明'},{value:'gems',label:'Agent 暂存 13 枚宝石'},{value:'return',label:'真人退还宝石'}];

function boundaryGame(roster:StablePlayer[],spectator:boolean,scenario:Exclude<BoundaryCase,''>):ControlledView<SplendorView>{
  let seed=24,state=createSplendor(`splendor-width-${scenario}`,roster.map(player=>({...player,kind:player.kind==='human'?'human':'agent'})),{random:()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}});
  const seat=scenario==='return'?0:2,player=state.players[seat];state.turn=seat;state.turnsTaken=roster.map((_,index)=>index<seat?1:0);
  const grant=(tokens:ReturnType<typeof emptyTokens>)=>{for(const color of [...COLORS,'gold' as const]){player.tokens[color]=tokens[color];state.bank[color]-=tokens[color];}};
  if(scenario==='gems'||scenario==='return'){
    if(scenario==='gems')for(const card of CARDS.filter(card=>card.bonus==='white').sort((a,b)=>a.points-b.points).slice(0,10)){
      const slot=state.market[card.level].indexOf(card.id);
      if(slot>=0)state.market[card.level][slot]=state.decks[card.level].shift()??null;else state.decks[card.level].splice(state.decks[card.level].indexOf(card.id),1);
      player.bought.push(card.id);
    }
    grant({white:2,blue:1,green:1,red:2,black:2,gold:2});state=applyAction(state,seat,{type:'take',colors:['white','blue','green']});
  }else{
    grant({white:0,blue:0,green:0,red:2,black:0,gold:0});state=applyAction(state,seat,{type:'take',colors:['green','red','black']});
  }
  assertSplendor(state);
  const view=viewSplendor(state,spectator?null:0,spectator);return {...view,players:view.players.map((player,seat)=>({...player,...roster[seat]}))};
}

// Manual display data only. This page never loads or writes a real game save.
const previewRoster:StablePlayer[]=[
  {playerId:'preview-you',name:'你',kind:'human'},
  {playerId:'preview-north',name:'北河',kind:'codex-acp'},
  {playerId:'preview-tide',name:'观澜',kind:'codex-acp'},
  {playerId:'preview-echo',name:'回声',kind:'codex-acp'},
];
function motionGame(){
  let seed=24;
  const state=createSplendor(`splendor-motion-${Date.now()}`,previewRoster.map((player,seat)=>({...player,kind:seat===0?'human':'agent'})),{random:()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}});
  for(const player of state.players){
    for(const color of COLORS){player.tokens[color]=1;state.bank[color]--;}
    const extra=COLORS[player.seat];player.tokens[extra]++;state.bank[extra]--;
    player.wins=player.seat+1;player.totalPoints=40+player.seat*7;
  }
  // Put an affordable card in the market for each seat; all actions below still
  // go through the real rules engine and preserve cards and bank resources.
  for(const player of state.players){
    const card=CARDS.find(card=>card.level===1&&defaultPayment(player,card)&&!state.market[1].includes(card.id))!;
    state.decks[1].splice(state.decks[1].indexOf(card.id),1);
    state.decks[1].push(state.market[1][player.seat]!);state.market[1][player.seat]=card.id;
  }
  assertSplendor(state);return state;
}
function displayGame(roster:StablePlayer[],reveal:boolean,spectator:boolean,loaded:boolean):ControlledView<SplendorView>{
  const market=Object.fromEntries(LEVELS.map(level=>[level,COLORS.slice(0,4).map(color=>CARDS.find(card=>card.level===level&&card.bonus===color)!)])) as SplendorView['market'];
  const marketIds=new Set(Object.values(market).flat().map(card=>card!.id));
  const pools=Object.fromEntries(COLORS.map(color=>[color,CARDS.filter(card=>card.bonus===color&&!marketIds.has(card.id))])) as Record<typeof COLORS[number],Card[]>;
  const bought=roster.map(()=>[] as Card[]);
  for(let round=0;round<3;round++)for(let seat=0;seat<roster.length;seat++)for(const color of COLORS)bought[seat].push(pools[color].shift()!);
  for(let seat=0;seat<roster.length;seat++)bought[seat].push(pools[COLORS[seat]].shift()!);
  const remaining=COLORS.flatMap(color=>pools[color]);
  const bank={white:7,blue:7,green:7,red:7,black:7,gold:5};
  const reserveEvents:Event[]=[];
  const players=roster.map((player,seat)=>{
    const tokens=emptyTokens();
    COLORS.forEach((color,index)=>{tokens[color]=[2,1,2,1,1][(index+seat)%5];bank[color]-=tokens[color];});
    tokens.gold=1;bank.gold--;
    const nobles=Array.from({length:3},(_,index)=>NOBLES[(seat*2+index)%NOBLES.length]);
    return {...player,seat,tokens,bought:bought[seat],nobles,
      reserved:remaining.splice(0,3).map((card,index)=>{
        const source=index===1?'deck' as const:'market' as const,visible=source==='market'||reveal||spectator;
        reserveEvents.push({seq:reserveEvents.length+6,time:'2026-10-25T14:00:00.000Z',type:source==='deck'?'reserveDeck':'reserve',seat,level:card.level,text:(source==='deck'?`暗抽 ${visible?cardName(card):`${card.level} 级卡`} 并预留`:`市场预留 ${cardName(card)}`)+'，获得 1 黄金',...(visible?{cards:[card.id]}:{})});
        return {level:card.level,source,card:visible||seat===0?card:null};
      }),
      bonuses:Object.fromEntries(COLORS.map(color=>[color,bought[seat].filter(card=>card.bonus===color).length])) as SplendorView['players'][number]['bonuses'],
      points:bought[seat].reduce((sum,card)=>sum+card.points,9),wins:seat,totalPoints:42+seat*7,
    };
  });
  const events=players.map((player,index)=>({seq:index+2,time:'2026-10-25T14:00:00.000Z',type:'buy',seat:player.seat,text:`购入${cardName(player.bought.at(-1)!)}，已有 16 张建筑、3 位贵族。`,cards:[player.bought.at(-1)!.id]}));
  if(!loaded){
    for(const player of players){player.bought=[];player.reserved=[];player.nobles=[];player.points=0;player.tokens=emptyTokens();for(const color of COLORS)player.bonuses[color]=0;}
    for(const color of COLORS)bank[color]=7;bank.gold=5;
  }
  const own=players[0],engineOwn={...own,kind:'human' as const,bought:own.bought.map(card=>card.id),reserved:own.reserved.map(reserved=>({cardId:reserved.card!.id,level:reserved.level,source:reserved.source,revealed:true})),nobles:own.nobles.map(noble=>noble.id)};
  const buys=Object.values(market).flat().filter((card):card is Card=>!!card).concat(own.reserved.flatMap(reserved=>reserved.card?[reserved.card]:[])).flatMap(card=>{
    const payment=defaultPayment(engineOwn,card);
    return payment?[{id:`buy:${card.id}`,label:`购买${cardName(card)}`,action:{type:'buy' as const,cardId:card.id,payment}}]:[];
  });
  return {
    gameId:'splendor',id:'splendor-full-display',round:1,revision:loaded?81:1,phase:'action',turn:0,firstSeat:0,turnsTaken:roster.map(()=>loaded?20:0),finalRound:loaded,viewer:spectator?null:0,
    players,bank,market,nobles:NOBLES.slice(5),deckCounts:Object.fromEntries(LEVELS.map(level=>[level,loaded?remaining.filter(card=>card.level===level).length:CARDS.filter(card=>card.level===level).length-4])) as SplendorView['deckCounts'],
    result:null,returnCount:0,eligibleNobles:[],
    events:[{seq:1,time:'2026-10-25T14:00:00.000Z',type:'setup',text:loaded?'满载界面展示：每位玩家 16 张建筑、3 张预留、3 位贵族。':'空桌布局对照。'},...(loaded?[...events,...reserveEvents]:[])],
    legalActions:spectator?[]:[...buys,...COLORS.flatMap((first,i)=>COLORS.slice(i+1).flatMap((second,j)=>COLORS.slice(i+j+2).map(third=>({id:`take:${first},${second},${third}`,label:'拿取三色宝石',action:{type:'take' as const,colors:[first,second,third]}}))))],
  };
}
function SplendorPreview(){
  const [boundary,setBoundary]=useState<BoundaryCase>('');
  const [reveal,setReveal]=useState(false),[spectator,setSpectator]=useState(false),[paused,setPaused]=useState(false),[loaded,setLoaded]=useState(true),[message,setMessage]=useState('');
  const [motion,setMotion]=useState(false),[motionState,setMotionState]=useState(motionGame);
  const effects=useEffectsPreference();
  useEffect(()=>{document.documentElement.dataset.reducedMotion=String(effects.reduced);},[effects.reduced]);
  const roster=useMemo<StablePlayer[]>(()=>previewRoster.map(player=>spectator&&player.kind==='human'?{...player,name:'南辰',kind:'codex-acp'}:player),[spectator]);
  const game=useMemo(()=>{
    if(boundary)return boundaryGame(roster,spectator,boundary);
    if(!motion)return displayGame(roster,reveal,spectator,loaded);
    const view=viewSplendor(motionState,spectator?null:0,reveal||spectator);
    return {...view,players:view.players.map((player,seat)=>({...player,...roster[seat]}))};
  },[roster,reveal,spectator,loaded,motion,motionState,boundary]);
  const state:AppSnapshot={connector:null,connected:true,connectorUpdateRequired:false,game,room:{moduleId:'splendor',moduleVersion:'1.0.0',stateVersion:1,roomId:game.id,runId:game.id,index:1,roster,config:{edition:'base-2024'},finished:false},seats:roster.map((player,seat)=>({...player,seat,status:'ready',turns:20,tokens:0})),paused,curiosityMode:reveal,conversations:{},conversationError:null,error:null,storageError:null,history:[],activity:{phase:'满载界面展示',actors:[]}};
  if(boundary)state.seats[2]={...state.seats[2],settings:{model:'gpt-6.1-sol',modelName:'GPT-6.1-Sol',reasoningEffort:'xhigh'}};
  const perform=(action?:Action)=>{if(!action||paused)return;try{setMotionState(applyAction(motionState,motionState.turn,action));}catch(error){setMessage((error as Error).message);}};
  const choices=motion?legalActions(motionState,motionState.turn):[];
  const marketBuy=choices.find(choice=>choice.action.type==='buy'&&motionState.market[CARD_BY_ID[choice.action.cardId].level].includes(choice.action.cardId));
  const reservedBuy=choices.find(({action})=>action.type==='buy'&&motionState.players[motionState.turn].reserved.some(card=>card.cardId===action.cardId));
  const marketReserve=choices.find(choice=>choice.action.type==='reserve'&&defaultPayment(motionState.players[motionState.turn],CARD_BY_ID[choice.action.cardId]));
  const deckReserve=choices.find(choice=>choice.action.type==='reserveDeck'&&choice.action.level===1);
  const next=choices.find(choice=>['take','return','noble','pass'].includes(choice.action.type));
  const take=choices.find(choice=>choice.action.type==='take'),pair=choices.find(choice=>choice.action.type==='pair');
  const motionButtons:Array<[string,LegalAction|undefined]>=[['拿三色宝石',take],['拿同色两枚',pair],['市场购买',marketBuy],['市场预留',marketReserve],['暗抽预留',deckReserve],['购买预留',reservedBuy],['继续回合',next]];
  const controller={humanAction:(action:Action)=>motion?perform(action):setMessage('这是界面展示局面；卡牌选择与背包可操作，确认行动不会改变正式对局。')} as unknown as GameController;
  return <div className="app-shell"><GameBackground enabled theme="splendor"/><VisualExperience enabled page="table"/><div className="app-content">
    <header className="site-header"><a className="brand" href="/"><Logo/><strong>同桌</strong><small>TONGZHUO</small></a><span style={{fontSize:11,color:'var(--muted)'}}>手动检查 · {motion?'使用真实规则执行行动':'每人 16 张发展牌 / 3 张预留 / 3 位贵族'}</span></header>
    <main id="main"><div className="game-page">
      <GameChrome title="璀璨宝石" status={boundary?boundaryCases.find(item=>item.value===boundary)!.label:motion?'卡牌动画检查':loaded?'满载界面展示':'空桌布局对照'} actions={<><select aria-label="玩家卡检查场景" value={boundary} onChange={event=>{setBoundary(event.target.value as BoundaryCase);setMotion(false);setPaused(false);}}>{boundaryCases.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select><button className="text-button" onClick={()=>{setBoundary('');setMotion(value=>!value);}}>{motion?'返回布局检查':'检查卡牌动画'}</button>{motion?<button className="text-button" onClick={()=>setMotionState(motionGame())}>重置动画局面</button>:<button className="text-button" onClick={()=>{setBoundary('');setLoaded(value=>!value);}}>{loaded?'切到空桌对照':'切回满载局面'}</button>}<button className="text-button" disabled={spectator} onClick={()=>setReveal(value=>!value)}>{reveal||spectator?'暗抽全部可见':'对手暗抽保密'}</button><button className="text-button" onClick={()=>setSpectator(value=>!value)}>{spectator?'切回真人视角':'检查 Agent 观战视角'}</button></>}/>
      {motion&&<div style={{display:'flex',alignItems:'center',gap:14,marginBottom:12,fontSize:11,color:'var(--muted)'}}><span>当前：{game.players[game.turn].name}</span>{motionButtons.map(([label,choice])=><button className="text-button" key={label} disabled={paused||!choice} onClick={()=>perform(choice?.action)}>{label}</button>)}</div>}
      <AgentRuntimeContext.Provider value={state.seats}><SplendorTable state={state} controller={controller} onError={setMessage} tableActions={<div className="game-actions"><button className="button outline" onClick={()=>setPaused(value=>!value)}>{paused?'继续展示':'暂停展示'}</button></div>}/></AgentRuntimeContext.Provider>
    </div></main>
    <footer className="site-footer"><span style={{fontSize:10,color:'var(--muted)'}}>{motion?'动画检查局面':'界面展示数据 · 贵族数量特意加大'} · 不写入正式存档</span><EffectsControls/></footer>
    {message&&<div className="toast" role="status"><span>{message}</span><button className="icon-button" aria-label="关闭消息" onClick={()=>setMessage('')}>×</button></div>}
  </div></div>;
}

const previewRoot=import.meta.hot?.data.previewRoot??createRoot(document.getElementById('root')!);
if(import.meta.hot)import.meta.hot.data.previewRoot=previewRoot;
previewRoot.render(<SplendorPreview/>);
