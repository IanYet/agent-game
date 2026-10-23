import type { ModelInfo, AgentSettings, HarnessInfo } from '@agent-game/protocol';
import type { PlayerKind } from '@agent-game/core';

const labels: Record<string, string> = { none: '无', minimal: '极低', low: '低', medium: '中', high: '高', xhigh: '更高', max: '最高', ultra: '极高' };
export function effortLabel(effort?: string) { return effort ? labels[effort] ?? effort : '模型默认'; }

const defaultHarnesses: HarnessInfo[] = [
  { id: 'codex-acp', name: 'Codex · ACP', protocol: 'ACP', available: true },
  { id: 'codex', name: 'Codex · App Server', protocol: 'Codex App Server', available: true },
];
export function AgentHarnessField({ harnesses, kind, label, onChange }: { harnesses?: HarnessInfo[]; kind: PlayerKind; label: string; onChange: (kind: PlayerKind) => void }) {
  const choices = harnesses?.length ? harnesses : defaultHarnesses;
  return <div className="agent-model-fields"><label>Harness<select aria-label={`${label} Harness`} value={kind} onChange={event => onChange(event.target.value as PlayerKind)}>
    {choices.map(harness => <option key={harness.id} value={harness.id} disabled={!harness.available}>{harness.name}{!harness.available ? ' · 未就绪' : ''}</option>)}
  </select></label></div>;
}

export function AgentModelFields({ models, settings, label, onChange }: { models: ModelInfo[]; settings: AgentSettings; label: string; onChange: (settings: AgentSettings) => void }) {
  const selected = settings.model ? models.find(m => m.id === settings.model) : models.find(m => m.isDefault) ?? models[0];
  const efforts = selected?.supportedReasoningEfforts ?? [];
  return <div className="agent-model-fields">
    <label>模型<select aria-label={`${label} 模型`} value={settings.model ?? ''} onChange={event => {
      const model = event.target.value || undefined;
      const next = model ? models.find(m => m.id === model) : models.find(m => m.isDefault) ?? models[0];
      const reasoningEffort = next?.supportedReasoningEfforts?.some(e => e.effort === settings.reasoningEffort) ? settings.reasoningEffort : undefined;
      onChange({ model, reasoningEffort });
    }}><option value="">默认模型{models.find(m => m.isDefault) ? ` · ${models.find(m => m.isDefault)!.name}` : ''}</option>{models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label>
    <label>思考强度<select aria-label={`${label} 思考强度`} value={settings.reasoningEffort ?? ''} disabled={!efforts.length} onChange={event => onChange({ ...settings, reasoningEffort: event.target.value || undefined })}>
      <option value="">模型默认{selected?.defaultReasoningEffort ? ` · ${effortLabel(selected.defaultReasoningEffort)}` : ''}</option>
      {efforts.map(effort => <option key={effort.effort} value={effort.effort} title={effort.description}>{effortLabel(effort.effort)} · {effort.effort}</option>)}
    </select></label>
    {!models.length && <small>连接本地搭档后获取模型及可用思考强度</small>}
  </div>;
}
