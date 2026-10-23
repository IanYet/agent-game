import {describe,expect,it} from 'vitest';
import {doudizhuModule} from './definition';
import {applyAction} from './engine';
import type {StoredRun} from '../../runtime/types';
import type {DoudizhuState} from './types';
function fixture():StoredRun<DoudizhuState>{
 const meta={moduleId:doudizhuModule.id,moduleVersion:doudizhuModule.version,stateVersion:1,roomId:'table',runId:'run',index:1,config:{},roster:Array.from({length:3},(_,i)=>({playerId:'p'+i,name:'P'+i,kind:'dsh' as const}))};
 let seed=17;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
 return{...meta,state:applyAction(doudizhuModule.create(meta,random),0,{type:'bid',value:3})};
}
describe('Agent 观察与真人界面的行动列表',()=>{
 it('MCP 和两类提示词使用有限预览，真人视图保留完整合法行动',()=>{
  const run=fixture(),view=doudizhuModule.observe(run,'p0'),decision=doudizhuModule.decisions(run)[0];
  expect(view.legalActions.length).toBeGreaterThan(12);
  const result=doudizhuModule.handleTool(run,{id:'read',scopeId:run.runId,playerId:'p0',tool:'game_get_state',args:{}}).result.structuredContent as any;
  expect(result.legalActions).toHaveLength(12);expect(result.legalActionCount).toBe(view.legalActions.length);
  expect(result.players.filter((p:any)=>p.hand).map((p:any)=>p.playerId)).toEqual(['p0']);
  for(const prompt of [doudizhuModule.initializePrompt(run,'p0'),doudizhuModule.decisionPrompt(run,decision)]){
   const privateState=JSON.parse(prompt.split('观察：')[1]);expect(privateState.legalActions).toHaveLength(12);expect(privateState.legalActionCount).toBe(view.legalActions.length);
  }
 });
 it('Agent 可以通过分页工具读取预览之外的完整行动',()=>{
  const run=fixture(),view=doudizhuModule.observe(run,'p0');
  const result=doudizhuModule.handleTool(run,{id:'more',scopeId:run.runId,playerId:'p0',tool:'game_legal_actions',args:{offset:12,limit:100}}).result.structuredContent as any;
  expect(result.total).toBe(view.legalActions.length);expect(result.actions).toEqual(view.legalActions.slice(12,112));
 });
});
