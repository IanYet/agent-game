import {describe,it,expect} from 'vitest';
import {BUILDINGS,BUILDING_BY_KEY,GOODS,GOOD_SUPPLY,PLANTATION_COUNTS,type BuildingKey,type Good,type Role} from './data';
import {applyPuertoRico,assertPuertoRico,createPuertoRico,legalActions,productionCapacity,replayPuertoRico,restorePuertoRico,scorePlayer,viewPuertoRico,type PuertoRicoState,type PlayerInput} from './engine';

// 预期先依据 Rio Grande 的 2002 经典基础版规则书第 2–11 页写定。
// 市长的自愿领取先逐人确认，再按角色顺序发完船上人员；全拒领时保留船员并补至目标。
const roster=(n=3):PlayerInput[]=>Array.from({length:n},(_,seat)=>({playerId:`p${seat}`,name:`玩家${seat+1}`,kind:seat===0?'human':'agent'}));
const seeded=(seed:number)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const fresh=(n=3)=>createPuertoRico('rules',roster(n),seeded(41));
const clone=<T,>(value:T):T=>structuredClone(value);
const act=(s:PuertoRicoState,input:unknown)=>applyPuertoRico(s,s.turn,input);
function phase(s:PuertoRicoState,role:Role,chooser=0,chosen=1){
  s.phase=role==='mayor'?'mayor_recruit':role.startsWith('prospector')?'role':role as typeof s.phase;
  s.governor=(chooser-chosen+1+s.players.length)%s.players.length;s.chooser=chooser;s.turn=chooser;s.role=role;s.rolePrivilege=true;s.acted=0;
  s.roles.forEach(r=>r.owner=null);s.roles.find(r=>r.id===role)!.owner=chooser;
  const others=s.roles.filter(r=>r.id!==role).slice(0,chosen-1);others.forEach((r,i)=>r.owner=(s.governor+i)%s.players.length);
  s.haciendaUsed=false;s.producedKinds=[];s.mayorAccepted=s.players.map(()=>null);s.wharfUsed=s.players.map(()=>false);s.captainBonusTaken=false;s.passed=0;
  return s;
}
function building(s:PuertoRicoState,seat:number,key:BuildingKey,workers=0){
  s.buildingStock[key]--;s.players[seat].buildings.push({key,workers});s.players[seat].colonists+=workers;s.colonistSupply-=workers;
}
function island(s:PuertoRicoState,seat:number,kind:Good|'quarry',workers=0){
  let tile;
  if(kind==='quarry'){tile={id:`quarry-${9-s.quarrySupply}`,kind};s.quarrySupply--;}
  else{const source=[s.deck,s.discard,s.plantationMarket].find(a=>a.some(t=>t.kind===kind))!;tile=source.splice(source.findIndex(t=>t.kind===kind),1)[0];}
  s.players[seat].island.push({...tile,workers});s.players[seat].colonists+=workers;s.colonistSupply-=workers;
}
function goods(s:PuertoRicoState,seat:number,good:Good,n:number){s.supply[good]-=n;s.players[seat].goods[good]+=n;}
function coins(s:PuertoRicoState,seat:number,n:number){s.bank-=n;s.players[seat].coins+=n;}
function ship(s:PuertoRicoState,capacity:number,good:Good,n:number){const boat=s.ships.find(b=>b.capacity===capacity)!;boat.good=good;boat.count=n;s.supply[good]-=n;}
function assign(s:PuertoRicoState,seat=s.turn){
  const p=s.players[seat];let remaining=p.colonists;
  const buildings=Object.fromEntries(p.buildings.map(b=>{const n=Math.min(remaining,BUILDING_BY_KEY[b.key].workers);remaining-=n;return [b.key,n];}));
  const island=Object.fromEntries(p.island.map(t=>{const n=Math.min(remaining,1);remaining-=n;return [t.id,n];}));
  return {type:'assign',island,buildings};
}
function reject(s:PuertoRicoState,input:unknown,message:RegExp,seat=s.turn){
  const before=clone(s);expect(()=>applyPuertoRico(s,seat,input)).toThrow(message);expect(s).toEqual(before);
  expect(s.revision).toBe(before.revision);expect(s.events).toEqual(before.events);expect(s.turn).toBe(before.turn);
}

describe('波多黎各 · 2002 经典基础版',()=>{
  it.each([3,4,5])('%i 人的全部供应、角色、船只、起始种植园与金币正确',n=>{
    const s=fresh(n);assertPuertoRico(s);
    expect(s.roles).toHaveLength(n+3);expect(s.roles.filter(r=>r.id.startsWith('prospector'))).toHaveLength(n-3);
    expect(s.ships.map(b=>b.capacity)).toEqual([n+1,n+2,n+3]);expect(s.colonistSupply).toBe([55,75,95][n-3]);expect(s.colonistShip).toBe(n);
    expect(s.vpSupply).toBe([75,100,122][n-3]);expect(s.plantationMarket).toHaveLength(n+1);expect(s.quarrySupply).toBe(8);
    expect(s.supply).toEqual(GOOD_SUPPLY);expect(s.players.every(p=>p.coins===n-1&&p.colonists===0)).toBe(true);
    const initial=Array.from({length:n},(_,i)=>s.players[(s.governor+i)%n].island[0].kind);
    expect(initial).toEqual(n===3?['indigo','indigo','corn']:n===4?['indigo','indigo','corn','corn']:['indigo','indigo','indigo','corn','corn']);
    expect(BUILDINGS).toHaveLength(23);expect(Object.values(s.buildingStock).reduce((a,b)=>a+b,0)).toBe(49);
    expect(BUILDING_BY_KEY.factory.cost).toBe(7);expect(BUILDING_BY_KEY.university.cost).toBe(8);
  });
  it('角色从选择者开始顺时针执行，完成后由总督的下一位选角色',()=>{
    let s=fresh();const governor=s.governor;s=act(s,{type:'choose_role',role:'settler'});expect(s.turn).toBe(governor);
    for(let i=0;i<3;i++){expect(s.turn).toBe((governor+i)%3);s=act(s,{type:'pass'});}
    expect(s.phase).toBe('role');expect(s.turn).toBe((governor+1)%3);reject(s,{type:'choose_role',role:'settler'},/已被选择/);
  });
  it('未选角色每轮各加一金币，总督轮换；淘金只使选择者得利',()=>{
    let s=fresh(4);const governor=s.governor;
    for(const role of ['prospector_1','builder','trader','captain'] as Role[]){
      const chooser=s.turn,before=s.players.map(p=>p.coins);s=act(s,{type:'choose_role',role});
      if(role==='prospector_1')expect(s.players.map((p,i)=>p.coins-before[i])).toEqual(before.map((_,i)=>i===chooser?1:0));
      while(s.phase!=='role'&&s.phase!=='finished')s=act(s,s.phase==='storage'?{type:'store',goods:{}}:{type:'pass'});
    }
    expect(s.round).toBe(2);expect(s.governor).toBe((governor+1)%4);
    expect(s.roles.filter(r=>r.coins===1).map(r=>r.id).sort()).toEqual(['craftsman','mayor','settler']);
    const chooser=s.turn,before=s.players[chooser].coins;s=act(s,{type:'choose_role',role:'settler'});expect(s.players[chooser].coins).toBe(before+1);
  });
  it('角色选择、时机和参数直接校验，非法提交不改变整个决策窗口',()=>{
    const s=fresh();reject(s,{type:'pass'},/选择角色/);reject(s,{type:'choose_role',role:'wizard'},/角色/);
    reject(s,{type:'choose_role',role:'builder',seat:1},/字段/);reject(s,{type:'choose_role',role:'builder'},/不是你的/,(s.turn+1)%3);
  });
  it('轮末行动仍记录在原轮，事件后的回放局面进入下一轮',()=>{
    let s=fresh();for(const role of ['settler','builder','trader'] as Role[]){s=act(s,{type:'choose_role',role});for(let i=0;i<3;i++)s=act(s,{type:'pass'});}
    expect(s.round).toBe(2);expect(s.events.at(-1)?.round).toBe(1);expect(replayPuertoRico(s,s.events.length).round).toBe(2);
  });
  it('拓荒特权与建筑工棚允许采石场，未启用的工棚无效',()=>{
    let s=phase(fresh(),'settler',1);s=act(s,{type:'settle',tile:'quarry'});expect(s.players[1].island.at(-1)?.kind).toBe('quarry');
    reject(s,{type:'settle',tile:'quarry'},/拓荒者|工棚/);building(s,2,'construction_hut');reject(s,{type:'settle',tile:'quarry'},/启用|工棚/);
    s.players[2].buildings[0].workers=1;s.players[2].colonists++;s.colonistSupply--;s=act(s,{type:'settle',tile:'quarry'});expect(s.players[2].island.at(-1)?.kind).toBe('quarry');
  });
  it('庄园先抽暗地并立即保留，之后仍可选明地；额外地没有救济院人员',()=>{
    let s=phase(fresh(),'settler');building(s,0,'hacienda',1);building(s,0,'hospice',1);const before=s.players[0].colonists;
    s=act(s,{type:'hacienda'});expect(s.turn).toBe(0);expect(s.players[0].island.at(-1)?.workers).toBe(0);expect(s.players[0].colonists).toBe(before);
    reject(s,{type:'hacienda'},/一次|已使用/);const tile=s.plantationMarket[0].id;s=act(s,{type:'settle',tile});expect(s.players[0].island.at(-1)?.id).toBe(tile);expect(s.players[0].island.at(-1)?.workers).toBe(1);
  });
  it('岛屿最多十二格，庄园抽地不能丢弃或把额外暗地换成采石场',()=>{
    let s=phase(fresh(),'settler');building(s,0,'hacienda',1);
    while(s.players[0].island.length<11)island(s,0,s.deck[0].kind as Good);
    s=act(s,{type:'hacienda'});expect(s.players[0].island).toHaveLength(12);expect(s.turn).not.toBe(0);
    const f=phase(fresh(),'settler');building(f,0,'hacienda',1);reject(f,{type:'hacienda',tile:'quarry'},/字段/);
  });
  it('救济院先从供应、供应空再从人员船取人，不可直接移动圣胡安的旧人员',()=>{
    let s=phase(fresh(),'settler');building(s,0,'hospice',1);const moved=s.colonistSupply;s.colonistSupply=0;s.players[2].colonists+=moved;
    const before=s.colonistShip;s=act(s,{type:'settle',tile:s.plantationMarket[0].id});expect(s.colonistShip).toBe(before-1);expect(s.players[0].island.at(-1)?.workers).toBe(1);
    const f=phase(fresh(),'settler');f.players[0].colonists++;f.colonistSupply--;const g=act(f,{type:'settle',tile:f.plantationMarket[0].id});expect(g.players[0].island.at(-1)?.workers).toBe(0);
  });
  it('拓荒结束弃掉余下明地，暗堆不足时洗入弃堆，所有岛屿板块守恒',()=>{
    let s=phase(fresh(),'settler');s.discard.push(...s.deck.splice(1));
    const old=s.plantationMarket.map(t=>t.id);for(let i=0;i<3;i++)s=act(s,{type:'pass'});
    expect(s.plantationMarket).toHaveLength(4);expect(s.deck.length+s.discard.length).toBe(43);expect(old.some(id=>[...s.deck,...s.discard,...s.plantationMarket].some(t=>t.id===id))).toBe(true);assertPuertoRico(s);
  });
  it('市长先领取供应特权，人员船逐人轮发，然后允许重新安排全部人员',()=>{
    let s=phase(fresh(4),'mayor');s.colonistShip+=2;s.colonistSupply-=2;
    for(let i=0;i<4;i++)s=act(s,{type:'recruit',accept:true});
    expect(s.phase).toBe('mayor');expect(s.players.map(p=>p.colonists)).toEqual([3,2,1,1]);
    const p=s.players[0];building(s,0,'small_indigo');s=act(s,{type:'assign',island:{[p.island[0].id]:1},buildings:{small_indigo:1}});expect(s.players[0].colonists).toBe(3);expect(s.players[0].buildings[0].workers).toBe(1);
  });
  it('可以拒领人员，剩余人员只向接受者轮发；全部拒领则保留船上人员',()=>{
    let s=phase(fresh(),'mayor');s.rolePrivilege=false;
    s=act(s,{type:'recruit',accept:false});s=act(s,{type:'recruit',accept:true});s=act(s,{type:'recruit',accept:false});
    expect(s.players.map(p=>p.colonists)).toEqual([0,3,0]);
    let f=phase(fresh(),'mayor');f.rolePrivilege=false;const supply=f.colonistSupply;
    for(let i=0;i<3;i++)f=act(f,{type:'recruit',accept:false});
    while(f.phase==='mayor')f=act(f,assign(f));expect(f.colonistShip).toBe(3);expect(f.colonistSupply).toBe(supply);
  });
  it('不能超出人员、场所或容量，也不能在有空位时自愿把人闲置',()=>{
    let s=phase(fresh(),'mayor');building(s,0,'indigo');for(let i=0;i<3;i++)s=act(s,{type:'recruit',accept:true});
    reject(s,{type:'assign',island:{},buildings:{}},/安置|空位/);reject(s,{type:'assign',island:{},buildings:{indigo:4}},/容量/);
    reject(s,{type:'assign',island:{unknown:1},buildings:{}},/岛屿|地块/);reject(s,{type:'assign',island:{},buildings:{indigo:2.5}},/整数/);
    s=act(s,{type:'assign',island:{},buildings:{indigo:2}});expect(s.players[0].buildings[0].workers).toBe(2);
  });
  it('人员船只按建筑空位补充，不统计种植园；恰好够补满不触发终局',()=>{
    let s=phase(fresh(),'mayor');building(s,0,'indigo');building(s,1,'coffee');for(let i=0;i<3;i++)s=act(s,{type:'recruit',accept:true});
    while(s.phase==='mayor')s=act(s,assign(s));expect(s.colonistShip).toBe(3);expect(s.finalReasons).toEqual([]);
    let f=phase(fresh(),'mayor');const excess=f.colonistSupply-4;f.players[2].colonists+=excess;f.colonistSupply-=excess;
    for(let i=0;i<3;i++)f=act(f,{type:'recruit',accept:true});while(f.phase==='mayor')f=act(f,assign(f));expect(f.colonistSupply).toBe(0);expect(f.colonistShip).toBe(3);expect(f.finalReasons).toEqual([]);
  });
  it('市长没有足够人员补船时标记最后一轮，仍让后续玩家选择角色',()=>{
    let s=phase(fresh(),'mayor');const excess=s.colonistSupply-2;s.players[2].colonists+=excess;s.colonistSupply-=excess;
    for(let i=0;i<3;i++)s=act(s,{type:'recruit',accept:true});while(s.phase==='mayor')s=act(s,assign(s));
    expect(s.finalReasons).toContain('colonists');expect(s.phase).toBe('role');expect(s.result).toBeNull();
  });
  it('每人每种建筑限一块；大建筑占两格，城市不能超过十二格',()=>{
    const s=phase(fresh(),'builder');coins(s,0,30);building(s,0,'small_market');reject(s,{type:'build',building:'small_market'},/已拥有|重复/);
    for(const b of BUILDINGS.filter(b=>b.spaces===1&&b.key!=='small_market').slice(0,10))building(s,0,b.key);
    reject(s,{type:'build',building:'guild_hall'},/两格|空间|城市/);
    const last=BUILDINGS.find(b=>b.spaces===1&&!s.players[0].buildings.some(owned=>owned.key===b.key))!;
    const t=act(s,{type:'build',building:last.key});expect(t.finalReasons).toContain('city');
  });
  it('四个采石折扣上限分别为一到四，未启用采石场不打折，费用最低零',()=>{
    const s=phase(fresh(),'builder');coins(s,0,30);for(let i=0;i<4;i++)island(s,0,'quarry',1);
    const before=s.players[0].coins;const f=act(s,{type:'build',building:'small_sugar'});expect(f.players[0].coins).toBe(before);
    const g=act(s,{type:'build',building:'university'});expect(g.players[0].coins).toBe(before-4);
    reject(s,{type:'build',building:'small_sugar',quarryDiscount:2},/上限|采石/);
    s.players[0].island.filter(t=>t.kind==='quarry').forEach(t=>t.workers=0);const h=act(s,{type:'build',building:'small_sugar'});expect(h.players[0].coins).toBe(before-1);
  });
  it('大学只给新建筑一个人员，供应空可用船员，新买大学不能启用自身',()=>{
    let s=phase(fresh(),'builder');coins(s,0,30);building(s,0,'university',1);const moved=s.colonistSupply;s.colonistSupply=0;s.players[2].colonists+=moved;
    const before=s.colonistShip;s=act(s,{type:'build',building:'indigo'});expect(s.players[0].buildings.at(-1)?.workers).toBe(1);expect(s.colonistShip).toBe(before-1);
    const f=phase(fresh(),'builder');coins(f,0,20);const g=act(f,{type:'build',building:'university'});expect(g.players[0].buildings.at(-1)?.workers).toBe(0);
  });
  it('采石场第二、四列上限以及自愿少用折扣，完全无人员时大学也不凭空招人',()=>{
    const s=phase(fresh(),'builder');coins(s,0,25);for(let i=0;i<4;i++)island(s,0,'quarry',1);const before=s.players[0].coins;
    expect(act(s,{type:'build',building:'office'}).players[0].coins).toBe(before-2);
    expect(act(s,{type:'build',building:'guild_hall'}).players[0].coins).toBe(before-5);
    expect(act(s,{type:'build',building:'office',quarryDiscount:0}).players[0].coins).toBe(before-4);
    const f=phase(fresh(),'builder');coins(f,0,20);building(f,0,'university',1);f.players[2].colonists+=f.colonistSupply+f.colonistShip;f.colonistSupply=0;f.colonistShip=0;
    expect(act(f,{type:'build',building:'coffee'}).players[0].buildings.at(-1)?.workers).toBe(0);
  });
  it('金币不足、库存耗尽和不属于当前阶段的行动都拒绝且不改状态',()=>{
    const s=phase(fresh(),'builder');reject(s,{type:'build',building:'coffee'},/金币不足/);reject(s,{type:'trade',good:'corn'},/阶段/);
    building(s,1,'guild_hall');coins(s,0,20);reject(s,{type:'build',building:'guild_hall'},/库存/);
    reject(s,{type:'build',building:'small_market',useUniversity:true},/大学.*启用/);
  });
  it('角色特权与建筑能力可以不使用，不能伪称尚未启用的能力',()=>{
    let s=fresh(4);const seat=s.turn,before=s.players[seat].coins;s=act(s,{type:'choose_role',role:'prospector_1',privilege:false});expect(s.players[seat].coins).toBe(before);
    const f=phase(fresh(),'trader');goods(f,0,'coffee',1);building(f,0,'small_market',1);building(f,0,'large_market',1);
    expect(act(f,{type:'trade',good:'coffee',useSmallMarket:false,useLargeMarket:false,privilege:false}).players[0].coins).toBe(f.players[0].coins+4);
    const g=phase(fresh(),'captain');goods(g,0,'corn',2);building(g,0,'harbor',1);expect(act(g,{type:'ship',good:'corn',ship:4,useHarbor:false,privilege:false}).players[0].vp).toBe(2);
  });
  it('生产按有人种植园和加工人员的较小值，玉米无需加工建筑',()=>{
    const s=phase(fresh(),'craftsman');island(s,0,'corn',1);island(s,0,'corn',1);island(s,0,'sugar',1);island(s,0,'sugar',1);building(s,0,'sugar',1);
    expect(productionCapacity(s.players[0])).toMatchObject({corn:2,sugar:1,indigo:0});const t=act(s,{type:'produce'});expect(t.players[0].goods).toMatchObject({corn:2,sugar:1});assertPuertoRico(t);
    reject(s,{type:'produce',goods:{corn:1}},/字段/);
  });
  it('生产短缺按工匠开始的顺序领取，工匠额外一桶在所有人生产后领取',()=>{
    let s=phase(fresh(),'craftsman');for(let i=0;i<3;i++)island(s,i,'corn',1);goods(s,2,'corn',8);
    s=act(s,{type:'produce'});expect(s.players[0].goods.corn).toBe(1);s=act(s,{type:'produce'});expect(s.supply.corn).toBe(0);s=act(s,{type:'produce'});
    expect(s.players[2].goods.corn).toBe(8);expect(s.phase).toBe('role');expect(s.players[0].goods.corn).toBe(1);
    let f=phase(fresh(),'craftsman');island(f,0,'corn',1);f=act(f,{type:'produce'});f=act(f,{type:'pass'});f=act(f,{type:'pass'});expect(f.phase).toBe('craftsman_bonus');
    reject(f,{type:'bonus',good:'coffee'},/生产|商品/);f=act(f,{type:'bonus',good:'corn'});expect(f.players[0].goods.corn).toBe(2);
  });
  it('工厂按实际领到的种类发钱，五种得五金币；允许整步放弃生产',()=>{
    const s=phase(fresh(),'craftsman');building(s,0,'factory',1);for(const good of GOODS)island(s,0,good,1);for(const key of ['small_indigo','small_sugar','tobacco','coffee'] as BuildingKey[])building(s,0,key,1);
    const before=s.players[0].coins;const t=act(s,{type:'produce'});expect(t.players[0].coins).toBe(before+5);
    goods(s,1,'coffee',9);const u=act(s,{type:'produce'});expect(u.players[0].coins).toBe(before+3);
    const v=act(s,{type:'pass'});expect(v.players[0].goods).toEqual(s.players[0].goods);expect(v.players[0].coins).toBe(before);
  });
  it('贸易价格、商人特权和两个市场叠加；玉米零价仍可出售',()=>{
    const s=phase(fresh(),'trader');goods(s,0,'corn',1);building(s,0,'small_market',1);building(s,0,'large_market',1);const before=s.players[0].coins;
    const t=act(s,{type:'trade',good:'corn'});expect(t.players[0].coins).toBe(before+4);expect(t.tradingHouse).toEqual(['corn']);
  });
  it('贸易所禁止重样，商馆只突破重样而不突破四桶容量，未满跨轮保留',()=>{
    let s=phase(fresh(),'trader');goods(s,0,'coffee',1);goods(s,1,'coffee',1);s=act(s,{type:'trade',good:'coffee'});reject(s,{type:'trade',good:'coffee'},/已有|同类|商馆/);
    building(s,1,'office',1);s=act(s,{type:'trade',good:'coffee'});expect(s.tradingHouse).toEqual(['coffee','coffee']);s=act(s,{type:'pass'});expect(s.tradingHouse).toHaveLength(2);
    const f=phase(fresh(),'trader');for(const good of ['corn','indigo','sugar','tobacco'] as Good[]){f.tradingHouse.push(good);f.supply[good]--;}
    building(f,0,'office',1);goods(f,0,'coffee',1);reject(f,{type:'trade',good:'coffee'},/已满|四桶/);
  });
  it('贸易所装满后统一清空归还商品，其余人不能在同一阶段继续卖',()=>{
    let s=phase(fresh(),'trader');for(const good of ['corn','indigo','sugar'] as Good[]){s.tradingHouse.push(good);s.supply[good]--;}
    goods(s,0,'coffee',1);const before=s.supply.corn;s=act(s,{type:'trade',good:'coffee'});expect(s.tradingHouse).toEqual([]);expect(s.supply.corn).toBe(before+1);expect(s.phase).toBe('role');assertPuertoRico(s);
  });
  it('船长强制装船，不能混装或同货占两船，失败后商品、暗分和机会不变',()=>{
    const s=phase(fresh(),'captain');goods(s,0,'corn',5);goods(s,0,'coffee',1);
    reject(s,{type:'pass'},/必须|装船/);reject(s,{type:'ship',good:'corn',ship:4},/最多|更多|装满/);
    ship(s,4,'indigo',1);reject(s,{type:'ship',good:'corn',ship:4},/靛蓝|不同|货物/);
    const f=phase(fresh(),'captain');goods(f,0,'corn',2);ship(f,4,'corn',4);reject(f,{type:'ship',good:'corn',ship:5},/已有|同种|同类|另一艘/);
  });
  it('选定货物须装最多，但可自由选少量货物；同样装得完时任意空船均合法',()=>{
    const s=phase(fresh(),'captain');goods(s,0,'corn',5);goods(s,0,'coffee',1);
    const t=act(s,{type:'ship',good:'coffee',ship:4});expect(t.ships[0].good).toBe('coffee');expect(t.players[0].vp).toBe(2);
    const u=act(s,{type:'ship',good:'coffee',ship:6});expect(u.ships[2].count).toBe(1);
    reject(s,{type:'ship',good:'corn',ship:5,amount:2},/字段/);
  });
  it('满船直到船长阶段末才卸货，未满船跨阶段保留，船长特权只加一次',()=>{
    let s=phase(fresh(),'captain');goods(s,0,'corn',6);goods(s,1,'corn',1);goods(s,0,'coffee',1);
    s=act(s,{type:'ship',good:'corn',ship:6});expect(s.ships[2].count).toBe(6);expect(s.players[0].vp).toBe(7);
    while(s.phase==='captain'&&s.turn!==0)s=act(s,{type:'pass'});s=act(s,{type:'ship',good:'coffee',ship:4});expect(s.players[0].vp).toBe(8);
    while(s.phase==='captain')s=act(s,{type:'pass'});while(s.phase==='storage')s=act(s,{type:'store',goods:{}});
    expect(s.ships[2].count).toBe(0);expect(s.ships[0]).toMatchObject({good:'coffee',count:1});assertPuertoRico(s);
  });
  it('私人码头一次运走某种全部商品，港口每次包括码头加分，码头不可复用',()=>{
    let s=phase(fresh(),'captain');building(s,0,'wharf',1);building(s,0,'harbor',1);goods(s,0,'corn',5);goods(s,0,'coffee',2);
    ship(s,4,'corn',4);s=act(s,{type:'ship',good:'corn',ship:'wharf'});expect(s.players[0].goods.corn).toBe(0);expect(s.players[0].vp).toBe(7);
    while(s.phase==='captain'&&s.turn!==0)s=act(s,{type:'pass'});reject(s,{type:'ship',good:'coffee',ship:'wharf'},/一次|已使用/);
    s=act(s,{type:'ship',good:'coffee',ship:5});expect(s.players[0].vp).toBe(10);
  });
  it('只有私人码头可用时可以放弃；有普通船可装时仍必须装船',()=>{
    let s=phase(fresh(),'captain');building(s,0,'wharf',1);goods(s,0,'coffee',2);ship(s,4,'corn',1);ship(s,5,'indigo',1);ship(s,6,'sugar',1);
    s=act(s,{type:'pass'});while(s.phase==='captain')s=act(s,{type:'pass'});expect(s.phase).toBe('storage');expect(s.players[0].goods.coffee).toBe(2);
  });
  it('仓储保留一个单桶加仓库种类，独立构造数量可行；未启用仓库无效',()=>{
    const s=phase(fresh(),'captain');s.phase='storage';goods(s,0,'corn',3);goods(s,0,'indigo',3);goods(s,0,'sugar',2);goods(s,0,'coffee',1);
    reject(s,{type:'store',goods:{corn:2}},/仓储|仓库|一桶/);building(s,0,'small_warehouse',1);
    const t=act(s,{type:'store',goods:{corn:2,coffee:1}});expect(t.players[0].goods).toMatchObject({corn:2,coffee:1,indigo:0,sugar:0});assertPuertoRico(t);
    building(s,0,'large_warehouse',1);const u=act(s,{type:'store',goods:{corn:3,indigo:3,sugar:2,coffee:1}});expect(u.players[0].goods).toEqual(s.players[0].goods);
    reject(s,{type:'store',goods:{coffee:2}},/持有|不足|数量/);reject(s,{type:'store',goods:{corn:-1}},/非负|整数/);
  });
  it('商品只在船长末检查仓储，工匠取得的货物可以暂时不受仓库限制',()=>{
    const s=phase(fresh(),'craftsman');for(let i=0;i<3;i++)island(s,0,'corn',1);goods(s,0,'corn',3);
    const t=act(s,{type:'produce'});expect(t.players[0].goods.corn).toBe(6);
  });
  it('第十二城市格触发最后一轮，仍可在后续市长阶段启用大建筑',()=>{
    let s=phase(fresh(),'builder');coins(s,0,30);for(const b of BUILDINGS.filter(b=>b.spaces===1).slice(0,10))building(s,0,b.key);
    s=act(s,{type:'build',building:'guild_hall'});expect(s.finalReasons).toContain('city');expect(s.phase).not.toBe('finished');expect(s.players[0].buildings.at(-1)?.workers).toBe(0);
  });
  it('分数筹片耗尽仍照常计超额分，完成整轮所有角色后才结算',()=>{
    let s=phase(fresh(),'captain',0,3);goods(s,0,'corn',3);s.players[2].vp=74;s.vpSupply=1;
    s=act(s,{type:'ship',good:'corn',ship:4});expect(s.vpSupply).toBe(-3);expect(s.players[0].vp).toBe(4);expect(s.finalReasons).toContain('vp');expect(s.phase).not.toBe('finished');
    while(s.phase==='captain')s=act(s,{type:'pass'});while(s.phase==='storage')s=act(s,{type:'store',goods:{}});
    expect(s.phase).toBe('finished');expect(s.result).not.toBeNull();expect(s.result!.scores[2].shipping).toBe(74);
  });
  it('全部五种大建筑严格按各自范围加分，空建筑仍有印刷分',()=>{
    const s=fresh();const p=s.players[0];building(s,0,'guild_hall',1);building(s,0,'small_indigo');building(s,0,'small_sugar');building(s,0,'coffee');
    expect(scorePlayer(p).bonuses.guild_hall).toBe(4);
    const f=fresh();building(f,0,'residence',1);while(f.players[0].island.length<10)island(f,0,f.deck[0].kind as Good);expect(scorePlayer(f.players[0]).bonuses.residence).toBe(5);
    const g=fresh();building(g,0,'fortress',1);g.players[0].colonists+=19;g.colonistSupply-=19;expect(scorePlayer(g.players[0]).bonuses.fortress).toBe(6);
    const h=fresh();building(h,0,'customs_house',1);h.players[0].vp=23;h.vpSupply-=23;expect(scorePlayer(h.players[0]).bonuses.customs_house).toBe(5);
    const j=fresh();building(j,0,'city_hall',1);building(j,0,'residence');building(j,0,'office');expect(scorePlayer(j.players[0]).bonuses.city_hall).toBe(3);
    j.players[0].buildings[0].workers=0;expect(scorePlayer(j.players[0]).bonuses.city_hall).toBe(0);expect(scorePlayer(j.players[0]).buildings).toBe(10);
  });
  it('同分比较金币与商品的合计，仍相同则共享胜利',()=>{
    let s=phase(fresh(),'builder',0,3);s.finalReasons=['city'];coins(s,1,2);goods(s,0,'corn',2);
    for(let i=0;i<3;i++)s=act(s,{type:'pass'});expect(s.phase).toBe('finished');expect(s.result!.winners).toEqual([0,1]);
    let f=phase(fresh(),'builder',0,3);f.finalReasons=['city'];coins(f,1,3);goods(f,0,'corn',2);for(let i=0;i<3;i++)f=act(f,{type:'pass'});expect(f.result!.winners).toEqual([1]);
  });
  it('公开和其他玩家观察隐藏暗分及种植园顺序，浏览器翻开不影响 Agent 观察',()=>{
    const s=fresh();s.players[0].vp=17;s.vpSupply-=17;
    const own=viewPuertoRico(s,0),other=viewPuertoRico(s,1),pub=viewPuertoRico(s,null),spectator=viewPuertoRico(s,null,true);
    expect(own.players[0].vp).toBe(17);expect(other.players[0].vp).toBeNull();expect(pub.players.every(p=>p.vp===null&&p.score===null)).toBe(true);expect(spectator.players[0].vp).toBe(17);
    for(const view of [own,other,pub,spectator]){expect(view).not.toHaveProperty('deck');expect(view).not.toHaveProperty('rng');expect(view).not.toHaveProperty('legalActions');}
    own.players[0].coins++;expect(s.players[0].coins).toBe(2);
  });
  it('拒绝损坏的资源与人员存档；当前公开记录可以重建每一步',()=>{
    const s=fresh();expect(restorePuertoRico(s)).toEqual(s);const f=clone(s);f.supply.corn--;expect(()=>restorePuertoRico(f)).toThrow(/守恒|商品/);
    const g=clone(s);g.players[0].colonists++;expect(()=>assertPuertoRico(g)).toThrow(/人员|守恒/);
    let t=act(s,{type:'choose_role',role:'settler'});t=act(t,{type:'settle',tile:t.plantationMarket[0].id});
    const frame=replayPuertoRico(t,t.events.length);expect(frame.players[0].vp).toBeNull();expect(frame.plantationMarket).toEqual(t.plantationMarket);expect(restorePuertoRico(t)).toEqual(t);
  });
  it('下一局按稳定身份继承累计分和胜场，轮换初始总督并重置所有供应',()=>{
    let s=phase(fresh(),'builder',0,3);s.finalReasons=['city'];coins(s,0,1);building(s,0,'small_market');s.players[0].vp=6;s.vpSupply-=6;s.players[0].totalScore=13;s.players[0].wins=2;for(let i=0;i<3;i++)s=act(s,{type:'pass'});
    expect(s.players[0].totalScore).toBe(20);expect(s.players[0].wins).toBe(3);
    const next=createPuertoRico('next',[...roster(4)].reverse(),seeded(5),2,s);expect(next.match).toBe(2);expect(next.players.find(p=>p.playerId==='p0')).toMatchObject({seat:3,totalScore:20,wins:3});expect(next.players.find(p=>p.playerId==='p3')).toMatchObject({totalScore:0,wins:0});
    expect(next.players[next.initialGovernor].playerId).toBe(s.players[(s.initialGovernor+1)%3].playerId);expect(next.players.every(p=>p.vp===0&&p.buildings.length===0&&p.island.length===1&&p.coins===3&&p.colonists===0)).toBe(true);assertPuertoRico(next);
    expect(()=>createPuertoRico('bad',roster(),seeded(1),2,next)).toThrow(/尚未结束/);
  });
  it('24 局 3–5 人补充对局逐步保持全部资源守恒并正常结束',()=>{
    for(let seed=1;seed<=24;seed++){
      const random=seeded(seed);let s=createPuertoRico(`play-${seed}`,roster(3+seed%3),random),steps=0;
      while(s.phase!=='finished'&&steps++<2400){const choices=legalActions(s,s.turn);expect(choices.length).toBeGreaterThan(0);s=act(s,choices[Math.floor(random()*choices.length)]);assertPuertoRico(s);}
      expect(s.phase).toBe('finished');expect(s.players.reduce((n,p)=>n+p.totalScore,0)).toBe(s.result!.scores.reduce((n,p)=>n+p.total,0));expect(restorePuertoRico(s)).toEqual(s);
    }
  },30000);
});
