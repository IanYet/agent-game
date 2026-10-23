import type { AgentSettings, ModelInfo } from '@agent-game/protocol';
import type { HarnessContext } from '../types';
import { gameName } from '@agent-game/core';

export function validateSettings(models: ModelInfo[], settings: AgentSettings): void {
  const model = settings.model ? models.find(m => m.id === settings.model) : models.find(m => m.isDefault) ?? models[0];
  if (settings.model && !model) throw new Error(`此 Harness 没有提供所选模型：${settings.model}`);
  if (settings.reasoningEffort && !model?.supportedReasoningEfforts?.some(e => e.effort === settings.reasoningEffort)) throw new Error(`所选模型不支持思考强度：${settings.reasoningEffort}`);
}

export function resolveSettings(models: ModelInfo[], settings: AgentSettings): AgentSettings {
  validateSettings(models, settings);
  const model = settings.model ? models.find(m => m.id === settings.model) : models.find(m => m.isDefault) ?? models[0];
  return { model: model?.id ?? settings.model, reasoningEffort: settings.reasoningEffort ?? model?.defaultReasoningEffort };
}

export function playerConversationTitle(context: HarnessContext): string {
  return `同桌 · ${gameName(context.gameId ?? 'doudizhu')} · ${context.name} · 第 ${context.round ?? 1} ${context.gameId === 'holdem' ? '手' : '局'} · ${(context.roomId ?? '').slice(0, 8)}`;
}

export function selectAcpModel(models: Array<{ modelId: string }>, currentModelId: string | undefined, settings: AgentSettings): string | undefined {
  const model = settings.model ?? currentModelId?.replace(/\[[^\]]+\]$/, '');
  if (!model) {
    if (settings.reasoningEffort) throw new Error('此 ACP harness 没有返回默认模型，无法设置思考强度');
    return undefined;
  }
  if (settings.reasoningEffort) {
    const exact = `${model}[${settings.reasoningEffort}]`;
    if (!models.some(m => m.modelId === exact)) throw new Error(`此 harness 不支持 ${model} 的 ${settings.reasoningEffort} 思考强度`);
    return exact;
  }
  if (!models.some(m => m.modelId === model || m.modelId.startsWith(`${model}[`))) throw new Error(`此 harness 没有提供所选模型：${model}`);
  if (currentModelId?.replace(/\[[^\]]+\]$/, '') === model) return currentModelId;
  throw new Error(`未获取到 ${model} 的默认思考强度，请明确选择思考强度`);
}
