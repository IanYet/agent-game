import type { ConversationEntry, ConversationUpdate } from '@agent-game/protocol';
import {gzipSync,gunzipSync,strFromU8,strToU8} from 'fflate';

type PlayerConversations = Record<string, ConversationEntry[]>;
interface SavedConversations { version: 2; runs: Record<string, PlayerConversations> }
const STORE_KEY = 'agent-arcade.conversations.v2';
// Repeated prompts compress well; keep every entry instead of truncating long games.
const encode=(data:SavedConversations)=>btoa(strFromU8(gzipSync(strToU8(JSON.stringify(data)),{level:1,mtime:0}),true));
const decode=(text:string)=>JSON.parse(strFromU8(gunzipSync(strToU8(atob(text),true)))) as SavedConversations;
const kinds = new Set(['instructions', 'prompt', 'message', 'reasoning', 'tool-call', 'tool-result', 'event', 'error']);
const empty: PlayerConversations = {};

export class ConversationStore {
  private data: SavedConversations = { version: 2, runs: {} };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  error: string | null = null;
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, private onChange: () => void) {
    try {
      storage.removeItem('agent-arcade.conversations.v1');
      const raw = storage.getItem(STORE_KEY);
      if (!raw) return;
      const saved = decode(raw);
      if (saved.version !== 2 || !saved.runs || typeof saved.runs !== 'object' || Array.isArray(saved.runs)) throw Error();
      for (const players of Object.values(saved.runs)) {
        if (!players || typeof players !== 'object' || Array.isArray(players)) throw Error();
        for (const entries of Object.values(players)) if (!Array.isArray(entries) || entries.some(e => !e || !kinds.has(e.kind) || !['id', 'time', 'title', 'text'].every(key => typeof e[key as keyof ConversationEntry] === 'string'))) throw Error();
      }
      this.data = saved;
    } catch { this.error = '浏览器中的对话记录无法读取；本次对话将重新记录。'; }
  }
  forRun(runId: string): PlayerConversations { return this.data.runs[runId] ?? empty; }
  record(runId: string, playerId: string, { entry, append }: ConversationUpdate): void {
    const players = this.forRun(runId), entries = [...(players[playerId] ?? [])];
    const index = entries.findIndex(e => e.id === entry.id);
    if (index < 0) entries.push({ ...entry });
    else entries[index] = { ...entry, ...(append ? { text: entries[index].text + entry.text } : {}) };
    this.data.runs[runId] = { ...players, [playerId]: entries };
    this.scheduleSave();
  }
  retain(runIds: Set<string>): void {
    let changed = false;
    for (const id of Object.keys(this.data.runs)) if (!runIds.has(id)) { delete this.data.runs[id]; changed = true; }
    if (changed) this.scheduleSave();
  }
  private scheduleSave(): void {
    this.dirty = true;
    // A stream can deliver many tokens per frame; write the full text in batches.
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 1000);
  }
  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.dirty) return;
    const previous = this.error;
    try { this.storage.setItem(STORE_KEY, encode(this.data)); this.dirty = false; this.error = null; }
    catch { this.error = '浏览器存储空间不足或不可用，对话暂留在当前页面；关闭或刷新后可能丢失。请释放浏览器存储空间。'; }
    if (this.error !== previous) this.onChange();
  }
}
