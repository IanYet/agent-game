import { APP_VERSION, PROTOCOL_VERSION, type ConnectorInfo } from '@agent-game/protocol';

export function connectorCompatibilityProblem(info: Pick<ConnectorInfo, 'version' | 'protocolVersion'>): string | null {
  const required = APP_VERSION.split('.').map(Number);
  const parsed = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(info.version ?? '');
  const detected = parsed?.slice(1).map(Number);
  const matchesVersion = detected && detected[0] === required[0] && detected[1] === required[1] && detected[2] >= required[2];
  if (matchesVersion && info.protocolVersion === PROTOCOL_VERSION) return null;
  return `连接器 v${info.version || '未知'} 与当前网页 v${APP_VERSION} 不兼容。需要连接器 v${required[0]}.${required[1]}.x（至少 v${APP_VERSION}，协议 ${PROTOCOL_VERSION}）。请下载最新连接器，退出旧版后重新启动；若连接器更高版本，请先刷新网页。`;
}
