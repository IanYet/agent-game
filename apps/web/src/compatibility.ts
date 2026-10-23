import type {ConnectorInfo} from '@agent-game/protocol';
import {connectorRequirements} from './version';
export function connectorCompatibilityProblem(info:Pick<ConnectorInfo,'version'|'protocolVersion'> & Partial<Pick<ConnectorInfo,'capabilities'>>):string|null{
  const parse=(value:string)=>/^v?(\d+)\.(\d+)\.(\d+)$/.exec(value)?.slice(1).map(Number);
  const required=parse(connectorRequirements.minimumVersion)!,detected=parse(info.version??'');
  const meetsMinimum=detected&&detected.some((n,i)=>n>required[i]&&detected.slice(0,i).every((p,j)=>p===required[j]))||detected?.every((n,i)=>n===required[i]);
  const missing=connectorRequirements.capabilities.filter(c=>!info.capabilities?.includes(c));
  if(meetsMinimum&&info.protocolVersion===connectorRequirements.protocolVersion&&!missing.length)return null;
  return `连接器 v${info.version||'未知'} 缺少当前网页所需能力。需要协议 ${connectorRequirements.protocolVersion}、至少 v${connectorRequirements.minimumVersion}${missing.length?`，缺少 ${missing.join('、')}`:''}。请下载兼容连接器，退出旧版后重新启动。`;
}
