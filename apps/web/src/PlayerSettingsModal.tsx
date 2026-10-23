import {useState} from 'react';
import {Copy} from 'lucide-react';
import {modelsForHarness} from '@agent-game/protocol';
import type {AppSnapshot,PlayerConfig} from './runtime/types';
import {AgentModelFields,kindName} from './AgentModelFields';
import {Avatar} from './UiBits';
import {Modal} from './Modal';export function PlayerSettingsModal({ state, busy, onClose, onSave, onError }: { state: AppSnapshot; busy: boolean; onClose: () => void; onSave: (players: PlayerConfig[]) => void; onError: (message: string) => void }) {
  const [players, setPlayers] = useState<PlayerConfig[]>(state.room!.roster.map(p => ({...p})));
  const agents = state.room!.roster.map((p,seat)=>({...p,seat})).filter(p => p.kind !== 'human');
  return <Modal title="玩家设置与会话" subtitle="牌局已暂停。设置在该玩家下次行动时生效，沿用原会话。" onClose={onClose} wide>
    <div className="player-settings-list">{agents.map(player => <section className="player-settings-card" key={player.seat}>
      <div className="player-settings-heading"><Avatar kind={player.kind} seat={player.seat} /><strong>{player.name}</strong><small>{kindName[player.kind]}</small></div>
      <AgentModelFields models={modelsForHarness(state.connector, player.kind)} label={player.name} settings={players[player.seat]} onChange={value => setPlayers(all => all.map((p, i) => i === player.seat ? { ...p, ...value } : p))} />
      <div className="conversation-info"><small>{state.persistConversations ? '已开启本机历史保留' : '临时会话 · 结束后不保留'}</small>{state.persistConversations && <><code>{state.seats[player.seat].conversationId ?? '首次行动时创建会话'}</code>{state.seats[player.seat].conversationId && <button className="button subtle" onClick={() => { void navigator.clipboard.writeText(state.seats[player.seat].conversationId!).catch(() => onError('无法复制，请手动复制会话 ID')); }}><Copy size={13} />复制会话 ID</button>}</>}</div>
    </section>)}</div>
    <div className="modal-footer"><small>关闭弹窗后，点击「继续游戏」恢复对局。</small><button className="button primary" disabled={busy || state.room?.finished} onClick={() => onSave(players)}>保存设置</button></div>
  </Modal>;
}
