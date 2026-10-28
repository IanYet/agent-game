import {BUILDINGS,BUILDING_BY_KEY,BUILDING_KEYS,GOODS,GOOD_NAMES,GOOD_SUPPLY,PLANTATION_COUNTS,PLANTATION_NAMES,ROLES,ROLE_NAMES,emptyGoods,type BuildingKey,type Good,type Goods,type Role} from './data';

export interface PlayerInput {playerId:string;name:string;kind:'human'|'agent'}
export interface IslandTile {id:string;kind:Good|'quarry'}
// Cargo capacity is the stable identifier used in actions (4–8).
export interface Ship {capacity:number;good:Good|null;count:number}
export interface Player extends PlayerInput {seat:number;coins:number;goods:Goods;colonists:number;island:Array<IslandTile&{workers:number}>;buildings:Array<{key:BuildingKey;workers:number}>;vp:number;totalScore:number;wins:number}
export type Phase='role'|'settler'|'mayor_recruit'|'mayor'|'builder'|'craftsman'|'craftsman_bonus'|'trader'|'captain'|'storage'|'finished';
export interface Score {seat:number;shipping:number;buildings:number;bonuses:Record<string,number>;total:number;tiebreak:number}
export interface Result {winners:number[];scores:Score[]}
export type Action=
  |{type:'choose_role';role:Role;privilege?:boolean}
  |{type:'hacienda'}|{type:'settle';tile:string;useHospice?:boolean}
  |{type:'recruit';accept:boolean}
  |{type:'assign';island:Record<string,number>;buildings:Record<string,number>}
  |{type:'build';building:BuildingKey;quarryDiscount?:number;useUniversity?:boolean}
  |{type:'produce';useFactory?:boolean}|{type:'bonus';good:Good|null}
  |{type:'trade';good:Good;useOffice?:boolean;useSmallMarket?:boolean;useLargeMarket?:boolean;privilege?:boolean}
  |{type:'ship';good:Good;ship:number|'wharf';useHarbor?:boolean;privilege?:boolean}
  |{type:'store';goods:Partial<Goods>}|{type:'pass'};
export type PublicPlayer=Omit<Player,'vp'>&{vp:number|null;score:number|null;sanJuan:number;citySpaces:number;production:Goods};
export interface PublicFrame {
  id:string;match:number;createdAt:string;revision:number;round:number;phase:Phase;governor:number;initialGovernor:number;turn:number;chooser:number;role:Role|null;rolePrivilege:boolean;acted:number;
  roles:Array<{id:Role;coins:number;owner:number|null}>;haciendaUsed:boolean;mayorAccepted:Array<boolean|null>;producedKinds:Good[];wharfUsed:boolean[];captainBonusTaken:boolean;passed:number;
  players:PublicPlayer[];buildingStock:Record<BuildingKey,number>;supply:Goods;colonistSupply:number;colonistShip:number;vpSupply:number;bank:number;plantationMarket:IslandTile[];quarrySupply:number;deckCount:number;discardCounts:Goods;ships:Ship[];tradingHouse:Good[];finalReasons:string[];result:Result|null;
}
export interface ReplayPatch {fields:Partial<Omit<PublicFrame,'players'>>;players?:Array<{seat:number;changes:Partial<PublicPlayer>}>;initialPlayers?:PublicPlayer[]}
export interface Event {seq:number;round:number;time:string;text:string;seat?:number;action?:Action;patch:ReplayPatch}
export interface PuertoRicoState {
  gameId:'puerto-rico';id:string;match:number;createdAt:string;revision:number;round:number;phase:Phase;governor:number;initialGovernor:number;turn:number;chooser:number;role:Role|null;rolePrivilege:boolean;acted:number;
  roles:Array<{id:Role;coins:number;owner:number|null}>;haciendaUsed:boolean;mayorAccepted:Array<boolean|null>;producedKinds:Good[];wharfUsed:boolean[];captainBonusTaken:boolean;passed:number;
  players:Player[];buildingStock:Record<BuildingKey,number>;supply:Goods;colonistSupply:number;colonistShip:number;vpSupply:number;bank:number;plantationMarket:IslandTile[];quarrySupply:number;deck:IslandTile[];discard:IslandTile[];ships:Ship[];tradingHouse:Good[];rng:number;finalReasons:string[];result:Result|null;events:Event[];
}
export interface PuertoRicoView extends PublicFrame {viewer:number|null;events:Array<Omit<Event,'patch'>>}
const clone=<T,>(value:T):T=>structuredClone(value);
function rule(value:unknown,message:string):asserts value {if(!value)throw new Error(message);}
const int=(n:unknown,min=0,max=Number.MAX_SAFE_INTEGER):n is number=>Number.isSafeInteger(n)&&(n as number)>=min&&(n as number)<=max;
const isGood=(v:unknown):v is Good=>GOODS.includes(v as Good);
const isBuilding=(v:unknown):v is BuildingKey=>BUILDING_KEYS.includes(v as BuildingKey);
const sum=(v:Record<string,number>)=>Object.values(v).reduce((a,b)=>a+b,0);
export const occupied=(p:Pick<Player,'buildings'>,key:BuildingKey)=>p.buildings.some(b=>b.key===key&&b.workers>0);
export const citySpaces=(p:Pick<Player,'buildings'>)=>p.buildings.reduce((n,b)=>n+BUILDING_BY_KEY[b.key].spaces,0);
export const usedWorkers=(p:Pick<Player,'buildings'|'island'>)=>p.buildings.reduce((n,b)=>n+b.workers,0)+p.island.reduce((n,t)=>n+t.workers,0);
export const staffCapacity=(p:Pick<Player,'buildings'|'island'>)=>p.island.length+p.buildings.reduce((n,b)=>n+BUILDING_BY_KEY[b.key].workers,0);
export const storageKinds=(p:Pick<Player,'buildings'>)=>(occupied(p,'small_warehouse')?1:0)+(occupied(p,'large_warehouse')?2:0);
export function productionCapacity(p:Pick<Player,'island'|'buildings'>):Goods {
  const capacity=emptyGoods();for(const good of GOODS){const farms=p.island.filter(t=>t.kind===good&&t.workers>0).length;
    capacity[good]=good==='corn'?farms:Math.min(farms,p.buildings.filter(b=>BUILDING_BY_KEY[b.key].good===good).reduce((n,b)=>n+b.workers,0));
  }return capacity;
}
export function buildCost(p:Pick<Player,'island'>,key:BuildingKey,privilege=false,discount?:number){
  const max=Math.min(BUILDING_BY_KEY[key].vp,p.island.filter(t=>t.kind==='quarry'&&t.workers>0).length);
  const chosen=discount??max;rule(int(chosen,0,max),`采石折扣须为 0–${max} 的整数，不能超过已启用采石场及建筑列数上限`);
  return Math.max(0,BUILDING_BY_KEY[key].cost-chosen-(privilege?1:0));
}
export function regularShipments(ships:PuertoRicoState['ships'],held:Goods):Array<{good:Good;ship:number;count:number}> {
  const choices:Array<{good:Good;ship:number;count:number}>=[];
  for(const good of GOODS){if(!held[good])continue;const existing=ships.find(b=>b.good===good);
    if(existing){const count=Math.min(held[good],existing.capacity-existing.count);if(count>0)choices.push({good,ship:existing.capacity,count});continue;}
    const empty=ships.filter(b=>b.count===0),best=Math.max(0,...empty.map(b=>Math.min(held[good],b.capacity)));
    for(const boat of empty)if(best&&Math.min(held[good],boat.capacity)===best)choices.push({good,ship:boat.capacity,count:best});
  }return choices;
}
function nextRandom(s:PuertoRicoState){let x=s.rng;x^=x<<13;x^=x>>>17;x^=x<<5;s.rng=x>>>0;return s.rng/4294967296;}
function shuffle<T>(s:PuertoRicoState,items:T[]){for(let i=items.length-1;i>0;i--){const j=Math.floor(nextRandom(s)*(i+1));[items[i],items[j]]=[items[j],items[i]];}return items;}
function drawPlantation(s:PuertoRicoState){if(!s.deck.length&&s.discard.length)s.deck=shuffle(s,s.discard.splice(0));return s.deck.shift();}
function refillPlantations(s:PuertoRicoState){s.discard.push(...s.plantationMarket.splice(0));for(let i=0;i<s.players.length+1;i++){const tile=drawPlantation(s);if(tile)s.plantationMarket.push(tile);}}
function gain(s:PuertoRicoState,seat:number,amount:number){s.players[seat].coins+=amount;s.bank-=amount;}
function mark(s:PuertoRicoState,reason:string){if(!s.finalReasons.includes(reason))s.finalReasons.push(reason);}
function point(s:PuertoRicoState,seat:number,amount:number){s.players[seat].vp+=amount;s.vpSupply-=amount;if(s.vpSupply<=0)mark(s,'vp');}
function recruitOne(s:PuertoRicoState,p:Player,shipAllowed:boolean){if(s.colonistSupply>0){s.colonistSupply--;p.colonists++;return true;}if(shipAllowed&&s.colonistShip>0){s.colonistShip--;p.colonists++;return true;}return false;}
function ability(a:Record<string,unknown>,field:string,p:Player,key:BuildingKey){if(a[field]===true)rule(occupied(p,key),`${BUILDING_BY_KEY[key].name}尚未启用，不能使用 ${field}`);return a[field]!==false&&occupied(p,key);}
export function scorePlayer(p:Player):Score {
  const bonuses:Record<string,number>={guild_hall:0,residence:0,fortress:0,customs_house:0,city_hall:0};
  if(occupied(p,'guild_hall'))bonuses.guild_hall=p.buildings.reduce((n,b)=>n+(BUILDING_BY_KEY[b.key].good?(b.key==='small_indigo'||b.key==='small_sugar'?1:2):0),0);
  if(occupied(p,'residence'))bonuses.residence=Math.max(4,p.island.length-5);
  if(occupied(p,'fortress'))bonuses.fortress=Math.floor(p.colonists/3);
  if(occupied(p,'customs_house'))bonuses.customs_house=Math.floor(p.vp/4);
  if(occupied(p,'city_hall'))bonuses.city_hall=p.buildings.filter(b=>!BUILDING_BY_KEY[b.key].good).length;
  const buildings=p.buildings.reduce((n,b)=>n+BUILDING_BY_KEY[b.key].vp,0);
  return {seat:p.seat,shipping:p.vp,buildings,bonuses,total:p.vp+buildings+sum(bonuses),tiebreak:p.coins+sum(p.goods)};
}
function finish(s:PuertoRicoState){
  const scores=s.players.map(scorePlayer),highest=Math.max(...scores.map(p=>p.total)),tie=Math.max(...scores.filter(p=>p.total===highest).map(p=>p.tiebreak));
  const winners=scores.filter(p=>p.total===highest&&p.tiebreak===tie).map(p=>p.seat);
  s.players.forEach(p=>{p.totalScore+=scores[p.seat].total;if(winners.includes(p.seat))p.wins++;});s.result={scores,winners};s.phase='finished';
}
function endRole(s:PuertoRicoState,notes:string[]){
  const n=s.players.length;
  if(s.role==='settler')refillPlantations(s);
  if(s.role==='mayor'){
    const target=Math.max(n,s.players.reduce((v,p)=>v+p.buildings.reduce((m,b)=>m+BUILDING_BY_KEY[b.key].workers-b.workers,0),0));
    const needed=Math.max(0,target-s.colonistShip),added=Math.min(needed,s.colonistSupply);s.colonistSupply-=added;s.colonistShip+=added;
    notes.push(`人员船目标 ${target}，补入 ${added}，船上 ${s.colonistShip} 名。`);if(added<needed)mark(s,'colonists');
  }
  if(s.role==='trader'&&s.tradingHouse.length===4){for(const good of s.tradingHouse)s.supply[good]++;s.tradingHouse=[];notes.push('贸易所满四桶，商品全部归还供应。');}
  if(s.role==='captain')for(const boat of s.ships)if(boat.count===boat.capacity){s.supply[boat.good!]+=boat.count;boat.count=0;boat.good=null;}
  const chosen=s.roles.filter(r=>r.owner!==null).length;
  if(chosen===n){
    if(s.finalReasons.length){finish(s);notes.push(`本轮完成，${s.result!.winners.map(i=>s.players[i].name).join('、')}获胜。`);return;}
    for(const r of s.roles){if(r.owner===null){r.coins++;s.bank--;}r.owner=null;}
    s.round++;s.governor=(s.governor+1)%n;notes.push(`开始第 ${s.round} 轮，总督为${s.players[s.governor].name}。`);
  }
  s.phase='role';s.role=null;s.acted=0;s.turn=(s.governor+(chosen===n?0:chosen))%n;s.chooser=s.turn;
}
function advance(s:PuertoRicoState,notes:string[]){
  s.acted++;s.haciendaUsed=false;
  if(s.acted<s.players.length){s.turn=(s.chooser+s.acted)%s.players.length;return;}
  if(s.phase==='craftsman'){
    if(s.rolePrivilege&&s.producedKinds.some(g=>s.supply[g]>0)){s.phase='craftsman_bonus';s.turn=s.chooser;return;}
    endRole(s,notes);return;
  }
  endRole(s,notes);
}
function publicFrame(s:PuertoRicoState,reveal=false,viewer:number|null=null):PublicFrame {
  const {gameId:_,rng:__,deck,discard,events:___,players,...rest}=s;
  return clone({...rest,vpSupply:Math.max(0,s.vpSupply),deckCount:deck.length,discardCounts:Object.fromEntries(GOODS.map(g=>[g,discard.filter(t=>t.kind===g).length])) as Goods,
    players:players.map(p=>({...p,vp:reveal||s.phase==='finished'||viewer===p.seat?p.vp:null,score:reveal||s.phase==='finished'||viewer===p.seat?scorePlayer(p).total:null,sanJuan:p.colonists-usedWorkers(p),citySpaces:citySpaces(p),production:productionCapacity(p)}))});
}
function changes(before:PublicFrame|null,after:PublicFrame):ReplayPatch {
  const {players,...fields}=after;const patch:ReplayPatch={fields:{}};
  for(const key of Object.keys(fields) as Array<keyof typeof fields>)if(!before||JSON.stringify(before[key])!==JSON.stringify(fields[key]))(patch.fields as Record<string,unknown>)[key]=clone(fields[key]);
  if(!before)patch.initialPlayers=clone(players);
  else {const updates=players.flatMap((p,seat)=>{const diff:Partial<PublicPlayer>={};for(const key of Object.keys(p) as Array<keyof PublicPlayer>)if(JSON.stringify(before.players[seat][key])!==JSON.stringify(p[key]))(diff as Record<string,unknown>)[key]=clone(p[key]);return Object.keys(diff).length?[{seat,changes:diff}]:[];});if(updates.length)patch.players=updates;}
  return patch;
}
function event(s:PuertoRicoState,before:PublicFrame|null,text:string,seat?:number,action?:Action){s.events.push({seq:s.events.length+1,round:before?.round??s.round,time:new Date().toISOString(),text,...(seat===undefined?{}:{seat}),...(action?{action:clone(action)}:{}),patch:changes(before,publicFrame(s))});}
export function createPuertoRico(id:string,inputs:PlayerInput[],random:()=>number=Math.random,match=1,previous?:PuertoRicoState):PuertoRicoState {
  rule(inputs.length>=3&&inputs.length<=5,'经典基础版支持 3–5 人');rule(inputs.every(p=>p.playerId&&p.name)&&new Set(inputs.map(p=>p.playerId)).size===inputs.length,'玩家身份缺失或重复');rule(inputs.filter(p=>p.kind==='human').length<=1,'每桌最多一位真人');
  if(previous)rule(previous.phase==='finished','上一局尚未结束，不能开始下一局');const n=inputs.length;
  const s:PuertoRicoState={gameId:'puerto-rico',id,match,createdAt:new Date().toISOString(),revision:1,round:1,phase:'role',governor:0,initialGovernor:0,turn:0,chooser:0,role:null,rolePrivilege:true,acted:0,
    roles:ROLES.slice(0,n+3).map(id=>({id,coins:0,owner:null})),haciendaUsed:false,mayorAccepted:inputs.map(()=>null),producedKinds:[],wharfUsed:inputs.map(()=>false),captainBonusTaken:false,passed:0,
    players:inputs.map((p,seat)=>({...p,seat,coins:n-1,goods:emptyGoods(),colonists:0,island:[],buildings:[],vp:0,totalScore:previous?.players.find(o=>o.playerId===p.playerId)?.totalScore??0,wins:previous?.players.find(o=>o.playerId===p.playerId)?.wins??0})),
    buildingStock:Object.fromEntries(BUILDINGS.map(b=>[b.key,b.quantity])) as Record<BuildingKey,number>,supply:clone(GOOD_SUPPLY),colonistSupply:[55,75,95][n-3],colonistShip:n,vpSupply:[75,100,122][n-3],bank:86-n*(n-1),
    plantationMarket:[],quarrySupply:8,deck:GOODS.flatMap(kind=>Array.from({length:PLANTATION_COUNTS[kind]},(_,i)=>({id:`${kind}-${i+1}`,kind}))),discard:[],rng:Math.floor(random()*4294967296)>>>0||0x8ce971bd,finalReasons:[],result:null,events:[],ships:[n+1,n+2,n+3].map(capacity=>({capacity,good:null,count:0})),tradingHouse:[]};
  s.governor=Math.floor(nextRandom(s)*n);
  if(previous){const oldId=previous.players[(previous.initialGovernor+1)%previous.players.length].playerId;const found=inputs.findIndex(p=>p.playerId===oldId);s.governor=found<0?0:found;}
  s.initialGovernor=s.governor;s.turn=s.governor;s.chooser=s.governor;
  for(let i=0;i<n;i++){const kind:Good=i<(n===5?3:2)?'indigo':'corn';const index=s.deck.findIndex(t=>t.kind===kind);s.players[(s.governor+i)%n].island.push({...s.deck.splice(index,1)[0],workers:0});}
  shuffle(s,s.deck);refillPlantations(s);event(s,null,`经典基础版 ${n} 人开局，${s.players[s.governor].name}担任总督；每人 ${n-1} 金币。`);assertPuertoRico(s);return s;
}
const actionFields:Record<Action['type'],string[]>={choose_role:['role','privilege'],hacienda:[],settle:['tile','useHospice'],recruit:['accept'],assign:['island','buildings'],build:['building','quarryDiscount','useUniversity'],produce:['useFactory'],bonus:['good'],trade:['good','useOffice','useSmallMarket','useLargeMarket','privilege'],ship:['good','ship','useHarbor','privilege'],store:['goods'],pass:[]};
const phaseInstructions:Record<Phase,string>={role:'必须选择角色 choose_role',settler:'请选择地块 settle、庄园 hacienda 或 pass',mayor_recruit:'请用 recruit 确认是否领取船上人员',mayor:'请用 assign 重新安置人员',builder:'请建造 build 或 pass',craftsman:'请生产 produce 或 pass',craftsman_bonus:'请选择本次实际生产过的奖励商品 bonus，good:null 表示放弃',trader:'请出售 trade 或 pass',captain:'请选择商品和货船 ship；无普通船可装才可 pass',storage:'请用 store 指定保留商品数量',finished:'本局已经结束'};
function object(v:unknown,message:string):asserts v is Record<string,unknown>{rule(!!v&&typeof v==='object'&&!Array.isArray(v),message);}
function validateAction(input:unknown):Action {
  object(input,'行动须为带 type 的对象');rule(typeof input.type==='string'&&Object.hasOwn(actionFields,input.type),'未知行动 type，请根据当前阶段重新构造');
  const fields=actionFields[input.type as Action['type']];rule(Object.keys(input).every(k=>k==='type'||fields.includes(k)),`行动字段只允许 type、${fields.join('、')||'无其他字段'}`);
  for(const [key,value] of Object.entries(input))if(key==='privilege'||key.startsWith('use'))rule(typeof value==='boolean',`${key} 须为布尔值 true 或 false`);
  return input as unknown as Action;
}
export function applyPuertoRico(source:PuertoRicoState,seat:number,input:unknown):PuertoRicoState {
  rule(source.phase!=='finished','本局已经结束');rule(int(seat,0,source.players.length-1)&&seat===source.turn,'当前不是你的行动回合');const action=validateAction(input);
  // Past events and their patches are immutable; copy only the domain state deeply.
  const s={...clone({...source,events:[]}),events:[...source.events]},p=s.players[seat],before=publicFrame(source),notes:string[]=[];
  const privilege=seat===s.chooser&&s.rolePrivilege;
  const wrong=()=>{throw new Error(`当前阶段：${phaseInstructions[s.phase]}`);};
  if(action.type==='choose_role'){
    if(s.phase!=='role')wrong();const card=s.roles.find(r=>r.id===action.role);rule(card,'该角色不在本桌，请使用可见角色牌的 id');rule(card.owner===null,'该角色本轮已被选择，请选择其他角色');
    p.coins+=card.coins;card.coins=0;card.owner=seat;s.role=card.id;s.chooser=seat;s.rolePrivilege=action.privilege!==false;s.acted=0;s.haciendaUsed=false;s.producedKinds=[];s.mayorAccepted=s.players.map(()=>null);s.wharfUsed=s.players.map(()=>false);s.captainBonusTaken=false;s.passed=0;
    notes.push(`${p.name}选择${ROLE_NAMES[card.id]}${s.rolePrivilege?'':'，放弃角色特权'}。`);
    if(card.id.startsWith('prospector')){if(s.rolePrivilege)gain(s,seat,1);endRole(s,notes);}
    else s.phase=card.id==='mayor'?'mayor_recruit':card.id as Phase;
  }else if(action.type==='hacienda'){
    if(s.phase!=='settler')wrong();rule(occupied(p,'hacienda'),'庄园尚未启用');rule(!s.haciendaUsed,'本阶段庄园已使用一次');rule(p.island.length<12,'岛屿十二格已满');
    const tile=drawPlantation(s);rule(tile,'暗种植园与弃堆已无地块，不能使用庄园');p.island.push({...tile,workers:0});s.haciendaUsed=true;notes.push(`${p.name}用庄园抽到${PLANTATION_NAMES[tile.kind as Good]}种植园并立即放入岛屿。`);if(p.island.length===12)advance(s,notes);
  }else if(action.type==='settle'){
    if(s.phase!=='settler')wrong();rule(p.island.length<12,'岛屿十二格已满，不能再拿地块');rule(typeof action.tile==='string','tile 须为可见种植园 id 或 quarry');let tile:IslandTile;
    if(action.tile==='quarry'){rule(privilege||occupied(p,'construction_hut'),'只有拓荒者特权或已启用建筑工棚可以拿采石场');rule(s.quarrySupply>0,'采石场已用尽，请选择明种植园');tile={id:`quarry-${9-s.quarrySupply}`,kind:'quarry'};s.quarrySupply--;}
    else {const index=s.plantationMarket.findIndex(t=>t.id===action.tile);rule(index>=0,'该种植园不在当前明牌区，请使用可见地块 id');tile=s.plantationMarket.splice(index,1)[0];}
    const staffed=ability(action as unknown as Record<string,unknown>,'useHospice',p,'hospice')&&recruitOne(s,p,true);p.island.push({...tile,workers:staffed?1:0});notes.push(`${p.name}取得${tile.kind==='quarry'?'采石场':`${PLANTATION_NAMES[tile.kind]}种植园`}${staffed?'，救济院招来一名人员':''}。`);advance(s,notes);
  }else if(action.type==='recruit'){
    if(s.phase!=='mayor_recruit')wrong();rule(typeof action.accept==='boolean','accept 须为 true（领取）或 false（拒领）');
    if(seat===s.chooser&&s.rolePrivilege)recruitOne(s,p,false);s.mayorAccepted[seat]=action.accept;notes.push(`${p.name}${action.accept?'接受':'拒领'}船上新人员。`);s.acted++;
    if(s.acted<s.players.length)s.turn=(s.chooser+s.acted)%s.players.length;
    else {const accepting=Array.from({length:s.players.length},(_,i)=>(s.chooser+i)%s.players.length).filter(i=>s.mayorAccepted[i]);let i=0;
      while(s.colonistShip>0&&accepting.length){s.players[accepting[i++%accepting.length]].colonists++;s.colonistShip--;}
      s.phase='mayor';s.acted=0;s.turn=s.chooser;notes.push('人员轮发完成，各人依市长顺序确认全部人员布置。');}
  }else if(action.type==='assign'){
    if(s.phase!=='mayor')wrong();object(action.island,'island 须为地块 id 到人员数的对象');object(action.buildings,'buildings 须为建筑 key 到人员数的对象');
    for(const [key,value] of Object.entries(action.island)){rule(p.island.some(t=>t.id===key),`岛屿没有地块 ${key}，只填写自己的地块 id`);rule(int(value,0,1),'每块地的人员数须为 0 或 1 的整数');}
    for(const [key,value] of Object.entries(action.buildings)){const owned=p.buildings.find(b=>b.key===key);rule(owned,`城市没有建筑 ${key}，只填写自己拥有的建筑`);rule(int(value),'建筑人员数须为非负整数');rule(value<=BUILDING_BY_KEY[owned.key].workers,`${BUILDING_BY_KEY[owned.key].name}人员容量为 ${BUILDING_BY_KEY[owned.key].workers}`);}
    const count=sum(action.island)+sum(action.buildings),required=Math.min(p.colonists,staffCapacity(p));rule(count===required,`须安置 ${required} 名人员，当前安排 ${count}；有空位不能自愿闲置，亦不能超出持有人员`);
    p.island.forEach(t=>t.workers=action.island[t.id]??0);p.buildings.forEach(b=>b.workers=action.buildings[b.key]??0);notes.push(`${p.name}安置 ${count} 名人员，圣胡安留 ${p.colonists-count} 名。`);advance(s,notes);
  }else if(action.type==='build'){
    if(s.phase!=='builder')wrong();rule(isBuilding(action.building),'building 须为基础建筑表中的 key');const b=BUILDING_BY_KEY[action.building];rule(!p.buildings.some(o=>o.key===b.key),'已拥有这种建筑，每人每种最多一座');rule(s.buildingStock[b.key]>0,`${b.name}库存已用尽`);rule(citySpaces(p)+b.spaces<=12,`城市空间不足：${b.name}需要 ${b.spaces===2?'两格': '一格'}，十二格城市不能扩建`);
    const price=buildCost(p,b.key,privilege,action.quarryDiscount);rule(p.coins>=price,`金币不足：${b.name}需要 ${price}，当前 ${p.coins}`);const university=ability(action as unknown as Record<string,unknown>,'useUniversity',p,'university');
    p.coins-=price;s.bank+=price;s.buildingStock[b.key]--;const staffed=university&&recruitOne(s,p,true);p.buildings.push({key:b.key,workers:staffed?1:0});notes.push(`${p.name}支付 ${price} 金币建造${b.name}${staffed?'，大学招来一名人员':''}。`);if(citySpaces(p)===12)mark(s,'city');advance(s,notes);
  }else if(action.type==='produce'){
    if(s.phase!=='craftsman')wrong();const capacity=productionCapacity(p),produced=emptyGoods();for(const good of GOODS){produced[good]=Math.min(capacity[good],s.supply[good]);s.supply[good]-=produced[good];p.goods[good]+=produced[good];}
    const kinds=GOODS.filter(g=>produced[g]>0);if(seat===s.chooser)s.producedKinds=kinds;
    const bonus=ability(action as unknown as Record<string,unknown>,'useFactory',p,'factory')?[0,0,1,2,3,5][kinds.length]:0;if(bonus)gain(s,seat,bonus);
    notes.push(`${p.name}生产${kinds.map(g=>`${GOOD_NAMES[g]} ${produced[g]} 桶`).join('、')||'零桶'}${bonus?`，工厂收入 ${bonus} 金币`:''}。`);advance(s,notes);
  }else if(action.type==='bonus'){
    if(s.phase!=='craftsman_bonus')wrong();rule(action.good===null||isGood(action.good),'good 须为商品种类或 null');
    if(action.good!==null){rule(s.producedKinds.includes(action.good),'额外商品必须是自己本阶段实际生产过的种类');rule(s.supply[action.good]>0,'该商品供应已空，请改选或放弃奖励');s.supply[action.good]--;p.goods[action.good]++;notes.push(`${p.name}最后额外领取一桶${GOOD_NAMES[action.good]}。`);}else notes.push(`${p.name}放弃额外商品。`);endRole(s,notes);
  }else if(action.type==='trade'){
    if(s.phase!=='trader')wrong();rule(isGood(action.good),'good 须为五种商品之一');rule(p.goods[action.good]>0,`未持有${GOOD_NAMES[action.good]}，不能出售`);rule(s.tradingHouse.length<4,'贸易所已满四桶，本阶段不能继续出售');
    const office=ability(action as unknown as Record<string,unknown>,'useOffice',p,'office');rule(office||!s.tradingHouse.includes(action.good),'贸易所已有同类商品，只有已启用商馆可重复出售');
    const price=GOODS.indexOf(action.good)+(privilege&&action.privilege!==false?1:0)+(ability(action as unknown as Record<string,unknown>,'useSmallMarket',p,'small_market')?1:0)+(ability(action as unknown as Record<string,unknown>,'useLargeMarket',p,'large_market')?2:0);
    p.goods[action.good]--;s.tradingHouse.push(action.good);gain(s,seat,price);notes.push(`${p.name}出售一桶${GOOD_NAMES[action.good]}，收入 ${price} 金币。`);if(s.tradingHouse.length===4)endRole(s,notes);else advance(s,notes);
  }else if(action.type==='ship'){
    if(s.phase!=='captain')wrong();rule(isGood(action.good),'good 须为五种商品之一');rule(p.goods[action.good]>0,`未持有${GOOD_NAMES[action.good]}，不能装船`);let count=0;
    if(action.ship==='wharf'){rule(occupied(p,'wharf'),'私人码头尚未启用');rule(!s.wharfUsed[seat],'私人码头本阶段已使用一次');s.wharfUsed[seat]=true;count=p.goods[action.good];s.supply[action.good]+=count;}
    else {rule(int(action.ship,4,8),'ship 须为本桌货船容量或 wharf');const boat=s.ships.find(b=>b.capacity===action.ship);rule(boat,'本桌没有该容量货船');const same=s.ships.find(b=>b.good===action.good);rule(!same||same===boat,'同种商品已有另一艘船，不能占用第二艘');rule(boat.good===null||boat.good===action.good,`该船已有${GOOD_NAMES[boat.good!]}，不能混装不同货物`);rule(boat.count<boat.capacity,'该货船已满，本阶段结束前不能卸货');
      count=Math.min(p.goods[action.good],boat.capacity-boat.count);const best=Math.max(0,...regularShipments(s.ships,p.goods).filter(c=>c.good===action.good).map(c=>c.count));rule(count===best,'必须选择能装最多所选商品的货船，不能故意少装');boat.good=action.good;boat.count+=count;}
    const extraCaptain=privilege&&!s.captainBonusTaken&&action.privilege!==false?1:0;if(seat===s.chooser)s.captainBonusTaken=true;const harbor=ability(action as unknown as Record<string,unknown>,'useHarbor',p,'harbor')?1:0;
    p.goods[action.good]-=count;point(s,seat,count+extraCaptain+harbor);s.passed=0;s.turn=(seat+1)%s.players.length;notes.push(`${p.name}向${action.ship==='wharf'?'私人码头':`${action.ship} 格船`}装运${GOOD_NAMES[action.good]} ${count} 桶，取得 ${count+extraCaptain+harbor} 胜利分。`);
  }else if(action.type==='store'){
    if(s.phase!=='storage')wrong();object(action.goods,'goods 须为商品种类到保留桶数的对象');for(const [good,count] of Object.entries(action.goods)){rule(isGood(good),'仓储只接受五种商品名称');rule(int(count),'保留数量须为非负整数');rule(count<=p.goods[good],`${GOOD_NAMES[good]}保留数量超过持有数量 ${p.goods[good]}`);}
    const held={...emptyGoods(),...action.goods} as Goods,unprotected=Object.values(held).sort((a,b)=>b-a).slice(storageKinds(p)).reduce((a,b)=>a+b,0);rule(unprotected<=1,`仓储不足：可保留 ${storageKinds(p)} 种商品的任意桶数，另加一个单桶`);
    for(const good of GOODS)s.supply[good]+=p.goods[good]-held[good];p.goods=held;notes.push(`${p.name}保留${GOODS.filter(g=>held[g]).map(g=>`${GOOD_NAMES[g]} ${held[g]} 桶`).join('、')||'零桶'}，其余归还供应。`);advance(s,notes);
  }else if(action.type==='pass'){
    if(s.phase==='captain'){
      rule(!regularShipments(s.ships,p.goods).length,'有普通货船可以装运，必须先选择一种商品装船');s.passed++;notes.push(`${p.name}无普通船可装${occupied(p,'wharf')&&!s.wharfUsed[seat]?'，不使用私人码头':''}。`);
      if(s.passed>=s.players.length){s.phase='storage';s.acted=0;s.turn=s.chooser;notes.push('装船结束，依角色顺序处理仓储。');}else s.turn=(seat+1)%s.players.length;
    }else if(s.phase==='craftsman_bonus'){notes.push(`${p.name}放弃额外商品。`);endRole(s,notes);}
    else {rule(['settler','builder','craftsman','trader'].includes(s.phase),phaseInstructions[s.phase]);if(s.phase==='craftsman'&&seat===s.chooser)s.producedKinds=[];notes.push(`${p.name}放弃本次${ROLE_NAMES[s.role!]}行动。`);advance(s,notes);}
  }
  s.revision++;event(s,before,notes.join(''),seat,action);assertPuertoRico(s);return s;
}
export function viewPuertoRico(s:PuertoRicoState,viewer:number|null,reveal=false):PuertoRicoView {
  rule(viewer===null||int(viewer,0,s.players.length-1),'观察玩家座位无效');return {...publicFrame(s,reveal,viewer),viewer,events:s.events.map(({patch:_,...e})=>clone(e))};
}
export function replayPuertoRico(s:PuertoRicoState,count:number):PublicFrame {
  rule(int(count,1,s.events.length),'回放序号超出本局记录');let frame={} as PublicFrame;
  for(const e of s.events.slice(0,count)){frame={...frame,...clone(e.patch.fields)};if(e.patch.initialPlayers)frame.players=clone(e.patch.initialPlayers);for(const update of e.patch.players??[])frame.players[update.seat]={...frame.players[update.seat],...clone(update.changes)};}
  return frame;
}
export function legalActions(s:PuertoRicoState,seat:number):Action[] {
  if(s.phase==='finished'||seat!==s.turn)return [];const p=s.players[seat];
  if(s.phase==='role')return s.roles.filter(r=>r.owner===null).map(r=>({type:'choose_role',role:r.id}));
  if(s.phase==='mayor_recruit')return [{type:'recruit',accept:true}];
  if(s.phase==='mayor'){
    // Representative layouts supplement independent rule tests; the engine accepts every valid allocation.
    const make=(reverse:boolean):Action=>{let remaining=p.colonists;const island:Record<string,number>={},buildings:Record<string,number>={};const slots=[...p.island.map(t=>({id:t.id,cap:1,island:true})),...p.buildings.map(b=>({id:b.key,cap:BUILDING_BY_KEY[b.key].workers,island:false}))];if(reverse)slots.reverse();for(const slot of slots){const count=Math.min(remaining,slot.cap);remaining-=count;(slot.island?island:buildings)[slot.id]=count;}return {type:'assign',island,buildings};};return [make(false),make(true)];
  }
  if(s.phase==='settler'){const choices:Action[]=[{type:'pass'}];if(p.island.length<12){choices.push(...s.plantationMarket.map(t=>({type:'settle',tile:t.id}) as Action));if(s.quarrySupply&&(seat===s.chooser&&s.rolePrivilege||occupied(p,'construction_hut')))choices.push({type:'settle',tile:'quarry'});if(occupied(p,'hacienda')&&!s.haciendaUsed&&(s.deck.length||s.discard.length))choices.push({type:'hacienda'});}return choices;}
  if(s.phase==='builder')return [{type:'pass'},...BUILDINGS.filter(b=>s.buildingStock[b.key]>0&&!p.buildings.some(o=>o.key===b.key)&&citySpaces(p)+b.spaces<=12&&buildCost(p,b.key,seat===s.chooser&&s.rolePrivilege)<=p.coins).map(b=>({type:'build',building:b.key}) as Action)];
  if(s.phase==='craftsman')return [{type:'produce'},{type:'pass'}];
  if(s.phase==='craftsman_bonus')return [{type:'bonus',good:null},...s.producedKinds.filter(g=>s.supply[g]>0).map(g=>({type:'bonus',good:g}) as Action)];
  if(s.phase==='trader')return [{type:'pass'},...GOODS.filter(g=>p.goods[g]>0&&s.tradingHouse.length<4&&(!s.tradingHouse.includes(g)||occupied(p,'office'))).map(g=>({type:'trade',good:g}) as Action)];
  if(s.phase==='captain'){const options=regularShipments(s.ships,p.goods).map(c=>({type:'ship',good:c.good,ship:c.ship}) as Action);if(!options.length)options.push({type:'pass'});if(occupied(p,'wharf')&&!s.wharfUsed[seat])for(const good of GOODS)if(p.goods[good])options.push({type:'ship',good,ship:'wharf'});return options;}
  if(s.phase==='storage'){const sorted=[...GOODS].sort((a,b)=>p.goods[b]-p.goods[a]);const keep=emptyGoods();for(const g of sorted.slice(0,storageKinds(p)))keep[g]=p.goods[g];const last=sorted.slice(storageKinds(p)).find(g=>p.goods[g]);if(last)keep[last]=1;return [{type:'store',goods:keep}];}
  return [];
}
export function assertPuertoRico(value:unknown):asserts value is PuertoRicoState {
  const s=value as PuertoRicoState;rule(s&&s.gameId==='puerto-rico'&&Array.isArray(s.players)&&s.players.length>=3&&s.players.length<=5,'波多黎各存档结构无效');const n=s.players.length;
  rule(Object.hasOwn(phaseInstructions,s.phase)&&int(s.revision,1)&&int(s.round,1)&&int(s.match,1)&&int(s.turn,0,n-1)&&int(s.governor,0,n-1)&&int(s.initialGovernor,0,n-1)&&int(s.chooser,0,n-1)&&int(s.rng,1,4294967295),'阶段、版本、座位或随机状态无效');
  rule(Array.isArray(s.roles)&&s.roles.length===n+3&&s.roles.every((r,i)=>r.id===ROLES[i]&&int(r.coins)&&(r.owner===null||int(r.owner,0,n-1)))&&new Set(s.roles.filter(r=>r.owner!==null).map(r=>r.owner)).size===s.roles.filter(r=>r.owner!==null).length,'角色和选择者无效');
  rule(Array.isArray(s.deck)&&Array.isArray(s.discard)&&Array.isArray(s.plantationMarket)&&s.plantationMarket.length<=n+1&&int(s.quarrySupply,0,8),'种植园供应结构无效');
  rule(new Set(s.players.map(p=>p.playerId)).size===n,'玩家身份重复');const tiles:IslandTile[]=[...s.deck,...s.discard,...s.plantationMarket];
  for(const p of s.players){rule(p.seat===s.players.indexOf(p)&&p.playerId&&p.name&&int(p.coins)&&int(p.colonists)&&int(p.vp)&&int(p.totalScore)&&int(p.wins)&&Array.isArray(p.island)&&p.island.length<=12&&Array.isArray(p.buildings),'玩家资源或岛屿结构无效');
    rule(p.buildings.every(b=>isBuilding(b.key)&&int(b.workers,0,BUILDING_BY_KEY[b.key].workers))&&new Set(p.buildings.map(b=>b.key)).size===p.buildings.length&&citySpaces(p)<=12,'建筑类型、容量、重复或城市格数无效');
    rule(p.island.every(t=>int(t.workers,0,1))&&usedWorkers(p)<=p.colonists,'人员超过持有数量或地块容量');for(const g of GOODS)rule(int(p.goods[g]),'玩家商品须为非负整数');tiles.push(...p.island);
  }
  rule(tiles.every(t=>t&&typeof t.id==='string'&&(isGood(t.kind)||t.kind==='quarry'))&&new Set(tiles.map(t=>t.id)).size===tiles.length,'岛屿板块重复或类型无效');
  for(const g of GOODS)rule(tiles.filter(t=>t.kind===g).length===PLANTATION_COUNTS[g],`${GOOD_NAMES[g]}种植园不守恒`);rule(tiles.filter(t=>t.kind==='quarry').length+s.quarrySupply===8,'采石场不守恒');
  rule(int(s.colonistSupply)&&int(s.colonistShip)&&s.colonistSupply+s.colonistShip+s.players.reduce((v,p)=>v+p.colonists,0)===[58,79,100][n-3],'人员资源不守恒');
  rule(Array.isArray(s.ships)&&s.ships.length===3&&s.ships.every((b,i)=>b.capacity===n+1+i&&int(b.count,0,b.capacity)&&(b.count===0?b.good===null:isGood(b.good)))&&new Set(s.ships.filter(b=>b.good!==null).map(b=>b.good)).size===s.ships.filter(b=>b.good!==null).length,'货船容量或商品类型无效');
  rule(Array.isArray(s.tradingHouse)&&s.tradingHouse.length<=4&&s.tradingHouse.every(isGood),'贸易所容量无效');
  for(const g of GOODS)rule(int(s.supply[g])&&s.supply[g]+s.players.reduce((v,p)=>v+p.goods[g],0)+s.ships.filter(b=>b.good===g).reduce((v,b)=>v+b.count,0)+s.tradingHouse.filter(t=>t===g).length===GOOD_SUPPLY[g],`${GOOD_NAMES[g]}商品不守恒`);
  for(const b of BUILDINGS)rule(int(s.buildingStock[b.key],0,b.quantity)&&s.buildingStock[b.key]+s.players.reduce((v,p)=>v+p.buildings.filter(o=>o.key===b.key).length,0)===b.quantity,`${b.name}建筑不守恒`);
  rule(Number.isSafeInteger(s.bank)&&s.bank+s.players.reduce((v,p)=>v+p.coins,0)+s.roles.reduce((v,r)=>v+r.coins,0)===86,'金币银行账目不守恒');rule(Number.isSafeInteger(s.vpSupply)&&s.vpSupply+s.players.reduce((v,p)=>v+p.vp,0)===[75,100,122][n-3],'胜利分账目不守恒');
  rule(Array.isArray(s.events)&&s.events.length>0&&s.events.every((e,i)=>e.seq===i+1&&e.patch&&typeof e.text==='string')&&s.events.length===s.revision,'公开记录与状态版本无效');
  rule(Array.isArray(s.finalReasons)&&s.finalReasons.every(r=>['city','colonists','vp'].includes(r))&&(s.phase==='finished'?!!s.result&&s.finalReasons.length>0:s.result===null),'终局状态无效');
}
export function restorePuertoRico(value:unknown):PuertoRicoState {
  assertPuertoRico(value);const s=value,frame=replayPuertoRico(s,s.events.length);rule(JSON.stringify(frame)===JSON.stringify(publicFrame(s)),'公开记录与当前局面不一致，不能恢复');
  if(s.result){const scores=s.players.map(scorePlayer);rule(JSON.stringify(scores)===JSON.stringify(s.result.scores),'终局计分与建筑、人员或商品不一致');const high=Math.max(...scores.map(p=>p.total)),tie=Math.max(...scores.filter(p=>p.total===high).map(p=>p.tiebreak));rule(JSON.stringify(s.result.winners)===JSON.stringify(scores.filter(p=>p.total===high&&p.tiebreak===tie).map(p=>p.seat)),'终局胜负不一致');}
  return clone(s);
}
