import {BOARDS,BOARD_PAIRS,COLORS,GOODS,KNOWLEDGE_BUILDINGS,PHASES,TILES,TILE_LIST,depotColors,neighbors,regionFor,tileName} from './data';
import type {Action,BurgundyConfig,BurgundyEvent,BurgundyFrame,BurgundyPlayer,BurgundyState,BurgundyView,EnginePlayer,FinalBonus,FrameChanges,FramePlayer,TileKind} from './types';

const clone=<T,>(value:T):T=>structuredClone(value);
function fail(message:string):never {throw Error(message);}
const integer=(value:unknown,label:string,min=0,max=Number.MAX_SAFE_INTEGER)=>{if(!Number.isSafeInteger(value)||Number(value)<min||Number(value)>max)fail(`${label}必须为 ${min}–${max} 的整数`);return Number(value);};
const knows=(p:BurgundyPlayer,n:number)=>p.estate.some(id=>id!==null&&TILES[id].knowledge===n);
export const knowledgeOf=(p:Pick<BurgundyPlayer,'estate'>)=>p.estate.flatMap(id=>id&&TILES[id].knowledge?[TILES[id].knowledge!]:[]).sort((a,b)=>a-b);
const boardOf=(p:BurgundyPlayer)=>BOARDS[p.boardId!]??fail('请先选择庄园');
export const turnOrder=(s:BurgundyState)=>s.players.map(p=>p.seat).sort((a,b)=>s.players[b].bridge-s.players[a].bridge||s.players[b].bridgeStamp-s.players[a].bridgeStamp);
function random(s:BurgundyState){let n=s.rng;n^=n<<13;n^=n>>>17;n^=n<<5;s.rng=n>>>0;return s.rng/4294967296;}
function shuffle<T>(s:BurgundyState,list:T[]){for(let i=list.length-1;i>0;i--){const j=Math.floor(random(s)*(i+1));[list[i],list[j]]=[list[j],list[i]];}return list;}
const roll=(s:BurgundyState)=>1+Math.floor(random(s)*6);
function grant(s:BurgundyState,p:BurgundyPlayer,resource:'silver'|'workers',n:number){p[resource]+=n;s.audit[resource==='silver'?'silverGranted':'workersGranted']+=n;}
function pay(s:BurgundyState,p:BurgundyPlayer,resource:'silver'|'workers',n:number){if(p[resource]<n)fail(`${resource==='silver'?'银币':'工人'}不足，需要 ${n}，持有 ${p[resource]}`);p[resource]-=n;s.audit[resource==='silver'?'silverPaid':'workersPaid']+=n;}
function points(p:BurgundyPlayer,kind:keyof BurgundyPlayer['scoreParts'],n:number){p.score+=n;p.scoreParts[kind]+=n;}
function playerFrame(p:BurgundyPlayer):FramePlayer {const {soldGoods,...rest}=p;return {...clone(rest),soldCount:soldGoods.length,knowledge:knowledgeOf(p)};}
export function frameBurgundy(s:BurgundyState):BurgundyFrame {return clone({phase:s.phase,phaseIndex:s.phaseIndex,round:s.round,turn:s.turn,turnIndex:s.turnIndex,roundOrder:s.roundOrder,turnOrder:turnOrder(s),whiteDie:s.whiteDie,depots:s.depots,goodsDepots:s.goodsDepots,roundGoods:s.roundGoods,poolCounts:Object.fromEntries(Object.entries(s.pools).map(([k,v])=>[k,v.length])) as BurgundyFrame['poolCounts'],players:s.players.map(playerFrame),bought:s.bought,pending:s.pending,result:s.result});}
function changes(before:BurgundyFrame|null,after:BurgundyFrame):FrameChanges {
  if(!before)return after;
  const result:FrameChanges={};for(const key of Object.keys(after) as Array<keyof BurgundyFrame>){if(key==='players')continue;if(JSON.stringify(before[key])!==JSON.stringify(after[key]))(result as any)[key]=after[key];}
  const changed=after.players.filter((p,i)=>JSON.stringify(p)!==JSON.stringify(before.players[i]));if(changed.length)result.players=changed;return result;
}
function record(s:BurgundyState,before:BurgundyFrame|null,event:Pick<BurgundyEvent,'kind'|'text'|'seat'|'action'>,phaseIndex=s.phaseIndex,round=s.round){s.events.push({...event,seq:s.events.length+1,time:new Date().toISOString(),phaseIndex,round,changes:changes(before,frameBurgundy(s))});}
export function validateBurgundyConfig(value:unknown):asserts value is BurgundyConfig {if(!value||typeof value!=='object'||Array.isArray(value)||!['classic','advanced'].includes((value as BurgundyConfig).setup)||Object.keys(value).some(k=>k!=='setup'))fail('开局配置须为 classic（相同 1 号庄园）或 advanced（原版双面庄园）');}

function startingCastle(s:BurgundyState,p:BurgundyPlayer,boardId:number,cellId:string){
  if(!p.boardOptions.includes(boardId))fail('庄园不在本次获配的双面选择中');const board=BOARDS[boardId],cell=board.cells.find(c=>c.id===cellId);
  if(!cell||cell.color!=='castle')fail('起始格必须是所选庄园的深绿色城堡格');
  p.boardId=boardId;p.estate=Array(37).fill(null);p.estate[board.cells.indexOf(cell)]=p.startCastle;p.startCastle=null;
  const region=regionFor(board,cellId);if(region.cells.length===1)p.completedRegions.push(region.id);
}
function startRound(s:BurgundyState){
  s.roundOrder=turnOrder(s);s.turnIndex=0;s.turn=s.roundOrder[0];s.bought=false;s.pending=null;
  for(const p of s.players){p.dice=[roll(s),roll(s)];p.used=[false,false];}
  s.whiteDie=roll(s);const good=s.roundGoods.shift();if(!good)fail('本阶段货物供应不足');s.goodsDepots[s.whiteDie-1].push(good!);
}
function startPhase(s:BurgundyState){
  s.removedTiles.push(...s.depots.flat());s.depots=Array.from({length:7},()=>[]);
  const draw=(pool:TileKind|'black')=>s.pools[pool].pop()??fail(`${pool} 板块供应不足`);
  depotColors(s.players.length,s.phaseIndex).forEach((colors,i)=>{s.depots[i+1]=colors.map(draw);});s.depots[0]=Array.from({length:2*s.players.length},()=>draw('black'));
  s.roundGoods=s.goodsPhases[s.phaseIndex];s.goodsPhases[s.phaseIndex]=[];s.phase='play';s.round=1;startRound(s);
}
export function createBurgundy(id:string,roster:EnginePlayer[],rng:()=>number,config:BurgundyConfig={setup:'classic'},match=1,previous?:BurgundyState):BurgundyState {
  validateBurgundyConfig(config);if(roster.length<2||roster.length>4)fail('勃艮第城堡需要 2–4 位玩家');if(new Set(roster.map(p=>p.playerId)).size!==roster.length||roster.some(p=>!p.playerId||!p.name))fail('玩家身份不得重复或为空');if(previous&&previous.phase!=='finished')fail('请先完成当前局，再开始下一局');
  const pools=Object.fromEntries([...COLORS,'black'].map(color=>[color,TILE_LIST.filter(t=>t.back===color).map(t=>t.id)])) as BurgundyState['pools'];
  const s:BurgundyState={gameId:'castles-of-burgundy',id,match,createdAt:new Date().toISOString(),config:clone(config),revision:1,phase:'setup',phaseIndex:0,round:0,turn:0,turnIndex:0,roundOrder:[],initialOrder:[],bridgeClock:roster.length,whiteDie:0,players:[],depots:Array.from({length:7},()=>[]),goodsDepots:Array.from({length:6},()=>[]),roundGoods:[],goodsPhases:[],pools,removedTiles:[],unusedGoods:[],rng:(Math.floor(rng()*4294967296)>>>0)||0x9e3779b9,bought:false,pending:null,events:[],result:null,audit:{silverGranted:roster.length,silverPaid:0,workersGranted:roster.length*(roster.length+1)/2,workersPaid:0}};
  for(const pool of Object.values(pools))shuffle(s,pool);
  // A new table follows roster order; later games retain the dice selection.
  let candidates=previous?roster.map((_,i)=>i):[0];while(candidates.length>1){const rolls=candidates.map(seat=>({seat,value:roll(s)})),high=Math.max(...rolls.map(r=>r.value));candidates=rolls.filter(r=>r.value===high).map(r=>r.seat);}
  const first=candidates[0];s.initialOrder=roster.map((_,i)=>(first+i)%roster.length);s.roundOrder=[...s.initialOrder];s.turn=first;
  const goods=shuffle(s,Object.keys(GOODS));s.goodsPhases=Array.from({length:5},()=>goods.splice(0,5));const pairs=shuffle(s,clone(BOARD_PAIRS));
  s.players=roster.map((p,seat)=>{const prior=previous?.players.find(q=>q.playerId===p.playerId),order=s.initialOrder.indexOf(seat);return {...p,seat,boardId:null,boardOptions:config.setup==='classic'?[1]:pairs[seat],startCastle:s.pools.castle.pop()!,estate:[],storage:[],goods:goods.splice(0,3),soldGoods:[],silver:1,workers:order+1,dice:[0,0],used:[false,false],bridge:0,bridgeStamp:roster.length-order,completedRegions:[],bonuses:[],score:0,scoreParts:{regions:0,animals:0,goods:0,buildings:0,colors:0},totalScore:prior?.totalScore??0,wins:prior?.wins??0,actionsTaken:0,turnsTaken:0};});s.unusedGoods=goods;
  if(config.setup==='classic'){s.players.forEach(p=>startingCastle(s,p,1,'D4'));startPhase(s);}
  record(s,null,{kind:'start',text:config.setup==='classic'?`2011 原版 ${roster.length} 人局开始，${s.players[s.turn].name} 先行动；A 阶段第 1 轮，白骰 ${s.whiteDie}。`:`2011 原版进阶开局，依初始顺序公开选择双面庄园及起始城堡，${s.players[first].name} 先选。`});assertBurgundy(s);return s;
}

const fields:Record<Action['type'],string[]>={setup:['boardId','cellId'],take:['tileId','die','workers','discardTileId'],place:['tileId','cellId','die','workers'],sell:['goodsType','die','workers'],workers:['die'],buy:['tileId','discardTileId'],ship:['depots','goodsTypes'],decline:[],end_turn:[]};
function parseAction(value:unknown):Action {
  if(!value||typeof value!=='object'||Array.isArray(value))fail('行动须为包含 type 的对象');const input=value as Record<string,unknown>,type=input.type as Action['type'];
  if(!Object.hasOwn(fields,type))fail('未知行动类型，请读取 game_rules 中的行动说明');for(const key of Object.keys(input))if(key!=='type'&&!fields[type].includes(key))fail(`该行动不接受字段 ${key}`);
  for(const key of ['tileId','cellId','discardTileId'])if(key in input&&(typeof input[key]!=='string'||!(input[key] as string).length))fail(`${key} 必须是可见局面中的实体 ID`);
  for(const key of ['tileId','cellId'])if(fields[type].includes(key)&&!input[key])fail(`请指定 ${key}`);
  if('die' in input)integer(input.die,'骰子编号',0,1);if('workers' in input)integer(input.workers,'工人预算');
  if(type==='setup')integer(input.boardId,'庄园编号',1,9);if(type==='sell')integer(input.goodsType,'货物类型',1,6);
  if(type==='ship')for(const key of ['depots','goodsTypes']){const list=input[key];if(key==='goodsTypes'&&list===undefined)continue;if(!Array.isArray(list)||new Set(list).size!==list.length)fail(`${key} 必须为不重复的数字数组`);for(const n of list as unknown[])integer(n,key==='depots'?'仓库编号':'货物类型',1,6);}
  return clone(input) as Action;
}
const distance=(a:number,b:number)=>Math.min(Math.abs(a-b),6-Math.abs(a-b));
export function workersNeeded(p:BurgundyPlayer,die:number,target:number,action:'take'|'place'|'sell',color?:TileKind){
  const free=action==='take'?knows(p,12):action==='place'?knows(p,color==='building'?9:color==='ship'||color==='animal'?10:11):false;
  return Math.ceil(Math.max(0,distance(p.dice[die],target)-(free?1:0))/(knows(p,8)?2:1));
}
function useDie(s:BurgundyState,p:BurgundyPlayer,action:Extract<Action,{die?:number}>,target?:number,color?:TileKind){
  const budget='workers' in action?action.workers??0:0;integer(budget,'工人预算');if(budget>p.workers)fail(`工人预算 ${budget} 超过持有的 ${p.workers}`);
  if(s.pending){if(action.die!==undefined)fail('立即效果不使用普通骰子，请省略 die');if(budget)fail('免费效果不需要工人，请省略 workers');s.pending=null;return;}
  if(action.die===undefined)fail('请用 die 指定尚未使用的骰子编号 0 或 1');const die=integer(action.die,'骰子编号',0,1);if(p.used[die])fail('这颗骰子已用过，请选另一颗');
  const needed=target===undefined?0:workersNeeded(p,die,target,action.type as 'take'|'place'|'sell',color);if(needed>budget)fail(`到达目标需要 ${needed} 名工人，当前预算 ${budget}；请增加 workers 或更换骰子/目标`);
  pay(s,p,'workers',needed);p.used[die]=true;p.actionsTaken++;
}
function placementProblem(p:BurgundyPlayer,id:string,cellId:string){
  if(!p.storage.includes(id))return '该板块不在你的暂存区';const board=boardOf(p),cell=board.cells.find(c=>c.id===cellId);if(!cell)return '庄园格不存在，请使用当前庄园的格 ID';
  if(p.estate[board.cells.indexOf(cell)])return '该庄园格已被占用';const t=TILES[id];if(t.kind!==cell.color)return '板块与目标格颜色不匹配';
  if(!neighbors(board,cellId).some(n=>p.estate[board.cells.findIndex(c=>c.id===n)]))return '目标格必须与至少一块已铺板块相邻';
  if(t.kind==='building'&&!knows(p,1)&&regionFor(board,cellId).cells.some(n=>{const other=p.estate[board.cells.findIndex(c=>c.id===n)];return other&&TILES[other].building===t.building;}))return '同一城市不能有重复种类的建筑；知识 1 铺入庄园后可解除限制';
  return null;
}
function depotOf(s:BurgundyState,id:string){const depot=s.depots.findIndex(d=>d.includes(id));if(depot<0)fail('该板块不在任何公开仓库，请刷新局面并使用可见 ID');return depot;}
function takeIntoStorage(s:BurgundyState,p:BurgundyPlayer,id:string,depot:number,discard?:string){
  if(p.storage.length===3){if(!discard)fail('暂存区已满，请用 discardTileId 指定丢弃一块旧暂存板块');if(!p.storage.includes(discard))fail('要丢弃的板块必须已经在自己的暂存区');p.storage.splice(p.storage.indexOf(discard),1);s.removedTiles.push(discard);}
  else if(discard!==undefined)fail('暂存区未满，无需丢弃板块，请省略 discardTileId');
  s.depots[depot].splice(s.depots[depot].indexOf(id),1);p.storage.push(id);
}
function completeRegions(s:BurgundyState,p:BurgundyPlayer,cellId:string){
  const board=boardOf(p),region=regionFor(board,cellId),filled=(id:string)=>!!p.estate[board.cells.findIndex(c=>c.id===id)];
  if(!p.completedRegions.includes(region.id)&&region.cells.every(filled)){p.completedRegions.push(region.id);points(p,'regions',region.cells.length*(region.cells.length+1)/2+10-s.phaseIndex*2);}
  if(!p.bonuses.some(b=>b.color===region.color)&&board.cells.filter(c=>c.color===region.color).every(c=>filled(c.id))){const claimed=s.players.filter(q=>q.bonuses.some(b=>b.color===region.color)).length;if(claimed<2){p.bonuses.push({color:region.color,rank:claimed===0?1:2});points(p,'colors',s.players.length+(claimed===0?3:0));}}
}
function placeTile(s:BurgundyState,p:BurgundyPlayer,id:string,cellId:string){
  const board=boardOf(p),t=TILES[id];p.storage.splice(p.storage.indexOf(id),1);p.estate[board.cells.findIndex(c=>c.id===cellId)]=id;
  completeRegions(s,p,cellId);
  if(t.kind==='castle')s.pending={kind:'castle',sourceTile:id};
  if(t.kind==='ship'){p.bridge=Math.min(6,p.bridge+1);p.bridgeStamp=++s.bridgeClock;s.pending={kind:'ship',sourceTile:id};}
  if(t.kind==='animal'){const same=regionFor(board,cellId).cells.flatMap(n=>{const id=p.estate[board.cells.findIndex(c=>c.id===n)];return id&&TILES[id].animal===t.animal?[TILES[id]]:[];});points(p,'animals',same.reduce((sum,tile)=>sum+tile.count!+(knows(p,7)?1:0),0));}
  if(t.kind==='building')switch(t.building){
    case 'bank':grant(s,p,'silver',2);break;
    case 'boarding-house':grant(s,p,'workers',4);break;
    case 'watchtower':points(p,'buildings',4);break;
    case 'warehouse':if(p.goods.length)s.pending={kind:'sell',sourceTile:id};break;
    case 'city-hall':s.pending={kind:'place',sourceTile:id};break;
    case 'carpenter':s.pending={kind:'take',sourceTile:id,colors:['building']};break;
    case 'church':s.pending={kind:'take',sourceTile:id,colors:['castle','mine','knowledge']};break;
    case 'market':s.pending={kind:'take',sourceTile:id,colors:['animal','ship']};break;
  }
}
function sellGoods(s:BurgundyState,p:BurgundyPlayer,type:number){const goods=p.goods.filter(id=>GOODS[id].type===type);if(!goods.length)fail('你没有这种货物，请选择自己持有的货物类型');p.goods=p.goods.filter(id=>GOODS[id].type!==type);p.soldGoods.push(...goods);grant(s,p,'silver',knows(p,3)?2:1);if(knows(p,4))grant(s,p,'workers',1);points(p,'goods',goods.length*s.players.length);return goods.length;}
export function shippingChoices(s:BurgundyState,p:BurgundyPlayer,depots:number[]){const held=[...new Set(p.goods.map(id=>GOODS[id].type))],available=[...new Set(depots.flatMap(d=>s.goodsDepots[d-1].map(id=>GOODS[id].type)))].sort();return {existing:available.filter(n=>held.includes(n)),fresh:available.filter(n=>!held.includes(n)),slots:3-held.length};}
function shipGoods(s:BurgundyState,p:BurgundyPlayer,action:Extract<Action,{type:'ship'}>){
  const depots=action.depots;if(depots.length<1||depots.length>2)fail('请选择一座仓库，或用知识 5 选择两座仓库');if(depots.length===2){if(!knows(p,5))fail('只有已铺知识 5 才能从两座仓库收货');if(![1,5].includes(Math.abs(depots[0]-depots[1])))fail('两座仓库必须相邻，6 与 1 也相邻');}
  const {existing,fresh,slots}=shippingChoices(s,p,depots),needed=Math.min(slots,fresh.length);let types=action.goodsTypes;
  if(types===undefined){if(fresh.length>slots)fail(`还可收取 ${slots} 种新货物，请用 goodsTypes 选择，并包含已有类型 ${existing.join('、')||'无'}`);types=[...existing,...fresh];}
  if(types.some(n=>!existing.includes(n)&&!fresh.includes(n)))fail('所选货物类型不在这些仓库中');if(existing.some(n=>!types!.includes(n)))fail('已有类型的同色货物必须全部收取');
  const newTypes=types.filter(n=>fresh.includes(n));if(newTypes.length>slots)fail('货物容量最多三种，不能丢弃已有货物腾位置');if(newTypes.length!==needed)fail(`必须装满可用位置：请选择 ${needed} 种新货物`);
  let count=0;for(const depot of depots){const incoming=s.goodsDepots[depot-1].filter(id=>types!.includes(GOODS[id].type));s.goodsDepots[depot-1]=s.goodsDepots[depot-1].filter(id=>!incoming.includes(id));p.goods.push(...incoming);count+=incoming.length;}
  s.pending=null;return count;
}
export function finalBonus(s:BurgundyState,seat:number):FinalBonus {
  const p=s.players[seat],knowledge=knowledgeOf(p).filter(n=>n>=15).map(id=>{let points=0;const tiles=p.estate.flatMap(id=>id?[TILES[id]]:[]);
    if(id===15)points=new Set(p.soldGoods.map(g=>GOODS[g].type)).size*3;
    if(KNOWLEDGE_BUILDINGS[id])points=tiles.filter(t=>t.building===KNOWLEDGE_BUILDINGS[id]).length*4;
    if(id===24)points=new Set(tiles.filter(t=>t.kind==='animal').map(t=>t.animal)).size*4;
    if(id===25)points=p.soldGoods.length;if(id===26)points=p.bonuses.length*2;return {id,points};});
  return {goods:p.goods.length,silver:p.silver,workers:Math.floor(p.workers/2),knowledge,points:p.goods.length+p.silver+Math.floor(p.workers/2)+knowledge.reduce((n,k)=>n+k.points,0)};
}
export function rankPlayers(s:BurgundyState){const order=turnOrder(s);return s.players.map(p=>p.seat).sort((a,b)=>s.players[b].score-s.players[a].score||s.players[b].estate.filter(id=>!id).length-s.players[a].estate.filter(id=>!id).length||order.indexOf(b)-order.indexOf(a));}
function finish(s:BurgundyState){const bonuses=s.players.map((_,seat)=>finalBonus(s,seat));s.players.forEach((p,i)=>{p.score+=bonuses[i].points;p.totalScore+=p.score;});const ranking=rankPlayers(s);s.players[ranking[0]].wins++;s.phase='finished';s.result={winners:[ranking[0]],ranking,bonuses};}
function endTurn(s:BurgundyState){
  if(s.pending)fail('请先处理立即效果及其连锁');const p=s.players[s.turn];if(!p.used.every(Boolean))fail('还需使用剩余骰子，不能提前结束回合');p.turnsTaken++;
  if(++s.turnIndex<s.roundOrder.length){s.turn=s.roundOrder[s.turnIndex];s.bought=false;return '';}
  if(s.round<5){s.round++;startRound(s);return `进入 ${PHASES[s.phaseIndex]} 阶段第 ${s.round} 轮，白骰 ${s.whiteDie}。`;}
  const income:string[]=[];for(const player of s.players){const mines=player.estate.filter(id=>id&&TILES[id].kind==='mine').length;if(mines){grant(s,player,'silver',mines);if(knows(player,2))grant(s,player,'workers',mines);income.push(`${player.name} 矿山收入 ${mines} 银币${knows(player,2)?`与 ${mines} 工人`:''}`);}}
  if(s.phaseIndex===4){finish(s);return `${income.join('；')}${income.length?'。':''}终局：${s.players[s.result!.winners[0]].name} 以 ${s.players[s.result!.winners[0]].score} 分获胜。`;}
  s.phaseIndex++;startPhase(s);return `${income.join('；')}${income.length?'。':''}进入 ${PHASES[s.phaseIndex]} 阶段，重新补货；第 1 轮白骰 ${s.whiteDie}。`;
}
export function applyBurgundy(previous:BurgundyState,seat:number,input:unknown):BurgundyState {
  if(previous.phase==='finished')fail('本局已经结束，请准备下一局');if(!Number.isInteger(seat)||seat!==previous.turn||!previous.players[seat])fail('尚未轮到你行动');const action=parseAction(input);
  const before=frameBurgundy(previous),s:BurgundyState=clone({...previous,events:[]});s.events=[...previous.events];const p=s.players[seat];let text='';
  if(s.phase==='setup'){
    if(action.type!=='setup')fail('当前需选择庄园和起始城堡');startingCastle(s,p,action.boardId,action.cellId);text=`选择 ${action.boardId} 号庄园，起始城堡置于 ${action.cellId}。`;
    if(++s.turnIndex<s.roundOrder.length)s.turn=s.roundOrder[s.turnIndex];else{startPhase(s);text+=`全部选择完成，揭示 A 阶段供应，第 1 轮白骰 ${s.whiteDie}。`;}
  }else{
    if(action.type==='setup')fail('开局选择已经结束');
    const pending=s.pending;
    if(pending){if(action.type==='buy'||action.type==='end_turn')fail('请先完成立即效果及其连锁，再购买或结束回合');if(action.type==='decline'){if(pending.kind==='ship'||pending.kind==='castle')fail('船只运输或城堡额外行动必须完成；城堡可选择取工人');s.pending=null;text=`放弃${tileName(pending.sourceTile)}的可选效果。`;}
      else if(pending.kind!=='castle'&&action.type!==pending.kind)fail(`当前必须处理${tileName(pending.sourceTile)}的 ${pending.kind} 效果`);
    }else if(action.type==='ship'||action.type==='decline')fail('当前没有该立即效果');
    if(action.type==='take'){
      const depot=depotOf(s,action.tileId);if(depot===0)fail('免费或骰子拿取不能选择黑市，请改用 buy');if(pending?.kind==='take'&&!pending.colors.includes(TILES[action.tileId].kind))fail('该板块颜色不符合当前建筑的免费拿取范围');
      useDie(s,p,action,depot);takeIntoStorage(s,p,action.tileId,depot,action.discardTileId);text=`从 ${depot} 号仓库拿取${tileName(action.tileId)}到暂存区${action.discardTileId?`，丢弃${tileName(action.discardTileId)}`:''}。`;
    }else if(action.type==='place'){
      const problem=placementProblem(p,action.tileId,action.cellId);if(problem)fail(problem);const cell=boardOf(p).cells.find(c=>c.id===action.cellId)!;useDie(s,p,action,cell.value,cell.color);const score=p.score;placeTile(s,p,action.tileId,action.cellId);text=`将${tileName(action.tileId)}铺入 ${action.cellId}${p.score!==score?`，获得 ${p.score-score} 分`:''}。`;
    }else if(action.type==='sell'){
      if(!p.goods.some(id=>GOODS[id].type===action.goodsType))fail('你没有这种货物，请选择自己持有的货物类型');useDie(s,p,action,action.goodsType);const count=sellGoods(s,p,action.goodsType);text=`出售全部 ${count} 件 ${action.goodsType} 类货物，获得 ${count*s.players.length} 分及${knows(p,3)?2:1}银币${knows(p,4)?'、1 工人':''}。`;
    }else if(action.type==='workers'){
      useDie(s,p,action);const n=knows(p,14)?4:2;grant(s,p,'workers',n);if(knows(p,13))grant(s,p,'silver',1);text=`获得 ${n} 名工人${knows(p,13)?'与 1 银币':''}。`;
    }else if(action.type==='buy'){
      if(s.bought)fail('本回合已经购买过，购买每回合只能一次');const depot=depotOf(s,action.tileId);if(depot!==0&&!knows(p,6))fail('只有已铺知识 6 才能购买编号仓库；否则请选择黑市');pay(s,p,'silver',2);takeIntoStorage(s,p,action.tileId,depot,action.discardTileId);s.bought=true;text=`花 2 银币从${depot?`${depot} 号仓库`:'黑市'}购买${tileName(action.tileId)}${action.discardTileId?`，丢弃${tileName(action.discardTileId)}`:''}。`;
    }else if(action.type==='ship'){const count=shipGoods(s,p,action);text=`从 ${action.depots.join('、')} 号仓库收取 ${count} 件货物。`;}
    else if(action.type==='end_turn')text=`结束回合。${endTurn(s)}`;
  }
  s.revision++;record(s,before,{kind:'action',seat,action,text:`${p.name}：${text}`},previous.phaseIndex,previous.round);return s;
}

function combinations<T>(items:T[],n:number):T[][] {if(!n)return [[]];return items.flatMap((item,i)=>combinations(items.slice(i+1),n-1).map(rest=>[item,...rest]));}
export function legalActions(s:BurgundyState,seat:number):Action[]{
  if(s.phase==='finished'||seat!==s.turn)return [];const p=s.players[seat],pending=s.pending,actions:Action[]=[];
  if(s.phase==='setup')return p.boardOptions.flatMap(boardId=>BOARDS[boardId].cells.filter(c=>c.color==='castle').map(c=>({type:'setup' as const,boardId,cellId:c.id})));
  if(pending?.kind==='ship'){
    const choices=Array.from({length:6},(_,i)=>[i+1]);if(knows(p,5))choices.push(...Array.from({length:6},(_,i)=>[i+1,(i+1)%6+1]));
    return choices.flatMap(depots=>{const {existing,fresh,slots}=shippingChoices(s,p,depots);return combinations(fresh,Math.min(slots,fresh.length)).map(chosen=>({type:'ship' as const,depots,goodsTypes:[...existing,...chosen]}));});
  }
  const dice=pending?[undefined]:[0,1].filter(d=>!p.used[d]);
  const payment=(die:number|undefined,target:number,type:'take'|'place'|'sell',color?:TileKind)=>die===undefined?{}:{die,workers:workersNeeded(p,die,target,type,color)};
  const affordable=(value:{workers?:number})=>(value.workers??0)<=p.workers;
  const discards=p.storage.length===3?p.storage.map(discardTileId=>({discardTileId})):[{}];
  for(const die of dice){
    if(!pending||pending.kind==='castle'||pending.kind==='take')for(let depot=1;depot<=6;depot++)for(const tileId of s.depots[depot]){
      if(pending?.kind==='take'&&!pending.colors.includes(TILES[tileId].kind))continue;const pay=payment(die,depot,'take');if(affordable(pay))for(const discard of discards)actions.push({type:'take',tileId,...pay,...discard});
    }
    if(!pending||pending.kind==='castle'||pending.kind==='place')for(const tileId of p.storage)for(const cell of boardOf(p).cells){if(placementProblem(p,tileId,cell.id))continue;const pay=payment(die,cell.value,'place',cell.color);if(affordable(pay))actions.push({type:'place',tileId,cellId:cell.id,...pay});}
    if(!pending||pending.kind==='castle'||pending.kind==='sell')for(const goodsType of new Set(p.goods.map(id=>GOODS[id].type))){const pay=payment(die,goodsType,'sell');if(affordable(pay))actions.push({type:'sell',goodsType,...pay});}
    if(!pending||pending.kind==='castle')actions.push(die===undefined?{type:'workers'}:{type:'workers',die});
  }
  if(pending){if(pending.kind!=='castle')actions.push({type:'decline'});return actions;}
  if(!s.bought&&p.silver>=2)for(let depot=0;depot<=6;depot++){if(depot&&!knows(p,6))continue;for(const tileId of s.depots[depot])for(const discard of discards)actions.push({type:'buy',tileId,...discard});}
  if(p.used.every(Boolean))actions.push({type:'end_turn'});return actions;
}
export function viewBurgundy(s:BurgundyState,viewer:number|null,includeLegal=false):BurgundyView {
  const frame=frameBurgundy(s),visibleTiles=new Set([...frame.depots.flat(),...frame.players.flatMap(p=>[...p.estate.filter((id):id is string=>!!id),...p.storage,...(p.startCastle?[p.startCastle]:[])])]);
  const visibleGoods=new Set([...frame.goodsDepots.flat(),...frame.roundGoods,...frame.players.flatMap(p=>p.goods),...(viewer===null?[]:s.players[viewer]?.soldGoods??[])]);
  const boardIds=[...new Set(s.players.flatMap(p=>s.phase==='setup'?p.boardOptions:p.boardId?[p.boardId]:[]))];
  return {...frame,id:s.id,match:s.match,createdAt:s.createdAt,config:clone(s.config),revision:s.revision,viewer,players:frame.players.map((p,i)=>i===viewer?{...p,soldGoods:[...s.players[i].soldGoods]}:p),boards:clone(boardIds.map(id=>BOARDS[id])),tiles:Object.fromEntries([...visibleTiles].map(id=>[id,clone(TILES[id])])),goodsCatalog:Object.fromEntries([...visibleGoods].map(id=>[id,clone(GOODS[id])])),events:s.events.map(({changes:_,...event})=>clone(event)),...(includeLegal?{legalActions:legalActions(s,viewer??-1)}:{})};
}
export function replayBurgundy(s:BurgundyState,through:number):BurgundyFrame {
  let frame:BurgundyFrame|undefined;for(const event of s.events.slice(0,Math.max(1,through))){if(!frame)frame=clone(event.changes) as BurgundyFrame;else{const {players,...changes}=clone(event.changes);Object.assign(frame,changes);for(const p of players??[])frame.players[p.seat]=p;}}
  if(!frame)fail('回放缺少开局记录');return frame!;
}
export function assertBurgundy(value:unknown):asserts value is BurgundyState {
  if(!value||typeof value!=='object')fail('存档不是游戏状态');const s=value as BurgundyState;
  if(s.gameId!=='castles-of-burgundy'||!s.id||!['setup','play','finished'].includes(s.phase)||!Array.isArray(s.players)||s.players.length<2||s.players.length>4)fail('对局或人数无效');validateBurgundyConfig(s.config);
  integer(s.revision,'状态版本',1);integer(s.phaseIndex,'阶段',0,4);integer(s.round,'轮次',s.phase==='setup'?0:1,5);integer(s.rng,'随机状态',1,4294967295);
  const seats=s.players.map((_,i)=>i);if(new Set(s.players.map(p=>p.playerId)).size!==seats.length||s.players.some((p,i)=>p.seat!==i))fail('玩家身份或座位无效');
  if(!Array.isArray(s.roundOrder)||s.roundOrder.length!==seats.length||new Set(s.roundOrder).size!==seats.length||s.roundOrder.some(n=>!seats.includes(n)))fail('轮内行动顺序无效');
  integer(s.turn,'当前玩家',0,seats.length-1);integer(s.turnIndex,'回合位置',0,s.phase==='finished'?seats.length:seats.length-1);if(s.phase!=='finished'&&s.turn!==s.roundOrder[s.turnIndex])fail('当前行动机会与轮内顺序不一致');
  if(!Array.isArray(s.depots)||s.depots.length!==7||!Array.isArray(s.goodsDepots)||s.goodsDepots.length!==6||!Array.isArray(s.goodsPhases)||s.goodsPhases.length!==5)fail('公共供应区域无效');
  const tileIds=[...Object.values(s.pools).flat(),...s.depots.flat(),...s.removedTiles],goodsIds=[...s.goodsPhases.flat(),...s.roundGoods,...s.goodsDepots.flat(),...s.unusedGoods];
  for(const p of s.players){
    for(const field of ['silver','workers','score','totalScore','wins','bridge','bridgeStamp','actionsTaken','turnsTaken'] as const)integer(p[field],`${p.name}的${field}`);
    if(!Array.isArray(p.storage)||p.storage.length>3||!Array.isArray(p.goods)||!Array.isArray(p.soldGoods)||new Set(p.goods.map(id=>GOODS[id]?.type)).size>3)fail('玩家暂存或货物容量无效');
    tileIds.push(...p.storage,...p.estate.filter((id):id is string=>!!id),...(p.startCastle?[p.startCastle]:[]));goodsIds.push(...p.goods,...p.soldGoods);
    if(p.boardId===null){if(s.phase!=='setup'||p.estate.length||!p.startCastle)fail('未选择庄园的初始状态无效');}
    else {const board=BOARDS[p.boardId];if(!board||p.estate.length!==37||p.startCastle)fail('庄园板无效');p.estate.forEach((id,i)=>{if(id&&TILES[id]?.kind!==board.cells[i].color)fail('庄园板块颜色不匹配');});}
    if(!Array.isArray(p.dice)||p.dice.length!==2||p.dice.some(n=>!Number.isInteger(n)||n<(s.phase==='setup'?0:1)||n>6)||!Array.isArray(p.used)||p.used.length!==2||p.used.some(v=>typeof v!=='boolean'))fail('玩家骰子状态无效');
  }
  if(tileIds.length!==164||new Set(tileIds).size!==164||tileIds.some(id=>!TILES[id]))fail('六角板块不守恒，必须为完整的 164 个不同实体');
  if(goodsIds.length!==42||new Set(goodsIds).size!==42||goodsIds.some(id=>!GOODS[id]))fail('货物不守恒，必须为完整的 42 个不同实体');
  for(const n of Object.values(s.audit))integer(n,'资源账目');
  if(s.players.reduce((n,p)=>n+p.silver,0)!==s.audit.silverGranted-s.audit.silverPaid||s.players.reduce((n,p)=>n+p.workers,0)!==s.audit.workersGranted-s.audit.workersPaid)fail('银币或工人获得/支付账目不守恒');
  if(!Array.isArray(s.events)||s.events.length!==s.revision||s.events.some((e,i)=>e.seq!==i+1))fail('公开记录或状态版本无效');
  if(s.phase==='finished'?!s.result||s.pending!==null:s.result!==null)fail('终局结果或连锁阶段无效');
}
export function restoreBurgundy(value:unknown):BurgundyState {
  try{assertBurgundy(value);const s=value,actual=frameBurgundy(s),replay=replayBurgundy(s,s.events.length);if(JSON.stringify(actual)!==JSON.stringify(replay))fail('公开记录与当前局面不一致');if(s.result&&JSON.stringify(s.result.ranking)!==JSON.stringify(rankPlayers(s)))fail('终局名次不一致');return clone(s);}catch(error){throw Error(`勃艮第城堡存档无效：${(error as Error).message}`);}
}
