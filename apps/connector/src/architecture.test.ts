import {describe,expect,it} from 'vitest';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'esbuild';
async function sources(directory:string):Promise<string[]>{
 const entries=await readdir(directory,{withFileTypes:true});
 return(await Promise.all(entries.map(e=>e.isDirectory()?sources(resolve(directory,e.name)):e.name.endsWith('.ts')&&!e.name.endsWith('.test.ts')?[resolve(directory,e.name)]:[]))).flat();
}
describe('模块边界与构建依赖',()=>{
 it('真实连接器入口的整个打包图不引入游戏、React 或网页代码',async()=>{
  const result=await build({entryPoints:['apps/connector/src/index.ts'],bundle:true,platform:'node',format:'cjs',target:'node22',write:false,metafile:true,logLevel:'silent'});
  const inputs=Object.keys(result.metafile!.inputs);
  expect(inputs.some(p=>/apps\/web|packages\/game-core|node_modules\/react/.test(p))).toBe(false);
  expect(inputs).toContain('packages/protocol/src/validation.ts');
 });
 it('协议与 Harness 源码没有具体游戏枚举、固定工具名或扑克参数',async()=>{
  const files=[...await sources('apps/connector/src'),...await sources('packages/protocol/src')];
  for(const path of files){
   const source=await readFile(path,'utf8');
   expect(source,path).not.toMatch(/@agent-game\/core|game-core|doudizhu|holdem|斗地主|德州|game_get_state|game_legal_actions|game_act|game_rules/);
  }
 });
 it('平台调度器、通用界面和协议不需要按新游戏修改分支或类型联合',async()=>{
  for(const path of ['apps/web/src/controller.ts','apps/web/src/App.tsx','apps/web/src/TableSetup.tsx','apps/web/src/runtime/types.ts','packages/protocol/src/index.ts']){
   expect(await readFile(path,'utf8'),path).not.toMatch(/doudizhu|holdem|game_get_state|game_legal_actions|game_act|game_rules|ArcadeState|\bGameId\b/);
  }
 });
});
