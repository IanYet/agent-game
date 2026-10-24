import { randomUUID } from 'node:crypto';
import type { ConversationEntry, ConversationKind, ConversationUpdate } from '@agent-game/protocol';
import type { HarnessContext } from '../types';
import type { JsonRpcProcess } from './rpc';

export class ConversationRecorder {
  private entries = new Map<string, Pick<ConversationEntry, 'id' | 'time'>>();
  constructor(private emit: (update: ConversationUpdate) => void) {}
  record(kind: ConversationKind, title: string, value: unknown, key: string = randomUUID(), append = false): void {
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    if (!text) return;
    let identity = this.entries.get(key);
    if (!identity) { identity = { id: randomUUID(), time: new Date().toISOString() }; this.entries.set(key, identity); }
    this.emit({ entry: { ...identity, kind, title, text }, ...(append ? { append: true } : {}) });
  }
}

// Observe conversational RPC traffic without recording authentication, MCP URLs
// or process configuration. Unknown conversation events retain their full payload.
export function captureConversation(rpc: JsonRpcProcess, context: HarnessContext): void {
  const recorder = new ConversationRecorder(context.onConversation);
  const permissions = new Set<string | number>();
  const turns = new Set<string | number>();
  const eventTitles: Record<string, string> = { available_commands_update: '可用指令更新', session_info_update: '会话信息更新', usage_update: '用量更新', current_mode_update: '模式更新', config_option_update: '模型设置更新', plan: 'Agent 计划', tool_call: '原生工具调用', tool_call_update: '原生工具进度', 'turn/started': 'Agent 开始本轮思考', 'turn/completed': 'Agent 完成本轮任务', 'item/reasoning/summaryPartAdded': 'Agent 开始新的思考摘要' };
  let chunkKind = '', chunkId = 0;
  rpc.on('message', (direction: 'sent' | 'received', message: any) => {
    const { method, params = {}, id } = message;
    if (direction === 'sent') {
      if (method === 'turn/start' || method === 'session/prompt') {
        chunkKind = ''; chunkId++;
        const input = params.input ?? params.prompt;
        recorder.record('prompt', '连接器 → Agent', Array.isArray(input) && input.every((p: any) => p.type === 'text') ? input.map((p: any) => p.text).join('\n\n') : input);
        turns.add(id);
      } else if (method === 'turn/interrupt' || method === 'session/cancel') {
        recorder.record('event', '连接器请求暂停', '取消当前推理，保留本局上下文。');
      } else if (method === 'session/set_model' || method === 'session/set_config_option') {
        recorder.record('event', '连接器调整模型设置', params);
      } else if (permissions.delete(id)) {
        recorder.record('event', '连接器权限答复', message.result ?? message.error);
      }
      return;
    }
    if (id !== undefined && method) {
      permissions.add(id);
      recorder.record('event', method==='session/request_permission'||method.includes('requestApproval')?'Agent 请求工具权限':'Agent 请求连接器', { method, ...params });
      return;
    }
    if (turns.delete(id)) {
      if (message.error) recorder.record('error', 'Agent 任务失败', message.error);
      // ACP can return stop metadata and a final message here instead of chunks.
      else if (message.result && !message.result.turn) recorder.record('event', 'Agent 任务结束', message.result);
      return;
    }
    if (!method) return;
    if (method === 'session/update') {
      const u = params.update;
      if (!u) return;
      const kind = u.sessionUpdate === 'agent_message_chunk' ? 'message' : u.sessionUpdate === 'agent_thought_chunk' ? 'reasoning' : u.sessionUpdate === 'user_message_chunk' ? 'prompt' : null;
      if (kind) {
        if (chunkKind !== kind) { chunkKind = kind; chunkId++; }
        const text = u.content?.type === 'text' ? u.content.text : u.content;
        recorder.record(kind, kind === 'reasoning' ? 'Agent 思考' : kind === 'prompt' ? 'Harness 输入' : 'Agent 回复', text, `acp:${chunkId}`, true);
      } else {
        chunkKind = '';
        recorder.record(u.status === 'failed' ? 'error' : u.sessionUpdate === 'tool_call' || u.sessionUpdate === 'tool_call_update' ? 'tool-call' : 'event', u.title ?? eventTitles[u.sessionUpdate] ?? 'Harness 事件', u);
      }
      return;
    }
    const stream = method === 'item/agentMessage/delta' ? ['message', 'Agent 回复', 'message'] :
      method === 'item/reasoning/summaryTextDelta' ? ['reasoning', 'Agent 思考摘要', `summary:${params.summaryIndex ?? 0}`] :
      method === 'item/reasoning/textDelta' ? ['reasoning', 'Agent 思考', `reasoning:${params.contentIndex ?? 0}`] : null;
    if (stream && typeof params.delta === 'string') {
      recorder.record(stream[0] as ConversationKind, stream[1], params.delta, `${params.itemId}:${stream[2]}`, true);
      return;
    }
    if (method === 'item/started' || method === 'item/completed') {
      const item = params.item;
      if (item?.type === 'agentMessage') {
        recorder.record('message', 'Agent 回复', item.text, `${item.id}:message`);
      } else if (item?.type === 'reasoning') {
        for (const [index, text] of (item.summary ?? []).entries()) recorder.record('reasoning', 'Agent 思考摘要', text, `${item.id}:summary:${index}`);
        for (const [index, text] of (item.content ?? []).entries()) recorder.record('reasoning', 'Agent 思考', text, `${item.id}:reasoning:${index}`);
      } else if (item?.type !== 'userMessage') {
        recorder.record(item?.status==='failed'?'error':'event', `${item?.type==='mcpToolCall'?'原生工具调用':'Agent 活动'} · ${item?.status==='failed'?'失败':method === 'item/started' ? '开始' : '完成'}`, item ?? params);
      }
      return;
    }
    if (/^(item\/|turn\/|error$|warning$|thread\/compacted)/.test(method)) recorder.record(method === 'error' ? 'error' : 'event', eventTitles[method] ?? 'Harness 事件', { method, ...params });
  });
}
