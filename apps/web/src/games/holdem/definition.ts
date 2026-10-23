import {applyHoldemAction,createHoldem,nextHoldemHand,viewHoldem,getHoldemLegalActions,holdemBetting,assertHoldemChips,HOLDEM_RULES,DEFAULT_HOLDEM_OPTIONS,type HoldemState,type HoldemAction} from './engine';
import {toolResult} from '@agent-game/protocol';
import type {GameModule,StoredRun} from '../../runtime/types';
import {enginePlayers,seatFor,decorateView,emptySchema,readOnly,decisionKey,checkRevision} from '../shared';
const descriptors=[
 {name:'game_get_state',description:'读取自己的底牌、公共牌、筹码、底池、轮次和当前下注范围；隐藏对手底牌、牌库和烧牌。',inputSchema:emptySchema,annotations:readOnly},
 {name:'game_legal_actions',description:'获取合法行动及 betting 下注范围。',inputSchema:{type:'object' as const,properties:{offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}},additionalProperties:false},annotations:readOnly},
 {name:'game_act',description:'执行一次行动。actionId 可选合法列表中的标识；自定义加注使用 actionId=raise，amount 为本轮累计下注到的总额。',inputSchema:{type:'object' as const,properties:{revision:{type:'integer',minimum:1},actionId:{type:'string',minLength:1,maxLength:300},amount:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER}},required:['revision','actionId'],additionalProperties:false},requiresDecision:true},
 {name:'game_rules',description:'读取无限注德州规则和本桌生命周期。',inputSchema:emptySchema,annotations:readOnly},
];
const observe=(run:StoredRun<HoldemState>,actor:string|null)=>decorateView(viewHoldem(run.state,actor===null?null:seatFor(run,actor)),run.roster);
export const holdemModule:GameModule<HoldemState>={
 id:'holdem',version:'1.0.0',stateVersion:1,name:'德州扑克',description:'读牌、下注、全下。筹码留在桌上，下一手重新思考。',tagline:'无限注',minPlayers:2,maxPlayers:9,defaultPlayers:4,defaultConfig:DEFAULT_HOLDEM_OPTIONS,runNoun:'手',
 rules:()=>HOLDEM_RULES,lifecycle:{sessionScope:'run',eagerAgents:true},
 create:(run,random)=>createHoldem(run.roomId,enginePlayers(run.roster),{...run.config,handId:run.runId,random,round:run.index}),
 next:(previous,run,random)=>nextHoldemHand(previous.state,enginePlayers(run.roster),{handId:run.runId,random}),
 finished:s=>s.phase==='finished',observe,
 decisions:run=>run.state.phase==='finished'?[]:[{decisionId:decisionKey(run,run.state.revision,run.state.turn),actorId:run.roster[run.state.turn].playerId,allowedTools:['game_act']}],
 tools:()=>descriptors,
 initializePrompt:(run,actor)=>`你是德州扑克玩家 ${run.roster[seatFor(run,actor)].name}。\n${HOLDEM_RULES}\n本手独立会话。amount 表示本轮下注到的总额，不是额外增加量。初始观察：${JSON.stringify(observe(run,actor))}`,
 decisionPrompt:(run,d)=>`德州扑克第 ${run.index} 手，决策 ${d.decisionId}。读取自己的状态，执行一次合法行动，然后结束任务。当前观察：${JSON.stringify(observe(run,d.actorId))}`,
 handleTool:(run,request)=>{
   const seat=seatFor(run,request.playerId),state=run.state;
   if(request.tool==='game_rules')return{result:toolResult({rules:HOLDEM_RULES})};
   if(request.tool==='game_get_state')return{result:toolResult(observe(run,request.playerId))};
   const legal=getHoldemLegalActions(state,seat);
   if(request.tool==='game_legal_actions'){const offset=Number(request.args.offset??0),limit=Number(request.args.limit??80);return{result:toolResult({revision:state.revision,total:legal.length,offset,actions:legal.slice(offset,offset+limit),betting:holdemBetting(state,seat)})};}
   if(request.tool!=='game_act')throw new Error('德州没有注册该工具');
   checkRevision(state,request.args);
   if(request.args.actionId!=='raise'&&request.args.amount!==undefined)throw new Error('只有自定义 raise 可以指定 amount');
   const action=request.args.actionId==='raise'?{type:'raise' as const,amount:request.args.amount as number}:legal.find(a=>a.id===request.args.actionId)?.action;
   if(!action)throw new Error('actionId 不是当前合法行动');
   const next=applyHoldemAction(state,seat,action);return{state:next,result:toolResult({success:true,revision:next.revision,message:'行动完成，结束本次任务。'})};
 },
 humanAction:(run,actor,input)=>applyHoldemAction(run.state,seatFor(run,actor),input as HoldemAction),
 restore:(data:any,version)=>{if(version!==1||data?.gameId!=='holdem'||!Array.isArray(data.deck)||!Array.isArray(data.ledger)||data.players?.length<2||data.players?.length>9)throw new Error('德州存档格式或版本不受支持');assertHoldemChips(data);return data;},
 summary:run=>({id:run.roomId,gameId:'holdem',round:run.index,endedAt:run.state.events.at(-1)?.time??run.state.createdAt,title:`德州扑克 · ${run.state.result?.winners.map(s=>run.roster[s].name).join('、')}赢得底池`,subtitle:`第 ${run.index} 手 · 盲注 ${run.state.options.smallBlind}/${run.state.options.bigBlind}`,entries:run.roster.map((p,i)=>({label:p.name,value:String(run.state.result?.deltas[i]??0),positive:(run.state.result?.deltas[i]??0)>0}))}),
 planning:run=>({subtitle:`同一牌桌 · 盲注 ${run.state.options.smallBlind}/${run.state.options.bigBlind} · 新玩家买入 ${run.state.options.initialChips}`,balances:new Map(run.state.players.map(p=>[p.playerId,p.chips])),newPlayerLabel:'按本桌初始筹码买入'}),
};
