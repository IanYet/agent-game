import {createBoard,shuffle} from './board';
import {RESOURCES,RESOURCE_NAMES,DEVELOPMENT_TYPES,DEVELOPMENT_NAMES,type CatanState,type Player,type Resources,type Resource,type DevelopmentType,type Development,type Building,type Event,type Action,type CatanView,type TradeTerms,type TradeResponse} from './types';

export const emptyResources=():Resources=>({wood:0,brick:0,wool:0,wheat:0,ore:0});
export const resourceCount=(r:Partial<Resources>)=>RESOURCES.reduce((sum,key)=>sum+(r[key]??0),0);
export const resourcesText=(r:Partial<Resources>)=>RESOURCES.filter(key=>r[key]).map(key=>`${RESOURCE_NAMES[key]}×${r[key]}`).join('、')||'无资源';
export const COSTS={road:{wood:1,brick:1},settlement:{wood:1,brick:1,wool:1,wheat:1},city:{wheat:2,ore:3},development:{wool:1,wheat:1,ore:1}};
const DEVELOPMENT_COUNTS:Record<DevelopmentType,number>={knight:14,road_building:2,invention:2,monopoly:2,victory_point:5};
const phases=['setup_settlement','setup_road','roll','action','discard','robber','free_roads','trade_reply','trade_choose','finished'];
type Identity=Pick<Player,'playerId'|'name'|'kind'>;

function randomValue(random:()=>number){const n=random();if(!Number.isFinite(n)||n<0||n>=1)throw Error('随机源无效');return n;}
function randomState(s:CatanState){let n=s.rng;n^=n<<13;n^=n>>>17;n^=n<<5;s.rng=n>>>0;return s.rng/2**32;}
function dice(random:()=>number):[number,number]{return [Math.floor(random()*6)+1,Math.floor(random()*6)+1];}
function readResources(input:unknown):Resources {
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('资源必须使用资源种类与非负整数数量的对象');
  const result=emptyResources();for(const [key,n] of Object.entries(input)){
    if(!RESOURCES.includes(key as Resource))throw Error(`未知资源 ${key}；只能使用 wood、brick、wool、wheat、ore`);
    if(!Number.isSafeInteger(n)||(n as number)<0||(n as number)>19)throw Error(`${RESOURCE_NAMES[key as Resource]}数量必须是 0–19 的非负整数`);result[key as Resource]=n as number;
  }return result;
}
function has(resources:Resources,cost:Partial<Resources>){return RESOURCES.every(r=>resources[r]>=(cost[r]??0));}
function requireResources(resources:Resources,cost:Partial<Resources>,label='持有资源'){
  const missing=RESOURCES.filter(r=>resources[r]<(cost[r]??0));
  if(missing.length)throw Error(`${label}不足：${missing.map(r=>`${RESOURCE_NAMES[r]}需 ${cost[r]}${label==='银行库存'?'':'，现有 '+resources[r]}`).join('；')}`);
}
function transfer(from:Resources,to:Resources,amount:Partial<Resources>){for(const r of RESOURCES){from[r]-=amount[r]??0;to[r]+=amount[r]??0;}}
function pay(s:CatanState,seat:number,cost:Partial<Resources>){requireResources(s.players[seat].resources,cost);transfer(s.players[seat].resources,s.bank,cost);}
function vertex(s:CatanState,id:string){const v=s.board.vertices.find(v=>v.id===id);if(!v)throw Error('顶点不存在，请使用 board.vertices 中的 vertex id');return v;}
function edge(s:CatanState,id:string){const e=s.board.edges.find(e=>e.id===id);if(!e)throw Error('道路边不存在，请使用 board.edges 中的 edge id');return e;}
function pieces(s:CatanState,seat:number){const buildings=Object.values(s.buildings).filter(b=>b.seat===seat);return {roads:15-Object.values(s.roads).filter(p=>p===seat).length,settlements:5-buildings.filter(b=>b.kind==='settlement').length,cities:4-buildings.filter(b=>b.kind==='city').length};}
export function publicScore(s:CatanState,seat:number){return Object.values(s.buildings).filter(b=>b.seat===seat).reduce((n,b)=>n+(b.kind==='city'?2:1),0)+(s.longestRoad===seat?2:0)+(s.largestArmy===seat?2:0);}
export function score(s:CatanState,seat:number){return publicScore(s,seat)+s.players[seat].development.filter(c=>c.type==='victory_point').length;}
export function actors(s:CatanState):number[]{
  if(s.phase==='finished')return [];
  if(s.phase==='discard')return s.players.filter(p=>s.discardNeeded[p.seat]>0).map(p=>p.seat);
  if(s.phase==='trade_reply')return s.trade!.targets.filter(seat=>!s.trade!.responses[seat]);
  return [s.turn];
}
function record(s:CatanState,event:Pick<Event,'type'|'text'>&Partial<Event>){
  s.events.push({...event,seq:s.events.length+1,time:new Date().toISOString(),resourceCounts:s.players.map(p=>resourceCount(p.resources)),developmentCounts:s.players.map(p=>p.development.length),
    points:s.players.map(p=>s.phase==='finished'&&p.seat===s.result?.winner?score(s,p.seat):publicScore(s,p.seat)),knights:s.players.map(p=>p.knights),longestRoad:s.longestRoad,largestArmy:s.largestArmy,turn:s.turn});
}
function checkWin(s:CatanState){
  if(s.phase.startsWith('setup')||s.phase==='finished'||score(s,s.turn)<10)return;
  s.phase='finished';s.endedAt=new Date().toISOString();s.result={winner:s.turn,scores:s.players.map(p=>score(s,p.seat))};s.players[s.turn].wins++;
  s.trade=null;s.freeRoads=null;s.discardNeeded={};
  record(s,{type:'finish',seat:s.turn,text:`达到 ${score(s,s.turn)} 分，立即获胜；揭示 ${s.players[s.turn].development.filter(c=>c.type==='victory_point').length} 张胜利点卡`});
}

export function createCatan(id:string,players:Identity[],options:{random:()=>number;round?:number;firstSeat?:number;wins?:Map<string,number>}):CatanState{
  if(players.length<3||players.length>4)throw Error('卡坦岛基础版需要 3–4 位玩家');
  if(new Set(players.map(p=>p.playerId)).size!==players.length)throw Error('每位玩家必须有不同身份');
  const random=()=>randomValue(options.random),board=createBoard(random),firstRolls:CatanState['firstRolls']=[];
  let firstSeat=options.firstSeat;
  if(firstSeat===undefined){
    let tied=players.map((_,i)=>i),attempts=0;
    while(tied.length>1){if(++attempts>100)throw Error('先手掷骰连续同点过多，请检查随机源');const rolls=tied.map(seat=>{const roll=dice(random);firstRolls.push({seat,dice:roll});return {seat,total:roll[0]+roll[1]};});const best=Math.max(...rolls.map(r=>r.total));tied=rolls.filter(r=>r.total===best).map(r=>r.seat);}
    firstSeat=tied[0];
  }
  if(!Number.isInteger(firstSeat)||firstSeat<0||firstSeat>=players.length)throw Error('先手座位无效');
  let cardIndex=0;const deck=shuffle(DEVELOPMENT_TYPES.flatMap(type=>Array.from({length:DEVELOPMENT_COUNTS[type]},()=>({id:`d${cardIndex++}`,type,boughtTurn:-1}))),random);
  const state:CatanState={gameId:'catan',id,round:options.round??1,createdAt:new Date().toISOString(),revision:1,rng:Math.floor(random()*0xffffffff)+1,board,
    players:players.map((p,seat)=>({...p,seat,resources:emptyResources(),development:[],knights:0,wins:options.wins?.get(p.playerId)??0})),bank:{wood:19,brick:19,wool:19,wheat:19,ore:19},deck,played:[],buildings:{},roads:{},
    robber:board.hexes.find(h=>h.resource==='desert')!.id,dice:null,firstSeat,firstRolls,turn:firstSeat,turnNumber:1,phase:'setup_settlement',setupStep:0,setupVertex:null,developmentPlayed:false,
    discardNeeded:{},robberReturn:'action',freeRoads:null,trade:null,tradeSerial:0,longestRoad:null,largestArmy:null,events:[],result:null};
  record(state,{type:'setup',text:`2025 第六版基础版 · ${players.length} 人 · 随机地图。${firstRolls.length?firstRolls.map(r=>`${players[r.seat].name}掷 ${r.dice.join('+')}`).join('；')+'。':''}${players[firstSeat].name}先手，开始正序布置。`});
  assertCatan(state);return state;
}
export function nextCatan(previous:CatanState,id:string,players:Identity[],random:()=>number,round:number){
  if(previous.phase!=='finished')throw Error('本局尚未结束，不能开始下一局');
  return createCatan(id,players,{random,round,wins:new Map(previous.players.map(p=>[p.playerId,p.wins]))});
}

export function tradeRateOptions(s:CatanState,seat:number):Record<Resource,number[]>{
  const rates=Object.fromEntries(RESOURCES.map(r=>[r,[4]])) as Record<Resource,number[]>;
  for(const port of s.board.ports)if(port.vertices.some(v=>s.buildings[v]?.seat===seat)){
    if(port.resource==='any')for(const r of RESOURCES)rates[r].push(3);else rates[port.resource].push(2);
  }return Object.fromEntries(RESOURCES.map(r=>[r,[...new Set(rates[r])].sort((a,b)=>a-b)])) as Record<Resource,number[]>;
}
export function tradeRates(s:CatanState,seat:number):Resources{const options=tradeRateOptions(s,seat);return Object.fromEntries(RESOURCES.map(r=>[r,options[r][0]])) as Resources;}
export function roadLength(s:CatanState,seat:number):number{
  const owned=s.board.edges.filter(e=>s.roads[e.id]===seat);if(!owned.length)return 0;
  const graph=new Map<string,{next:string;bit:number}[]>();
  owned.forEach((e,i)=>{for(const v of e.vertices){const links=graph.get(v)??[];links.push({next:e.vertices.find(n=>n!==v)!,bit:1<<i});graph.set(v,links);}});
  const visit=(v:string,used:number):number=>{
    if(used&&s.buildings[v]&&s.buildings[v].seat!==seat)return 0;
    let best=0;for(const link of graph.get(v)??[])if(!(used&link.bit))best=Math.max(best,1+visit(link.next,used|link.bit));return best;
  };
  return Math.max(...[...graph.keys()].map(v=>visit(v,0)));
}
function award(values:number[],minimum:number,current:number|null):number|null{
  const max=Math.max(...values);if(max<minimum)return null;const tied=values.map((n,i)=>n===max?i:-1).filter(i=>i>=0);
  return current!==null&&tied.includes(current)?current:tied.length===1?tied[0]:null;
}
export function updateAwards(s:CatanState){s.longestRoad=award(s.players.map(p=>roadLength(s,p.seat)),5,s.longestRoad);s.largestArmy=award(s.players.map(p=>p.knights),3,s.largestArmy);}
function checkSettlement(s:CatanState,seat:number,id:string,initial=false){
  const v=vertex(s,id);if(s.buildings[id])throw Error('该顶点已有建筑，请选择空顶点');
  if(pieces(s,seat).settlements<1)throw Error('五（5）座定居点已用完，请先升级一座城市归还定居点');
  if(v.neighbors.some(n=>s.buildings[n]))throw Error('不符合距离规则：定居点必须与任何建筑相隔至少两条边');
  if(!initial&&!v.edges.some(e=>s.roads[e]===seat))throw Error('新定居点必须连接自己的一条道路');
}
function checkRoad(s:CatanState,seat:number,id:string,initial=false){
  const e=edge(s,id);if(s.roads[id]!==undefined)throw Error('该边已有道路，不能占用');if(pieces(s,seat).roads<1)throw Error('15 条道路实体已全部使用');
  if(initial){if(!e.vertices.includes(s.setupVertex!))throw Error('初始道路必须相邻于刚建的定居点');return;}
  if(!e.vertices.some(v=>s.buildings[v]?.seat===seat||(!s.buildings[v]&&vertex(s,v).edges.some(other=>s.roads[other]===seat))))throw Error('道路必须连接自己的道路或建筑，不能穿过对手建筑');
}
function roadAvailable(s:CatanState,seat:number){return s.board.edges.some(e=>{try{checkRoad(s,seat,e.id);return true;}catch{return false;}});}
function finishFreeRoads(s:CatanState){if(s.freeRoads&&(!s.freeRoads.remaining||!roadAvailable(s,s.turn))){s.phase=s.freeRoads.returnPhase;s.freeRoads=null;}}
function play(s:CatanState,seat:number,cardId:string,type:DevelopmentType){
  if(s.developmentPlayed)throw Error('本回合已使用一张发展卡，不能再次使用');
  const index=s.players[seat].development.findIndex(c=>c.id===cardId);if(index<0)throw Error('必须提交自己持有的发展卡 cardId');const card=s.players[seat].development[index];
  if(card.type!==type)throw Error(`牌种不符：此行动必须使用${DEVELOPMENT_NAMES[type]}卡`);
  if(card.boughtTurn>=s.turnNumber)throw Error('本回合买到的发展卡不能当回合使用');
  s.players[seat].development.splice(index,1);s.played.push(card);s.developmentPlayed=true;return card;
}
function terms(give:unknown,want:unknown):TradeTerms{
  const offer={give:readResources(give),want:readResources(want)};
  if(!resourceCount(offer.give)||!resourceCount(offer.want))throw Error('交易双方至少各给一种资源，不能为空或赠送');
  if(RESOURCES.some(r=>offer.give[r]&&offer.want[r]))throw Error('交易给取不能包含同种资源重叠，不能用多换少变相赠送');return offer;
}
function validTarget(s:CatanState,target:unknown){if(!Number.isInteger(target)||(target as number)<0||(target as number)>=s.players.length||(target as number)===s.turn)throw Error('交易目标必须是另一位玩家，不能选自己');return target as number;}
export function robberTargets(s:CatanState,hex:string,seat=s.turn){const h=s.board.hexes.find(h=>h.id===hex);return h?s.players.filter(p=>p.seat!==seat&&resourceCount(p.resources)>0&&h.vertices.some(v=>s.buildings[v]?.seat===p.seat)).map(p=>p.seat):[];}
function production(s:CatanState,total:number){
  const due=s.players.map(()=>emptyResources());
  for(const h of s.board.hexes)if(h.number===total&&h.resource!=='desert'&&h.id!==s.robber)for(const v of h.vertices){const b=s.buildings[v];if(b)due[b.seat][h.resource]+=b.kind==='city'?2:1;}
  const short:Resource[]=[];
  for(const r of RESOURCES){const eligible=s.players.filter(p=>due[p.seat][r]>0),needed=eligible.reduce((n,p)=>n+due[p.seat][r],0);
    if(needed>s.bank[r]){short.push(r);if(eligible.length===1)due[eligible[0].seat][r]=s.bank[r];else for(const p of eligible)due[p.seat][r]=0;}
  }
  due.forEach((resources,seat)=>{if(resourceCount(resources)){transfer(s.bank,s.players[seat].resources,resources);record(s,{type:'produce',seat,text:'生产获得 '+resourcesText(resources),resources});}});
  if(short.length)record(s,{type:'shortage',text:`${short.map(r=>RESOURCE_NAMES[r]).join('、')}库存短缺；多位领取者均不领取，单独领取者领剩余库存。`});
}

const ACTION_FIELDS:Record<string,string[]>={setup_settlement:['vertex'],settlement:['vertex'],city:['vertex'],setup_road:['edge'],road:['edge'],free_road:['edge'],roll:[],end_turn:[],buy_development:[],trade_cancel:[],discard:['resources'],move_robber:['hex','target'],bank_trade:['give','want'],trade_open:['give','want','target'],trade_reply:['response','give','want'],trade_accept:['target'],play_knight:['cardId'],play_road_building:['cardId'],play_invention:['cardId','resources'],play_monopoly:['cardId','resource']};
function actionInput(input:unknown):Action{
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('行动格式必须是包含 type 的对象');const action=input as Action;
  if(typeof action.type!=='string'||!Object.hasOwn(ACTION_FIELDS,action.type))throw Error('未知行动 type，请读取 game_rules 的行动字段说明');
  if(Object.keys(input).some(k=>k!=='type'&&!ACTION_FIELDS[action.type].includes(k)))throw Error('行动包含不支持的额外字段，请按行动说明提交');
  return action;
}
export function applyCatan(previous:CatanState,seat:number,input:unknown):CatanState{
  if(previous.phase==='finished')throw Error('本局已结束');
  if(!Number.isInteger(seat)||!actors(previous).includes(seat))throw Error('当前没有这位玩家的决策，尚未轮到你或你已完成回应');
  // The map and earlier events never change. Copy only the mutable domain state.
  const {board,events,...mutable}=previous;
  const action=actionInput(input),s:CatanState={...structuredClone(mutable),board,events:events.slice()},p=s.players[seat];let event:Pick<Event,'type'|'text'>&Partial<Event>={type:action.type,seat,text:''};
  if(s.phase==='setup_settlement'){
    if(action.type!=='setup_settlement')throw Error('初始布置阶段必须先选择定居点顶点');checkSettlement(s,seat,action.vertex,true);s.buildings[action.vertex]={seat,kind:'settlement'};s.setupVertex=action.vertex;
    if(s.setupStep>=s.players.length){const resources=emptyResources();for(const id of vertex(s,action.vertex).hexes){const h=s.board.hexes.find(h=>h.id===id)!;if(h.resource!=='desert')resources[h.resource]++;}transfer(s.bank,p.resources,resources);event.resources=resources;}
    s.phase='setup_road';event={...event,vertex:action.vertex,kind:'settlement',text:`初始${s.setupStep>=s.players.length?'第二':'第一'}座定居点 · ${action.vertex}${event.resources?' · 获得 '+resourcesText(event.resources):''}`};
  }else if(s.phase==='setup_road'){
    if(action.type!=='setup_road')throw Error('初始布置阶段必须放置与刚建定居点相邻的道路');checkRoad(s,seat,action.edge,true);s.roads[action.edge]=seat;s.setupStep++;s.setupVertex=null;
    if(s.setupStep===s.players.length*2){s.phase='roll';s.turn=s.firstSeat;}else {const index=s.setupStep<s.players.length?s.setupStep:2*s.players.length-1-s.setupStep;s.turn=(s.firstSeat+index)%s.players.length;s.phase='setup_settlement';}
    event={...event,edge:action.edge,text:`初始道路 · ${action.edge}`};
  }else if(s.phase==='discard'){
    if(action.type!=='discard')throw Error(`必须先弃牌，准确弃 ${s.discardNeeded[seat]} 张资源`);const resources=readResources(action.resources);
    if(resourceCount(resources)!==s.discardNeeded[seat])throw Error(`必须准确弃 ${s.discardNeeded[seat]} 张资源`);requireResources(p.resources,resources);transfer(p.resources,s.bank,resources);delete s.discardNeeded[seat];
    if(!Object.keys(s.discardNeeded).length)s.phase='robber';event={...event,text:`弃掉 ${resourceCount(resources)} 张资源`,private:{[seat]:{resources}}};
  }else if(s.phase==='robber'){
    if(action.type!=='move_robber')throw Error('必须先移动强盗并选择可偷取的目标');const hex=s.board.hexes.find(h=>h.id===action.hex);
    if(!hex)throw Error('强盗目标地块不存在，请使用 board.hexes 的 hex id');if(action.hex===s.robber)throw Error('强盗必须移动到另一块不同地块');
    const targets=robberTargets(s,action.hex);if(targets.length&&!targets.includes(action.target!))throw Error(`请选择新地块上有资源的相邻对手作为偷取目标 target：${targets.join('、')}`);
    if(!targets.length&&action.target!==undefined)throw Error('新地块没有可偷取目标，请省略 target');
    s.robber=action.hex;event={...event,hex:action.hex,text:`强盗移动到 ${action.hex}`};
    if(action.target!==undefined){const victim=s.players[action.target],total=resourceCount(victim.resources);let pick=Math.floor(randomState(s)*total);let resource:Resource='wood';for(const r of RESOURCES){if(pick<victim.resources[r]){resource=r;break;}pick-=victim.resources[r];}
      transfer(victim.resources,p.resources,{[resource]:1});event.target=action.target;event.text+=`，从${victim.name}随机偷取 1 张资源`;event.private={[seat]:{resources:{[resource]:1}},[action.target]:{resources:{[resource]:1}}};
    }s.phase=s.robberReturn;
  }else if(s.phase==='free_roads'){
    if(action.type!=='free_road')throw Error('修路卡正在结算，请用 free_road 放置免费道路');checkRoad(s,seat,action.edge);s.roads[action.edge]=seat;s.freeRoads!.remaining--;finishFreeRoads(s);event={...event,edge:action.edge,text:`修路卡免费建造道路 · ${action.edge}`};
  }else if(s.phase==='trade_reply'){
    if(action.type!=='trade_reply')throw Error('请接受、拒绝或还价，当前为交易回应阶段');let response:TradeResponse;
    if(action.response==='counter'){
      const offer=terms(action.give,action.want);requireResources(p.resources,offer.give);response={response:'counter',offer};event.text=`向${s.players[s.turn].name}还价：给 ${resourcesText(offer.give)}，要 ${resourcesText(offer.want)}`;
    }else {
      if(action.give!==undefined||action.want!==undefined)throw Error('接受或拒绝不应填写 give/want；修改报价请使用 counter');
      if(action.response==='accept'){if(!s.trade!.offer)throw Error('尚无具体报价，请使用 counter 主动提出交换');requireResources(p.resources,s.trade!.offer.want);response={response:'accept'};event.text='接受交易意向，等待当前回合玩家确认成交';}
      else if(action.response==='reject'){response={response:'reject'};event.text='拒绝本次交易';}else throw Error('response 必须为 accept、reject 或 counter');
    }
    s.trade!.responses[seat]=response;if(!s.trade!.targets.some(target=>!s.trade!.responses[target]))s.phase='trade_choose';
  }else if(s.phase==='trade_choose'){
    if(action.type==='trade_cancel'){s.trade=null;s.phase='action';event.text='结束本次协商，继续行动';}
    else if(action.type==='trade_accept'){
      const target=validTarget(s,action.target),response=s.trade!.responses[target];if(!response||response.response==='reject')throw Error('该玩家尚未接受或还价，不能成交');
      const offer:TradeTerms=response.response==='accept'?s.trade!.offer!:{give:response.offer.want,want:response.offer.give};if(!offer)throw Error('没有可接受的报价');
      requireResources(p.resources,offer.give);if(!has(s.players[target].resources,offer.want))throw Error('对方当前持有资源不足，无法按此报价成交，请重新协商或取消');
      transfer(p.resources,s.players[target].resources,offer.give);transfer(s.players[target].resources,p.resources,offer.want);s.trade=null;s.phase='action';
      event={...event,target,text:`与${s.players[target].name}成交：给 ${resourcesText(offer.give)}，得到 ${resourcesText(offer.want)}`};
    }else throw Error('请用 trade_accept 选择接受或还价的对手成交，或 trade_cancel 结束协商');
  }else {
    // Only pre-roll development cards and roll are permitted before production.
    if(s.phase==='roll'&&action.type!=='roll'&&!action.type.startsWith('play_'))throw Error('请先掷骰；此阶段只能 roll 或使用一张以前买到的发展卡');
    if(action.type==='roll'){
      if(s.phase!=='roll')throw Error('本回合已经掷骰，不能再次掷骰');s.dice=dice(()=>randomState(s));const total=s.dice[0]+s.dice[1];
      event={...event,dice:s.dice,text:`掷出 ${s.dice.join(' + ')} = ${total}`};
      if(total===7){s.discardNeeded=Object.fromEntries(s.players.filter(p=>resourceCount(p.resources)>7).map(p=>[p.seat,Math.floor(resourceCount(p.resources)/2)]));s.phase=Object.keys(s.discardNeeded).length?'discard':'robber';s.robberReturn='action';}
      else {s.phase='action';record(s,event);production(s,total);event=null as never;}
    }else if(action.type==='road'){
      checkRoad(s,seat,action.edge);pay(s,seat,COSTS.road);s.roads[action.edge]=seat;event={...event,edge:action.edge,text:`建造道路 · ${action.edge} · 支付 ${resourcesText(COSTS.road)}`};
    }else if(action.type==='settlement'){
      checkSettlement(s,seat,action.vertex);pay(s,seat,COSTS.settlement);s.buildings[action.vertex]={seat,kind:'settlement'};event={...event,vertex:action.vertex,kind:'settlement',text:`建造定居点 · ${action.vertex} · 支付 ${resourcesText(COSTS.settlement)}`};
    }else if(action.type==='city'){
      vertex(s,action.vertex);if(s.buildings[action.vertex]?.seat!==seat||s.buildings[action.vertex]?.kind!=='settlement')throw Error('城市只能升级自己的定居点');if(pieces(s,seat).cities<1)throw Error('四（4）座城市已用完');
      pay(s,seat,COSTS.city);s.buildings[action.vertex]={seat,kind:'city'};event={...event,vertex:action.vertex,kind:'city',text:`升级城市 · ${action.vertex} · 支付 ${resourcesText(COSTS.city)}，定居点返回库存`};
    }else if(action.type==='buy_development'){
      if(!s.deck.length)throw Error('发展卡牌堆已经耗尽');pay(s,seat,COSTS.development);const card=s.deck.shift()!;card.boughtTurn=s.turnNumber;p.development.push(card);event={...event,text:'购买 1 张隐藏发展卡 · 支付 '+resourcesText(COSTS.development),private:{[seat]:{development:card}}};
    }else if(action.type==='bank_trade'){
      const offer=terms(action.give,action.want),rates=tradeRateOptions(s,seat);let quantities=new Set([0]);
      for(const r of RESOURCES){
        // A port grants another trade option; it never removes the ordinary 4:1 exchange.
        const groups=Array.from({length:offer.give[r]+1},()=>new Set<number>());groups[0].add(0);
        for(let amount=1;amount<=offer.give[r];amount++)for(const rate of rates[r])if(amount>=rate)for(const n of groups[amount-rate])groups[amount].add(n+1);
        if(!groups[offer.give[r]].size)throw Error(`${RESOURCE_NAMES[r]}数量无法按可用比例 ${rates[r].map(n=>n+':1').join('、')} 分组`);
        quantities=new Set([...quantities].flatMap(n=>[...groups[offer.give[r]]].map(m=>n+m)));
      }
      if(!quantities.has(resourceCount(offer.want)))throw Error(`按给出的资源与可用港口比例，可换取 ${[...quantities].sort((a,b)=>a-b).join('、')} 张，不能换 ${resourceCount(offer.want)} 张`);requireResources(p.resources,offer.give);requireResources(s.bank,offer.want,'银行库存');transfer(p.resources,s.bank,offer.give);transfer(s.bank,p.resources,offer.want);
      event.text=`与银行交易：给 ${resourcesText(offer.give)}，取 ${resourcesText(offer.want)}`;
    }else if(action.type==='trade_open'){
      const targets=action.target===undefined?s.players.filter(other=>other.seat!==seat).map(p=>p.seat):[validTarget(s,action.target)];let offer:TradeTerms|null=null;
      if(action.give!==undefined||action.want!==undefined){offer=terms(action.give,action.want);requireResources(p.resources,offer.give);}
      s.trade={id:++s.tradeSerial,offer,targets,responses:{}};s.phase='trade_reply';event.text=`向${targets.map(i=>s.players[i].name).join('、')}${offer?`报价：给 ${resourcesText(offer.give)}，要 ${resourcesText(offer.want)}`:'开放协商，邀请对手提出交易'}`;
    }else if(action.type==='end_turn'){
      s.turn=(s.turn+1)%s.players.length;s.turnNumber++;s.phase='roll';s.dice=null;s.developmentPlayed=false;event.text=`结束回合；轮到${s.players[s.turn].name}`;
    }else if(action.type==='play_knight'){
      const c=play(s,seat,action.cardId,'knight');p.knights++;s.robberReturn=s.phase==='roll'?'roll':'action';s.phase='robber';event={...event,cardId:c.id,development:c.type,text:`打出骑士，已出 ${p.knights} 张；移动强盗`};
    }else if(action.type==='play_road_building'){
      const c=play(s,seat,action.cardId,'road_building');s.freeRoads={remaining:2,returnPhase:s.phase==='roll'?'roll':'action'};s.phase='free_roads';finishFreeRoads(s);event={...event,cardId:c.id,development:c.type,text:'打出修路，依次免费建造最多两条道路'};
    }else if(action.type==='play_invention'){
      const resources=readResources(action.resources),count=Math.min(2,resourceCount(s.bank));if(resourceCount(resources)!==count)throw Error(`发明须立即取 ${count} 张资源（通常为两（2）张）`);requireResources(s.bank,resources,'银行库存');const c=play(s,seat,action.cardId,'invention');transfer(s.bank,p.resources,resources);event={...event,cardId:c.id,development:c.type,resources,text:'打出发明，获得 '+resourcesText(resources)};
    }else if(action.type==='play_monopoly'){
      if(!RESOURCES.includes(action.resource))throw Error('垄断必须选择 wood、brick、wool、wheat、ore 之一');const c=play(s,seat,action.cardId,'monopoly');let total=0;for(const other of s.players)if(other.seat!==seat){total+=other.resources[action.resource];transfer(other.resources,p.resources,{[action.resource]:other.resources[action.resource]});}
      event={...event,cardId:c.id,development:c.type,resources:{[action.resource]:total},text:`打出垄断，收取所有对手的${RESOURCE_NAMES[action.resource]}共 ${total} 张`};
    }else throw Error('此行动不适用于当前阶段，请读取当前 phase 与行动说明');
  }
  updateAwards(s);if(event)record(s,event);checkWin(s);s.revision++;
  assertCatan(s);return s;
}

function visibleEvents(s:CatanState,viewer:number|null,reveal=false):Omit<Event,'private'>[]{
  return s.events.map(event=>{
    const {private:secret,...publicEvent}=event;
    const own=viewer===null?undefined:secret?.[viewer];
    const disclosed=own??(reveal?Object.values(secret??{})[0]:undefined);
    return {...publicEvent,...(disclosed?.resources?{resources:disclosed.resources}:{}),...(disclosed?.development?{development:disclosed.development.type,cardId:disclosed.development.id}:{})};
  });
}
export function viewCatan(s:CatanState,viewer:number|null,reveal=false):CatanView{
  const {rng:_rng,deck:_deck,bank:_bank,players:_players,events:_events,result:_result,...publicState}=s;
  return structuredClone({...publicState,viewer,bank:Object.fromEntries(RESOURCES.map(r=>[r,s.bank[r]>0])) as Record<Resource,boolean>,developmentRemaining:s.deck.length,actors:actors(s),
    players:s.players.map(p=>{
      const visible=reveal||viewer===p.seat,winner=s.phase==='finished'&&s.result?.winner===p.seat;
      return {...p,resources:visible?p.resources:null,development:visible?p.development:winner?p.development.filter(c=>c.type==='victory_point'):null,
        resourceCount:resourceCount(p.resources),developmentCount:p.development.length,points:visible||winner?score(s,p.seat):publicScore(s,p.seat),publicPoints:publicScore(s,p.seat),roadLength:roadLength(s,p.seat),pieces:pieces(s,p.seat),rates:tradeRates(s,p.seat),rateOptions:tradeRateOptions(s,p.seat)};
    }),events:visibleEvents(s,viewer,reveal),result:s.result?{winner:s.result.winner,score:s.result.scores[s.result.winner]}:null});
}

export function replayCatan(s:CatanState,through:number){
  const buildings:Record<string,Building>={},roads:Record<string,number>={};let robber=s.board.hexes.find(h=>h.resource==='desert')!.id,dice:[number,number]|null=null;
  const events=visibleEvents(s,null).filter(e=>e.seq<=through);
  for(const event of events){
    if(event.vertex&&event.kind&&event.seat!==undefined)buildings[event.vertex]={seat:event.seat,kind:event.kind};
    if(event.edge&&event.seat!==undefined)roads[event.edge]=event.seat;
    if(event.hex)robber=event.hex;if(event.dice)dice=event.dice;
    if(event.type==='end_turn')dice=null;
  }
  const last=events.at(-1);
  return {board:s.board,buildings,roads,robber,dice,points:last?.points??s.players.map(()=>0),resourceCounts:last?.resourceCounts??s.players.map(()=>0),developmentCounts:last?.developmentCounts??s.players.map(()=>0),knights:last?.knights??s.players.map(()=>0),longestRoad:last?.longestRoad??null,largestArmy:last?.largestArmy??null,turn:last?.turn??s.firstSeat,events};
}

export function assertCatan(s:CatanState):void{
  const fail=(message:string):never=>{throw Error(`卡坦岛状态无效：${message}`);};
  if(!s||s.gameId!=='catan'||!Array.isArray(s.players)||s.players.length<3||s.players.length>4||new Set(s.players.map(p=>p.playerId)).size!==s.players.length)fail('玩家人数或身份不符');
  if(!phases.includes(s.phase)||!Number.isSafeInteger(s.revision)||s.revision<1||!Number.isInteger(s.rng)||s.rng<1||s.rng>0xffffffff||!Number.isSafeInteger(s.turnNumber)||s.turnNumber<1||!Number.isInteger(s.turn)||!s.players[s.turn]||!Number.isInteger(s.firstSeat)||!s.players[s.firstSeat])fail('阶段、随机源、回合或版本无效');
  const b=s.board;if(!b||!Array.isArray(b.hexes)||b.hexes.length!==19||!Array.isArray(b.vertices)||b.vertices.length!==54||!Array.isArray(b.edges)||b.edges.length!==72||!Array.isArray(b.ports)||b.ports.length!==9)fail('地图组件数量不符');
  const hIds=new Set(b.hexes.map(h=>h.id)),vIds=new Set(b.vertices.map(v=>v.id)),eIds=new Set(b.edges.map(e=>e.id));
  if(hIds.size!==19||vIds.size!==54||eIds.size!==72||!hIds.has(s.robber))fail('地图标识重复或强盗位置无效');
  if(b.hexes.filter(h=>h.resource==='desert').length!==1||b.ports.filter(p=>p.resource==='any').length!==4)fail('沙漠或港口数量不符');
  for(const r of RESOURCES)if(b.hexes.filter(h=>h.resource===r).length!==(r==='brick'||r==='ore'?3:4)||b.ports.filter(p=>p.resource===r).length!==1)fail('地形或港口资源种类不符');
  for(const h of b.hexes)if(h.vertices.length!==6||h.edges.length!==6||h.vertices.some(v=>!vIds.has(v))||h.edges.some(e=>!eIds.has(e))||h.resource==='desert'&&h.number!==null||h.resource!=='desert'&&(!Number.isInteger(h.number)||h.number!<2||h.number!>12||h.number===7))fail('地形顶点、边或数字无效');
  for(const v of b.vertices)if(!Number.isFinite(v.x)||!Number.isFinite(v.y)||v.edges.length<2||v.edges.length>3||v.edges.some(e=>!eIds.has(e))||v.neighbors.some(n=>!vIds.has(n))||v.hexes.some(h=>!hIds.has(h)))fail('顶点连接无效');
  for(const e of b.edges)if(e.vertices.length!==2||e.vertices[0]===e.vertices[1]||e.vertices.some(v=>!vIds.has(v))||e.hexes.length<1||e.hexes.length>2||e.hexes.some(h=>!hIds.has(h)))fail('道路边连接无效');
  if(new Set(b.ports.flatMap(p=>p.vertices)).size!==18||b.ports.some(p=>!eIds.has(p.edge)||b.edges.find(e=>e.id===p.edge)!.hexes.length!==1||p.vertices.some(v=>!vIds.has(v))))fail('港口必须位于独立海岸边');
  const validResources=(resources:Resources)=>resources&&RESOURCES.every(r=>Number.isSafeInteger(resources[r])&&resources[r]>=0&&resources[r]<=19)&&Object.keys(resources).every(k=>RESOURCES.includes(k as Resource));
  if(!validResources(s.bank)||s.players.some(p=>!validResources(p.resources)))fail('资源数量无效');
  for(const r of RESOURCES)if(s.bank[r]+s.players.reduce((n,p)=>n+p.resources[r],0)!==19)fail(`${RESOURCE_NAMES[r]}资源不守恒`);
  if(!s.roads||!s.buildings||Object.entries(s.roads).some(([e,p])=>!eIds.has(e)||!Number.isInteger(p)||!s.players[p])||Object.entries(s.buildings).some(([v,p])=>!vIds.has(v)||!Number.isInteger(p.seat)||!s.players[p.seat]||!['settlement','city'].includes(p.kind)))fail('建筑或道路归属无效');
  for(const p of s.players){if(!Number.isInteger(p.seat)||s.players[p.seat]!==p||!Number.isSafeInteger(p.knights)||p.knights<0||!Number.isSafeInteger(p.wins)||p.wins<0||Object.values(pieces(s,p.seat)).some(n=>n<0))fail('实体棋子、骑士或胜局数量无效');}
  if(!Array.isArray(s.deck)||!Array.isArray(s.played)||s.players.some(p=>!Array.isArray(p.development)))fail('发展牌组格式无效');
  const cards=[...s.deck,...s.played,...s.players.flatMap(p=>p.development)];
  if(cards.length!==25||new Set(cards.map(c=>c.id)).size!==25||cards.some(c=>typeof c.id!=='string'||!DEVELOPMENT_TYPES.includes(c.type)||!Number.isInteger(c.boughtTurn)||c.boughtTurn>s.turnNumber))fail('发展牌数量或标识不守恒');
  for(const type of DEVELOPMENT_TYPES)if(cards.filter(c=>c.type===type).length!==DEVELOPMENT_COUNTS[type])fail('发展牌种类不守恒');
  if(s.played.some(c=>c.type==='victory_point')||s.played.filter(c=>c.type==='knight').length!==s.players.reduce((n,p)=>n+p.knights,0))fail('已打骑士或胜利点牌无效');
  if([s.longestRoad,s.largestArmy].some(seat=>seat!==null&&(!Number.isInteger(seat)||!s.players[seat])))fail('奖励归属无效');
  if(s.dice!==null&&(!Array.isArray(s.dice)||s.dice.length!==2||s.dice.some(n=>!Number.isInteger(n)||n<1||n>6)))fail('骰子无效');
  if(!s.discardNeeded||Object.entries(s.discardNeeded).some(([seat,n])=>!s.players[Number(seat)]||!Number.isInteger(n)||n<1||n>resourceCount(s.players[Number(seat)].resources))||s.phase==='discard'&&!Object.keys(s.discardNeeded).length)fail('弃牌窗口无效');
  if(s.phase==='setup_road'&&(!s.setupVertex||!vIds.has(s.setupVertex)||s.buildings[s.setupVertex]?.seat!==s.turn))fail('初始道路缺少本次定居点');
  if(s.phase.startsWith('setup')&&(!Number.isInteger(s.setupStep)||s.setupStep<0||s.setupStep>=s.players.length*2))fail('初始布置进度无效');
  if(s.phase==='free_roads'&&(!s.freeRoads||s.freeRoads.remaining<1||s.freeRoads.remaining>2||!['roll','action'].includes(s.freeRoads.returnPhase)))fail('修路窗口无效');
  if(s.phase.startsWith('trade')&&(!s.trade||!s.trade.targets.length||s.trade.targets.some(t=>t===s.turn||!s.players[t])||new Set(s.trade.targets).size!==s.trade.targets.length))fail('交易窗口无效');
  if(s.phase==='finished'&&(!s.result||!s.players[s.result.winner]||s.result.winner!==s.turn||s.result.scores[s.result.winner]<10))fail('胜利条件无效');
  if(!Array.isArray(s.events)||!s.events.length||s.events.some((e,i)=>e.seq!==i+1||typeof e.text!=='string'||e.resourceCounts.length!==s.players.length||e.developmentCounts.length!==s.players.length||e.points.length!==s.players.length))fail('历史记录无效');
}
