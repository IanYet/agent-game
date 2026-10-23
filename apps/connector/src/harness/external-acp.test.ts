import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { acpPromptFailure, dshGameGuard, ExternalAcpAdapter, modelsFromAcp } from './external-acp';
import { executableCandidates, executableCommand } from './discovery';
import type { HarnessContext } from '../types';
import { JsonRpcProcess } from './rpc';

const roots: string[] = [];
afterEach(async () => { for(const path of roots.splice(0)) if(resolve(path).startsWith(resolve(tmpdir())+sep) && path.includes('agent-arcade-test-')) await rm(path,{recursive:true,force:true}); });

// A protocol fixture only: no model, subscription calls, or production player implementation.
const fixtureSource = String.raw`
import { createInterface } from 'node:readline';
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const args=process.argv.slice(2), dsh=process.argv[1].includes('dsh-');
if(args.includes('--help')) { console.log('--acp --serve --tools --allowedTools --strict-mcp-config --mcp-config --settings --no-session-persistence'); process.exit(0); }
if(args.includes('--version')) { console.log('test'); process.exit(0); }
const log=process.argv[1]+'.log';
appendFileSync(log,JSON.stringify({args,...(args.includes('--serve')?{gateway:{host:process.env.SERVER__HOST,port:process.env.SERVER__PORT,auth:process.env.CODEBUDDY_GATEWAY_AUTH,passwordLength:process.env.CODEBUDDY_GATEWAY_PASSWORD?.length,tunnel:process.env.CODEBUDDY_GATEWAY_FORCE_TUNNEL}}:{})})+'\n');
if(dsh) {
  const patch=JSON.parse(readFileSync(args[args.indexOf('--patch')+1],'utf8'));
  const guard=patch.find(p=>p.insert)?.insert[0];
  let check; const plugin=await import(pathToFileURL(guard.name).href); plugin.apply({tools:{guard:f=>{check=f;}}});
  if(!check({name:'bash'})) throw new Error('guard failed');
  appendFileSync(log,JSON.stringify({patch})+'\n');
}
const ids=dsh?['["other","x"]','["deepseek-official","main"]']:['other-model','workbuddy-main'];
let model=ids[1],effort='high',pending,createdAt=0;
const options=()=>[{id:'model',category:'model',type:'select',currentValue:model,options:[{group:'native',options:(process.argv[1].includes('delayed') && Date.now()-createdAt<200 ? ids.slice(1) : ids).map(value=>({value,name:value===ids[1]?'Main':'Other'}))}]},{id:'reasoning_effort',category:'thought_level',type:'select',currentValue:effort,options:(model===ids[1]?['medium','high']:['low']).map(value=>({value,name:value}))}];
const send=(id,result)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\n');
const lines=createInterface({input:process.stdin});
lines.on('line',async line=>{
  const m=JSON.parse(line); appendFileSync(log,JSON.stringify(m)+'\n');
  if(m.method==='initialize') send(m.id,{protocolVersion:1,...(!args.includes('--serve')?{agentInfo:{name:dsh?'deepseek-harness-acp':'codebuddy',version:'test'}}:{}),agentCapabilities:{mcpCapabilities:{http:true},sessionCapabilities:{close:{}}}});
  else if(m.method==='session/new') {createdAt=Date.now();send(m.id,{sessionId:crypto.randomUUID(),configOptions:options()});}
  else if(m.method==='session/set_config_option') { if(m.params.configId==='model'){model=m.params.value;effort=model===ids[1]?'high':'low';}else effort=m.params.value;send(m.id,{configOptions:options()}); }
  else if(m.method==='session/prompt') { if(m.params.prompt[0].text.includes('BLOCK'))pending=m.id;else send(m.id,{stopReason:'end_turn'}); }
  else if(m.method==='session/cancel') { if(pending){send(pending,{stopReason:'cancelled'});pending=undefined;} }
  else if(m.method==='session/close') send(m.id,{});
});
`;
async function fixture(kind: 'dsh'|'workbuddy', lite=false, delayed=false) {
  const root=await mkdtemp(join(tmpdir(),'agent-arcade-test-')); roots.push(root);
  const path=join(root,lite?'codebuddy-lite-wb.mjs':`${kind}-${delayed?'delayed-':''}fixture.mjs`); await writeFile(path,fixtureSource);
  const context: HarnessContext={cwd:root,scopeId:'table',playerId:'agent-12',kind,name:'Agent',displayTitle:'宇宙拍卖 · Agent',instructions:'Initial resource budget: 997. Use the registered tools.',tools:[{name:'auction_offer',description:'Make an offer',inputSchema:{type:'object'},requiresDecision:true}],mcpUrl:'http://127.0.0.1:1234/mcp/table/capability',persistConversation:false,onActivity:()=>{},onUsage:()=>{}};
  const adapter=new ExternalAcpAdapter(kind,path); return {root,path,context,adapter,log:async()=> (await readFile(path+'.log','utf8')).trim().split('\n').map(line=>JSON.parse(line))};
}
describe('独立 Harness 的公开 ACP 适配',()=>{
  it.each(['dsh','workbuddy'] as const)('%s 从自己的目录逐模型检测思考强度，保留原始模型标识',async kind=>{
    const f=await fixture(kind), inspected=await f.adapter.inspect();
    expect(inspected.models).toHaveLength(2); expect(inspected.models.map(m=>m.isDefault)).toEqual([false,true]);
    expect(inspected.models.map(m=>m.supportedReasoningEfforts?.map(e=>e.effort))).toEqual([['low'],['medium','high']]);
    expect(inspected.models[1].defaultReasoningEffort).toBe('high');
    if(kind==='dsh')expect(inspected.models[1].id).toBe('["deepseek-official","main"]');
    const frames=await f.log(); expect(frames.some(m=>m.method==='session/prompt')).toBe(false);
  });
  it.each(['dsh','workbuddy'] as const)('%s 创建隔离会话、挂载座位 MCP、设置模型与强度，取消后继续同一会话',async kind=>{
    const f=await fixture(kind); const {models}=await f.adapter.inspect();
    const session=await f.adapter.createSession({...f.context,model:models[0].id,reasoningEffort:'low'});
    try {
      await session.playTurn('PLAY',new AbortController().signal,{model:models[1].id,reasoningEffort:'medium'});
      const abort=new AbortController(), interrupted=session.playTurn('BLOCK',abort.signal);
      await new Promise(resolve=>setTimeout(resolve,80)); abort.abort(); await expect(interrupted).rejects.toMatchObject({name:'AbortError'});
      await session.playTurn('RESUME',new AbortController().signal);
      const log=await f.log(), created=log.filter(m=>m.method==='session/new').at(-1);
      expect(created.params.mcpServers).toEqual([{type:'http',name:'agent_game',url:f.context.mcpUrl,headers:[]}]);
      const prompts=log.filter(m=>m.method==='session/prompt'); expect(new Set(prompts.map(m=>m.params.sessionId)).size).toBe(1);
      expect(prompts[0].params.prompt[0].text).toContain('997'); expect(prompts.at(-1).params.prompt[0].text).toBe('RESUME');
      expect(log.some(m=>m.method==='session/cancel')).toBe(true);
      if(kind==='workbuddy') {
        const args=log.filter(m=>m.args).at(-1).args; expect(args[args.indexOf('--tools')+1]).toBe(''); expect(args).toContain('--strict-mcp-config'); expect(args).toContain('--no-session-persistence');
      } else {
        const patch=log.filter(m=>m.patch).at(-1).patch;
        expect(patch.find((p:any)=>p.id==='session-persistence-jsonl').config.root).toBe(join(f.root,'dsh-history'));
      }
    } finally { await session.close(); }
  });
  it('没有关闭历史/工具隔离能力的 WorkBuddy 明确拒绝，不默默保存对话',async()=>{
    const f=await fixture('workbuddy');
    const adapter=new ExternalAcpAdapter('workbuddy',f.path,'--acp --tools --allowedTools --strict-mcp-config --mcp-config --settings');
    await expect(adapter.createSession(f.context)).rejects.toThrow('不支持关闭历史');
  });
  it('dsh 账户模型延迟注册时，目录探测与座位创建等待原生目录稳定',async()=>{
    const f=await fixture('dsh',false,true), inspected=await f.adapter.inspect();
    expect(inspected.models).toHaveLength(2);
    const session=await f.adapter.createSession({...f.context,model:inspected.models[0].id,reasoningEffort:'low'});
    await session.close();
    expect((await f.log()).some(m=>m.method==='session/prompt')).toBe(false);
  });
  it('WorkBuddy 桌面 lite 公开 ACP 使用隔离的 loopback gateway，接受可选 agentInfo 缺省',async()=>{
    const f=await fixture('workbuddy',true);
    expect((await f.adapter.inspect()).models).toHaveLength(2);
    const session=await f.adapter.createSession(f.context);
    await session.close();
    const commands=(await f.log()).filter(m=>m.args);
    for(const {args,gateway} of commands){
      expect(args).toContain('--serve'); expect(args).toContain('--acp');
      expect(args.some((a:string)=>a.length===64)).toBe(false);
      expect(gateway).toEqual({host:'127.0.0.1',port:'0',auth:'password',passwordLength:64,tunnel:'0'});
    }
  });
  it('dsh 工具守卫只放行当前会话动态声明的 MCP 工具，拒绝文件、终端、其他 MCP 和子 Agent',async()=>{
    const root=await mkdtemp(join(tmpdir(),'agent-arcade-test-')); roots.push(root); const file=join(root,'guard.mjs'); const source=dshGameGuard(['auction.offer','accept-gift']); await writeFile(file,source);
    const plugin = new Function(source.replaceAll('export ', '') + '\nreturn {apply};')();
    let guard!: (e:{name:string})=>string|undefined;
    plugin.apply({tools:{guard:(f:typeof guard)=>{guard=f;}}});
    for(const name of ['auction.offer','accept-gift'])expect(guard({name:`mcp__agent_game__${name}`})).toBeUndefined();
    for(const name of ['bash','pwsh','read_file','subagent','mcp__other__game_act','mcp__agent_game__other'])expect(guard({name})).toBeTruthy();
  });
  it('解析标准分组模型目录，不借用 Codex 模型或臆造强度',()=>{
    expect(modelsFromAcp([{id:'model',category:'model',currentValue:'local',options:[{value:'',options:[{value:'local',name:'Local'}]}]}])).toEqual([{id:'local',name:'Local',isDefault:true}]);
  });
  it('将 WorkBuddy 原生认证失败显示为可处理的登录提示',()=>{
    expect(acpPromptFailure({_meta:{'codebuddy.ai/errorMessage':JSON.stringify({message:'Authentication required',data:{details:'Authentication required. Please use /login command to sign in to your account',category:'auth'}})}})).toContain('独立公开 CLI 会话提供有效登录');
  });
  it('Windows npm .cmd 直接解析 Node 入口，无 shell 代理',async()=>{
    const root=await mkdtemp(join(tmpdir(),'agent-arcade-test-')); roots.push(root);
    const {mkdir}=await import('node:fs/promises'); await mkdir(join(root,'node_modules','example'),{recursive:true});
    const entry=join(root,'node_modules','example','cli.js'); await writeFile(entry,'');
    const shim=join(root,'dsh.cmd'); await writeFile(shim,'@"%dp0%\\node_modules\\example\\cli.js" %*');
    expect(await executableCommand(shim,['--profile','acp'])).toEqual({command:process.execPath,args:[entry,'--profile','acp']});
    const bin=join(root,'.bin'); await mkdir(bin); const localShim=join(bin,'dsh.cmd'); await writeFile(localShim,'@"%dp0%\\..\\node_modules\\example\\cli.js" %*');
    expect(await executableCommand(localShim)).toEqual({command:process.execPath,args:[entry]});
    await mkdir(join(root,'node_modules','example','bin')); const wb=join(root,'node_modules','example','bin','codebuddy'); await writeFile(wb,'#!/usr/bin/env node\n');
    const wbShim=join(root,'codebuddy.cmd'); await writeFile(wbShim,'@"%dp0%\\node_modules\\example\\bin\\codebuddy" %*');
    expect(await executableCommand(wbShim,['--acp'])).toEqual({command:process.execPath,args:[wb,'--acp']});
    expect(executableCandidates('C:\\repo\\.bin\\codex\r\nC:\\repo\\.bin\\codex.cmd\r\nC:\\app\\codex.exe','win32')).toEqual(['C:\\app\\codex.exe','C:\\repo\\.bin\\codex.cmd']);
  });
  it('保留 WorkBuddy 官方 Node 启动器，以执行它自己的版本与产品初始化',async()=>{
    const root=await mkdtemp(join(tmpdir(),'agent-arcade-test-')); roots.push(root);
    const {mkdir}=await import('node:fs/promises'); await mkdir(join(root,'bin')); await mkdir(join(root,'dist'));
    const wrapper=join(root,'bin','codebuddy'); await writeFile(wrapper,'#!/usr/bin/env node\n');
    await writeFile(join(root,'dist','codebuddy-lite-wb.mjs'),'');
    const command=await executableCommand(wrapper,['--help']);
    expect(command.command).toBe(process.execPath); expect(command.args).toEqual([wrapper,'--help']);
    expect(command.env?.CODEBUDDY_FORCE_LITE_WB_BUNDLE).toBe('1');
  });
  it('Windows dsh 桌面 CLI 保留官方 Electron Node carrier 的 ASAR 加载',async()=>{
    const root=await mkdtemp(join(tmpdir(),'agent-arcade-test-')); roots.push(root);
    const {mkdir}=await import('node:fs/promises'); const bin=join(root,'resources','runtime','cli','bin'); await mkdir(bin,{recursive:true});
    await writeFile(join(root,'DeepSeek Harness.exe'),''); await writeFile(join(root,'resources','app.asar'),'');
    const shim=join(bin,'dsh.cmd'); await writeFile(shim,'set ELECTRON_RUN_AS_NODE=1\ndsh-desktop-host\\lib\\cli.js');
    const command=await executableCommand(shim,['--profile','acp']);
    expect(command.command).toBe(join(root,'DeepSeek Harness.exe'));
    expect(command.args[0]).toBe('--expose-internals'); expect(command.args[1]).toContain('app.asar');
    expect(command.env?.ELECTRON_RUN_AS_NODE).toBe('1');
  });
  it.skipIf(process.platform!=='win32')('关闭不响应 stdio 的适配器时回收其子进程树',async()=>{
    const root=await mkdtemp(join(tmpdir(),'agent-arcade-test-')); roots.push(root); const file=join(root,'stubborn.cjs');
    await writeFile(file,`const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});require('node:readline').createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{pid:child.pid}})+'\\n');});setInterval(()=>{},1000);`);
    const rpc=new JsonRpcProcess({command:process.execPath,args:[file]}); const {pid}=await rpc.call('initialize');
    await rpc.close();
    const isAlive=()=>{try{process.kill(pid,0);return true;}catch{return false;}};
    const deadline=Date.now()+3000; while(isAlive() && Date.now()<deadline)await new Promise(r=>setTimeout(r,30));
    expect(isAlive()).toBe(false);
  });
});
