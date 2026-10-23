import {describe,expect,it} from 'vitest';
import {ToolRegistry} from './validation';
import {toolResult,type ToolDefinition} from './index';
const tool:ToolDefinition={name:'future.offer-v8',description:'A newly published web tool',requiresDecision:true,inputSchema:{type:'object',properties:{credits:{type:'integer',minimum:0,maximum:999},mode:{enum:['sealed','open']}},required:['credits','mode'],additionalProperties:false},outputSchema:{type:'object',properties:{accepted:{type:'boolean'}},required:['accepted'],additionalProperties:false}};
describe('JSON Schema 动态注册表',()=>{
 it('校验真实类型、范围、枚举和额外字段，不转换或删除参数',()=>{
  const registry=new ToolRegistry([tool]);expect(()=>registry.validateInput(tool.name,{credits:888,mode:'sealed'})).not.toThrow();
  for(const args of [{credits:'5',mode:'sealed'},{credits:-1,mode:'sealed'},{credits:1.1,mode:'sealed'},{credits:1000,mode:'sealed'},{credits:3,mode:'other'},{credits:3,mode:'sealed',actorId:'other'}])expect(()=>registry.validateInput(tool.name,args)).toThrow('JSON Schema');
 });
 it('校验结构化输出，但允许工具错误内容',()=>{
  const registry=new ToolRegistry([tool]);expect(()=>registry.validateOutput(tool.name,toolResult({accepted:true}))).not.toThrow();expect(()=>registry.validateOutput(tool.name,toolResult({accepted:'yes'}))).toThrow('outputSchema');expect(()=>registry.validateOutput(tool.name,toolResult({error:'No'},true))).not.toThrow();
 });
 it('拒绝重名、非法名称、外部 schema 引用及非 object schema',()=>{
  for(const defs of [[tool,tool],[{...tool,name:'bad/name'}],[{...tool,inputSchema:{type:'array'}}],[{...tool,inputSchema:{type:'object',properties:{x:{$ref:'https://example.com/schema'}}}}]])expect(()=>new ToolRegistry(defs as ToolDefinition[])).toThrow();
 });
 it('同时支持显式 draft-07 和默认 2020-12；不会忽略条件 schema',()=>{
  for(const schema of [{...tool.inputSchema,$schema:'http://json-schema.org/draft-07/schema#'},{...tool.inputSchema,if:{properties:{mode:{const:'open'}}},then:{properties:{credits:{maximum:10}}}}]){
   const registry=new ToolRegistry([{...tool,inputSchema:schema}]);expect(()=>registry.validateInput(tool.name,{credits:5,mode:'open'})).not.toThrow();
  }
  const registry=new ToolRegistry([{...tool,inputSchema:{type:'object',properties:{n:{type:'array',prefixItems:[{const:7}],items:false}},required:['n']}}]);expect(()=>registry.validateInput(tool.name,{n:[8]})).toThrow();
 });
});
