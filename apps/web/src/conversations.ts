import type { ConversationEntry, ConversationUpdate } from '@agent-game/protocol';

type PlayerConversations = Record<string, ConversationEntry[]>;
interface SavedConversations { version: 1; runs: Record<string, PlayerConversations> }
const STORE_KEY = 'agent-arcade.conversations.v1';
const kinds = new Set(['instructions', 'prompt', 'message', 'reasoning', 'tool-call', 'tool-result', 'event', 'error']);
const empty: PlayerConversations = {};

export class ConversationStore {
  private data: SavedConversations = { version: 1, runs: {} };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  error: string | null = null;
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'>, private onChange: () => void) {
    try {
      const raw = storage.getItem(STORE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as SavedConversations;
      if (saved.version !== 1 || !saved.runs || typeof saved.runs !== 'object' || Array.isArray(saved.runs)) throw Error();
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
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 250);
  }
  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.dirty) return;
    const previous = this.error;
    try { this.storage.setItem(STORE_KEY, JSON.stringify(this.data)); this.dirty = false; this.error = null; }
    catch { this.error = '浏览器存储空间不足或不可用，对话暂留在当前页面；关闭或刷新后可能丢失。请释放浏览器存储空间。'; }
    if (this.error !== previous) this.onChange();
  }
}
