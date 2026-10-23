// Public ACP fixture only. No model, game logic or fallback player is implemented here.
import {createInterface} from 'node:readline';
import {appendFileSync,readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
if(!process.env.AGENT_GAME_FIXTURE_AUDIT)throw new Error('Explicit protocol-fixture audit path is required');
const args=process.argv.slice(2),audit=value=>appendFileSync(process.env.AGENT_GAME_FIXTURE_AUDIT,JSON.stringify({...value,pid:process.pid})+'\n');
if(args.includes('--help')){console.log('--profile --patch ACP protocol fixture');process.exit(0);}
if(args.includes('--version')){console.log('protocol-fixture');process.exit(0);}
const patch=JSON.parse(readFileSync(args[args.indexOf('--patch')+1],'utf8')),guardPath=patch.find(p=>p.insert).insert[0].name;
const plugin=await import(pathToFileURL(guardPath).href);let guard;plugin.apply({tools:{guard:f=>{guard=f;}}});
if(!guard({name:'bash'}))throw new Error('Fixture guard did not deny a non-MCP tool');
const options=[{id:'model',category:'model',type:'select',currentValue:'protocol-fixture',options:[{value:'protocol-fixture',name:'Protocol fixture (no inference)'}]}];
let client,sessionId;
const send=(id,result)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\n');
createInterface({input:process.stdin}).on('line',async line=>{
 const m=JSON.parse(line);if(!m.method)return;
 try{
  if(m.method==='initialize')send(m.id,{protocolVersion:1,agentInfo:{name:'deepseek-harness-acp-protocol-fixture',version:'1'},agentCapabilities:{mcpCapabilities:{http:true},sessionCapabilities:{close:{}}}});
  else if(m.method==='session/new'){
   sessionId=randomUUID();const server=m.params.mcpServers[0];
   if(server){client=new Client({name:'explicit-protocol-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(server.url)));const list=await client.listTools();for(const t of list.tools)if(guard({name:'mcp__agent_game__'+t.name})!==undefined)throw new Error('Dynamic allowlist rejected a declared tool');audit({type:'tools',sessionId,tools:list.tools,guarded:true});}
   send(m.id,{sessionId,configOptions:options});
  }else if(m.method==='session/set_config_option')send(m.id,{configOptions:options});
  else if(m.method==='session/prompt'){
   const prompt=m.params.prompt[0].text,marker='\nFIXTURE_CALLS:',index=prompt.lastIndexOf(marker);if(index<0)throw new Error('Fixture only accepts explicit test commands');
   const commands=JSON.parse(prompt.slice(index+marker.length));
   for(const command of commands){const result=await client.callTool({name:command.name,arguments:command.args??{}});audit({type:'result',sessionId,name:command.name,result});if(Boolean(result.isError)!==Boolean(command.expectError))throw new Error('Unexpected MCP result for '+command.name);}
   send(m.id,{stopReason:'end_turn'});
  }else if(m.method==='session/close'){await client?.close();send(m.id,{});}
  else if(m.method==='session/cancel'){}
 }catch(error){if(m.id!==undefined)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,error:{code:-32000,message:error.message}})+'\n');}
});
