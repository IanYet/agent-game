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
import {CARDS,NOBLES} from './data';
import {cardName,defaultPayment,emptyTokens} from './engine';
import {COLORS,LEVELS,type Card,type Event,type SplendorView} from './types';
import {SplendorTable} from './ui';

// Manual display data only. This page never loads or writes a real game save.
const roster:StablePlayer[]=[
  {playerId:'preview-you',name:'你',kind:'human'},
  {playerId:'preview-north',name:'北河',kind:'codex-acp'},
  {playerId:'preview-tide',name:'观澜',kind:'codex-acp'},
  {playerId:'preview-echo',name:'回声',kind:'codex-acp'},
];
function displayGame(reveal:boolean,spectator:boolean,loaded:boolean):ControlledView<SplendorView>{
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
  const [reveal,setReveal]=useState(false),[spectator,setSpectator]=useState(false),[paused,setPaused]=useState(false),[loaded,setLoaded]=useState(true),[message,setMessage]=useState('');
  const effects=useEffectsPreference();
  useEffect(()=>{document.documentElement.dataset.reducedMotion=String(effects.reduced);},[effects.reduced]);
  const game=useMemo(()=>displayGame(reveal,spectator,loaded),[reveal,spectator,loaded]);
  const state:AppSnapshot={connector:null,connected:true,connectorUpdateRequired:false,game,room:{moduleId:'splendor',moduleVersion:'1.0.0',stateVersion:1,roomId:game.id,runId:game.id,index:1,roster,config:{edition:'base-2024'},finished:false},seats:roster.map((player,seat)=>({...player,seat,status:'ready',turns:20,tokens:0})),paused,curiosityMode:reveal,conversations:{},conversationError:null,error:null,history:[],activity:{phase:'满载界面展示',actors:[]}};
  const controller={humanAction:()=>setMessage('这是界面展示局面；卡牌选择与背包可操作，确认行动不会改变正式对局。')} as unknown as GameController;
  return <div className="app-shell"><GameBackground enabled theme="splendor"/><VisualExperience enabled page="table"/><div className="app-content">
    <header className="site-header"><a className="brand" href="/"><Logo/><strong>同桌</strong><small>TONGZHUO</small></a><span style={{fontSize:11,color:'var(--muted)'}}>手动检查 · 每人 16 张建筑 / 3 张预留 / 3 位贵族</span></header>
    <main id="main"><div className="game-page">
      <GameChrome title="璀璨宝石" status={loaded?'满载界面展示':'空桌布局对照'} actions={<><button className="text-button" onClick={()=>setLoaded(value=>!value)}>{loaded?'切到空桌对照':'切回满载局面'}</button><button className="text-button" disabled={spectator} onClick={()=>setReveal(value=>!value)}>{reveal||spectator?'暗抽全部可见':'对手暗抽保密'}</button><button className="text-button" onClick={()=>setSpectator(value=>!value)}>{spectator?'切回真人视角':'检查 Agent 观战视角'}</button></>}/>
      <SplendorTable state={state} controller={controller} onError={setMessage} tableActions={<div className="game-actions"><button className="button outline" onClick={()=>setPaused(value=>!value)}>{paused?'继续展示':'暂停展示'}</button></div>}/>
    </div></main>
    <footer className="site-footer"><span style={{fontSize:10,color:'var(--muted)'}}>界面展示数据 · 贵族数量特意加大 · 不写入正式存档</span><EffectsControls/></footer>
    {message&&<div className="toast" role="status"><span>{message}</span><button className="icon-button" aria-label="关闭消息" onClick={()=>setMessage('')}>×</button></div>}
  </div></div>;
}

const previewRoot=import.meta.hot?.data.previewRoot??createRoot(document.getElementById('root')!);
if(import.meta.hot)import.meta.hot.data.previewRoot=previewRoot;
previewRoot.render(<SplendorPreview/>);
