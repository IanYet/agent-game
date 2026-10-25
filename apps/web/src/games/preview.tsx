import {useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Pause,Play} from 'lucide-react';
import '../styles.css';
import type {GameController} from '../controller';
import type {AppSnapshot,GameModule,StablePlayer,StoredRun} from '../runtime/types';
import {gameRegistry} from './registry';
import {GameChrome} from '../GameChrome';
import {Logo,PrimaryButton} from '../UiBits';
import {CuriosityToggle} from '../CuriosityToggle';
import {EffectsControls} from '../visuals/EffectsControls';
import {GameBackground} from '../visuals/GameBackground';
import type {TableTheme} from '../visuals/table-models';
import {VisualExperience} from '../visuals/VisualExperience';
import {useEffectsPreference} from '../visuals/preferences';

// Manual layout preview. All positions come from the real game modules;
// this page never connects to a Harness or reads/writes a saved table.
const names=['北河','观澜','回声','远山','南风','听雨','望舒','星野','兰舟'];
function randomSource(){let seed=0x5fa18;return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function createPreview(game:GameModule,human:boolean):StoredRun{
  const roster:StablePlayer[]=Array.from({length:game.maxPlayers},(_,seat)=>({playerId:`preview-${game.id}-${seat}`,name:names[seat],kind:'codex-acp'}));
  const meta={moduleId:game.id,moduleVersion:game.version,stateVersion:game.stateVersion,roomId:`preview-${game.id}`,runId:`preview-${game.id}`,index:1,roster,config:structuredClone(game.defaultConfig)};
  const initial={...meta,state:game.create(meta,randomSource())};
  if(!human)return initial;
  const actor=game.decisions(initial)[0]?.actorId??roster[0].playerId;
  meta.roster=roster.map(player=>player.playerId===actor?{...player,name:'你',kind:'human'}:player);
  return {...meta,state:game.create(meta,randomSource())};
}
function TablePreview(){
  const [gameId,setGameId]=useState('doudizhu'),[human,setHuman]=useState(true),[paused,setPaused]=useState(false),[curious,setCurious]=useState(false),[message,setMessage]=useState('');
  const effects=useEffectsPreference(),gameModule=gameRegistry.get(gameId),run=useMemo(()=>createPreview(gameModule,human),[gameModule,human]);
  useEffect(()=>{document.documentElement.dataset.scene='game';document.documentElement.dataset.reducedMotion=String(effects.reduced);},[effects.reduced]);
  const viewer=run.roster.find(player=>player.kind==='human')?.playerId??null;
  const view=gameModule.tableView(run,viewer,{revealHands:!human||curious});
  const {state:_engineState,...room}=run;
  const state:AppSnapshot={connector:null,connected:true,connectorUpdateRequired:false,game:view,room:{...room,finished:false},seats:run.roster.map((player,seat)=>({...player,seat,status:'ready',turns:0,tokens:0})),paused,curiosityMode:!human||curious,conversations:{},conversationError:null,error:null,history:[],activity:{...gameModule.activity(run),actors:[]}};
  const controller={humanAction:()=>setMessage('这是牌桌展示，不会执行正式游戏行动。')} as unknown as GameController;
  const Table=gameModule.ui!.Table,theme=(['baohuang','guandan'].includes(gameId)?'doudizhu':gameId) as TableTheme;
  const label=`最大人数 · ${gameModule.maxPlayers} 人 · ${human?'真人参与':'全 Agent'}`;
  const changeGame=(id:string)=>{setGameId(id);setPaused(false);setMessage('');};
  return <div className="app-shell"><GameBackground enabled theme={theme}/><VisualExperience enabled page="table"/><div className="app-content">
    <header className="site-header"><a className="brand" href="/"><Logo/><strong>同桌</strong><small>TONGZHUO</small></a><span style={{fontSize:11,color:'var(--muted)'}}>最大人数牌桌预览</span></header>
    <main id="main"><div className="game-page">
      <GameChrome title={gameModule.name} status={label} actions={<div style={{display:'flex',alignItems:'center',gap:12}}>
        <select aria-label="预览游戏" value={gameId} onChange={event=>changeGame(event.target.value)}>{gameRegistry.list().map(game=><option key={game.id} value={game.id}>{game.name} · {game.maxPlayers} 人</option>)}</select>
        <select aria-label="玩家模式" value={human?'human':'agents'} onChange={event=>{setHuman(event.target.value==='human');setPaused(false);setMessage('');}}><option value="human">真人 + Agent</option><option value="agents">全 Agent 观战</option></select>
      </div>}/>
      <Table key={`${gameId}:${human}`} state={state} controller={controller} onError={setMessage} tableActions={<div className="game-actions"><PrimaryButton onClick={()=>setPaused(value=>!value)}>{paused?<Play size={14}/>:<Pause size={14}/>} {paused?'继续游戏':'暂停'}</PrimaryButton></div>}/>
    </div></main>
    <footer className="site-footer">{human&&<CuriosityToggle compact enabled={curious} onChange={setCurious}/>}<span className="footer-build">本地预览 · 不连接模型</span><EffectsControls/><a href="/">返回游戏</a></footer>
    {message&&<div className="toast" role="status"><span>{message}</span><button className="icon-button" aria-label="关闭消息" onClick={()=>setMessage('')}>×</button></div>}
  </div></div>;
}
const previewRoot=import.meta.hot?.data.previewRoot??createRoot(document.getElementById('root')!);
if(import.meta.hot)import.meta.hot.data.previewRoot=previewRoot;
previewRoot.render(<TablePreview/>);
