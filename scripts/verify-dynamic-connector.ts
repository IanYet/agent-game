import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {ConnectorClient} from '../apps/web/src/connector';
import {GameController} from '../apps/web/src/controller';
import {GameRegistry,type GameModule} from '../apps/web/src/runtime/types';
import {doudizhuModule} from '../apps/web/src/games/doudizhu/definition';
import {getLegalActions} from '../apps/web/src/games/doudizhu/engine';
import {holdemModule} from '../apps/web/src/games/holdem/definition';
import {getHoldemLegalActions} from '../apps/web/src/games/holdem/engine';
import {auctionModule} from '../apps/web/src/games/auction-fixture/definition';

// This launches the production bundle unchanged. Only DSH_PATH points to an explicit ACP test driver.
const bundle=resolve('dist/connector/index.cjs'),hash=async()=>createHash('sha256').update(await readFile(bundle)).digest('hex'),before=await hash();
const root=resolve('.cache','validation','dynamic-'+randomUUID());await mkdir(root,{recursive:true});
const auditPath=resolve(root,'acp-audit.ndjson');await writeFile(auditPath,'');
const net=createServer();await new Promise<void>(r=>net.listen(0,'127.0.0.1',r));const port=(net.address() as any).port;await new Promise<void>(r=>net.close(()=>r()));
const connector=spawn(process.execPath,[bundle],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,AGENT_GAME_PORT:String(port),AGENT_GAME_DATA_DIR:resolve(root,'sessions'),AGENT_GAME_WEB_ORIGINS:'http://127.0.0.1:5173',CODEX_PATH:resolve(root,'no-codex'),WORKBUDDY_PATH:resolve(root,'no-workbuddy'),DSH_PATH:resolve('scripts/fixtures/acp-driver.mjs'),AGENT_GAME_FIXTURE_AUDIT:auditPath}});
let diagnostic='';connector.stdout.on('data',c=>{diagnostic=(diagnostic+c).slice(-6000);});connector.stderr.on('data',c=>{diagnostic=(diagnostic+c).slice(-6000);});
async function until(check:()=>boolean|Promise<boolean>,timeout=90_000){const end=Date.now()+timeout;while(!await check()){if(Date.now()>end)throw new Error('Verification timed out: '+diagnostic);await new Promise(r=>setTimeout(r,30));}}
const endpoint='http://127.0.0.1:'+port,browserFetch:typeof fetch=(url,options)=>fetch(url,{...options,headers:{...Object.fromEntries(new Headers(options?.headers)),Origin:'http://127.0.0.1:5173'}});
const commands=(calls:unknown[])=>'\nFIXTURE_CALLS:'+JSON.stringify(calls);
const cardFixture=(module:GameModule,legal:(state:any,seat:number)=>Array<{id:string}>):GameModule=>({...module,decisionPrompt:(run,d)=>{
 const seat=run.roster.findIndex(p=>p.playerId===d.actorId),actions=legal(run.state,seat),action=actions.find(a=>a.id==='bid-3')??actions.find(a=>a.id==='check')??actions.find(a=>a.id==='call')??actions[0];
 return commands([{name:'game_get_state'},{name:'game_legal_actions',args:{limit:100}},{name:'game_act',args:{actionId:action.id,revision:run.state.revision}}]);
}});
const simultaneousFixture:GameModule={...auctionModule,decisionPrompt:()=>commands([{name:'auction.peek'},{name:'auction.offer',args:{credits:101},expectError:true},{name:'auction.offer',args:{credits:4,playerId:'someone-else'},expectError:true},{name:'auction.offer',args:{credits:20}},{name:'auction.offer',args:{credits:22}},{name:'auction.confirm'},{name:'auction.confirm',expectError:true}])};
const registry=new GameRegistry([cardFixture(doudizhuModule,getLegalActions),cardFixture(holdemModule,getHoldemLegalActions)]);
const client=new ConnectorClient(endpoint,browserFetch),values=new Map<string,string>(),game=new GameController({getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);}},client,registry);
const evidence:Array<{moduleId:string;participants:number;runId:string;toolCalls:number}>=[];
try{
 await until(async()=>{try{return(await fetch(endpoint+'/health')).ok;}catch{return false;}});
 await game.connect();
 for(const [moduleId,count] of [['doudizhu',3],['holdem',2],['sealed-auction-fixture',12]] as const){
  if(moduleId===simultaneousFixture.id)registry.register(simultaneousFixture);
  const lineCount=(await readFile(auditPath,'utf8')).trim().split('\n').filter(Boolean).length;
  await game.create(Array.from({length:count},(_,i)=>({playerId:moduleId+'-p'+i,name:'Fixture '+i,kind:'dsh' as const})),{gameId:moduleId});
  await until(()=>game.getSnapshot().room!.finished||Boolean(game.getSnapshot().error));
  assert.equal(game.getSnapshot().error,null);
  await game.pause();assert.equal(connector.exitCode,null);assert.equal(await hash(),before);
  const records=(await readFile(auditPath,'utf8')).trim().split('\n').filter(Boolean).slice(lineCount).map(line=>JSON.parse(line));
  assert.equal(records.filter(r=>r.type==='tools').length,count);assert.ok(records.every(r=>r.type!=='tools'||r.guarded));
  if(moduleId==='sealed-auction-fixture'){
   assert.ok(records.filter(r=>r.type==='tools').every(r=>r.tools.map((t:any)=>t.name).join(',')==='auction.peek,auction.offer,auction.confirm'));
   assert.equal(records.filter(r=>r.type==='result'&&r.result.isError).length,36);
   assert.ok(records.some(r=>r.result?.content?.some((c:any)=>c.type==='image')));
   assert.ok(records.filter(r=>r.name==='auction.peek').every(r=>Object.keys(r.result.structuredContent).sort().join(',')==='budget,confirmed,offer,revision,waiting'));
  }
  evidence.push({moduleId,participants:count,runId:game.getSnapshot().room!.runId,toolCalls:records.filter(r=>r.type==='result').length});
  console.log('PASS same production connector PID '+connector.pid+': '+moduleId+' ('+count+' participants)');
 }
 const proof={verifiedAt:new Date().toISOString(),connectorPid:connector.pid,bundleSha256:before,unchanged:before===await hash(),inference:false,driver:'explicit ACP/HTTP MCP fixture via DSH_PATH',games:evidence};
 await mkdir(resolve('.cache','validation'),{recursive:true});await writeFile(resolve('.cache','validation','dynamic-connector-proof.json'),JSON.stringify(proof,null,2)+'\n');
 console.log('PASS unchanged connector SHA-256: '+before);
}finally{
 await game.disconnect().catch(()=>{});
 connector.kill();await Promise.race([new Promise<void>(r=>connector.once('exit',()=>r())),new Promise<void>(r=>setTimeout(r,5000))]);
}
