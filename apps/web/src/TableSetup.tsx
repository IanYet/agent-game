import { useState } from 'react';
import { ArrowRight, Link2, Loader2, Play, Plus, Sparkles, Trash2, User } from 'lucide-react';
import { DEFAULT_HOLDEM_OPTIONS, type GameId, type HoldemOptions, type HoldemPlayerConfig, type HoldemView } from '@agent-game/core';
import { modelsForHarness, type AppSnapshot, type HarnessId } from '@agent-game/protocol';
import { AgentHarnessField, AgentModelFields } from './AgentModelFields';
import { Modal } from './Modal';

const defaultHarness = (state: AppSnapshot): HarnessId => state.connector?.harnesses.find(h => h.available)?.id ?? 'codex-acp';
const newPlayer = (state: AppSnapshot, index: number): HoldemPlayerConfig => ({ playerId: crypto.randomUUID(), name: ['你', 'Atlas', 'Nova', 'Echo', 'River', 'Sage', 'Luna', 'Orion', 'Iris'][index] ?? `玩家 ${index + 1}`, kind: defaultHarness(state) });
export function RosterEditor({ state, players, onChange, poker, balances }: { state: AppSnapshot; players: HoldemPlayerConfig[]; onChange: (players: HoldemPlayerConfig[]) => void; poker: boolean; balances?: Map<string, number> }) {
  const update = (index: number, patch: Partial<HoldemPlayerConfig>) => onChange(players.map((p, i) => i === index ? { ...p, ...patch } : p));
  return <>
    <div className="roster-grid">{players.map((player, index) => <section className="roster-card" key={player.playerId ?? index}>
      <div className="roster-heading"><span className={`avatar avatar-${index % 3}`}>{player.kind === 'human' ? <User size={20} /> : <Sparkles size={20} />}</span><strong>座位 {index + 1}</strong>{poker && <button className="icon-button" disabled={players.length <= 2} aria-label={`移除座位 ${index + 1}`} onClick={() => onChange(players.filter((_, i) => i !== index))}><Trash2 size={15} /></button>}</div>
      {poker && <div className={`roster-balance ${balances?.get(player.playerId ?? '') === 0 ? 'busted' : ''}`}>{balances?.has(player.playerId ?? '') ? `保留筹码 ${balances.get(player.playerId!)}` : balances ? `新玩家 · 按本桌初始筹码买入` : '新桌 · 按初始筹码入座'}{balances?.get(player.playerId ?? '') === 0 && <small>筹码归零，请移除此玩家</small>}</div>}
      <label className="roster-field">玩家名称<input aria-label={`座位 ${index + 1} 名称`} value={player.name} maxLength={32} onChange={e => update(index, { name: e.target.value })} /></label>
      <label className="roster-field">玩家类型<select aria-label={`座位 ${index + 1} 玩家类型`} value={player.kind === 'human' ? 'human' : 'agent'} onChange={e => update(index, { kind: e.target.value === 'human' ? 'human' : defaultHarness(state), model: undefined, reasoningEffort: undefined })}><option value="human" disabled={players.some((p, i) => i !== index && p.kind === 'human')}>真人</option><option value="agent">Agent</option></select></label>
      {player.kind !== 'human' && <><AgentHarnessField harnesses={state.connector?.harnesses} kind={player.kind} label={`座位 ${index + 1}`} onChange={kind => update(index, { kind, model: undefined, reasoningEffort: undefined })} /><AgentModelFields label={`座位 ${index + 1}`} models={modelsForHarness(state.connector, player.kind)} settings={player} onChange={settings => update(index, settings)} /></>}
    </section>)}</div>
    {poker && <button className="button outline" disabled={players.length >= 9} onClick={() => onChange([...players, newPlayer(state, players.length)])}><Plus size={15} />增加玩家 <small>{players.length}/9</small></button>}
    <p className="roster-note">最多一位真人，也可以全部由 Agent 游玩。每位 Agent 独立选择 Harness、模型与思考强度。</p>
  </>;
}
function validateRoster(state: AppSnapshot, players: HoldemPlayerConfig[]) {
  for (const player of players) if (player.kind !== 'human') {
    const harness = state.connector?.harnesses.find(h => h.id === player.kind);
    if (!harness?.available) throw new Error(`${player.name} 的 Harness 尚未就绪。${harness?.detail ?? '请先连接本机'}`);
  }
}
export function SetupModal({ state, initialGame, onClose, onConnect, onStart }: { state: AppSnapshot; initialGame: GameId; onClose: () => void; onConnect: () => void; onStart: (players: HoldemPlayerConfig[], persist: boolean, gameId: GameId, options: HoldemOptions) => Promise<void> }) {
  const [gameId, setGameId] = useState<GameId>(initialGame);
  const [players, setPlayers] = useState<HoldemPlayerConfig[]>(Array.from({ length: initialGame === 'holdem' ? 4 : 3 }, (_, i) => ({ ...newPlayer(state, i), ...(i === 0 ? { kind: 'human' as const } : {}) })));
  const [options, setOptions] = useState(DEFAULT_HOLDEM_OPTIONS), [persist, setPersist] = useState(state.persistConversations), [pending, setPending] = useState(false), [error, setError] = useState('');
  const start = async () => {
    setPending(true); setError('');
    try { validateRoster(state, players); await onStart(players, persist, gameId, options); } catch (e: any) { setError(e.message); } finally { setPending(false); }
  };
  return <Modal title="凑齐搭档，准备开桌" subtitle="独立静态牌桌 · 每手独立 Agent 会话" onClose={onClose} wide>
    <div className="mode-switch"><button className={gameId === 'doudizhu' ? 'selected' : ''} onClick={() => { setGameId('doudizhu'); setPlayers(p => p.length >= 3 ? p.slice(0, 3) : [...p, newPlayer(state, 2)]); }}><strong>斗地主</strong><small>经典三人局</small></button><button className={gameId === 'holdem' ? 'selected' : ''} onClick={() => setGameId('holdem')}><strong>德州扑克</strong><small>2–9 人 · 无限注</small></button></div>
    {gameId === 'holdem' && <div className="poker-options">{([['initialChips','初始筹码'],['smallBlind','小盲'],['bigBlind','大盲']] as const).map(([key, label]) => <label key={key}>{label}<input type="number" min="1" max="1000000000" step="1" aria-label={label} value={options[key]} onChange={e => setOptions(old => ({ ...old, [key]: Number(e.target.value) }))} /></label>)}</div>}
    <div className="mode-switch"><button className={players.some(p=>p.kind==='human') ? 'selected' : ''} onClick={()=>setPlayers(all=>all.map((p,i)=>i===0 ? {...p,kind:'human',model:undefined,reasoningEffort:undefined} : p.kind==='human' ? {...p,kind:defaultHarness(state)} : p))}><User size={16} /><strong>我也要玩</strong><small>1 位真人，其余 Agent</small></button><button className={players.every(p=>p.kind!=='human') ? 'selected' : ''} onClick={()=>setPlayers(all=>all.map(p=>p.kind==='human' ? {...p,kind:defaultHarness(state)} : p))}><Sparkles size={16} /><strong>全 Agent 观战</strong><small>每位玩家独立会话</small></button></div>
    <RosterEditor state={state} players={players} onChange={setPlayers} poker={gameId === 'holdem'} />
    <label className="conversation-option"><input type="checkbox" checked={persist} onChange={e => setPersist(e.target.checked)} /><span><strong>保留玩家对话到各自 Harness 的本机历史</strong><small>默认关闭。开启后保存独立对话；是否显示在客户端由对应 Harness 决定。</small></span></label>
    {!state.connected && <div className="inline-notice"><Link2 size={17} /><span>启动本机连接器后连接，即可获取各 Harness 的模型目录。</span><button onClick={onConnect}>连接本机 <ArrowRight size={13} /></button></div>}
    {state.connectorUpdateRequired && <p className="form-error">{state.error}</p>}
    {state.game && <p className="setup-warning">新牌桌将替换当前牌桌。德州筹码与买入账本按新桌规则重新开始。</p>}
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="modal-footer"><small>每手发牌前可调整阵容；进行中固定阵容。</small><button className="button primary" disabled={pending || !state.connected} onClick={start}>{pending ? <Loader2 size={15} className="spin" /> : <Play size={15} />}开桌并发牌</button></div>
  </Modal>;
}
export function NextHandModal({ state, game, onClose, onConnect, onStart }: { state: AppSnapshot; game: HoldemView; onClose: () => void; onConnect: () => void; onStart: (players: HoldemPlayerConfig[]) => Promise<void> }) {
  const [players, setPlayers] = useState<HoldemPlayerConfig[]>(game.players.map(({ playerId, name, kind, model, reasoningEffort }) => ({ playerId, name, kind, model, reasoningEffort })));
  const [error, setError] = useState(''), [pending, setPending] = useState(false);
  const balances = new Map(game.players.map(p => [p.playerId, p.chips]));
  const start = async () => { setPending(true); setError(''); try { validateRoster(state, players); await onStart(players); } catch (e: any) { setError(e.message); } finally { setPending(false); } };
  return <Modal title={`准备第 ${game.round + 1} 手`} subtitle={`同一牌桌 · 盲注 ${game.options.smallBlind}/${game.options.bigBlind} · 新玩家买入 ${game.options.initialChips}`} onClose={onClose} wide>
    <p className="roster-note">替换玩家的 Agent 或 Harness 会保留该玩家筹码。移除玩家兑现剩余筹码；每位 Agent 都将创建全新会话。</p>
    <RosterEditor state={state} players={players} onChange={setPlayers} poker balances={balances} />
    {!state.connected && <div className="inline-notice"><Link2 size={17} /><span>重新连接本机后，即可读取模型目录并发下一手牌。</span><button onClick={onConnect}>连接本机 <ArrowRight size={13} /></button></div>}
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="modal-footer"><small>确认后发下一手牌，本手阵容不再变更。</small><button className="button primary" onClick={start} disabled={pending || !state.connected}>{pending ? <Loader2 size={15} className="spin" /> : <Play size={15} />}发下一手牌</button></div>
  </Modal>;
}
