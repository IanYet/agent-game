import { describe, expect, it } from 'vitest';
import { playerConversationTitle, resolveSettings, selectAcpModel, validateSettings } from './settings';

describe('玩家模型与思考强度', () => {
  const models = [{ modelId: 'a[low]' }, { modelId: 'a[high]' }, { modelId: 'b[medium]' }];
  it('精确选择模型和强度，不把不支持的强度静默替换成其他值', () => {
    expect(selectAcpModel(models, 'a[low]', { model: 'a', reasoningEffort: 'high' })).toBe('a[high]');
    expect(selectAcpModel(models, 'a[low]', { model: 'b', reasoningEffort: 'medium' })).toBe('b[medium]');
    expect(() => selectAcpModel(models, 'a[low]', { model: 'b', reasoningEffort: 'high' })).toThrow('不支持');
  });
  it('恢复模型默认时不强制 low，也不继承另一个模型的强度', () => {
    const defaults = [{ id: 'b', name: 'B', isDefault: false, defaultReasoningEffort: 'medium' }];
    expect(selectAcpModel(models, 'a[high]', resolveSettings(defaults, { model: 'b' }))).toBe('b[medium]');
    expect(selectAcpModel(models, 'a[high]', {})).toBe('a[high]');
    expect(() => selectAcpModel(models, 'a[high]', { model: 'missing' })).toThrow('所选模型');
  });
  it('校验默认模型支持的强度，标题包含玩家、牌局和轮次', () => {
    expect(() => validateSettings([{ id: 'b', name: 'B', isDefault: true, supportedReasoningEfforts: [{ effort: 'medium', description: '' }] }], { reasoningEffort: 'high' })).toThrow('不支持');
    expect(playerConversationTitle({ name:'Atlas',scopeId:'run',playerId:'atlas',kind:'codex',instructions:'Web supplied',displayTitle:'同桌 · 宇宙拍卖 · Atlas',tools:[], cwd: '', mcpUrl: '', onActivity() {}, onUsage() {} })).toBe('同桌 · 宇宙拍卖 · Atlas');
  });
});
