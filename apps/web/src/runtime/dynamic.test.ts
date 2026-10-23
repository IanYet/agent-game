import {CONNECTOR_VERSION} from '../../../connector/src/version';
import {afterEach,describe,expect,it} from 'vitest';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {CONNECTOR_CAPABILITIES,PROTOCOL_VERSION,type ConnectorInfo,type ToolResponse} from '@agent-game/protocol';
import {LocalBridge} from '../../../connector/src/bridge';
import {createConnectorServer} from '../../../connector/src/server';
import type {HarnessAdapter,HarnessContext} from '../../../connector/src/types';
import {GameController} from '../controller';
import {ConnectorClient} from '../connector';
import {GameRegistry,type GameModule} from './types';
import {auctionModule} from '../games/auction-fixture/definition';
const cleanups:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const close of cleanups.splice(0).reverse())await close();});
const memoryStore=()=>{const values=new Map<string,string>();return{values,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};};
async function until(check:()=>boolean){const end=Date.now()+8000;while(!check()){if(Date.now()>end)throw new Error('Fixture condition timed out');await new Promise(r=>setTimeout(r,5));}}
async function fixture(module:GameModule=auctionModule){
 const net=createServer();await new Promise<void>(r=>net.listen(0,'127.0.0.1',r));const port=(net.address() as any).port;await new Promise<void>(r=>net.close(()=>r()));
 const info:ConnectorInfo={version:CONNECTOR_VERSION,protocolVersion:PROTOCOL_VERSION,capabilities:[...CONNECTOR_CAPABILITIES],platform:'test',port,harnesses:[],models:[],auth:'missing'};
 const contexts:HarnessContext[]=[],clients=new Map<string,Client>(),releases=new Map<string,()=>void>(),prompts:Array<{actor:string;prompt:string}>=[],closed:string[]=[];
 const adapter:HarnessAdapter={id:'dsh',createSession:async context=>{
  contexts.push(context);const client=new Client({name:'protocol-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(context.mcpUrl)));clients.set(context.playerId,client);
  return{sessionId:randomUUID(),playTurn:(prompt,signal)=>new Promise<void>((yes,no)=>{
   prompts.push({actor:context.playerId,prompt});const abort=()=>no(new Error('fixture cancelled'));
   const done=()=>{signal.removeEventListener('abort',abort);yes();};releases.set(context.playerId,done);
   if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});
  }),close:async()=>{closed.push(context.playerId);await client.close();}};
 }};
 const bridge=new LocalBridge(info,new Map([['dsh',adapter],['workbuddy',adapter]]),resolve('.cache','dynamic-'+randomUUID()));
 const service=createConnectorServer(bridge,['http://127.0.0.1:5173']);await service.listen();
 const browserFetch:typeof fetch=(url,options)=>fetch(url,{...options,headers:{...Object.fromEntries(new Headers(options?.headers)),Origin:'http://127.0.0.1:5173'}});
 const store=memoryStore(),client=new ConnectorClient('http://127.0.0.1:'+port,browserFetch),registry=new GameRegistry([module]),game=new GameController(store,client,registry);
 let forwarded=0;bridge.on('event',event=>{if(event.type==='tool')forwarded++;});
 cleanups.push(async()=>{await game.disconnect();await service.close();});
 await game.connect();
 const roster=(n:number,human=false)=>Array.from({length:n},(_,i)=>({playerId:'participant-'+i,name:'P'+i,kind:human&&i===0?'human' as const:'dsh' as const}));
 const call=(actor:number,name:string,args={})=>clients.get('participant-'+actor)!.callTool({name,arguments:args}) as Promise<ToolResponse>;
 return{game,store,registry,contexts,clients,releases,prompts,closed,roster,call,forwarded:()=>forwarded};
}
describe('游戏无关运行时与动态 MCP 合约',()=>{
 it('每个玩家保有自己的工具名称和 schema，不能调用另一个玩家的工具',async()=>{
  const module:GameModule={...auctionModule,tools:(run,actor)=>[...auctionModule.tools(run,actor),{name:'private.'+actor,description:'Read only this participant identity',inputSchema:{type:'object',additionalProperties:false},annotations:{readOnlyHint:true}}],handleTool:(run,request)=>request.tool.startsWith('private.')?{result:{content:[],structuredContent:{owner:request.playerId}}}:auctionModule.handleTool(run,request)};
  const f=await fixture(module);await f.game.create(f.roster(2));await until(()=>f.prompts.length===2);
  const list=(await f.clients.get('participant-0')!.listTools()).tools.map(t=>t.name);
  expect(list).toContain('private.participant-0');expect(list).not.toContain('private.participant-1');
  const before=f.forwarded();expect((await f.call(0,'private.participant-1')).isError).toBe(true);expect(f.forwarded()).toBe(before);
  expect((await f.call(0,'private.participant-0')).structuredContent).toEqual({owner:'participant-0'});
  const url=new URL(f.contexts.find(c=>c.playerId==='participant-0')!.mcpUrl);url.pathname=url.pathname.replace('/mcp/','/mcp/foreign-');
  expect((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status).toBe(401);
 });
 it('12 位同时决策、新工具/参数、多次交互、私有观察、结构化/图片结果及重复调用拒绝',async()=>{
  const f=await fixture();await f.game.create(f.roster(12));await until(()=>f.prompts.length===12);
  expect((await f.clients.get('participant-0')!.listTools()).tools.map(t=>t.name)).toEqual(['auction.peek','auction.offer','auction.confirm']);
  expect(f.contexts.find(c=>c.playerId==='participant-11')!.instructions).toContain('participant-11');
  const a=await f.call(0,'auction.offer',{credits:30});expect(a.isError).not.toBe(true);expect(a.structuredContent).toEqual({staged:30});expect(a.content[1]).toMatchObject({type:'image',mimeType:'image/png'});
  await f.call(1,'auction.offer',{credits:20});await f.call(0,'auction.offer',{credits:40});
  const view=await f.call(0,'auction.peek');expect(view.structuredContent).toMatchObject({offer:40,budget:100,waiting:12});expect(JSON.stringify(view)).not.toContain('participant-1');
  expect((await f.call(1,'auction.confirm')).isError).not.toBe(true);
  expect((await f.call(1,'auction.confirm')).isError).toBe(true);
  const before=f.forwarded();for(const args of [{credits:1.5},{credits:101},{credits:10,playerId:'participant-1'},{chips:10}])expect((await f.call(0,'auction.offer',args)).isError).toBe(true);
  expect((await f.call(0,'game_act')).isError).toBe(true);expect(f.forwarded()).toBe(before);
  expect((await f.call(0,'auction.confirm')).isError).not.toBe(true);
  for(let i=2;i<12;i++){await f.call(i,'auction.offer',{credits:i});expect((await f.call(i,'auction.confirm')).isError).not.toBe(true);}
  f.releases.forEach(release=>release());await until(()=>f.game.getSnapshot().room?.finished===true);
  expect(f.game.getSnapshot().error).toBeNull();expect(f.game.getSnapshot().history).toHaveLength(1);expect(f.closed).toHaveLength(0);
 });
 it('room 会话跨轮保留，旧决策不可重放；控制方式改变只重建对应玩家',async()=>{
  const f=await fixture();await f.game.create(f.roster(2));await until(()=>f.prompts.length===2);
  const oldRun=f.game.getSnapshot().room!.runId,scope=f.game.getSnapshot().room!.roomId;
  for(let i=0;i<2;i++){await f.call(i,'auction.offer',{credits:10+i});await f.call(i,'auction.confirm');f.releases.get('participant-'+i)!();}
  await until(()=>f.game.getSnapshot().seats.every(s=>s.status==='ready'));
  await f.game.nextRound();await until(()=>f.prompts.length===4);expect(f.contexts).toHaveLength(2);
  expect(f.game.handleTool({id:randomUUID(),scopeId:scope,playerId:'participant-0',decisionId:oldRun+':participant-0',tool:'auction.offer',args:{credits:99}}).isError).toBe(true);
  for(let i=0;i<2;i++){await f.call(i,'auction.offer',{credits:22});await f.call(i,'auction.confirm');f.releases.get('participant-'+i)!();}
  await until(()=>f.game.getSnapshot().seats.every(s=>s.status==='ready'));
  const roster=f.roster(2);roster[0].kind='workbuddy' as any;
  await f.game.nextRound(roster);await until(()=>f.prompts.length===6);expect(f.contexts).toHaveLength(3);expect(f.closed).toEqual(['participant-0']);
 });
 it('暂停保留会话、取消全部并发任务，继续仅唤醒未完成决策；真人遵循同一授权',async()=>{
  const f=await fixture();await f.game.create(f.roster(3,true));await until(()=>f.prompts.length===2);
  f.game.humanAction({credits:13});f.game.humanAction({confirm:true});
  await f.call(1,'auction.offer',{credits:20});await f.call(1,'auction.confirm');f.releases.get('participant-1')!();
  await f.game.pause();expect(f.closed).toHaveLength(0);expect(f.game.getSnapshot().seats[2].sessionId).toBeTruthy();
  expect((await f.call(2,'auction.offer',{credits:5})).isError).toBe(true);expect(()=>f.game.humanAction({credits:5})).toThrow('不能操作');
  await f.game.resume();await until(()=>f.prompts.length===3);expect(f.prompts.at(-1)!.actor).toBe('participant-2');expect(f.contexts).toHaveLength(2);
  await f.call(2,'auction.offer',{credits:5});await f.call(2,'auction.confirm');f.releases.get('participant-2')!();await until(()=>f.game.getSnapshot().room!.finished);
  expect(f.game.getSnapshot().error).toBeNull();
 });
 it('模块超时也串行提交；暂停期间不派发，恢复后处理已到期决策',async()=>{
  let deadline=Date.now()+60_000;
  const module:GameModule={...auctionModule,decisions:run=>auctionModule.decisions(run).map(d=>({...d,deadline}))};
  const f=await fixture(module);await f.game.create(f.roster(2,true));
  await until(()=>f.prompts.length===1);await f.game.pause();
  // Advance the module deadline only after native startup; startup speed is not under test.
  deadline=Date.now()-1;await new Promise(r=>setTimeout(r,20));
  expect(f.game.getSnapshot().room!.finished).toBe(false);await f.game.resume();await until(()=>f.game.getSnapshot().room!.finished);
 });
 it('schema 固定在会话内；后续轮次声明变化时撤销该会话并重新注册',async()=>{
  let extra=false;const module={...auctionModule,tools:()=>[...auctionModule.tools(null as any,''),...(extra?[{name:'auction.rules',description:'New read operation',inputSchema:{type:'object' as const},annotations:{readOnlyHint:true}}]:[])]};
  const f=await fixture(module);await f.game.create(f.roster(2));await until(()=>f.prompts.length===2);extra=true;
  expect((await f.clients.get('participant-0')!.listTools()).tools).toHaveLength(3);
  expect((await f.call(0,'auction.rules')).isError).toBe(true);
  for(let i=0;i<2;i++){await f.call(i,'auction.offer',{credits:2});await f.call(i,'auction.confirm');f.releases.get('participant-'+i)!();}
  await until(()=>f.game.getSnapshot().seats.every(s=>s.status==='ready'));await f.game.nextRound();await until(()=>f.prompts.length===4);
  expect(f.contexts).toHaveLength(4);expect((await f.clients.get('participant-0')!.listTools()).tools).toHaveLength(4);
 });
 it('只读工具不能偷偷提交状态，失败结果也不能提交状态',async()=>{
  const malicious={...auctionModule,handleTool:(run:any)=>({state:{...run.state,closed:true},result:{...{content:[]},structuredContent:{budget:100,offer:null,confirmed:false,revision:1,waiting:2}}})} as GameModule;
  const f=await fixture(malicious);await f.game.create(f.roster(2));await until(()=>f.prompts.length===2);
  expect((await f.call(0,'auction.peek')).isError).toBe(true);expect(f.game.getSnapshot().room!.finished).toBe(false);
  malicious.handleTool=(run:any)=>({state:{...run.state,closed:true},result:{content:[],isError:true}});
  expect((await f.call(0,'auction.offer',{credits:1})).isError).toBe(true);expect(f.game.getSnapshot().room!.finished).toBe(false);
 });
 it('仅恢复当前格式和模块 stateVersion；不包含旧存档兼容或迁移',async()=>{
  const f=await fixture();await f.game.create(f.roster(2));await until(()=>f.prompts.length===2);await f.game.pause();
  const restored=new GameController(f.store,undefined,f.registry);expect(restored.getSnapshot().room!.runId).toBe(f.game.getSnapshot().room!.runId);expect(restored.getSnapshot().paused).toBe(true);expect(restored.getSnapshot().seats.every(s=>!s.sessionId)).toBe(true);
  const key='agent-arcade.games.v3',bad=JSON.parse(f.store.getItem(key)!);bad.current.stateVersion=99;f.store.setItem(key,JSON.stringify(bad));
  const rejected=new GameController(f.store,undefined,f.registry);expect(rejected.getSnapshot().room).toBeNull();expect(rejected.getSnapshot().error).toContain('版本已改变');
  const old=memoryStore();old.setItem('agent-arcade.games.v1','old development data');expect(new GameController(old,undefined,f.registry).getSnapshot().room).toBeNull();
 });
 it('平台拒绝多真人与重复玩家标识，玩家数量由模块决定',async()=>{
  const f=await fixture();await expect(f.game.create([{name:'A',kind:'human'},{name:'B',kind:'human'}])).rejects.toThrow('最多一位真人');
  await expect(f.game.create([{name:'A',kind:'dsh',playerId:'same'},{name:'B',kind:'dsh',playerId:'same'}])).rejects.toThrow('标识重复');
 });
});
