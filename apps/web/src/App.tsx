import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, CircleHelp, Club, Copy, Cpu, Download, ExternalLink, Gamepad2, History, Layers3, Link2, Loader2, LockKeyhole, Monitor, MoreHorizontal, Pause, Play, Plus, Radio, RotateCcw, Settings2, ShieldCheck, Sparkles, Spade, Square, Table2, Unplug, User, Users, Wifi, X, Zap } from 'lucide-react';
import type {AppSnapshot,StoredRun} from './runtime/types';
import {WEB_VERSION} from './version';
import {gameRegistry} from './games/registry';
import {Logo,Dot,StatusTag} from './UiBits';
import { GameController } from './controller';
import { AgentModelFields, kindName } from './AgentModelFields';
import { Modal } from './Modal';
import { SetupModal } from './TableSetup';


const controller = new GameController(localStorage);
type Page = 'lobby' | 'table' | 'history' | 'connector';
export function App() {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [page, setPage] = useState<Page>('lobby');
  const defaultModule=gameRegistry.list()[0];
  const currentModule=state.room?gameRegistry.get(state.room.moduleId):defaultModule;
  const Table=currentModule.ui?.Table;
  const [setup, setSetup] = useState<string | null>(null);
  const [rules, setRules] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const notify = (message: string) => { setToast(message); };
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 5500); return () => clearTimeout(id); }, [toast]);
  const run = async (action: () => Promise<void>) => { setBusy(true); try { await action(); } catch (error: any) { notify(error.message); } finally { setBusy(false); } };
  const connect = () => run(async () => { await controller.connect(); notify('本机连接器已连接，可以入座了'); });
  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => setPage('lobby')} aria-label="同桌，返回游戏大厅"><Logo /><span><strong>同桌<span className="brand-dot">.</span></strong><small>AGENT ARCADE</small></span></button>
      <div className="nav-label">一起玩点什么</div>
      <nav aria-label="主导航">
        <button className={page === 'lobby' ? 'active' : ''} onClick={() => setPage('lobby')}><Gamepad2 size={19} />游戏大厅<ChevronRight className="nav-arrow" size={15} /></button>
        <button className={page === 'table' ? 'active' : ''} onClick={() => state.game ? setPage('table') : setSetup(defaultModule.id)}><Table2 size={19} />我的牌桌{state.game && <Dot on={!state.paused && !state.room?.finished} />}</button>
        <button className={page === 'history' ? 'active' : ''} onClick={() => setPage('history')}><History size={19} />对局记录{state.history.length > 0 && <span className="nav-count">{state.history.length}</span>}</button>
      </nav>
      <div className="sidebar-divider" />
      <div className="nav-label">我的搭档</div>
      <nav><button className={page === 'connector' ? 'active' : ''} onClick={() => setPage('connector')}><Cpu size={19} />本地连接<span className={`nav-state ${state.connected ? 'green' : ''}`}>{state.connected ? '已连接' : '未连接'}</span></button></nav>
      <div className="sidebar-note"><div className="note-icon"><Spade size={18} /></div><strong>好牌，留给好搭档。</strong><p>一点默契，一点运气。<br />今天也和 agents 玩一局。</p></div>
      <div className="sidebar-bottom"><span><Dot on={state.connected} />{state.connected ? '本机连接就绪' : '等待本机连接'}</span><small>本地优先 <span>v{WEB_VERSION}</span></small></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><span className="breadcrumb">同桌 <ChevronRight size={13} /><b>{({ lobby: '游戏大厅', table: state.game ? currentModule.name : '我的牌桌', history: '对局记录', connector: '本地连接' })[page]}</b></span><div className="topbar-right"><span className="local-pill"><Monitor size={13} />本机同桌</span><button className="icon-button" onClick={() => setRules(true)} aria-label="游戏规则"><CircleHelp size={19} /></button><div className="user-chip"><User size={17} /></div></div></header>
      <main className={`main-content page-${page}`}>
        {state.error && <div className="error-banner" role="alert"><CircleHelp size={17} /><span>{state.error}</span>{state.connectorUpdateRequired && <ConnectorDownload label="下载最新连接器" onError={notify} />}<button onClick={() => controller.clearError()} aria-label="关闭提示"><X size={16} /></button></div>}
        {page === 'lobby' && <Lobby state={state} busy={busy} onSetup={id => setSetup(id ?? defaultModule.id)} onConnect={connect} onResume={() => setPage('table')} onConnector={() => setPage('connector')} onError={notify} />}
        {page === 'table' && state.room && Table && <Table controller={controller} state={state} busy={busy} onRules={() => setRules(true)} onSetup={() => setSetup(currentModule.id)} onBack={() => setPage('lobby')} onError={notify} run={run} />}
        {page === 'history' && <HistoryPage state={state} onSetup={() => setSetup(defaultModule.id)} />}
        {page === 'connector' && <ConnectorPage state={state} busy={busy} onConnect={connect} onDisconnect={() => run(() => controller.disconnect())} onToast={notify} />}
      </main>
      <footer className="site-footer"><span>人类与 agents 的游戏时间。</span><span><LockKeyhole size={12} />牌局保存在这个浏览器中</span></footer>
    </div>
    {setup && <SetupModal state={state} initialGame={setup} onClose={() => setSetup(null)} onConnect={connect} onStart={async (players, persistConversations, gameId, config) => { await controller.create(players, { persistConversations, gameId, config }); setSetup(null); setPage('table'); }} />}
    {rules && <Modal title="这一桌的规则" subtitle={currentModule.name} onClose={() => setRules(false)}><div className="rules-copy">{controller.rules().split('\n').map((p,i)=><p key={i}>{p}</p>)}</div></Modal>}
    {toast && <div className="toast" role="status"><CheckCircle2 size={18} /><span>{toast}</span><button onClick={() => setToast('')} aria-label="关闭"><X size={15} /></button></div>}
  </div>;
}

function Lobby({ state, busy, onSetup, onConnect, onResume, onConnector, onError }: { state: AppSnapshot; busy: boolean; onSetup: (gameId?: string) => void; onConnect: () => void; onResume: () => void; onConnector: () => void; onError: (message: string) => void }) {
  const currentModule=state.room?gameRegistry.get(state.room.moduleId):gameRegistry.list()[0];
  return <>
    <section className="lobby-hero"><div className="hero-copy"><div className="eyebrow"><span />THE HUMAN + AGENT PLAYGROUND</div><h1>和你的 agents，<br /><span>坐下来玩一局。</span></h1><p>熟悉的游戏，不一样的搭档。<br />带上你的 agents，让默契从这张牌桌开始。</p><button className="button primary" onClick={() => onSetup()}>来一局 <ArrowRight size={16} /></button></div><div className="hero-art" aria-hidden="true"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><span className="art-spark spark-one">✦</span><span className="art-spark spark-two">+</span><div className="art-seat seat-one"><User size={23} /></div><div className="art-seat seat-two"><Sparkles size={23} /></div><div className="art-seat seat-three"><Sparkles size={23} /></div><div className="hero-card hc-one"><b>A</b><span>♣</span><i>♣</i></div><div className="hero-card hc-two"><b>K</b><span>♥</span><i>♥</i></div><div className="hero-card hc-three"><b>A</b><span>♠</span><i>♠</i></div><div className="art-caption"><Dot />YOUR AGENTS. YOUR TABLE.</div></div></section>
    {state.room && !state.room.finished && <button className="resume-strip" onClick={onResume}><span className="resume-icon"><Table2 size={20}/></span><span><strong>你的牌桌还在这里</strong><small>{currentModule.name} · 第 {state.room.index} {currentModule.runNoun} · {state.paused ? '已暂停' : '进行中'}</small></span><b>回到牌桌 <ArrowRight size={16}/></b></button>}
    <div className="section-heading"><div><h2>挑一款，开一桌<span>{gameRegistry.list().length.toString().padStart(2,'0')}</span></h2><p>从经典开始，更多游戏陆续入座。</p></div><span className="subtle-label"><Square size={11} fill="currentColor" />所有游戏</span></div>
    <div className="lobby-grid">
      {gameRegistry.list().map(module=>{const Cover=module.ui?.Cover;return <article className={`game-feature ${module.ui?.cardClass??''}`} key={module.id}>{Cover && <Cover/>}<div className="game-description"><div><h3>{module.name} <span>{module.tagline}</span></h3><p>{module.description}</p><div className="game-tags"><span><Users size={13}/>{module.minPlayers===module.maxPlayers?module.minPlayers:`${module.minPlayers}–${module.maxPlayers}`} 位玩家</span><span><User size={13}/>0–1 位真人</span><span><Sparkles size={13}/>支持全 Agent</span></div></div><button className="button primary" onClick={()=>onSetup(module.id)}>创建牌桌 <ArrowRight size={15}/></button></div></article>;})}
      <div className="lobby-side"><article className="connection-card"><div className="card-heading"><span className="line-icon"><Cpu size={19} /></span><h3>让你的 agent 入座</h3><button className="icon-button" onClick={onConnector} aria-label="查看连接说明"><ArrowRight size={17} /></button></div><p>复用各 Harness 已有登录与订阅。<br />启动连接器，然后一键连接。</p><div className="harness-row"><span className="codex-mark">✳</span><span><strong>Codex · dsh · WorkBuddy</strong><small>按座位选择，各用自己的模型目录</small></span><StatusTag tone={state.connected ? 'green' : ''}>{state.connected ? '已连接' : '等待连接'}</StatusTag></div>{state.connectorUpdateRequired && <div className="connection-upgrade"><p>当前连接器 v{state.connector?.version} 不兼容，请下载新版并退出旧版。</p><ConnectorDownload label="下载最新连接器" onError={onError} /></div>}<button className={`button full ${state.connected ? 'soft' : 'dark'}`} disabled={busy || state.connected} onClick={onConnect}>{busy ? <Loader2 size={16} className="spin" /> : state.connected ? <Check size={16} /> : <Link2 size={16} />}{state.connected ? '搭档已就绪' : '连接本机'}</button><span className="microcopy"><ShieldCheck size={12} />登录凭据留在本机</span></article></div>
    </div>
    <div className="principles"><div><span><Monitor size={19} /></span><p><strong>一台电脑，一张牌桌</strong><small>自己玩，或看 agents 过招</small></p></div><div><span><Layers3 size={19} /></span><p><strong>每位搭档，独立会话</strong><small>自己的手牌，自己的策略</small></p></div><div><span><Zap size={19} /></span><p><strong>用你已有的订阅</strong><small>沿用各自登录与模型目录</small></p></div></div>
  </>;
}

function HistoryPage({state,onSetup}:{state:AppSnapshot;onSetup:()=>void}){
 const [replay,setReplay]=useState<StoredRun|null>(null);
 const module=replay?gameRegistry.get(replay.moduleId):null,Replay=module?.ui?.Replay;
 const download=(value:unknown,name:string)=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 return <><div className="standard-heading"><div className="eyebrow">GOOD GAMES, GOOD MEMORIES</div><h1>每一局，都算数。</h1><p>这些默契和好牌，只保存在你的浏览器里。</p></div>
 {!state.history.length?<div className="empty-state"><History size={36} strokeWidth={1.3}/><h2>故事从第一局开始</h2><p>完成一局游戏，就会在这里留下记录。</p><button className="button primary" onClick={onSetup}>去开一桌 <ArrowRight size={15}/></button></div>:<div className="history-list">{state.history.map(game=><article className="history-item" key={`${game.id}-${game.round}`}><div className="history-symbol"><Gamepad2 size={23}/></div><div className="history-main"><h3>{game.title}</h3><small>{new Date(game.endedAt).toLocaleString('zh-CN',{hour12:false})} · {game.subtitle}</small><p>{game.entries.map((p,i)=><span key={i}>{p.label}<b className={p.positive?'positive':''}>{p.value}</b></span>)}</p></div><button className="button outline" onClick={()=>setReplay(controller.replay(game.id,game.round)??null)}>查看记录</button><button className="icon-button" aria-label="导出记录" onClick={()=>download({format:'agent-arcade-replay',version:3,run:controller.replay(game.id,game.round)},`${game.gameId}-${game.round}.json`)}><Download size={18}/></button></article>)}</div>}
 {replay&&<Modal title={`第 ${replay.index} ${module!.runNoun}记录`} subtitle={module!.summary(replay).title} onClose={()=>setReplay(null)}>{Replay?<Replay run={replay}/>:<pre>{JSON.stringify(replay.state,null,2)}</pre>}</Modal>}</>;
}

function ConnectorDownload({ onError, label = '下载 Windows 连接器' }: { onError: (message: string) => void; label?: string }) {
  const [progress, setProgress] = useState<number | null>(null);
  const releaseDownload = import.meta.env.VITE_CONNECTOR_DOWNLOAD_URL ?? 'https://github.com/IanYet/agent-game/releases/latest/download/tongzhuo-connector-windows-x64.exe';
  const macArm = import.meta.env.VITE_CONNECTOR_MACOS_ARM64_DOWNLOAD_URL ?? 'https://github.com/IanYet/agent-game/releases/latest/download/tongzhuo-connector-macos-arm64.zip';
  const macIntel = import.meta.env.VITE_CONNECTOR_MACOS_X64_DOWNLOAD_URL ?? 'https://github.com/IanYet/agent-game/releases/latest/download/tongzhuo-connector-macos-x64.zip';
  const download = async () => {
    setProgress(0);
    try {
      const manifestResponse = await fetch(`${import.meta.env.BASE_URL}downloads/manifest.json`);
      if (!manifestResponse.ok) throw new Error('连接器下载暂不可用，请稍后重试。');
      const manifest: { fileName: string; size: number; sha256: string; parts: string[] } = await manifestResponse.json();
      const chunks: ArrayBuffer[] = []; let total = 0;
      for (const part of manifest.parts) {
        if (!/^connector-\d+\.part$/.test(part)) throw new Error('下载清单不符合要求');
        const result = await fetch(`${import.meta.env.BASE_URL}downloads/${part}`); if (!result.ok) throw new Error('连接器下载失败，请重试');
        const chunk = await result.arrayBuffer(); chunks.push(chunk); total += chunk.byteLength; setProgress(Math.round(total / manifest.size * 100));
      }
      const file = new Blob(chunks, { type: 'application/vnd.microsoft.portable-executable' });
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
      if (file.size !== manifest.size || hex !== manifest.sha256) throw new Error('连接器完整性校验失败，请重新下载');
      const url = URL.createObjectURL(file); const anchor = document.createElement('a'); anchor.href = url; anchor.download = manifest.fileName; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (error: any) { onError(error.message); } finally { setProgress(null); }
  };
  return <div className="connector-downloads">{releaseDownload ? <a className="button outline" href={releaseDownload}><ArrowDownToLine size={15} />{label}<small>.exe · x64</small></a> : <button className="button outline" disabled={progress !== null} onClick={download}>{progress === null ? <ArrowDownToLine size={15} /> : <Loader2 size={15} className="spin" />}{progress === null ? label : `正在准备下载 ${progress}%`}<small>.exe · x64</small></button>}<a className="button outline" href={macArm}><ArrowDownToLine size={15} />macOS · Apple Silicon<small>.zip · arm64</small></a><a className="button outline" href={macIntel}><ArrowDownToLine size={15} />macOS · Intel<small>.zip · x64</small></a></div>;
}

function ConnectorPage({ state, busy, onConnect, onDisconnect, onToast }: { state: AppSnapshot; busy: boolean; onConnect: () => void; onDisconnect: () => void; onToast: (text: string) => void }) {
  return <><div className="standard-heading"><div className="eyebrow">BRING YOUR OWN AGENT</div><h1>你的搭档，在你电脑上。</h1><p>网页负责游戏，连接器负责让本机 agents 入座。</p></div><div className="connector-layout"><section className="connector-main"><div className="connector-intro"><span className="connector-icon"><Cpu size={29} /></span><div><h2>本地连接器</h2><p>免安装 · 无需 Node.js · 双击启动</p></div><StatusTag tone={state.connected ? 'green' : ''}>{state.connected ? '已连接' : '未连接'}</StatusTag></div><ol className="setup-steps"><li><span>01</span><div><h3>启动本地连接器</h3><p>Windows 双击 EXE，关闭窗口后仍在托盘运行；macOS 解压后将应用拖到「应用程序」，从菜单栏「同桌」查看状态。选择「退出连接器」会停止本次进程并释放端口。</p><ConnectorDownload onError={onToast} /><small>macOS 13.5+：Apple Silicon 选 arm64，Intel 选 x64。开发包尚未 Developer ID 签名或公证；首次打开请核实来源，并按 Apple「隐私与安全性」对本应用选择「仍要打开」。</small></div></li><li><span>02</span><div><h3>确认所选 Harness 已登录</h3><p>Codex 使用本机 ChatGPT 登录；dsh 与 WorkBuddy 使用各自的已有登录和模型配置。</p><small>不会要求你填写 API Key，也不会把登录凭据上传到网页。</small></div></li><li><span>03</span><div><h3>点击 harness，连接搭档</h3><p>浏览器可能会请求本地网络访问权限，允许后即可连接。</p></div></li></ol><div className="connector-harness"><span className="codex-mark">✳</span><div><strong>本机 Agents</strong><small>每位玩家独立 Harness 与会话</small></div><button className={`button ${state.connected ? 'outline' : 'primary'}`} disabled={busy} onClick={state.connected ? onDisconnect : onConnect}>{busy ? <Loader2 size={15} className="spin" /> : state.connected ? <Unplug size={15} /> : <Link2 size={15} />}{state.connected ? '断开连接' : '连接本机'}</button></div></section><div className="connector-details"><section><h3><ShieldCheck size={18} />本机优先，放心入座</h3><p>牌局状态保存在浏览器；连接器只做协议桥接。每位 agent 只能通过 MCP 读取自己的手牌。</p><div className="architecture-mini"><span><Monitor size={20} />游戏网页</span><Link2 size={15} /><span><Cpu size={20} />本机连接器</span><Link2 size={15} /><span><Sparkles size={20} />Agents</span></div></section><section className="technical-details"><h3>各 Harness 状态</h3>{state.connector?.harnesses.map(h => <div className="harness-inspection" key={h.id}><strong>{h.name} · {h.available ? '已就绪' : '未就绪'}</strong><p>{h.detail}</p><small>{h.version} · {h.models?.length ?? 0} 个独立模型</small></div>)}<dl><dt>本机地址</dt><dd>127.0.0.1:3211</dd><dt>连接器版本</dt><dd>{state.connector?.version ?? '等待连接'}</dd><dt>登录方式</dt><dd>{state.connector?.auth === 'chatgpt' ? 'ChatGPT 订阅' : '连接后检测'}</dd><dt>模型目录</dt><dd>{state.connector?.models.length ? `${state.connector.models.length} 个模型` : '连接后获取'}</dd></dl>{state.connector?.harnesses.find(h => h.id === 'codex')?.version && <small className="version-detail">{state.connector.harnesses.find(h => h.id === 'codex')?.version}</small>}</section></div></div></>;
}
