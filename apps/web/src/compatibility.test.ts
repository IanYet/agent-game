import { describe, expect, it } from 'vitest';
import { APP_VERSION, PROTOCOL_VERSION } from '@agent-game/protocol';
import packageInfo from '../../../package.json';
import { connectorCompatibilityProblem } from './compatibility';

describe('网页与连接器版本匹配', () => {
  it('网页的版本要求与当前发行版本一致', () => expect(APP_VERSION).toBe(packageInfo.version));
  it('接受当前版本及同一系列的后续补丁', () => {
    expect(connectorCompatibilityProblem({ version: APP_VERSION, protocolVersion: PROTOCOL_VERSION })).toBeNull();
    expect(connectorCompatibilityProblem({ version: '0.2.99', protocolVersion: PROTOCOL_VERSION })).toBeNull();
  });
  it.each(['0.1.9', '0.3.0', '1.0.0', 'unknown', '0.2.0-beta'])('拒绝不兼容的版本 %s 并明确提供升级指引', version => {
    expect(connectorCompatibilityProblem({ version, protocolVersion: PROTOCOL_VERSION })).toContain('请下载最新连接器');
  });
  it('版本号相同但通信协议不同也不能连接', () => {
    expect(connectorCompatibilityProblem({ version: APP_VERSION, protocolVersion: PROTOCOL_VERSION - 1 })).toContain('不兼容');
  });
});
