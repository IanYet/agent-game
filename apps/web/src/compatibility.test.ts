import {CONNECTOR_VERSION} from '../../connector/src/version';
import {describe,expect,it} from 'vitest';
import {CONNECTOR_CAPABILITIES,PROTOCOL_VERSION} from '@agent-game/protocol';
import {connectorCompatibilityProblem} from './compatibility';
import {connectorRequirements,WEB_VERSION} from './version';
describe('独立的网页/连接器版本与能力协商',()=>{
 const valid={version:CONNECTOR_VERSION,protocolVersion:PROTOCOL_VERSION,capabilities:[...CONNECTOR_CAPABILITIES]};
 it('当前协议基线兼容',()=>expect(connectorCompatibilityProblem(valid)).toBeNull());
 it('不要求网页与连接器同版本、同 minor，允许满足能力与最低修复版本的更高发行',()=>{
   for(const version of ['0.4.1','0.9.0','1.0.0','99.3.2'])expect(connectorCompatibilityProblem({...valid,version})).toBeNull();
   expect(typeof WEB_VERSION).toBe('string');expect(connectorRequirements.minimumVersion).toBe(CONNECTOR_VERSION);
 });
 it('最低修复版本、协议或能力缺失时给出更新提示',()=>{
  for(const info of [{...valid,version:'0.4.0'},{...valid,version:'0.3.99'},{...valid,version:'broken'},{...valid,protocolVersion:3},{...valid,capabilities:[]}])expect(connectorCompatibilityProblem(info)).toContain('下载兼容连接器');
 });
});
