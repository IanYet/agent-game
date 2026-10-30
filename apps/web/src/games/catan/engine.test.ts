import {describe,it,expect} from 'vitest';
import {createCatan,applyCatan,assertCatan,viewCatan,actors,roadLength,updateAwards,score,tradeRates,nextCatan,replayCatan,emptyResources} from './engine';
import {definition} from './definition';
import {RESOURCES,type CatanState,type Resource,type DevelopmentType,type Action} from './types';
import type {StoredRun} from '../../runtime/types';

// Expected behavior is from CATAN CN3081 v6.250401, pp. 6–12, and the official base-game FAQ.
// Fixtures deliberately construct resources, targets and board positions independently of UI choices.
function random(seed=42){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};}
const identities=Array.from({length:4},(_,seat)=>({playerId:`p${seat}`,name:`玩家${seat}`,kind:'agent' as const}));
function game(n=3){return createCatan('rules',identities.slice(0,n),{random:random(),firstSeat:0});}
function main(n=3){const s=game(n);s.phase='action';s.setupStep=n*2;s.setupVertex=null;return s;}
function give(s:CatanState,seat:number,resource:Resource,n:number){s.players[seat].resources[resource]+=n;s.bank[resource]-=n;}
function card(s:CatanState,seat:number,type:DevelopmentType,boughtTurn=0){const i=s.deck.findIndex(c=>c.type===type);expect(i).toBeGreaterThanOrEqual(0);const [c]=s.deck.splice(i,1);c.boughtTurn=boughtTurn;s.players[seat].development.push(c);return c.id;}
function reject(s:CatanState,seat:number,action:unknown,reason:RegExp){const before=structuredClone(s),pending=actors(s);expect(()=>applyCatan(s,seat,action)).toThrow(reason);expect(s).toEqual(before);expect(actors(s)).toEqual(pending);}
function ring(s:CatanState,index=9){const h=s.board.hexes[index];return {vertices:h.vertices,edges:h.edges};}
function chain(s:CatanState,count:number,excluded=new Set<string>()){
  const walk=(v:string,vs:string[],es:string[]):{vertices:string[];edges:string[]}|null=>{
    if(es.length===count)return {vertices:vs,edges:es};
    const node=s.board.vertices.find(n=>n.id===v)!;
    for(const id of node.edges){const edge=s.board.edges.find(e=>e.id===id)!;const next=edge.vertices.find(x=>x!==v)!;if(excluded.has(id)||es.includes(id)||vs.includes(next))continue;const found=walk(next,[...vs,next],[...es,id]);if(found)return found;}
    return null;
  };
  for(const v of s.board.vertices){const found=walk(v.id,[v.id],[]);if(found)return found;}throw Error('fixture chain not found');
}
function setup(s:CatanState){
  while(s.phase.startsWith('setup')){
    if(s.phase==='setup_settlement'){
      const vertex=s.board.vertices.find(v=>!s.buildings[v.id]&&v.neighbors.every(id=>!s.buildings[id]))!;
      s=applyCatan(s,s.turn,{type:'setup_settlement',vertex:vertex.id});
    }else {const edge=s.board.vertices.find(v=>v.id===s.setupVertex)!.edges.find(id=>s.roads[id]===undefined)!;s=applyCatan(s,s.turn,{type:'setup_road',edge});}
  }return s;
}
function seedFor(total:number){for(let seed=1;seed<10000;seed++){let n=seed;const roll=()=>{n^=n<<13;n^=n>>>17;n^=n<<5;n>>>=0;return Math.floor(n/2**32*6)+1;};if(roll()+roll()===total)return seed;}throw Error('seed');}
function run(s:CatanState):StoredRun<CatanState>{return {moduleId:'catan',moduleVersion:'1.0.0',stateVersion:1,roomId:'room',runId:s.id,index:s.round,config:{edition:'base-2025'},roster:identities.slice(0,s.players.length).map(p=>({...p,kind:'codex-acp'})),state:s};}

describe('卡坦岛：基础版组件与随机布置',()=>{
  it('只支持 3–4 人，拒绝重复身份和未支持配置',()=>{
    expect(()=>createCatan('x',identities.slice(0,2),{random:random()})).toThrow(/3.*4/);
    expect(()=>createCatan('x',[identities[0],identities[0],identities[2]],{random:random()})).toThrow(/身份/);
    expect(()=>definition.validateConfig!({edition:'base-2025',friendlyRobber:true})).toThrow();
  });
  it('19 地块、54 顶点、72 边、九座港口、完整资源与发展牌',()=>{
    const s=game(4);expect(s.board.hexes).toHaveLength(19);expect(s.board.vertices).toHaveLength(54);expect(s.board.edges).toHaveLength(72);
    expect(s.board.ports).toHaveLength(9);expect(s.board.ports.filter(p=>p.resource==='any')).toHaveLength(4);
    for(const r of RESOURCES){expect(s.bank[r]).toBe(19);expect(s.board.ports.filter(p=>p.resource===r)).toHaveLength(1);expect(s.board.hexes.filter(h=>h.resource===r)).toHaveLength(r==='ore'||r==='brick'?3:4);}
    expect(s.board.hexes.filter(h=>h.number!==null).map(h=>h.number).sort((a,b)=>a!-b!)).toEqual([2,3,3,4,4,5,5,6,6,8,8,9,9,10,10,11,11,12]);
    expect(s.deck).toHaveLength(25);expect(new Set(s.deck.map(c=>c.id)).size).toBe(25);
    for(const [type,n] of Object.entries({knight:14,road_building:2,invention:2,monopoly:2,victory_point:5}))expect(s.deck.filter(c=>c.type===type)).toHaveLength(n);
    expect(s.board.hexes.find(h=>h.id===s.robber)?.resource).toBe('desert');assertCatan(s);
  });
  it('数字按 A–R 逆时针螺旋跳过沙漠，随机地图可复现且不固定地形',()=>{
    const a=game(),b=game();expect(a.board).toEqual(b.board);
    const other=createCatan('other',identities.slice(0,3),{random:random(100)});expect(other.board.hexes.map(h=>h.resource)).not.toEqual(a.board.hexes.map(h=>h.resource));
    expect(a.board.hexes.filter(h=>h.letter).sort((x,y)=>x.letter!.localeCompare(y.letter!)).map(h=>h.number)).toEqual([5,2,6,3,8,10,9,12,11,4,8,10,9,4,5,6,3,11]);
    for(const p of a.board.ports){const edge=a.board.edges.find(e=>e.id===p.edge)!;expect(edge.hexes).toHaveLength(1);expect(edge.vertices).toEqual(p.vertices);}
    expect(new Set(a.board.ports.flatMap(p=>p.vertices)).size).toBe(18);
  });
  it('先手比较掷骰结果；初始布置按正序和逆序完成，第二座给资源',()=>{
    let s=game(4);const order:number[]=[];
    while(s.phase.startsWith('setup')){
      if(s.phase==='setup_settlement'){
        order.push(s.turn);const vertex=s.board.vertices.find(v=>!s.buildings[v.id]&&v.neighbors.every(id=>!s.buildings[id]))!;
        const expected=emptyResources();if(s.setupStep>=4)for(const id of vertex.hexes){const h=s.board.hexes.find(h=>h.id===id)!;if(h.resource!=='desert')expected[h.resource]++;}
        const before={...s.players[s.turn].resources},seat=s.turn;s=applyCatan(s,seat,{type:'setup_settlement',vertex:vertex.id});
        for(const r of RESOURCES)expect(s.players[seat].resources[r]-before[r]).toBe(expected[r]);
      }else s=applyCatan(s,s.turn,{type:'setup_road',edge:s.board.vertices.find(v=>v.id===s.setupVertex)!.edges.find(id=>s.roads[id]===undefined)!});
    }
    expect(order).toEqual([0,1,2,3,3,2,1,0]);expect(s.phase).toBe('roll');expect(s.turn).toBe(0);expect(Object.keys(s.roads)).toHaveLength(8);expect(Object.keys(s.buildings)).toHaveLength(8);assertCatan(s);
  });
  it('初始定居点也遵守距离，初始道路必须相邻于刚建定居点',()=>{
    let s=game();const v=s.board.vertices[0];s=applyCatan(s,0,{type:'setup_settlement',vertex:v.id});
    reject(s,0,{type:'setup_road',edge:s.board.edges.find(e=>!e.vertices.includes(v.id))!.id},/刚.*定居点|相邻/);
    s=applyCatan(s,0,{type:'setup_road',edge:v.edges[0]});reject(s,1,{type:'setup_settlement',vertex:v.neighbors[0]},/距离|两条/);
    reject(s,0,{type:'setup_settlement',vertex:s.board.vertices.at(-1)!.id},/决策|轮到/);
  });
});

describe('生产、七点、弃牌和强盗',()=>{
  it('所有玩家按定居点 1、城市 2 生产，强盗所在格不产出',()=>{
    let s=main();s.phase='roll';const h=s.board.hexes.find(h=>h.resource!=='desert')!;h.number=6;
    s.board.hexes.filter(t=>t!==h).forEach(t=>{if(t.resource!=='desert')t.number=4;});
    s.buildings[h.vertices[0]]={seat:0,kind:'settlement'};s.buildings[h.vertices[2]]={seat:1,kind:'city'};s.rng=seedFor(6);
    s=applyCatan(s,0,{type:'roll'});expect(s.players[0].resources[h.resource as Resource]).toBe(1);expect(s.players[1].resources[h.resource as Resource]).toBe(2);expect(s.phase).toBe('action');assertCatan(s);
    s.phase='roll';s.robber=h.id;s.rng=seedFor(6);const old=s.players.map(p=>({...p.resources}));s=applyCatan(s,0,{type:'roll'});expect(s.players.map(p=>p.resources)).toEqual(old);
  });
  it('短缺时多人均不领取，只有一位领取者时拿剩余库存',()=>{
    let s=main();s.phase='roll';s.board.hexes.forEach(h=>{if(h.resource!=='desert')h.number=4;});const h=s.board.hexes.find(h=>h.resource==='ore')!;h.number=6;
    s.buildings[h.vertices[0]]={seat:0,kind:'city'};s.buildings[h.vertices[2]]={seat:1,kind:'settlement'};give(s,2,'ore',18);s.rng=seedFor(6);
    s=applyCatan(s,0,{type:'roll'});expect(s.players[0].resources.ore).toBe(0);expect(s.players[1].resources.ore).toBe(0);expect(s.bank.ore).toBe(1);
    delete s.buildings[h.vertices[2]];s.phase='roll';s.rng=seedFor(6);s=applyCatan(s,0,{type:'roll'});expect(s.players[0].resources.ore).toBe(1);expect(s.bank.ore).toBe(0);assertCatan(s);
  });
  it('七点仅超过七张弃一半向下取整，发展卡不计；每人弃牌窗口稳定',()=>{
    let s=main();s.phase='roll';give(s,0,'wood',9);give(s,1,'brick',7);give(s,2,'wool',8);card(s,1,'knight');s.rng=seedFor(7);
    s=applyCatan(s,0,{type:'roll'});expect(s.discardNeeded).toEqual({0:4,2:4});expect(actors(s)).toEqual([0,2]);
    const before=definition.decisions(run(s)).find(d=>d.actorId==='p2')!.decisionId;
    reject(s,0,{type:'discard',resources:{wood:3}},/4/);reject(s,0,{type:'bank_trade',give:{wood:4},want:{brick:1}},/弃牌/);
    s=applyCatan(s,0,{type:'discard',resources:{wood:4}});expect(definition.decisions(run(s)).find(d=>d.actorId==='p2')!.decisionId).toBe(before);
    reject(s,0,{type:'discard',resources:{wood:4}},/决策|弃过/);s=applyCatan(s,2,{type:'discard',resources:{wool:4}});expect(s.phase).toBe('robber');expect(s.players[1].resources.brick).toBe(7);assertCatan(s);
  });
  it('弃后仍大于七张不会再次弃牌，不能凭空弃资源或给负数',()=>{
    let s=main();give(s,1,'wood',18);s.phase='roll';s.rng=seedFor(7);s=applyCatan(s,0,{type:'roll'});
    reject(s,1,{type:'discard',resources:{wood:8,ore:1}},/持有|不足/);reject(s,1,{type:'discard',resources:{wood:10,ore:-1}},/非负|整数/);
    s=applyCatan(s,1,{type:'discard',resources:{wood:9}});expect(s.players[1].resources.wood).toBe(9);expect(s.phase).toBe('robber');
  });
  it('必须移动到另一地块；有相邻有牌对手时必须选一人，不能选自己或远方玩家',()=>{
    let s=main();s.phase='robber';const h=s.board.hexes.find(h=>h.id!==s.robber)!;s.buildings[h.vertices[0]]={seat:1,kind:'settlement'};give(s,1,'wheat',2);
    reject(s,0,{type:'move_robber',hex:s.robber},/另一|不同/);reject(s,0,{type:'move_robber',hex:h.id},/目标|选择/);
    reject(s,0,{type:'move_robber',hex:h.id,target:0},/目标|自己/);reject(s,0,{type:'move_robber',hex:h.id,target:2},/目标|相邻/);
    s=applyCatan(s,0,{type:'move_robber',hex:h.id,target:1});expect(s.players[0].resources.wheat).toBe(1);expect(s.players[1].resources.wheat).toBe(1);expect(s.phase).toBe('action');assertCatan(s);
  });
  it('允许放回沙漠并偷取；没有可偷目标可正常继续',()=>{
    let s=main();const desert=s.robber;s.robber=s.board.hexes.find(h=>h.resource!=='desert')!.id;s.phase='robber';
    s=applyCatan(s,0,{type:'move_robber',hex:desert});expect(s.robber).toBe(desert);expect(s.phase).toBe('action');
  });
});

describe('建造、连通、库存与最长道路',()=>{
  it('直接提交非候选道路也按连通和费用判断，拒绝不相连、占用和资源不足',()=>{
    let s=main();const v=s.board.vertices[20];s.buildings[v.id]={seat:0,kind:'settlement'};give(s,0,'wood',2);give(s,0,'brick',1);
    const edge=v.edges.at(-1)!;const far=s.board.edges.find(e=>!e.vertices.includes(v.id))!.id;reject(s,0,{type:'road',edge:far},/连接/);
    s=applyCatan(s,0,{type:'road',edge});expect(s.roads[edge]).toBe(0);expect(s.players[0].resources.wood).toBe(1);
    reject(s,0,{type:'road',edge},/已有|占用/);reject(s,0,{type:'road',edge:v.edges[0]},/砖|资源/);assertCatan(s);
  });
  it('道路不可穿过敌方建筑，但可从中断另一侧已有道路延伸',()=>{
    const s=main(),p=chain(s,4);p.edges.slice(0,2).forEach(e=>s.roads[e]=0);s.buildings[p.vertices[2]]={seat:1,kind:'settlement'};give(s,0,'wood',2);give(s,0,'brick',2);
    reject(s,0,{type:'road',edge:p.edges[2]},/连接|对手/);s.roads[p.edges[2]]=0;
    const after=applyCatan(s,0,{type:'road',edge:p.edges[3]});expect(after.roads[p.edges[3]]).toBe(0);
  });
  it('定居点距离限制适用于双方建筑，必须接自己的道路且每人最多五座',()=>{
    let s=main();const p=chain(s,3);s.roads[p.edges[0]]=0;s.buildings[p.vertices[0]]={seat:1,kind:'settlement'};
    for(const r of ['wood','brick','wool','wheat'] as Resource[])give(s,0,r,3);
    reject(s,0,{type:'settlement',vertex:p.vertices[1]},/距离|两条/);
    reject(s,0,{type:'settlement',vertex:p.vertices[3]},/道路|连接/);s.roads[p.edges[1]]=0;s=applyCatan(s,0,{type:'settlement',vertex:p.vertices[2]});expect(score(s,0)).toBe(1);assertCatan(s);
  });
  it('城市仅升级自己的定居点，支付 2 麦 3 矿并归还定居点，最多四城',()=>{
    let s=main();const v=s.board.vertices[0].id;s.buildings[v]={seat:0,kind:'settlement'};give(s,0,'wheat',2);give(s,0,'ore',3);
    reject(s,0,{type:'city',vertex:s.board.vertices[5].id},/自己的定居点/);
    s=applyCatan(s,0,{type:'city',vertex:v});expect(s.buildings[v]).toEqual({seat:0,kind:'city'});expect(score(s,0)).toBe(2);expect(viewCatan(s,0).players[0].pieces.settlements).toBe(5);assertCatan(s);
    for(const node of s.board.vertices.slice(2,5))s.buildings[node.id]={seat:0,kind:'city'};const target=s.board.vertices[6].id;s.buildings[target]={seat:0,kind:'settlement'};
    give(s,0,'wheat',2);give(s,0,'ore',3);reject(s,0,{type:'city',vertex:target},/四|4/);
  });
  it('15 条道路和 5 座定居点的实体库存独立校验',()=>{
    const s=main(),p=chain(s,16);p.edges.slice(0,15).forEach(e=>s.roads[e]=0);give(s,0,'wood',1);give(s,0,'brick',1);reject(s,0,{type:'road',edge:p.edges[15]},/15/);
    const t=main();t.board.vertices.slice(0,5).forEach(v=>t.buildings[v.id]={seat:0,kind:'settlement'});const target=t.board.vertices[40];t.roads[target.edges[0]]=0;
    for(const r of ['wood','brick','wool','wheat'] as Resource[])give(t,0,r,1);reject(t,0,{type:'settlement',vertex:target.id},/五|5/);
  });
  it('最长道路按不重复边的连续路径，环计六条，分叉不能相加',()=>{
    const s=main(),loop=ring(s);loop.edges.forEach(e=>s.roads[e]=0);expect(roadLength(s,0)).toBe(6);
    const t=main(),v=t.board.vertices.find(v=>v.edges.length===3)!;v.edges.forEach(e=>t.roads[e]=0);expect(roadLength(t,0)).toBe(2);
    s.buildings[loop.vertices[0]]={seat:1,kind:'settlement'};expect(roadLength(s,0)).toBe(6);
    s.buildings[loop.vertices[3]]={seat:2,kind:'settlement'};expect(roadLength(s,0)).toBe(3);
  });
  it('至少五条才得奖励，平手保留；被切断后转移、无独占领先则归还银行',()=>{
    const s=main(),a=chain(s,7);a.edges.forEach(e=>s.roads[e]=0);const b=chain(s,6,new Set(a.edges));b.edges.forEach(e=>s.roads[e]=1);updateAwards(s);expect(s.longestRoad).toBe(0);
    s.buildings[a.vertices[3]]={seat:2,kind:'settlement'};updateAwards(s);expect(s.longestRoad).toBe(1);
    const t=main(),p=chain(t,5);p.edges.forEach(e=>t.roads[e]=0);updateAwards(t);expect(t.longestRoad).toBe(0);
    const q=chain(t,5,new Set(p.edges));q.edges.forEach(e=>t.roads[e]=1);updateAwards(t);expect(t.longestRoad).toBe(0);
    t.buildings[p.vertices[2]]={seat:2,kind:'settlement'};updateAwards(t);expect(t.longestRoad).toBe(1);
  });
  it('没有持有人时多个五条并列不授奖，敌方定居点实际建造会重算奖励',()=>{
    let s=main();const a=chain(s,6);a.edges.forEach(e=>s.roads[e]=0);s.longestRoad=0;s.turn=1;
    const target=a.vertices[3],branch=s.board.vertices.find(v=>v.id===target)!.edges.find(e=>!a.edges.includes(e));expect(branch).toBeDefined();s.roads[branch!]=1;
    for(const r of ['wood','brick','wool','wheat'] as Resource[])give(s,1,r,1);s=applyCatan(s,1,{type:'settlement',vertex:target});expect(s.longestRoad).toBeNull();expect(roadLength(s,0)).toBe(3);
  });
});

describe('交易与协商',()=>{
  it('4:1 换取允许任意多组与混合支付，但不允许同种给取、赠送或小数',()=>{
    let s=main();give(s,0,'wood',8);give(s,0,'brick',4);
    reject(s,0,{type:'bank_trade',give:{wood:3},want:{ore:1}},/比例|4/);
    reject(s,0,{type:'bank_trade',give:{wood:4},want:{wood:1}},/同种|重叠/);
    reject(s,0,{type:'bank_trade',give:{wood:4},want:{}},/双方|至少|不能为空/);
    reject(s,0,{type:'bank_trade',give:{wood:4.5},want:{ore:1}},/整数/);
    s=applyCatan(s,0,{type:'bank_trade',give:{wood:8,brick:4},want:{ore:2,wheat:1}});expect(s.players[0].resources.ore).toBe(2);expect(s.players[0].resources.wheat).toBe(1);assertCatan(s);
  });
  it('港口必须有自己的建筑，通港 3:1、专港 2:1；强盗不封港',()=>{
    let s=main();const generic=s.board.ports.find(p=>p.resource==='any')!,wood=s.board.ports.find(p=>p.resource==='wood')!;
    s.roads[generic.edge]=0;expect(tradeRates(s,0).wood).toBe(4);s.buildings[generic.vertices[0]]={seat:0,kind:'settlement'};expect(tradeRates(s,0).ore).toBe(3);
    s.buildings[wood.vertices[0]]={seat:0,kind:'city'};expect(tradeRates(s,0).wood).toBe(2);give(s,0,'wood',2);s.robber=s.board.edges.find(e=>e.id===wood.edge)!.hexes[0];
    s=applyCatan(s,0,{type:'bank_trade',give:{wood:2},want:{ore:1}});expect(s.players[0].resources.ore).toBe(1);assertCatan(s);
  });
  it('银行缺货、掷骰前及非当前回合不能换取',()=>{
    const s=main();give(s,0,'wood',4);give(s,1,'ore',19);reject(s,0,{type:'bank_trade',give:{wood:4},want:{ore:1}},/库存|不足/);
    s.phase='roll';reject(s,0,{type:'bank_trade',give:{wood:4},want:{brick:1}},/掷骰|阶段/);reject(s,1,{type:'bank_trade',give:{ore:4},want:{brick:1}},/决策|轮到/);
  });
  it('有更优港口仍可选择通用 4:1 或已拥有的 3:1，同种资源可混合合法组数',()=>{
    let s=main();const wood=s.board.ports.find(p=>p.resource==='wood')!,generic=s.board.ports.find(p=>p.resource==='any')!;s.buildings[wood.vertices[0]]={seat:0,kind:'settlement'};s.buildings[generic.vertices[0]]={seat:0,kind:'settlement'};give(s,0,'wood',14);
    s=applyCatan(s,0,{type:'bank_trade',give:{wood:4},want:{ore:1}});expect(s.players[0].resources.ore).toBe(1);
    s=applyCatan(s,0,{type:'bank_trade',give:{wood:3},want:{wool:1}});expect(s.players[0].resources.wool).toBe(1);
    s=applyCatan(s,0,{type:'bank_trade',give:{wood:7},want:{brick:3}});expect(s.players[0].resources.brick).toBe(3);assertCatan(s);
    const t=main();t.buildings[wood.vertices[0]]={seat:0,kind:'settlement'};give(t,0,'wood',3);reject(t,0,{type:'bank_trade',give:{wood:3},want:{ore:1}},/比例|分组|2|4/);
  });
  it('有牌才能报价；自由比例交易经对方回应和当前玩家确认，不能只接受就转移',()=>{
    let s=main();give(s,0,'wood',3);give(s,1,'ore',1);reject(s,0,{type:'trade_open',target:0,give:{wood:1},want:{ore:1}},/自己|目标/);
    reject(s,0,{type:'trade_open',target:1,give:{wood:4},want:{ore:1}},/持有|不足/);
    s=applyCatan(s,0,{type:'trade_open',target:1,give:{wood:3},want:{ore:1}});expect(actors(s)).toEqual([1]);
    reject(s,2,{type:'trade_reply',response:'accept'},/决策|报价/);s=applyCatan(s,1,{type:'trade_reply',response:'accept'});expect(s.players[0].resources.wood).toBe(3);expect(s.phase).toBe('trade_choose');
    s=applyCatan(s,0,{type:'trade_accept',target:1});expect(s.players[0].resources.ore).toBe(1);expect(s.players[1].resources.wood).toBe(3);expect(s.trade).toBeNull();assertCatan(s);
  });
  it('全桌开放协商允许非当前玩家主动还价；回应窗口不被其他人回应改变',()=>{
    let s=main();give(s,0,'wood',2);give(s,1,'wool',2);give(s,2,'ore',1);
    s=applyCatan(s,0,{type:'trade_open'});const key=definition.decisions(run(s)).find(d=>d.actorId==='p2')!.decisionId;
    s=applyCatan(s,1,{type:'trade_reply',response:'counter',give:{wool:2},want:{wood:1}});expect(definition.decisions(run(s)).find(d=>d.actorId==='p2')!.decisionId).toBe(key);
    reject(s,2,{type:'trade_reply',response:'counter',give:{ore:1},want:{ore:2}},/同种|重叠/);
    s=applyCatan(s,2,{type:'trade_reply',response:'reject'});s=applyCatan(s,0,{type:'trade_accept',target:1});expect(s.players[0].resources.wool).toBe(2);expect(s.players[1].resources.wood).toBe(1);assertCatan(s);
  });
  it('非法接受、伪造还价、赠送和含发展卡字段被拒且保持窗口',()=>{
    let s=main();give(s,0,'wood',1);s=applyCatan(s,0,{type:'trade_open',target:1,give:{wood:1},want:{ore:1}});
    reject(s,1,{type:'trade_reply',response:'accept'},/持有|不足/);
    reject(s,1,{type:'trade_reply',response:'counter',give:{},want:{wood:1}},/双方|至少|不能为空/);
    reject(s,1,{type:'trade_reply',response:'counter',give:{knight:1},want:{wood:1}},/资源/);
    s=applyCatan(s,1,{type:'trade_reply',response:'reject'});reject(s,0,{type:'trade_accept',target:1},/接受|还价|拒绝/);s=applyCatan(s,0,{type:'trade_cancel'});expect(s.phase).toBe('action');assertCatan(s);
  });
  it('成交时重新核验双方持有量，暂停的报价不作资源预扣',()=>{
    let s=main();give(s,0,'wood',1);give(s,1,'ore',1);s=applyCatan(s,0,{type:'trade_open',target:1,give:{wood:1},want:{ore:1}});s=applyCatan(s,1,{type:'trade_reply',response:'accept'});
    s.players[1].resources.ore--;s.bank.ore++;reject(s,0,{type:'trade_accept',target:1},/不足|持有/);expect(s.players[0].resources.wood).toBe(1);
  });
});

describe('发展卡、奖励与胜负',()=>{
  it('购买使用羊毛小麦矿石各一；新卡当回合不能使用，购买类型不公开',()=>{
    let s=main();for(const r of ['wool','wheat','ore'] as Resource[])give(s,0,r,1);s=applyCatan(s,0,{type:'buy_development'});const c=s.players[0].development[0];
    expect(c.boughtTurn).toBe(s.turnNumber);expect(s.players[0].resources).toEqual(emptyResources());
    if(c.type==='knight')reject(s,0,{type:'play_knight',cardId:c.id},/本回合|当回合/);
    expect(viewCatan(s,1).players[0].development).toBeNull();expect(viewCatan(s,1).events.at(-1)?.development).toBeUndefined();assertCatan(s);
  });
  it('骑士可掷骰前使用，恢复掷骰阶段且不触发弃牌；同回合只能打一张',()=>{
    let s=main();s.phase='roll';give(s,1,'wood',9);const id=card(s,0,'knight'),second=card(s,0,'monopoly');s=applyCatan(s,0,{type:'play_knight',cardId:id});expect(s.phase).toBe('robber');expect(s.discardNeeded).toEqual({});
    s=applyCatan(s,0,{type:'move_robber',hex:s.board.hexes.find(h=>h.id!==s.robber)!.id});expect(s.phase).toBe('roll');expect(s.players[1].resources.wood).toBe(9);
    reject(s,0,{type:'play_monopoly',cardId:second,resource:'wood'},/一张|已使用/);assertCatan(s);
  });
  it('不能使用新买卡、对手卡、胜利点卡或冒充牌种；不能在弃牌时使用',()=>{
    const s=main(),fresh=card(s,0,'knight',s.turnNumber),other=card(s,1,'knight'),vp=card(s,0,'victory_point'),old=card(s,0,'monopoly');
    reject(s,0,{type:'play_knight',cardId:fresh},/本回合|当回合/);reject(s,0,{type:'play_knight',cardId:other},/持有|自己的/);reject(s,0,{type:'play_knight',cardId:vp},/牌种|骑士/);reject(s,0,{type:'play_knight',cardId:old},/牌种|骑士/);
    s.phase='discard';s.discardNeeded={0:1};reject(s,0,{type:'play_monopoly',cardId:old,resource:'wood'},/弃牌/);
  });
  it('发明可取两个同种或异种，库存不足和多取都保持原卡',()=>{
    let s=main();const id=card(s,0,'invention');reject(s,0,{type:'play_invention',cardId:id,resources:{ore:3}},/2|两/);
    give(s,1,'ore',18);reject(s,0,{type:'play_invention',cardId:id,resources:{ore:2}},/库存|不足/);s=applyCatan(s,0,{type:'play_invention',cardId:id,resources:{wood:1,ore:1}});expect(s.players[0].resources.ore).toBe(1);expect(s.players[0].resources.wood).toBe(1);assertCatan(s);
    let t=main();const same=card(t,0,'invention');t=applyCatan(t,0,{type:'play_invention',cardId:same,resources:{wool:2}});expect(t.players[0].resources.wool).toBe(2);
  });
  it('垄断收走所有对手指定资源，不影响银行及其他资源；允许零收入',()=>{
    let s=main();give(s,1,'ore',4);give(s,2,'ore',2);give(s,2,'wood',1);const id=card(s,0,'monopoly');s=applyCatan(s,0,{type:'play_monopoly',cardId:id,resource:'ore'});expect(s.players[0].resources.ore).toBe(6);expect(s.players[2].resources.wood).toBe(1);expect(s.bank.ore).toBe(13);assertCatan(s);
  });
  it('修路卡依次放两条免费路，第二条可接第一条；不够一条时只建一条',()=>{
    let s=main();const p=chain(s,2);s.buildings[p.vertices[0]]={seat:0,kind:'settlement'};const id=card(s,0,'road_building');s=applyCatan(s,0,{type:'play_road_building',cardId:id});
    s=applyCatan(s,0,{type:'free_road',edge:p.edges[0]});expect(s.phase).toBe('free_roads');s=applyCatan(s,0,{type:'free_road',edge:p.edges[1]});expect(s.phase).toBe('action');expect(s.players[0].resources).toEqual(emptyResources());assertCatan(s);
    let t=main();const path=chain(t,15);path.edges.slice(0,14).forEach(e=>t.roads[e]=0);const one=card(t,0,'road_building');t=applyCatan(t,0,{type:'play_road_building',cardId:one});t=applyCatan(t,0,{type:'free_road',edge:path.edges[14]});expect(t.phase).toBe('action');expect(Object.values(t.roads).filter(v=>v===0)).toHaveLength(15);
  });
  it('最大军队三张起、并列保留、超过即转移',()=>{
    const s=main();s.players[0].knights=2;updateAwards(s);expect(s.largestArmy).toBeNull();s.players[0].knights=3;updateAwards(s);expect(s.largestArmy).toBe(0);s.players[1].knights=3;updateAwards(s);expect(s.largestArmy).toBe(0);s.players[1].knights=4;updateAwards(s);expect(s.largestArmy).toBe(1);
  });
  it('本回合买到的胜利点立即参与十分胜利，无等轮结束',()=>{
    let s=main();s.board.vertices.slice(0,4).forEach(v=>s.buildings[v.id]={seat:0,kind:'city'});card(s,0,'victory_point');const i=s.deck.findIndex(c=>c.type==='victory_point');[s.deck[0],s.deck[i]]=[s.deck[i],s.deck[0]];
    for(const r of ['wool','wheat','ore'] as Resource[])give(s,0,r,1);s=applyCatan(s,0,{type:'buy_development'});expect(s.phase).toBe('finished');expect(s.result?.winner).toBe(0);expect(s.result?.scores[0]).toBe(10);expect(s.players[0].wins).toBe(1);expect(actors(s)).toEqual([]);reject(s,0,{type:'end_turn'},/结束/);assertCatan(s);
  });
  it('只在自己回合获胜；开始轮到已有十分的玩家时立刻结束，甚至不用掷骰',()=>{
    let s=main();s.board.vertices.slice(0,4).forEach(v=>s.buildings[v.id]={seat:1,kind:'city'});card(s,1,'victory_point');card(s,1,'victory_point');expect(score(s,1)).toBe(10);s=applyCatan(s,0,{type:'end_turn'});expect(s.phase).toBe('finished');expect(s.result?.winner).toBe(1);
  });
  it('三名骑士取得最大军队后立即胜利，不要求先完成强盗移动',()=>{
    let s=main();s.board.vertices.slice(0,4).forEach(v=>s.buildings[v.id]={seat:0,kind:'city'});for(let i=0;i<2;i++){const id=card(s,0,'knight');const [c]=s.players[0].development.splice(s.players[0].development.findIndex(c=>c.id===id),1);s.played.push(c);s.players[0].knights++;}
    const id=card(s,0,'knight');s=applyCatan(s,0,{type:'play_knight',cardId:id});expect(s.result?.winner).toBe(0);expect(s.largestArmy).toBe(0);assertCatan(s);
  });
  it('结束回合重置发展卡次数，下一局按稳定身份继承胜局，重新布置',()=>{
    let s=setup(game());s.rng=seedFor(6);s=applyCatan(s,0,{type:'roll'});s=applyCatan(s,0,{type:'end_turn'});expect(s.turn).toBe(1);expect(s.phase).toBe('roll');expect(s.turnNumber).toBe(2);
    s.phase='finished';s.result={winner:0,scores:[10,2,2]};s.players[0].wins=1;const next=nextCatan(s,'next',[identities[2],identities[0],identities[1],identities[3]],random(8),2);expect(next.players[1].wins).toBe(1);expect(next.players[3].wins).toBe(0);expect(Object.keys(next.buildings)).toHaveLength(0);expect(next.round).toBe(2);assertCatan(next);
  });
});

describe('可见范围、恢复与公开回放',()=>{
  it('只展示自己的资源和发展卡，公开计数但隐藏对手胜利点、随机源与牌库',()=>{
    const s=main();give(s,0,'ore',3);card(s,0,'victory_point');card(s,0,'knight');const own=viewCatan(s,0),other=viewCatan(s,1),publicView=viewCatan(s,null);
    expect(own.players[0].resources?.ore).toBe(3);expect(own.players[0].points).toBe(1);expect(other.players[0].resources).toBeNull();expect(other.players[0].development).toBeNull();expect(other.players[0].points).toBe(0);expect(other.players[0].resourceCount).toBe(3);expect(other.players[0].developmentCount).toBe(2);
    expect(publicView).not.toHaveProperty('rng');expect(publicView).not.toHaveProperty('deck');expect(publicView.players.every(p=>p.resources===null&&p.development===null)).toBe(true);
    expect(viewCatan(s,null,true).players[0].development).toHaveLength(2);expect(definition.observe(run(s),'p1')).not.toHaveProperty('legalActions');
  });
  it('弃牌种类只给本人；偷取种类仅双方知道，公开记录与回放无泄露',()=>{
    let s=main();give(s,1,'ore',8);s.phase='discard';s.discardNeeded={1:4};s=applyCatan(s,1,{type:'discard',resources:{ore:4}});
    expect(viewCatan(s,1).events.at(-1)?.resources?.ore).toBe(4);expect(viewCatan(s,2).events.at(-1)?.resources).toBeUndefined();
    const h=s.board.hexes.find(h=>h.id!==s.robber)!;s.buildings[h.vertices[0]]={seat:1,kind:'settlement'};s=applyCatan(s,0,{type:'move_robber',hex:h.id,target:1});
    expect(viewCatan(s,0).events.at(-1)?.resources?.ore).toBe(1);expect(viewCatan(s,1).events.at(-1)?.resources?.ore).toBe(1);expect(viewCatan(s,null).events.at(-1)?.resources).toBeUndefined();expect(JSON.stringify(viewCatan(s,2).events)).not.toContain('"private"');
  });
  it('库存不足的错误说明缺少哪种资源，但不额外公开精确银行余量',()=>{
    const s=main();give(s,0,'wood',8);give(s,1,'ore',18);
    reject(s,0,{type:'bank_trade',give:{wood:8},want:{ore:2}},/银行库存.*矿石/);
    let message='';try{applyCatan(s,0,{type:'bank_trade',give:{wood:8},want:{ore:2}});}catch(error){message=(error as Error).message;}
    expect(message).not.toMatch(/现有\s*1|剩余\s*1|余量\s*1/);
  });
  it('有效存档通过守恒检查；版本、资源和牌组损坏拒绝恢复',()=>{
    const s=setup(game());expect(definition.restore(structuredClone(s),1)).toEqual(s);expect(()=>definition.restore(s,0)).toThrow(/版本|格式/);
    const broken=structuredClone(s);broken.bank.ore++;expect(()=>definition.restore(broken,1)).toThrow(/资源|守恒/);const missing=structuredClone(s);missing.deck.pop();expect(()=>definition.restore(missing,1)).toThrow(/发展|牌/);
  });
  it('公开回放按步重建道路、定居点和城市，不读取最终建筑来提前展示',()=>{
    let s=game();const v=s.board.vertices[0];s=applyCatan(s,0,{type:'setup_settlement',vertex:v.id});const beforeRoad=s.events.at(-1)!.seq;s=applyCatan(s,0,{type:'setup_road',edge:v.edges[0]});
    expect(replayCatan(s,beforeRoad).roads).toEqual({});expect(replayCatan(s,s.events.length).roads[v.edges[0]]).toBe(0);expect(replayCatan(s,1).buildings).toEqual({});expect(replayCatan(s,beforeRoad).buildings[v.id].kind).toBe('settlement');
  });
  it('工具拒绝过期 revision 或错误决策，原状态和待行动者保持不变',()=>{
    const s=game(),r=run(s),decision=definition.decisions(r)[0],original=structuredClone(s);
    const request={scopeId:r.runId,playerId:'p0',decisionId:decision.decisionId,tool:'game_act',args:{revision:0,action:{type:'setup_settlement',vertex:s.board.vertices[0].id}}} as any;
    expect(()=>definition.handleTool(r,request)).toThrow(/更新|过期/);expect(s).toEqual(original);request.args.revision=s.revision;request.decisionId='wrong';expect(()=>definition.handleTool(r,request)).toThrow(/决策/);expect(s).toEqual(original);
  });
  it('随机合法行动补充验证资源、发展卡与实体棋子守恒和实际结束条件',()=>{
    for(let seed=1;seed<=8;seed++){
      let s=setup(createCatan(`random-${seed}`,identities.slice(0,3+seed%2),{random:random(seed),firstSeat:0}));const rng=random(seed+100);
      for(let i=0;i<600&&s.phase!=='finished';i++){
        const seat=actors(s)[0],p=s.players[seat];let action:Action;
        if(s.phase==='roll')action={type:'roll'};
        else if(s.phase==='discard'){let left=s.discardNeeded[seat];const resources=emptyResources();for(const r of RESOURCES){resources[r]=Math.min(p.resources[r],left);left-=resources[r];}action={type:'discard',resources};}
        else if(s.phase==='robber'){const h=s.board.hexes[Math.floor(rng()*19)];if(h.id===s.robber)continue;const target=s.players.find(p=>p.seat!==seat&&RESOURCES.some(r=>p.resources[r])&&h.vertices.some(v=>s.buildings[v]?.seat===p.seat))?.seat;action={type:'move_robber',hex:h.id,...(target!==undefined?{target}:{})};}
        else if(s.phase==='free_roads'){
          const e=s.board.edges.find(e=>s.roads[e.id]===undefined&&e.vertices.some(v=>s.buildings[v]?.seat===seat||!s.buildings[v]&&s.board.vertices.find(n=>n.id===v)!.edges.some(id=>s.roads[id]===seat)))!;action={type:'free_road',edge:e.id};
        }else {
          const candidates:Action[]=[],affords=(cost:Partial<typeof p.resources>)=>RESOURCES.every(r=>p.resources[r]>=(cost[r]??0));
          if(affords({wheat:2,ore:3}))candidates.push(...Object.entries(s.buildings).filter(([,b])=>b.seat===seat&&b.kind==='settlement').map(([vertex])=>({type:'city' as const,vertex})));
          if(affords({wood:1,brick:1,wool:1,wheat:1}))candidates.push(...s.board.vertices.filter(v=>!s.buildings[v.id]&&v.neighbors.every(id=>!s.buildings[id])&&v.edges.some(id=>s.roads[id]===seat)).map(v=>({type:'settlement' as const,vertex:v.id})));
          if(affords({wool:1,wheat:1,ore:1})&&s.deck.length)candidates.push({type:'buy_development'});
          if(!s.developmentPlayed)for(const c of p.development.filter(c=>c.boughtTurn<s.turnNumber)){
            if(c.type==='knight')candidates.push({type:'play_knight',cardId:c.id});
            if(c.type==='monopoly')candidates.push({type:'play_monopoly',cardId:c.id,resource:RESOURCES.slice().sort((a,b)=>s.players.reduce((n,p)=>n+p.resources[b]-p.resources[a],0))[0]});
            if(c.type==='road_building')candidates.push({type:'play_road_building',cardId:c.id});
            if(c.type==='invention'){const resource=RESOURCES.find(r=>s.bank[r]>=2);if(resource)candidates.push({type:'play_invention',cardId:c.id,resources:{[resource]:2}});}
          }
          if(affords({wood:1,brick:1}))candidates.push(...s.board.edges.filter(e=>s.roads[e.id]===undefined&&e.vertices.some(v=>s.buildings[v]?.seat===seat||!s.buildings[v]&&s.board.vertices.find(n=>n.id===v)!.edges.some(id=>s.roads[id]===seat))).map(e=>({type:'road' as const,edge:e.id})));
          for(const give of RESOURCES)for(const want of RESOURCES)if(give!==want&&p.resources[give]>=tradeRates(s,seat)[give]&&s.bank[want]>0)candidates.push({type:'bank_trade',give:{[give]:tradeRates(s,seat)[give]},want:{[want]:1}});
          action={type:'end_turn'};for(const candidate of candidates){try{applyCatan(s,seat,candidate);action=candidate;break;}catch{/* independent direct candidates, no legal action generator */}}
        }
        s=applyCatan(s,seat,action);assertCatan(s);
      }
      // CATAN has no turn limit: a random policy need not win within a fixed number of actions.
      if(s.phase==='finished'){expect(s.result!.winner).toBe(s.turn);expect(score(s,s.turn)).toBeGreaterThanOrEqual(10);}else expect(score(s,s.turn)).toBeLessThan(10);
    }
  },20000);
});
