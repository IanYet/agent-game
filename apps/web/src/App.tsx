import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, CircleHelp, Club, Copy, Cpu, Download, ExternalLink, Gamepad2, History, Layers3, Link2, Loader2, LockKeyhole, Monitor, MoreHorizontal, Pause, Play, Plus, Radio, RotateCcw, Settings2, ShieldCheck, Sparkles, Spade, Square, Table2, Unplug, User, Users, Wifi, X, Zap } from 'lucide-react';
import { beats, cardLabel, classify, DOUDIZHU_RULES, rankLabel, SUIT_LABELS, type Card, gameName, rulesForGame, type ArcadeState, type GameId, type GameView, type PlayerConfig, type PlayerKind, type PlayerView, type Seat } from '@agent-game/core';
import { APP_VERSION, modelsForHarness, type AppSnapshot, type SeatRuntime } from '@agent-game/protocol';
import { GameController } from './controller';
import { AgentModelFields, kindName } from './AgentModelFields';
import { Modal } from './Modal';
import { SetupModal } from './TableSetup';
import { HoldemTable } from './HoldemTable';

const controller = new GameController(localStorage);
type Page = 'lobby' | 'table' | 'history' | 'connector';
function Logo({ small = false }: { small?: boolean }) { return <div className={`logo ${small ? 'small' : ''}`}><span /><span /><span /><span /></div>; }
function Dot({ on = true }: { on?: boolean }) { return <i className={`status-dot ${on ? 'on' : ''}`} />; }
function Avatar({ kind, seat, size = '' }: { kind: PlayerKind; seat: number; size?: string }) { const Icon = kind === 'human' ? User : Sparkles; return <div className={`avatar avatar-${seat} ${size}`}><Icon size={size === 'large' ? 27 : 21} strokeWidth={1.8} /></div>; }
function StatusTag({ children, tone = '' }: { children: ReactNode; tone?: string }) { return <span className={`tag ${tone}`}>{children}</span>; }

export function App() {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [page, setPage] = useState<Page>('lobby');
  const [setup, setSetup] = useState<GameId | null>(null);
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
        <button className={page === 'table' ? 'active' : ''} onClick={() => state.game ? setPage('table') : setSetup('doudizhu')}><Table2 size={19} />我的牌桌{state.game && <Dot on={!state.paused && state.game.phase !== 'finished'} />}</button>
        <button className={page === 'history' ? 'active' : ''} onClick={() => setPage('history')}><History size={19} />对局记录{state.history.length > 0 && <span className="nav-count">{state.history.length}</span>}</button>
      </nav>
      <div className="sidebar-divider" />
      <div className="nav-label">我的搭档</div>
      <nav><button className={page === 'connector' ? 'active' : ''} onClick={() => setPage('connector')}><Cpu size={19} />本地连接<span className={`nav-state ${state.connected ? 'green' : ''}`}>{state.connected ? '已连接' : '未连接'}</span></button></nav>
      <div className="sidebar-note"><div className="note-icon"><Spade size={18} /></div><strong>好牌，留给好搭档。</strong><p>一点默契，一点运气。<br />今天也和 agents 玩一局。</p></div>
      <div className="sidebar-bottom"><span><Dot on={state.connected} />{state.connected ? '本机连接就绪' : '等待本机连接'}</span><small>本地优先 <span>v{APP_VERSION}</span></small></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><span className="breadcrumb">同桌 <ChevronRight size={13} /><b>{({ lobby: '游戏大厅', table: state.game ? gameName(state.game.gameId) : '我的牌桌', history: '对局记录', connector: '本地连接' })[page]}</b></span><div className="topbar-right"><span className="local-pill"><Monitor size={13} />本机同桌</span><button className="icon-button" onClick={() => setRules(true)} aria-label="游戏规则"><CircleHelp size={19} /></button><div className="user-chip"><User size={17} /></div></div></header>
      <main className={`main-content page-${page}`}>
        {state.error && <div className="error-banner" role="alert"><CircleHelp size={17} /><span>{state.error}</span>{state.connectorUpdateRequired && <ConnectorDownload label="下载最新连接器" onError={notify} />}<button onClick={() => controller.clearError()} aria-label="关闭提示"><X size={16} /></button></div>}
        {page === 'lobby' && <Lobby state={state} busy={busy} onSetup={id => setSetup(id ?? 'doudizhu')} onConnect={connect} onResume={() => setPage('table')} onConnector={() => setPage('connector')} onError={notify} />}
        {page === 'table' && state.game?.gameId === 'holdem' && <HoldemTable controller={controller} state={state} busy={busy} onRules={() => setRules(true)} onSetup={() => setSetup('holdem')} onBack={() => setPage('lobby')} onError={notify} run={run} />}
        {page === 'table' && state.game?.gameId === 'doudizhu' && <GameTable state={state} busy={busy} onRules={() => setRules(true)} onSetup={() => setSetup('doudizhu')} onBack={() => setPage('lobby')} onError={notify} run={run} />}
        {page === 'history' && <HistoryPage state={state} onSetup={() => setSetup('doudizhu')} />}
        {page === 'connector' && <ConnectorPage state={state} busy={busy} onConnect={connect} onDisconnect={() => run(() => controller.disconnect())} onToast={notify} />}
      </main>
      <footer className="site-footer"><span>人类与 agents 的游戏时间。</span><span><LockKeyhole size={12} />牌局保存在这个浏览器中</span></footer>
    </div>
    {setup && <SetupModal state={state} initialGame={setup} onClose={() => setSetup(null)} onConnect={connect} onStart={async (players, persistConversations, gameId, holdem) => { await controller.create(players, { persistConversations, gameId, holdem }); setSetup(null); setPage('table'); }} />}
    {rules && <Modal title="这一桌的规则" subtitle={state.game?.gameId === 'holdem' ? '德州扑克 · 无限注 2–9 人' : '斗地主 · 三人经典玩法'} onClose={() => setRules(false)}><div className="rules-copy">{rulesForGame(state.game?.gameId ?? 'doudizhu').split('\n').map((p, i) => <p key={i}>{p}</p>)}</div></Modal>}
    {toast && <div className="toast" role="status"><CheckCircle2 size={18} /><span>{toast}</span><button onClick={() => setToast('')} aria-label="关闭"><X size={15} /></button></div>}
  </div>;
}

function Lobby({ state, busy, onSetup, onConnect, onResume, onConnector, onError }: { state: AppSnapshot; busy: boolean; onSetup: (gameId?: GameId) => void; onConnect: () => void; onResume: () => void; onConnector: () => void; onError: (message: string) => void }) {
  return <>
    <section className="lobby-hero"><div className="hero-copy"><div className="eyebrow"><span />THE HUMAN + AGENT PLAYGROUND</div><h1>和你的 agents，<br /><span>坐下来玩一局。</span></h1><p>熟悉的游戏，不一样的搭档。<br />带上你的 agents，让默契从这张牌桌开始。</p><button className="button primary" onClick={() => onSetup()}>来一局 <ArrowRight size={16} /></button></div><div className="hero-art" aria-hidden="true"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><span className="art-spark spark-one">✦</span><span className="art-spark spark-two">+</span><div className="art-seat seat-one"><User size={23} /></div><div className="art-seat seat-two"><Sparkles size={23} /></div><div className="art-seat seat-three"><Sparkles size={23} /></div><div className="hero-card hc-one"><b>A</b><span>♣</span><i>♣</i></div><div className="hero-card hc-two"><b>K</b><span>♥</span><i>♥</i></div><div className="hero-card hc-three"><b>A</b><span>♠</span><i>♠</i></div><div className="art-caption"><Dot />YOUR AGENTS. YOUR TABLE.</div></div></section>
    {state.game && state.game.phase !== 'finished' && <button className="resume-strip" onClick={onResume}><span className="resume-icon"><Table2 size={20} /></span><span><strong>你的牌桌还在这里</strong><small>{gameName(state.game.gameId)} · 第 {state.game.round} {state.game.gameId === 'holdem' ? '手' : '局'} · {state.paused ? '已暂停' : state.game.phase === 'bidding' ? '正在叫分' : '进行中'}</small></span><b>回到牌桌 <ArrowRight size={16} /></b></button>}
    <div className="section-heading"><div><h2>挑一款，开一桌<span>02</span></h2><p>从经典开始，更多游戏陆续入座。</p></div><span className="subtle-label"><Square size={11} fill="currentColor" />所有游戏</span></div>
    <div className="lobby-grid">
      <article className="game-feature"><div className="game-cover"><div className="cover-grid" /><span className="cover-label"><Dot />NOW PLAYING</span><span className="cover-big">斗<span>地主</span><i>♠</i></span><div className="cover-cards" aria-hidden="true"><div>3<span>♠</span></div><div>3<span>♥</span></div><div>3<span>♣</span></div></div><span className="cover-edition">CLASSIC NO. 001</span></div><div className="game-description"><div><h3>斗地主 <span>经典三人局</span></h3><p>一位地主，两位农民。和 agents 过过招。</p><div className="game-tags"><span><Users size={13} />3 位玩家</span><span><User size={13} />0–1 位真人</span><span><Sparkles size={13} />支持全 Agent</span></div></div><button className="button primary" onClick={() => onSetup()}>创建牌桌 <ArrowRight size={15} /></button></div></article>
      <article className="game-feature poker-feature"><div className="game-cover poker-cover"><span className="cover-label"><Dot />NO LIMIT HOLD’EM</span><span className="cover-big">德州<span>扑克</span><i>♦</i></span><div className="cover-cards" aria-hidden="true"><div>A<span>♠</span></div><div>K<span>♥</span></div></div><span className="cover-edition">CLASSIC NO. 002</span></div><div className="game-description"><div><h3>德州扑克 <span>无限注</span></h3><p>读牌、下注、全下。筹码留在桌上，下一手重新思考。</p><div className="game-tags"><span><Users size={13} />2–9 位玩家</span><span><User size={13} />0–1 位真人</span><span>主池与边池</span></div></div><button className="button primary" onClick={() => onSetup('holdem')}>创建牌桌 <ArrowRight size={15} /></button></div></article>
      <div className="lobby-side"><article className="connection-card"><div className="card-heading"><span className="line-icon"><Cpu size={19} /></span><h3>让你的 agent 入座</h3><button className="icon-button" onClick={onConnector} aria-label="查看连接说明"><ArrowRight size={17} /></button></div><p>复用各 Harness 已有登录与订阅。<br />启动连接器，然后一键连接。</p><div className="harness-row"><span className="codex-mark">✳</span><span><strong>Codex · dsh · WorkBuddy</strong><small>按座位选择，各用自己的模型目录</small></span><StatusTag tone={state.connected ? 'green' : ''}>{state.connected ? '已连接' : '等待连接'}</StatusTag></div>{state.connectorUpdateRequired && <div className="connection-upgrade"><p>当前连接器 v{state.connector?.version} 不兼容，请下载新版并退出旧版。</p><ConnectorDownload label="下载最新连接器" onError={onError} /></div>}<button className={`button full ${state.connected ? 'soft' : 'dark'}`} disabled={busy || state.connected} onClick={onConnect}>{busy ? <Loader2 size={16} className="spin" /> : state.connected ? <Check size={16} /> : <Link2 size={16} />}{state.connected ? '搭档已就绪' : '连接本机'}</button><span className="microcopy"><ShieldCheck size={12} />登录凭据留在本机</span></article></div>
    </div>
    <div className="principles"><div><span><Monitor size={19} /></span><p><strong>一台电脑，一张牌桌</strong><small>自己玩，或看 agents 过招</small></p></div><div><span><Layers3 size={19} /></span><p><strong>每位搭档，独立会话</strong><small>自己的手牌，自己的策略</small></p></div><div><span><Zap size={19} /></span><p><strong>用你已有的订阅</strong><small>沿用各自登录与模型目录</small></p></div></div>
  </>;
}

function PlayerSettingsModal({ state, busy, onClose, onSave, onError }: { state: AppSnapshot; busy: boolean; onClose: () => void; onSave: (players: PlayerConfig[]) => void; onError: (message: string) => void }) {
  const [players, setPlayers] = useState<PlayerConfig[]>(state.game!.players.map(({ name, kind, model, reasoningEffort }) => ({ name, kind, model, reasoningEffort })));
  const agents = state.game!.players.filter(p => p.kind !== 'human');
  return <Modal title="玩家设置与会话" subtitle="牌局已暂停。设置在该玩家下次行动时生效，沿用原会话。" onClose={onClose} wide>
    <div className="player-settings-list">{agents.map(player => <section className="player-settings-card" key={player.seat}>
      <div className="player-settings-heading"><Avatar kind={player.kind} seat={player.seat} /><strong>{player.name}</strong><small>{kindName[player.kind]}</small></div>
      <AgentModelFields models={modelsForHarness(state.connector, player.kind)} label={player.name} settings={players[player.seat]} onChange={value => setPlayers(all => all.map((p, i) => i === player.seat ? { ...p, ...value } : p))} />
      <div className="conversation-info"><small>{state.persistConversations ? '已开启本机历史保留' : '临时会话 · 结束后不保留'}</small>{state.persistConversations && <><code>{state.seats[player.seat].conversationId ?? '首次行动时创建会话'}</code>{state.seats[player.seat].conversationId && <button className="button subtle" onClick={() => { void navigator.clipboard.writeText(state.seats[player.seat].conversationId!).catch(() => onError('无法复制，请手动复制会话 ID')); }}><Copy size={13} />复制会话 ID</button>}</>}</div>
    </section>)}</div>
    <div className="modal-footer"><small>关闭弹窗后，点击「继续游戏」恢复对局。</small><button className="button primary" disabled={busy || state.game?.phase === 'finished'} onClick={() => onSave(players)}>保存设置</button></div>
  </Modal>;
}

function PlayingCard({ card, small = false, selected = false, onClick, disabled = false }: { card?: Card; small?: boolean; selected?: boolean; onClick?: () => void; disabled?: boolean }) {
  const content = card ? <><span className="card-corner"><b>{card.rank > 15 ? (card.rank === 16 ? '小' : '大') : rankLabel(card.rank)}</b><i>{SUIT_LABELS[card.suit]}</i></span><span className="card-pip">{card.rank > 15 ? '♔' : SUIT_LABELS[card.suit]}</span><span className="card-foot">{card.rank > 15 ? 'JOKER' : `${rankLabel(card.rank)} ${SUIT_LABELS[card.suit]}`}</span></> : <span className="card-back-pattern">✦</span>;
  const cls = `playing-card ${small ? 'mini' : ''} ${card && (card.suit === 'H' || card.suit === 'D' || card.rank === 17) ? 'red' : ''} ${!card ? 'card-back' : ''} ${selected ? 'selected' : ''}`;
  return onClick ? <button className={cls} onClick={onClick} disabled={disabled} aria-label={card ? cardLabel(card) : '底牌'} aria-pressed={selected}>{content}</button> : <div className={cls} aria-label={card ? cardLabel(card) : '底牌'}>{content}</div>;
}

function PlayerBadge({ player, runtime, active, paused }: { player: PlayerView; runtime: SeatRuntime; active: boolean; paused: boolean }) {
  const waiting = runtime?.status === 'connecting' || runtime?.status === 'thinking';
  return <div className={`player-badge ${active ? 'current' : ''}`}><Avatar seat={player.seat} kind={player.kind} /><div className="player-info"><strong>{player.name}{player.role && <StatusTag tone={player.role === 'landlord' ? 'gold' : ''}>{player.role === 'landlord' ? '地主' : '农民'}</StatusTag>}</strong><small>{paused ? '已暂停' : active ? player.kind === 'human' ? '轮到你了' : waiting ? runtime.message ?? '正在思考' : '等待行动' : kindName[player.kind]}</small></div><div className="player-count"><b>{player.count}</b><small>张</small></div>{active && !paused && waiting && <span className="thinking-dots"><i /><i /><i /></span>}</div>;
}

function GameTable({ state, busy, onRules, onSetup, onBack, onError, run }: { state: AppSnapshot; busy: boolean; onRules: () => void; onSetup: () => void; onBack: () => void; onError: (message: string) => void; run: (action: () => Promise<void>) => Promise<void> }) {
  const game = state.game as GameView; const [playerSettings, setPlayerSettings] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [hintIndex, setHintIndex] = useState(0);
  const human = game.viewer;
  const bottomSeat = human ?? 0;
  const topSeats = [((bottomSeat + 1) % 3) as Seat, ((bottomSeat + 2) % 3) as Seat];
  const hand = game.players[bottomSeat].hand ?? [];
  const ownTurn = !state.paused && game.turn === human && game.phase !== 'finished';
  const chosen = hand.filter(c => selected.includes(c.id));
  const combination = classify(chosen);
  const canPlay = ownTurn && !!combination && beats(combination, game.lastPlay?.combination ?? null);
  useEffect(() => { setSelected([]); setHintIndex(0); }, [game.revision, game.id, game.round]);
  const act = (action: Parameters<typeof controller.humanAction>[0]) => { try { controller.humanAction(action); } catch (error: any) { onError(error.message); } };
  const hint = () => { const choices = game.legalActions.filter(a => a.action.type === 'play'); if (!choices.length) { onError('没有能压过上家的牌，可以选择不出'); return; } setSelected(choices[hintIndex % choices.length].cards.map(c => c.id)); setHintIndex(i => i + 1); };
  return <>
    <div className="table-page-heading"><div><button className="back-link" onClick={onBack}><ArrowLeft size={14} />游戏大厅</button><h1>斗地主<StatusTag tone="green">{game.phase === 'finished' ? '已结束' : state.paused ? '已暂停' : game.phase === 'bidding' ? '正在叫分' : '对局中'}</StatusTag></h1></div><div className="table-heading-actions"><button className="button subtle" onClick={onRules}><CircleHelp size={15} />规则</button>{game.phase !== 'finished' && <button className="button outline" disabled={busy} onClick={() => run(() => state.paused ? controller.resume() : controller.pause())}>{state.paused ? <Play size={15} /> : <Pause size={15} />}{state.paused ? '继续游戏' : '暂停'}</button>}<button className="button outline" disabled={busy} onClick={() => run(async () => { await controller.pause(); setPlayerSettings(true); })}><Settings2 size={15} />玩家设置</button><button className="button outline" onClick={() => onSetup()}><Plus size={15} />新牌桌</button></div></div>
    {playerSettings && <PlayerSettingsModal state={state} busy={busy} onClose={() => setPlayerSettings(false)} onError={onError} onSave={players => { controller.configurePlayers(players); setPlayerSettings(false); }} />}
    <div className="table-layout"><section className="table-card"><div className="table-toolbar"><span><Dot on={!state.paused} />{human === null ? '观战模式' : '真人 + Agents'}</span><span>第 <b>{game.round.toString().padStart(2, '0')}</b> 局 <i />底分 {game.highBid || '—'} <i />{game.multiplier} 倍</span><span><LockKeyhole size={12} />本机牌桌</span></div>
      <div className="table-stage"><div className="opponent-row">{topSeats.map(seat => <div className="opponent" key={seat}><PlayerBadge player={game.players[seat]} runtime={state.seats[seat]} active={game.turn === seat && game.phase !== 'finished'} paused={state.paused} /><div className="opponent-hand">{game.phase === 'finished' ? game.players[seat].hand?.map(card => <PlayingCard key={card.id} card={card} small />) : [0, 1, 2, 3, 4].map(i => <PlayingCard key={i} small />)}</div></div>)}</div>
      <div className="felt"><div className="felt-line" /><div className="bottom-cards"><span>底牌</span><div>{game.bottom.length ? game.bottom.map(c => <PlayingCard key={c.id} card={c} small />) : [0, 1, 2].map(i => <PlayingCard key={i} small />)}</div></div><div className="felt-brand"><Logo small /><span>同 桌</span></div>
        <div className="played-zones">{game.players.map(player => <div className={`played-zone zone-${player.seat === bottomSeat ? 'bottom' : player.seat === topSeats[0] ? 'left' : 'right'}`} key={player.seat}>{game.phase === 'bidding' ? game.bids[player.seat] !== null && <span className="bid-bubble">{player.name} · {game.bids[player.seat] ? `${game.bids[player.seat]} 分` : '不叫'}</span> : game.lastActions[player.seat] && <><small>{player.name}</small>{game.lastActions[player.seat]?.type === 'pass' ? <span className="pass-label">不出</span> : <div className="played-cards">{game.lastActions[player.seat]?.cards.map(c => <PlayingCard key={c.id} card={c} small />)}</div>}</>}</div>)}</div>
        {game.phase !== 'finished' && <div className="turn-label">{state.paused ? <><Pause size={13} />牌局已暂停</> : <><span className="turn-pulse" />{game.players[game.turn].name}{game.phase === 'bidding' ? ' 正在叫分' : ' 的回合'}</>}</div>}
        {game.phase === 'finished' && <div className="result-overlay"><span className="result-emblem">{game.result?.winner === 'landlord' ? '♛' : '♧'}</span><h2>{game.result?.winner === 'landlord' ? '地主获胜' : '农民获胜'}</h2><p>{game.result?.spring ? '春天 · ' : ''}底分 {game.highBid} × {game.multiplier} 倍</p><div className="result-scores">{game.players.map((p, i) => <span key={i}>{p.name}<b className={(game.result?.deltas[i] ?? 0) > 0 ? 'positive' : ''}>{(game.result?.deltas[i] ?? 0) > 0 ? '+' : ''}{game.result?.deltas[i]}</b></span>)}</div><button className="button primary" disabled={busy} onClick={() => run(() => controller.nextRound())}><RotateCcw size={15} />再来一局</button></div>}
      </div>
      <div className="own-player"><PlayerBadge player={game.players[bottomSeat]} runtime={state.seats[bottomSeat]} active={game.turn === bottomSeat && game.phase !== 'finished'} paused={state.paused} /><span>{human === null ? '你正在观看 agents 对弈' : game.phase === 'bidding' ? '好牌在手，叫个几分？' : ownTurn ? '轮到你了，点击手牌选中出牌' : '好牌不急，等搭档出招。'}</span></div>
      <div className={`hand ${human === null && game.phase !== 'finished' ? 'spectator-hand' : ''}`} style={{ '--cards': hand.length } as CSSProperties}>{hand.length ? hand.map(card => <PlayingCard key={card.id} card={card} selected={selected.includes(card.id)} onClick={human !== null && game.phase !== 'finished' ? () => setSelected(old => old.includes(card.id) ? old.filter(id => id !== card.id) : [...old, card.id]) : undefined} disabled={!ownTurn || game.phase !== 'playing'} />) : human === null && game.phase !== 'finished' ? <><Radio size={24} /><p>每位 agent 只看得到自己的手牌</p></> : <span className="empty-hand">手牌已出完</span>}</div>
      <div className="action-area">{ownTurn && game.phase === 'bidding' ? <div className="bid-actions">{game.legalActions.map(a => <button className={`button ${a.action.type === 'bid' && a.action.value === 3 ? 'primary' : 'outline'}`} key={a.id} onClick={() => act(a.action)}>{a.label}</button>)}</div> : ownTurn && game.phase === 'playing' ? <><div className="selection-label">{selected.length ? combination ? <><b>{combination.label}</b> · 已选 {selected.length} 张{!canPlay && ' · 需压过上家'}</> : `已选 ${selected.length} 张 · 牌型不成立` : '选择你要出的手牌'}</div><div className="play-actions"><button className="button outline" disabled={!game.legalActions.some(a => a.action.type === 'pass')} onClick={() => act({ type: 'pass' })}>不出</button><button className="button outline" onClick={hint}><Sparkles size={14} />提示</button><button className="button primary" disabled={!canPlay} onClick={() => act({ type: 'play', cards: selected })}>出牌{selected.length > 0 ? ` (${selected.length})` : ''}<ArrowRight size={15} /></button></div></> : <span className="waiting-label">{game.phase === 'finished' ? '对局已保存到本机记录' : state.paused ? '点击继续，回到牌桌' : `${game.players[game.turn].name} 正在${game.phase === 'bidding' ? '叫分' : '行动'}…`}</span>}</div></div>
    </section><aside className="table-rail"><section className="score-card"><h3>本桌积分<span>累计</span></h3>{game.players.map(p => <div key={p.seat}><Avatar kind={p.kind} seat={p.seat} /><span>{p.name}<small>{kindName[p.kind]}</small></span><b className={p.score > 0 ? 'positive' : ''}>{p.score > 0 ? '+' : ''}{p.score}</b></div>)}</section><section className="event-card"><div className="event-heading"><h3>牌桌动态</h3><span><Dot on={!state.paused && game.phase !== 'finished'} />LIVE</span></div><div className="event-list">{[...game.events].reverse().slice(0, 35).map(event => <div className={`game-event ${event.type === 'finish' ? 'finish-event' : ''}`} key={event.seq}><span className="event-time">{new Date(event.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span><p>{event.seat !== undefined && <b>{game.players[event.seat].name} </b>}{event.text}</p>{event.cards && <span className="event-card-labels">{event.cards.map(cardLabel).join(' ')}</span>}</div>)}</div></section></aside></div>
  </>;
}

function HistoryPage({ state, onSetup }: { state: AppSnapshot; onSetup: () => void }) {
  const [replay, setReplay] = useState<ArcadeState | null>(null);
  const download = (id: string, round: number) => {
    const game = controller.replay(id, round); if (!game) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'agent-arcade-replay', version: 1, game }, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${game.gameId}-round-${round}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <><div className="standard-heading"><div className="eyebrow">GOOD GAMES, GOOD MEMORIES</div><h1>每一局，都算数。</h1><p>这些默契和好牌，只保存在你的浏览器里。</p></div>{!state.history.length ? <div className="empty-state"><History size={36} strokeWidth={1.3} /><h2>故事从第一局开始</h2><p>完成一局游戏，就会在这里留下记录。</p><button className="button primary" onClick={() => onSetup()}>去开一桌 <ArrowRight size={15} /></button></div> : <div className="history-list">{state.history.map(game => <article className="history-item" key={`${game.id}-${game.round}`}><div className="history-symbol"><Spade size={23} /></div><div className="history-main"><h3>{gameName(game.gameId)} <StatusTag>{game.winner}获胜</StatusTag></h3><small>{new Date(game.endedAt).toLocaleString('zh-CN', { hour12: false })} · 第 {game.round} 局 · {game.actions} 次行动</small><p>{game.players.map(p => <span key={p.name}>{p.name}<b className={p.delta > 0 ? 'positive' : ''}>{p.delta > 0 ? '+' : ''}{p.delta}</b></span>)}</p></div><button className="button outline" onClick={() => setReplay(controller.replay(game.id, game.round) ?? null)}>查看牌谱</button><button className="icon-button" onClick={() => download(game.id, game.round)} aria-label="导出牌谱"><Download size={18} /></button></article>)}</div>}{replay && <Modal title={`第 ${replay.round} 局牌谱`} subtitle={replay.gameId === 'holdem' ? `德州扑克 · ${replay.result?.winners.map(s => replay.players[s].name).join('、')}赢得底池` : `${replay.result?.winner === 'landlord' ? '地主' : '农民'}获胜 · ${replay.multiplier} 倍`} onClose={() => setReplay(null)}><div className="replay-events">{replay.events.map(event => <div key={event.seq}><span>{event.seq.toString().padStart(2, '0')}</span><p>{event.seat !== undefined && <b>{replay.players[event.seat].name} </b>}{event.text}{event.cards && <small>{event.cards.map(cardLabel).join(' ')}</small>}</p></div>)}</div></Modal>}</>;
}

function ConnectorDownload({ onError, label = '下载 Windows 连接器' }: { onError: (message: string) => void; label?: string }) {
  const [progress, setProgress] = useState<number | null>(null);
  const releaseDownload = import.meta.env.VITE_CONNECTOR_DOWNLOAD_URL;
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
  if (releaseDownload) return <a className="button outline" href={releaseDownload}><ArrowDownToLine size={15} />{label}<small>.exe · x64</small></a>;
  return <button className="button outline" disabled={progress !== null} onClick={download}>{progress === null ? <ArrowDownToLine size={15} /> : <Loader2 size={15} className="spin" />}{progress === null ? label : `正在准备下载 ${progress}%`}<small>.exe · x64</small></button>;
}

function ConnectorPage({ state, busy, onConnect, onDisconnect, onToast }: { state: AppSnapshot; busy: boolean; onConnect: () => void; onDisconnect: () => void; onToast: (text: string) => void }) {
  return <><div className="standard-heading"><div className="eyebrow">BRING YOUR OWN AGENT</div><h1>你的搭档，在你电脑上。</h1><p>网页负责游戏，连接器负责让本机 agents 入座。</p></div><div className="connector-layout"><section className="connector-main"><div className="connector-intro"><span className="connector-icon"><Cpu size={29} /></span><div><h2>Windows 本地连接器</h2><p>免安装 · 无需 Node.js · 双击启动</p></div><StatusTag tone={state.connected ? 'green' : ''}>{state.connected ? '已连接' : '未连接'}</StatusTag></div><ol className="setup-steps"><li><span>01</span><div><h3>启动本地连接器</h3><p>下载后双击连接器 EXE，无需安装或解压。最小化或关闭窗口会缩到右下角托盘；从托盘选择「退出连接器」会释放端口。</p><ConnectorDownload onError={onToast} /></div></li><li><span>02</span><div><h3>确认所选 Harness 已登录</h3><p>Codex 使用本机 ChatGPT 登录；dsh 与 WorkBuddy 使用各自的已有登录和模型配置。</p><small>不会要求你填写 API Key，也不会把登录凭据上传到网页。</small></div></li><li><span>03</span><div><h3>点击 harness，连接搭档</h3><p>浏览器可能会请求本地网络访问权限，允许后即可连接。</p></div></li></ol><div className="connector-harness"><span className="codex-mark">✳</span><div><strong>本机 Agents</strong><small>每位玩家独立 Harness 与会话</small></div><button className={`button ${state.connected ? 'outline' : 'primary'}`} disabled={busy} onClick={state.connected ? onDisconnect : onConnect}>{busy ? <Loader2 size={15} className="spin" /> : state.connected ? <Unplug size={15} /> : <Link2 size={15} />}{state.connected ? '断开连接' : '连接本机'}</button></div></section><div className="connector-details"><section><h3><ShieldCheck size={18} />本机优先，放心入座</h3><p>牌局状态保存在浏览器；连接器只做协议桥接。每位 agent 只能通过 MCP 读取自己的手牌。</p><div className="architecture-mini"><span><Monitor size={20} />游戏网页</span><Link2 size={15} /><span><Cpu size={20} />本机连接器</span><Link2 size={15} /><span><Sparkles size={20} />Agents</span></div></section><section className="technical-details"><h3>各 Harness 状态</h3>{state.connector?.harnesses.map(h => <div className="harness-inspection" key={h.id}><strong>{h.name} · {h.available ? '已就绪' : '未就绪'}</strong><p>{h.detail}</p><small>{h.version} · {h.models?.length ?? 0} 个独立模型</small></div>)}<dl><dt>本机地址</dt><dd>127.0.0.1:3211</dd><dt>连接器版本</dt><dd>{state.connector?.version ?? '等待连接'}</dd><dt>登录方式</dt><dd>{state.connector?.auth === 'chatgpt' ? 'ChatGPT 订阅' : '连接后检测'}</dd><dt>模型目录</dt><dd>{state.connector?.models.length ? `${state.connector.models.length} 个模型` : '连接后获取'}</dd></dl>{state.connector?.harnesses.find(h => h.id === 'codex')?.version && <small className="version-detail">{state.connector.harnesses.find(h => h.id === 'codex')?.version}</small>}</section></div></div></>;
}
