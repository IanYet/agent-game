import {lazy,Suspense,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {ArrowUpRight,Download,History,Pause,Play,Settings2,X} from 'lucide-react';
import type {AppSnapshot,StoredRun,PlayerConfig} from './runtime/types';
import {WEB_VERSION} from './version';
import {gameRegistry} from './games/registry';
import {Logo,Dot,PrimaryButton} from './UiBits';
import {useEffectsPreference} from './visuals/preferences';
import {EffectsControls} from './visuals/EffectsControls';
import {controller} from './application';
import {Modal} from './Modal';
import {SetupModal,NextRunModal,createDraft,type SetupDraft} from './TableSetup';
import {PlayerSettingsModal} from './PlayerSettingsModal';
import {ConnectionPanel} from './ConnectionPanel';
import {GameGallery,type GalleryGame} from './visuals/GameGallery';
import {GameBackground} from './visuals/GameBackground';
import {GameChrome} from './GameChrome';
const VisualExperience=lazy(()=>import('./visuals/VisualExperience').then(module=>({default:module.VisualExperience})));

type Page='lobby'|'table'|'history';
export function App(){
  const effects=useEffectsPreference();
  useEffect(()=>{document.documentElement.dataset.reducedMotion=String(effects.reduced);},[effects.reduced]);
  const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot);
  const [requestedPage,setPage]=useState<Page>('lobby'),[selected,setSelected]=useState<string|null>(null),[setup,setSetup]=useState(false),[connection,setConnection]=useState(false),[connectTarget,setConnectTarget]=useState<'setup'|'table'|'next'|null>(null);
  const page=requestedPage==='table'&&!state.connected?'lobby':requestedPage;
  const [drafts,setDrafts]=useState<Record<string,SetupDraft>>({}),[rules,setRules]=useState(false),[players,setPlayers]=useState(false),[next,setNext]=useState(false),[busy,setBusy]=useState(false),[toast,setToast]=useState('');
  const currentModule=state.room?gameRegistry.get(state.room.moduleId):null,Table=currentModule?.ui?.Table;
  const [nextPlayers,setNextPlayers]=useState<PlayerConfig[]|null>(null);
  useEffect(()=>{setNextPlayers(null);},[state.room?.runId]);
  const overlay=setup||connection||rules||players||next;
  const gate=useRef(false);
  const run=async(action:()=>Promise<void>)=>{if(gate.current)return;gate.current=true;setBusy(true);try{await action();}catch(e){setToast((e as Error).message);}finally{gate.current=false;setBusy(false);}};
  const scrollTarget=useRef<'top'|'games'>('top');
  useEffect(()=>{if(scrollTarget.current==='games'){document.getElementById('games')?.scrollIntoView({behavior:effects.reduced?'instant':'smooth'});scrollTarget.current='top';}else window.scrollTo({top:0,behavior:'instant'});},[page]);
  const navigate=(to:Page)=>{
    // Read the live snapshot: async creation can finish after the connection changes.
    if(to==='table'){
      const current=controller.getSnapshot();
      if(!current.connected){setConnectTarget('table');setConnection(true);return;}
      if(!current.room)return;
    }
    setPage(to);if(to===page)window.scrollTo({top:0,behavior:'instant'});
  };
  useEffect(()=>{
    if(requestedPage!=='table'||state.connected)return;
    setPage('lobby');setRules(false);setPlayers(false);setNext(false);
    setConnectTarget('table');setConnection(true);
  },[requestedPage,state.connected]);
  const gallery=()=>{if(page!=='lobby'){scrollTarget.current='games';setPage('lobby');}else document.getElementById('games')?.scrollIntoView({behavior:effects.reduced?'instant':'smooth'});};
  const choose=(id:string)=>{setSelected(id);setDrafts(all=>all[id]?all:{...all,[id]:createDraft(state,gameRegistry.get(id))});setSetup(true);};
  const closeSetup=()=>{setSetup(false);requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>(`[data-game-id="${selected}"] .r-accordion-choice`)?.focus({preventScroll:true}));};
  useEffect(()=>{if(!toast)return;const id=setTimeout(()=>setToast(''),6000);return()=>clearTimeout(id);},[toast]);
  useEffect(()=>{const visibility=()=>document.documentElement.classList.toggle('page-hidden',document.hidden);visibility();document.addEventListener('visibilitychange',visibility);return()=>document.removeEventListener('visibilitychange',visibility);},[]);
  useEffect(()=>{document.documentElement.dataset.scene=page==='table'?'game':'public';return()=>{delete document.documentElement.dataset.scene;};},[page]);
  return <div className="app-shell">{page==='table'&&state.room&&<GameBackground enabled={!overlay}/>}<div className="app-content" data-motion-paused={overlay}>
    <a className="skip-link" href="#main">跳到内容</a><header className="site-header"><button className="brand" onClick={()=>navigate('lobby')} aria-label="同桌，返回首页"><Logo/><strong>同桌</strong><small>TONGZHUO</small></button><nav aria-label="主导航"><button className="nav-roll" aria-label="游戏" onClick={gallery}><span aria-hidden="true" data-text="游戏">游戏</span></button>{state.room&&<button className={`nav-current ${page==='table'?'active':''}`} onClick={()=>navigate('table')}>当前桌<span className="nav-current-status" data-state={state.room.finished?'finished':state.paused?'paused':'playing'}><Dot on={!state.paused&&!state.room.finished}/>{state.room.finished?'已结束':state.paused?'已暂停':'进行中'}</span></button>}<button className={`nav-roll ${page==='history'?'active':''}`} aria-label="已完成记录" onClick={()=>navigate('history')}><span aria-hidden="true" data-text="已完成记录">已完成记录</span>{state.history.length>0&&<small>{state.history.length}</small>}</button></nav><button className="connect-button" onClick={()=>{setConnectTarget(null);setConnection(true);}}><Dot on={state.connected}/>{state.connected?'本机已连接':'连接本机'}<ArrowUpRight size={15}/></button></header>
    <main id="main" tabIndex={-1}>{state.error&&<div className="error-banner" role="alert"><span>{state.error}</span>{!state.connected&&<button onClick={()=>{setConnectTarget(state.room?'table':null);setConnection(true);}}>连接与恢复 ↗</button>}<button className="icon-button" onClick={()=>controller.clearError()} aria-label="关闭提示"><X size={16}/></button></div>}
      {page==='lobby'&&<Lobby onSelect={choose} onGallery={gallery} enabled={!overlay}/>}
      {page==='history'&&<HistoryPage state={state} onGallery={gallery} onError={setToast}/>}
      {page==='table'&&state.room&&currentModule&&Table&&<div className="game-page" data-game-scene="true">
        <GameChrome title={currentModule.name} status={state.room.finished?'已结束':state.paused?'已暂停':state.activity?.phase} actions={<>
          <button className="text-button" onClick={()=>setRules(true)}>规则 ↗</button>
          <button className="button outline" onClick={()=>setPlayers(true)}><Settings2 size={14}/>玩家与模型</button>
          <button className="text-button" onClick={gallery}>选择新桌 ↗</button>
        </>}/>
        <Table state={state} controller={controller} onError={setToast} tableActions={<div className="game-actions">{state.room.finished?<PrimaryButton onClick={()=>setNext(true)}>准备下一{currentModule.runNoun}<ArrowUpRight size={18}/></PrimaryButton>:<PrimaryButton disabled={busy} onClick={()=>!state.connected?(setConnectTarget('table'),setConnection(true)):void run(()=>state.paused?controller.resume():controller.pause())}>{state.paused?<Play size={14}/>:<Pause size={14}/>} {state.paused?'继续游戏':'暂停'}</PrimaryButton>}</div>}/>
      </div>}
    </main><footer className="site-footer"><span className="footer-build">LOCAL FIRST / v{WEB_VERSION}</span><EffectsControls/><a href={`${import.meta.env.BASE_URL}licenses/NOTICE.txt`} target="_blank" rel="noreferrer">来源与许可 ↗</a></footer>
    </div>
    {!effects.static&&<Suspense fallback={null}><VisualExperience enabled={!overlay} page={page}/></Suspense>}
    {connection&&<ConnectionPanel state={state} symbol={connectTarget==='setup'&&selected?gameRegistry.get(selected).presentation.symbol:connectTarget?currentModule?.presentation.symbol:undefined} selection={connectTarget==='setup'&&selected?gameRegistry.get(selected).name:connectTarget==='table'?currentModule?.name:undefined} onClose={()=>setConnection(false)} onConnect={()=>controller.connect()} onDisconnect={()=>controller.disconnect()} onContinue={connectTarget?()=>{if(!controller.getSnapshot().connected)return;setConnection(false);if(connectTarget==='setup'&&selected){setDrafts(all=>all[selected]?all:{...all,[selected]:createDraft(state,gameRegistry.get(selected))});setSetup(true);}else if(connectTarget==='next'){navigate('table');setNext(true);}else if(connectTarget==='table')navigate('table');}:undefined}/>}
    {setup&&selected&&drafts[selected]&&<SetupModal state={state} gameId={selected} draft={drafts[selected]} onDraft={draft=>setDrafts(all=>({...all,[selected]:draft}))} onClose={closeSetup} onConnect={()=>{setSetup(false);setConnectTarget('setup');setConnection(true);}} onBack={()=>{closeSetup();gallery();}} onStart={async(players,persistConversations,gameId,config)=>{await controller.create(players,{persistConversations,gameId,config});setSetup(false);navigate('table');}}/>}
    {rules&&<Modal symbol={currentModule?.presentation.symbol} title={`${currentModule?.name??'游戏'}规则`} subtitle="规则来自游戏模块" onClose={()=>setRules(false)}><div className="rules-copy">{controller.rules().split('\n').map((p,i)=><p key={i}>{p}</p>)}</div></Modal>}
    {players&&<PlayerSettingsModal state={state} busy={busy} onClose={()=>setPlayers(false)} onConnect={()=>{setPlayers(false);setConnectTarget('table');setConnection(true);}} onPause={()=>controller.pause()} onSave={configs=>{controller.configurePlayers(configs);setPlayers(false);}}/>}
    {next&&<NextRunModal state={state} controller={controller} players={nextPlayers??state.room!.roster.map(p=>({...p}))} onPlayers={setNextPlayers} onClose={()=>setNext(false)} onConnect={()=>{setNext(false);setConnectTarget('next');setConnection(true);}} onStart={async configs=>{await controller.nextRound(configs);setNext(false);}}/>}
    {toast&&<div className="toast" role="status"><span>{toast}</span><button className="icon-button" onClick={()=>setToast('')} aria-label="关闭消息"><X size={16}/></button></div>}
  </div>;
}

function Lobby({onSelect,onGallery,enabled}:{onSelect:(id:string)=>void;onGallery:()=>void;enabled:boolean}){
  const games:GalleryGame[]=gameRegistry.list().map(m=>({id:m.id,name:m.name,english:m.presentation.english,players:`${m.minPlayers===m.maxPlayers?m.minPlayers:`${m.minPlayers}–${m.maxPlayers}`} 位参与者`,symbol:m.presentation.symbol,tone:m.presentation.tone}));
  return <>
    <section className="resonance-hero"><div className="hero-meta"><span>HUMAN × AGENT</span><span>不同的思考。同一张桌。</span></div><h1 className="hero-title" aria-label="YOUR MOVE. 你出招"><span className="hero-title-fallback" aria-hidden="true">YOUR<br/>MOVE.</span></h1><div className="glass-art" tabIndex={0} role="img" aria-label="白光照向玻璃环，经过玻璃折射后产生色散。自动缓缓旋转，拖动或用方向键调整角度。"><div className="glass-fallback"/><canvas data-visual="hero" aria-hidden="true"/><span className="orbit-human">○ HUMAN</span><span className="orbit-agent">◇ AGENT</span></div><div className="hero-bottom"><div><h2>对面，是另一种思考。</h2></div><PrimaryButton onClick={onGallery}>挑选游戏<ArrowUpRight size={23}/></PrimaryButton><span>01 / 相遇</span></div><div className="scroll-mark" aria-hidden="true"><i/>SCROLL TO PLAY</div></section>
    <div className="brand-ticker" aria-hidden="true"><div>{Array.from({length:4},(_,i)=><span key={i}>HUMAN INSTINCT <b>×</b> MACHINE INTELLIGENCE <b>×</b> A SHARED PLAYGROUND <b>×</b></span>)}</div></div>
    <section id="games" className="games-section"><header className="gallery-heading"><span className="eyebrow">02 / 游戏</span><div><h2>下一局，<br/>和谁过招。</h2><p>熟悉的规则，新的对手。</p></div><span className="gallery-count">游戏 <b>{String(games.length).padStart(2,'0')}</b></span></header><GameGallery games={games} onSelect={id=>onSelect(id)} enabled={enabled}/><div className="gallery-foot"><span>YOUR AGENTS. YOUR TABLE.</span></div></section></>;
}
function HistoryPage({state,onGallery,onError}:{state:AppSnapshot;onGallery:()=>void;onError:(s:string)=>void}){
  const [record,setRecord]=useState<StoredRun|null>(null),module=record?gameRegistry.get(record.moduleId):null,Replay=module?.ui?.Replay;
  const exportRecord=(id:string,round:number)=>{try{const run=controller.replay(id,round);if(!run)throw Error('记录不存在');const m=gameRegistry.get(run.moduleId);const value={format:'tongzhuo-public-record',version:1,gameId:m.id,index:run.index,summary:m.summary(run),publicView:m.observe(run,null)};const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`TongZhuo-${m.id}-${run.index}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){onError((e as Error).message);}};
  return <section className="history-page"><header className="page-heading"><span className="eyebrow">THE MOVES WE MADE</span><h1>每一局，都留下回声。</h1><p>最近 20 局／手的已完成结果与公开日志，仅保存在当前浏览器。可导出 JSON。</p></header>{state.history.length?<div className="history-list">{state.history.map((entry,index)=><article className="history-item" key={`${entry.id}-${entry.round}`}><span className="record-index">{String(index+1).padStart(2,'0')}</span><div><h2>{entry.title}</h2><small>{new Date(entry.endedAt).toLocaleString('zh-CN',{hour12:false})} · {entry.subtitle}</small><p>{entry.entries.map((p,i)=><span key={i}>{p.label}<b className={p.positive?'positive':''}>{p.value}</b></span>)}</p></div><button className="text-button" onClick={()=>setRecord(controller.replay(entry.id,entry.round)??null)}>查看记录 <ArrowUpRight size={18}/></button><button className="icon-button" onClick={()=>exportRecord(entry.id,entry.round)} aria-label={`导出${entry.title}`}><Download size={17}/></button></article>)}</div>:<div className="empty-state"><History size={30} strokeWidth={1}/><h2>故事从第一局开始。</h2><p>完成游戏后，结果与公开日志会留在这里。</p><PrimaryButton onClick={onGallery}>挑选游戏<ArrowUpRight size={18}/></PrimaryButton></div>}{record&&module&&<Modal symbol={module.presentation.symbol} title={`第 ${record.index} ${module.runNoun}记录`} subtitle={module.summary(record).title} onClose={()=>setRecord(null)} footer={<><small>已完成结果与公开日志</small><button className="button outline" onClick={()=>exportRecord(record.roomId,record.index)}><Download size={14}/>导出 JSON</button></>}>{Replay?<Replay run={record}/>:<p>该游戏未提供日志视图。</p>}</Modal>}</section>;
}
