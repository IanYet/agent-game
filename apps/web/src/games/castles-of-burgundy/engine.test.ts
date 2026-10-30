import {describe,expect,it,vi} from 'vitest';
import {BOARDS,GOODS,TILES,TILE_LIST,COLORS,BUILDINGS,neighbors,regionFor} from './data';
import {applyBurgundy,assertBurgundy,createBurgundy,finalBonus,legalActions,rankPlayers,replayBurgundy,restoreBurgundy,viewBurgundy} from './engine';
import {burgundyModule} from './definition';
import type {BurgundyState,Action,TileKind} from './types';
import type {StoredRun} from '../../runtime/types';

const roster=(n=2)=>Array.from({length:n},(_,seat)=>({playerId:`p${seat}`,name:`玩家${seat+1}`,kind:'agent' as const}));
const seeded=(seed:number)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const create=(n=2,setup:'classic'|'advanced'='classic',seed=99)=>createBurgundy('test',roster(n),seeded(seed),{setup});
const index=(s:BurgundyState,seat:number,cell:string)=>BOARDS[s.players[seat].boardId!].cells.findIndex(c=>c.id===cell);
function pluck(s:BurgundyState,id:string){
  for(const list of [...Object.values(s.pools),...s.depots,s.removedTiles,...s.players.map(p=>p.storage)]){const i=list.indexOf(id);if(i>=0){list.splice(i,1);return;}}
  for(const p of s.players){const i=p.estate.indexOf(id);if(i>=0){p.estate[i]=null;return;}if(p.startCastle===id){p.startCastle=null;return;}}
  throw new Error(`测试重复使用板块 ${id}`);
}
function storage(s:BurgundyState,id:string,seat=0){pluck(s,id);s.players[seat].storage.push(id);return id;}
function placed(s:BurgundyState,id:string,cell:string,seat=0){pluck(s,id);s.players[seat].estate[index(s,seat,cell)]=id;}
function knowledge(s:BurgundyState,id:number,seat=0){const cell=BOARDS[s.players[seat].boardId!].cells.find((c,i)=>c.color==='knowledge'&&!s.players[seat].estate[i])!;placed(s,`k-${id}`,cell.id,seat);}
function goodsAt(s:BurgundyState,id:string,location:string[]){
  for(const list of [...s.goodsPhases,s.roundGoods,...s.goodsDepots,s.unusedGoods,...s.players.flatMap(p=>[p.goods,p.soldGoods])]){const i=list.indexOf(id);if(i>=0){list.splice(i,1);location.push(id);return;}}
  throw Error(`测试重复使用货物 ${id}`);
}
function fixture(n=2){const s=create(n);s.turn=0;s.turnIndex=0;s.roundOrder=[...s.players.keys()];s.players.forEach(p=>p.used=[false,false]);s.players[0].dice=[3,1];s.players[0].workers=10;sync(s);return s;}
function sync(s:BurgundyState){s.audit.workersGranted=s.players.reduce((n,p)=>n+p.workers,0)+s.audit.workersPaid;s.audit.silverGranted=s.players.reduce((n,p)=>n+p.silver,0)+s.audit.silverPaid;}
const spare=(s:BurgundyState,kind:TileKind)=>TILE_LIST.find(t=>t.kind===kind&&!s.players.some(p=>p.estate.includes(t.id)))!.id;
function reject(s:BurgundyState,action:unknown,reason:RegExp,seat=s.turn){const before=structuredClone(s);expect(()=>applyBurgundy(s,seat,action)).toThrow(reason);expect(s).toEqual(before);}
function runOf(s:BurgundyState):StoredRun<BurgundyState>{return {moduleId:'castles-of-burgundy',moduleVersion:'1.0.0',stateVersion:1,roomId:'room',runId:s.id,index:s.match,config:s.config,roster:roster(s.players.length).map(p=>({...p,kind:'codex-acp'})),state:s};}

describe('勃艮第城堡 · 2011 alea 原版基础游戏',()=>{
  it('完整组件：164 六角板块、26 种唯一知识、42 件货物，黑背与普通供应分开',()=>{
    expect(TILE_LIST).toHaveLength(164);expect(new Set(TILE_LIST.map(t=>t.id)).size).toBe(164);
    expect(TILE_LIST.filter(t=>t.back==='black')).toHaveLength(40);
    for(const [kind,total,black] of [['building',56,16],['animal',28,8],['knowledge',26,6],['castle',16,2],['mine',12,2],['ship',26,6]] as const){expect(TILE_LIST.filter(t=>t.kind===kind)).toHaveLength(total);expect(TILE_LIST.filter(t=>t.kind===kind&&t.back==='black')).toHaveLength(black);}
    expect(TILE_LIST.filter(t=>t.kind==='knowledge'&&t.back==='black').map(t=>t.knowledge).sort((a,b)=>a!-b!)).toEqual([7,12,14,15,24,25]);
    for(const building of BUILDINGS)expect(TILE_LIST.filter(t=>t.building===building)).toHaveLength(7);
    for(const animal of ['cow','pig','sheep','chicken']){
      expect(TILE_LIST.filter(t=>t.animal===animal&&t.back!=='black').map(t=>t.count).sort()).toEqual([2,2,3,3,4]);
      expect(TILE_LIST.filter(t=>t.animal===animal&&t.back==='black').map(t=>t.count).sort()).toEqual([3,4]);
    }
    expect(Object.values(GOODS)).toHaveLength(42);for(let type=1;type<=6;type++)expect(Object.values(GOODS).filter(g=>g.type===type)).toHaveLength(7);
  });
  it('原版九张庄园各 37 格，1 号城市大小为 1/3/3/5，骰值与实物一致',()=>{
    expect(Object.keys(BOARDS)).toHaveLength(9);
    for(const board of Object.values(BOARDS)){expect(board.cells).toHaveLength(37);expect(new Set(board.cells.map(c=>c.id)).size).toBe(37);for(const [color,count] of [['building',12],['animal',6],['knowledge',6],['castle',4],['mine',3],['ship',6]] as const)expect(board.cells.filter(c=>c.color===color)).toHaveLength(count);}
    expect(BOARDS[1].regions.filter(r=>r.color==='building').map(r=>r.cells.length).sort()).toEqual([1,3,3,5]);
    expect(BOARDS[1].cells.filter(c=>neighbors(BOARDS[1],c.id).includes('D4')).map(c=>c.id).sort()).toEqual(['C3','C4','D3','D5','E3','E4']);
    expect(BOARDS[1].cells.filter(c=>c.id.startsWith('B')).map(c=>c.value)).toEqual([2,1,6,5,4]);
    expect(BOARDS[2].cells.find(c=>c.id==='D4')?.color).toBe('building');
    expect(BOARDS[8].cells.filter(c=>c.color==='castle').map(c=>c.id)).toEqual(['B2','B4','F2','F4']);
  });
  it.each([2,3,4])('%i 人按印刷仓库补货、黑市 2n 块，初始货物/银币/工人正确且守恒',n=>{
    const s=create(n);expect(s.depots.slice(1).map(d=>d.length)).toEqual(Array(6).fill(n));expect(s.depots[0]).toHaveLength(2*n);
    expect(s.players.every(p=>p.goods.length===3&&p.silver===1&&p.estate.filter(Boolean).length===1&&p.score===0)).toBe(true);
    expect(s.roundOrder.map(seat=>s.players[seat].workers)).toEqual(Array.from({length:n},(_,i)=>i+1));
    expect(s.roundGoods).toHaveLength(4);expect(s.goodsDepots.flat()).toHaveLength(1);expect(s.goodsPhases.flat()).toHaveLength(20);expect(s.unusedGoods).toHaveLength(17-3*n);assertBurgundy(s);
  });
  it('拒绝不支持的人数、重复玩家和非原版配置',()=>{
    expect(()=>create(1)).toThrow(/2.*4/);expect(()=>create(5)).toThrow(/2.*4/);
    expect(()=>createBurgundy('x',[roster()[0],roster()[0]],seeded(1),{setup:'classic'})).toThrow(/身份/);
    expect(()=>createBurgundy('x',roster(),seeded(1),{setup:'demo'} as any)).toThrow(/配置|开局/);
  });
  it('进阶先公开选择获配的双面庄园及任意城堡格，选完才揭示 A 阶段供应',()=>{
    let s=create(4,'advanced');expect(s.phase).toBe('setup');expect(s.depots.flat()).toHaveLength(0);expect(s.roundGoods).toEqual([]);
    const seats=[...s.roundOrder];for(const seat of seats){const p=s.players[seat],boardId=p.boardOptions[0],cellId=BOARDS[boardId].cells.find(c=>c.color==='castle')!.id;
      reject(s,{type:'setup',boardId:10,cellId},/庄园/);reject(s,{type:'setup',boardId,cellId:BOARDS[boardId].cells.find(c=>c.color!=='castle')!.id},/城堡/);
      s=applyBurgundy(s,seat,{type:'setup',boardId,cellId});expect(s.players[seat].score).toBe(0);expect(s.players[seat].storage).toEqual([]);expect(s.pending).toBeNull();}
    expect(s.phase).toBe('play');expect(s.round).toBe(1);expect(s.depots.flat()).toHaveLength(32);assertBurgundy(s);
  });
  it('直接指定编号仓库板块；1→6 循环只需一个工人，白骰不能作行动骰',()=>{
    const s=fixture(),id=spare(s,'mine');pluck(s,id);s.depots[6].push(id);s.players[0].dice=[1,2];
    reject(s,{type:'take',die:0,tileId:id},/工人/);reject(s,{type:'take',die:2,tileId:id,workers:10},/骰子/);
    const next=applyBurgundy(s,0,{type:'take',die:0,tileId:id,workers:1});expect(next.players[0].workers).toBe(9);expect(next.players[0].storage).toContain(id);expect(next.players[0].used).toEqual([true,false]);expect(next.whiteDie).toBe(s.whiteDie);
  });
  it('知识 8 与放置减点叠加，但免费 ±1 不会变成 ±2；库存知识不生效',()=>{
    const s=fixture();storage(s,'b-bank-1');s.players[0].dice=[6,2];knowledge(s,8);knowledge(s,9);
    const next=applyBurgundy(s,0,{type:'place',die:0,tileId:'b-bank-1',cellId:'E4',workers:1});expect(next.players[0].workers).toBe(9);expect(next.players[0].silver).toBe(3);
    const t=fixture();storage(t,'b-bank-1');storage(t,'k-9');t.players[0].dice=[2,2];reject(t,{type:'place',die:0,tileId:'b-bank-1',cellId:'E4'},/工人/);
    knowledge(t,8);knowledge(t,9);t.players[0].dice=[1,2];reject(t,{type:'place',die:0,tileId:'b-bank-1',cellId:'E4'},/工人/);
  });
  it('知识 11 不能用于放置其自身；已生效的知识 12 只减拿取动作的点数',()=>{
    const s=fixture();storage(s,'k-11');s.players[0].dice=[2,2];reject(s,{type:'place',die:0,tileId:'k-11',cellId:'C4'},/工人/);
    knowledge(s,12);const id=spare(s,'ship');pluck(s,id);s.depots[3].push(id);const next=applyBurgundy(s,0,{type:'take',die:0,tileId:id});expect(next.players[0].workers).toBe(10);
  });
  it('独立校验空位、邻接、颜色、骰值、持有权和额外控制参数，非法后完整状态不变',()=>{
    const s=fixture();storage(s,'b-bank-1');
    for(const [action,reason] of [
      [{type:'place',die:0,tileId:'b-bank-1',cellId:'G4'},/相邻/],
      [{type:'place',die:0,tileId:'b-bank-1',cellId:'D4'},/占用/],
      [{type:'place',die:0,tileId:'b-bank-1',cellId:'E3'},/颜色/],
      [{type:'place',die:0,tileId:'b-bank-1',cellId:'E4',seat:1},/字段/],
      [{type:'place',die:0,tileId:'b-bank-2',cellId:'E4'},/暂存/],
      [{type:'place',die:0,tileId:'b-bank-1',cellId:'Z9'},/格/],
      [{type:'workers',die:0,workers:-1},/字段|工人/],
    ] as const)reject(s,action,reason);
    reject(s,{type:'workers',die:0},/轮到/,1);
    const next=applyBurgundy(s,0,{type:'place',die:0,tileId:'b-bank-1',cellId:'E4'});expect(next.players[0].estate[index(next,0,'E4')]).toBe('b-bank-1');
    reject(next,{type:'workers',die:0},/已用/);reject(s,{type:'end_turn'},/骰子/);
  });
  it('同城建筑不可重复，另一城市可重复，知识 1 解除同城限制',()=>{
    const s=fixture();placed(s,'b-bank-1','E4');storage(s,'b-bank-2');s.players[0].dice=[1,3];
    reject(s,{type:'place',die:0,tileId:'b-bank-2',cellId:'E5'},/同.*城|重复/);
    const other=applyBurgundy(s,0,{type:'place',die:1,tileId:'b-bank-2',cellId:'C3'});expect(other.players[0].silver).toBe(3);
    knowledge(s,1);const same=applyBurgundy(s,0,{type:'place',die:0,tileId:'b-bank-2',cellId:'E5'});expect(same.players[0].silver).toBe(3);
  });
  it('暂存满时必须先指定丢弃旧板块，不能丢新板块、庄园或对手板块',()=>{
    const s=fixture();for(const id of ['b-bank-1','b-watchtower-1','k-1'])storage(s,id);const id=spare(s,'ship');pluck(s,id);s.depots[3].push(id);
    reject(s,{type:'take',die:0,tileId:id},/暂存.*满|弃/);reject(s,{type:'take',die:0,tileId:id,discardTileId:id},/弃.*暂存|暂存/);
    const next=applyBurgundy(s,0,{type:'take',die:0,tileId:id,discardTileId:'k-1'});expect(next.players[0].storage).toEqual(['b-bank-1','b-watchtower-1',id]);expect(next.removedTiles).toContain('k-1');assertBurgundy(next);
  });
  it('黑市购买花 2 银币、每回合一次且不耗骰；知识 6 允许买编号仓库，不能拿黑市作骰子行动',()=>{
    const s=fixture();s.players[0].silver=1;sync(s);const id=s.depots[0][0];reject(s,{type:'buy',tileId:id},/银币/);s.players[0].silver=5;sync(s);
    reject(s,{type:'take',die:0,tileId:id,workers:10},/黑市|黑色/);
    const next=applyBurgundy(s,0,{type:'buy',tileId:id});expect(next.players[0].silver).toBe(3);expect(next.players[0].used).toEqual([false,false]);reject(next,{type:'buy',tileId:next.depots[0][0]},/一次|已购买/);
    const publicId=s.depots[1][0];reject(s,{type:'buy',tileId:publicId},/知识.*6|黑市/);knowledge(s,6);expect(applyBurgundy(s,0,{type:'buy',tileId:publicId}).players[0].silver).toBe(3);
  });
  it.each([['b-watchtower-1',4,0,0],['b-bank-1',0,2,0],['b-boarding-house-1',0,0,4]] as const)('%s 的即时效果与单格区域奖励同时结算', (id,points,silver,workers)=>{
    const s=fixture();storage(s,id);const next=applyBurgundy(s,0,{type:'place',die:0,tileId:id,cellId:'C3'});expect(next.players[0].score).toBe(11+points);expect(next.players[0].silver).toBe(1+silver);expect(next.players[0].workers).toBe(10+workers);
  });
  it('取工人叠加知识 13/14 得 4 工人+1 银币；客舍不触发这两块知识',()=>{
    const s=fixture();knowledge(s,13);knowledge(s,14);const next=applyBurgundy(s,0,{type:'workers',die:0});expect(next.players[0].workers).toBe(14);expect(next.players[0].silver).toBe(2);
    storage(s,'b-boarding-house-1');const house=applyBurgundy(s,0,{type:'place',die:0,tileId:'b-boarding-house-1',cellId:'C3'});expect(house.players[0].workers).toBe(14);expect(house.players[0].silver).toBe(1);
  });
  it.each([['b-carpenter-1','building'],['b-church-1','mine'],['b-market-1','ship']] as const)('%s 免费拿对应颜色，不能从黑市拿，知识 6 也不改变免费效果', (id,kind)=>{
    let s=fixture();storage(s,id);knowledge(s,6);const target=spare(s,kind);pluck(s,target);s.depots[6].push(target);
    s=applyBurgundy(s,0,{type:'place',die:0,tileId:id,cellId:'C3'});expect(s.pending?.kind).toBe('take');
    reject(s,{type:'take',tileId:s.depots[0][0]},/黑市|编号/);reject(s,{type:'buy',tileId:s.depots[0][0]},/立即|连锁|效果/);
    const next=applyBurgundy(s,0,{type:'take',tileId:target});expect(next.players[0].storage).toContain(target);expect(next.players[0].used).toEqual([true,false]);expect(next.pending).toBeNull();
  });
  it('市政厅→城堡→仓库连锁保留第二颗骰子，市政厅仍检查放置约束，原版不能插入黑市购买',()=>{
    let s=fixture();const castle=spare(s,'castle');storage(s,'b-city-hall-1');storage(s,castle);storage(s,'b-warehouse-1');s.players[0].silver=4;sync(s);
    s=applyBurgundy(s,0,{type:'place',die:0,tileId:'b-city-hall-1',cellId:'C3'});expect(s.pending?.kind).toBe('place');
    reject(s,{type:'place',tileId:castle,cellId:'D3'},/颜色/);reject(s,{type:'end_turn'},/效果|连锁/);
    s=applyBurgundy(s,0,{type:'place',tileId:castle,cellId:'B3'});expect(s.pending?.kind).toBe('castle');reject(s,{type:'buy',tileId:s.depots[0][0]},/效果|连锁|立即/);
    s=applyBurgundy(s,0,{type:'place',tileId:'b-warehouse-1',cellId:'E4'});expect(s.pending?.kind).toBe('sell');const goodsType=GOODS[s.players[0].goods[0]].type;
    const n=s.players[0].goods.filter(g=>GOODS[g].type===goodsType).length;s=applyBurgundy(s,0,{type:'sell',goodsType});expect(s.players[0].soldGoods).toHaveLength(n);expect(s.players[0].used).toEqual([true,false]);expect(s.pending).toBeNull();
  });
  it('货物整堆售出，银币按一次出售计算，知识 3/4 同时生效',()=>{
    const s=fixture(3);s.players[0].dice=[4,1];knowledge(s,3);knowledge(s,4);
    for(const id of [...s.players[0].goods])goodsAt(s,id,s.unusedGoods);for(const id of ['g-4-1','g-4-2','g-4-3'])goodsAt(s,id,s.players[0].goods);
    const next=applyBurgundy(s,0,{type:'sell',die:0,goodsType:4});expect(next.players[0].score).toBe(9);expect(next.players[0].silver).toBe(3);expect(next.players[0].workers).toBe(11);expect(next.players[0].goods).toEqual([]);expect(next.players[0].soldGoods).toHaveLength(3);
    reject(s,{type:'sell',die:0,goodsType:2,workers:10},/货物/);reject(s,{type:'sell',die:0,goodsType:4,count:1},/字段/);
  });
  it('运输取任意仓库且最多三种货物，同色全部收取，放不下的留原仓，不可丢货',()=>{
    let s=fixture();const ship=spare(s,'ship');storage(s,ship);s.players[0].dice=[2,1];for(const id of [...s.players[0].goods])goodsAt(s,id,s.unusedGoods);
    for(const id of ['g-1-1','g-2-1'])goodsAt(s,id,s.players[0].goods);
    s.goodsDepots.forEach(d=>{for(const id of [...d])goodsAt(s,id,s.unusedGoods);});for(const id of ['g-1-2','g-3-1','g-3-2','g-4-1'])goodsAt(s,id,s.goodsDepots[5]);
    s=applyBurgundy(s,0,{type:'place',die:0,tileId:ship,cellId:'D3'});expect(s.pending?.kind).toBe('ship');expect(s.players[0].bridge).toBe(1);
    reject(s,{type:'ship',depots:[6],goodsTypes:[3]},/已有|同色|必须/);reject(s,{type:'ship',depots:[6],goodsTypes:[1,3,4]},/三|3|容量/);
    const next=applyBurgundy(s,0,{type:'ship',depots:[6],goodsTypes:[1,3]});expect(next.players[0].goods.sort()).toEqual(['g-1-1','g-1-2','g-2-1','g-3-1','g-3-2'].sort());expect(next.goodsDepots[5]).toEqual(['g-4-1']);expect(next.pending).toBeNull();assertBurgundy(next);
  });
  it('知识 5 可选两座相邻仓库，6 与 1 相邻，不能取不相邻或三座仓库',()=>{
    let s=fixture();knowledge(s,5);const ship=spare(s,'ship');storage(s,ship);s.players[0].dice=[2,1];s=applyBurgundy(s,0,{type:'place',die:0,tileId:ship,cellId:'D3'});
    reject(s,{type:'ship',depots:[1,3]},/相邻/);reject(s,{type:'ship',depots:[1,2,3]},/两|2|仓库/);
    const next=applyBurgundy(s,0,{type:'ship',depots:[6,1]});expect(next.pending).toBeNull();
  });
  it('知识 10 免费调船和动物，船更新后续顺序，同轮每人仍各行动一次',()=>{
    let s=fixture();knowledge(s,10);const ship=spare(s,'ship');storage(s,ship);s.players[0].dice=[1,1];
    s=applyBurgundy(s,0,{type:'place',die:0,tileId:ship,cellId:'D3'});s=applyBurgundy(s,0,{type:'ship',depots:[1]});s=applyBurgundy(s,0,{type:'workers',die:1});s=applyBurgundy(s,0,{type:'end_turn'});expect(s.turn).toBe(1);expect(s.round).toBe(1);
    for(const die of [0,1])s=applyBurgundy(s,1,{type:'workers',die});s=applyBurgundy(s,1,{type:'end_turn'});expect(s.round).toBe(2);expect(s.turn).toBe(0);expect(s.players[0].workers).toBe(12);
  });
  it('动物在同一完整印刷牧场内重计，无需互相接触；其他牧场和种类不参与，知识 7 按板块加分',()=>{
    const s=fixture();placed(s,'a-cow-4-1','A1');placed(s,'a-cow-3-1','E6');placed(s,'a-pig-3-1','B1');placed(s,'b-bank-1','C3');storage(s,'a-cow-3-2');knowledge(s,7);s.players[0].dice=[4,1];
    const next=applyBurgundy(s,0,{type:'place',die:0,tileId:'a-cow-3-2',cellId:'C2'});expect(next.players[0].score).toBe((4+1)+(3+1));
  });
  it.each([0,1,2,3,4])('阶段 %i 完成三格矿区按区域大小和当期奖励计分，颜色奖励只取一次',phaseIndex=>{
    let s=fixture();s.phaseIndex=phaseIndex;placed(s,'m-1','E3');placed(s,'m-2','F2');storage(s,'m-3');s.players[0].dice=[3,1];
    s=applyBurgundy(s,0,{type:'place',die:0,tileId:'m-3',cellId:'G1'});expect(s.players[0].score).toBe(6+(10-phaseIndex*2)+5);expect(s.players[0].bonuses).toEqual([{color:'mine',rank:1}]);
    expect(s.players[0].completedRegions).toContain(regionFor(BOARDS[1],'G1').id);
  });
  it('同色首位/次位奖励随人数变化，第三名不再获奖',()=>{
    let s=fixture(3);for(let seat=0;seat<3;seat++){
      s.turn=seat;s.turnIndex=seat;const ids=TILE_LIST.filter(t=>t.kind==='mine').slice(seat*3,seat*3+3).map(t=>t.id);placed(s,ids[0],'E3',seat);placed(s,ids[1],'F2',seat);storage(s,ids[2],seat);s.players[seat].dice=[3,1];
      s=applyBurgundy(s,seat,{type:'place',die:0,tileId:ids[2],cellId:'G1'});expect(s.players[seat].score).toBe(16+[6,3,0][seat]);}
    expect(s.players.map(p=>p.bonuses.length)).toEqual([1,1,0]);
  });
  it.each([16,17,18,19,20,21,22,23])('知识 %i 对应正确建筑，每座 4 分，只统计已铺板块',n=>{
    const s=fixture(),building=['warehouse','watchtower','carpenter','church','market','boarding-house','bank','city-hall'][n-16];knowledge(s,n);placed(s,`b-${building}-1`,'C3');placed(s,`b-${building}-2`,'E4');storage(s,`b-${building}-3`);
    expect(finalBonus(s,0).knowledge.find(k=>k.id===n)?.points).toBe(8);
  });
  it('知识 15/24/25/26 的原版终局值是每货物种类3、每动物种类4、每已售货物1、每奖励2',()=>{
    const s=fixture();for(const n of [15,24,25,26])knowledge(s,n);for(const id of ['g-1-1','g-1-2','g-3-1','g-5-1'])goodsAt(s,id,s.players[0].soldGoods);
    placed(s,'a-cow-2-1','A1');placed(s,'a-sheep-2-1','B1');placed(s,'a-pig-2-1','B2');placed(s,'a-cow-3-1','C1');s.players[0].bonuses=[{color:'mine',rank:1},{color:'ship',rank:2}];
    expect(finalBonus(s,0).knowledge).toEqual([{id:15,points:9},{id:24,points:12},{id:25,points:4},{id:26,points:4}]);
  });
  it('E 阶段也先收矿山和知识 2 收入，再结算余货、银币与两工人一分，暂存板块不计分',()=>{
    const s=fixture();s.phaseIndex=4;s.round=5;s.turn=1;s.turnIndex=1;placed(s,'m-1','E3');knowledge(s,2);s.players[0].workers=3;s.players[0].silver=2;storage(s,'b-watchtower-1');s.players.forEach(p=>p.used=[true,true]);sync(s);
    const next=applyBurgundy(s,1,{type:'end_turn'});expect(next.phase).toBe('finished');expect(next.players[0].silver).toBe(3);expect(next.players[0].workers).toBe(4);expect(next.result!.bonuses[0].goods).toBe(3);expect(next.result!.bonuses[0].silver).toBe(3);expect(next.result!.bonuses[0].workers).toBe(2);expect(next.players[0].score).toBe(8);reject(next,{type:'workers',die:0},/结束/);
  });
  it('平分先比较空格较多者，再比较最终桥上顺序较后者，遵循德文原版纠正英译错误',()=>{
    const s=fixture();s.players.forEach(p=>p.score=50);placed(s,'b-watchtower-1','C3');expect(rankPlayers(s)[0]).toBe(1);placed(s,'b-watchtower-2','C3',1);
    s.players[0].bridge=1;s.players[1].bridge=0;expect(rankPlayers(s)[0]).toBe(1);s.players[1].bridge=2;expect(rankPlayers(s)[0]).toBe(0);
  });
  it('工人与银币不限供应数量，不能透支或提交非整数预算',()=>{
    const s=fixture();s.players[0].workers=40;s.players[0].silver=40;sync(s);const next=applyBurgundy(s,0,{type:'workers',die:0});expect(next.players[0].workers).toBe(42);assertBurgundy(next);
    reject(s,{type:'take',die:0,tileId:s.depots[1][0],workers:41},/工人/);reject(s,{type:'take',die:0,tileId:s.depots[1][0],workers:1.5},/整数|工人/);
  });
  it('观察不暴露随机状态、未揭示供应与未来货物；售出明细只给本人且无合法行动清单',()=>{
    const s=fixture();goodsAt(s,'g-6-7',s.players[1].soldGoods);const own=viewBurgundy(s,1),publicView=viewBurgundy(s,null),json=JSON.stringify(publicView);
    for(const field of ['rng','pools','goodsPhases','unusedGoods'])expect(publicView).not.toHaveProperty(field);
    expect(publicView.players[1]).not.toHaveProperty('soldGoods');expect(own.players[1].soldGoods).toContain('g-6-7');expect(publicView.players[1].soldCount).toBe(1);
    expect(json).not.toContain(s.goodsPhases.flat()[0]);expect(publicView).not.toHaveProperty('legalActions');expect(publicView.events.every(e=>!('changes' in e))).toBe(true);
    const run=runOf(s);expect(burgundyModule.observe(run,'p0')).not.toHaveProperty('legalActions');expect(burgundyModule.initializePrompt(run,'p0')).toContain('2011');
  });
  it('同一规则引擎处理真人和 Agent 的自然行动，过期版本与错决策不改变局面',()=>{
    const clock=vi.spyOn(Date.prototype,'toISOString').mockReturnValue('2026-10-28T00:00:00.000Z');
    try {
    const s=fixture(),run=runOf(s),d=burgundyModule.decisions(run)[0],before=structuredClone(s),action={type:'workers',die:0};
    const good=burgundyModule.handleTool(run,{scopeId:s.id,playerId:'p0',decisionId:d.decisionId,tool:'game_act',args:{revision:s.revision,action}} as any);
    expect(good.state).toEqual(burgundyModule.humanAction(run,'p0',action));
    for(const request of [{revision:0,decisionId:d.decisionId},{revision:s.revision,decisionId:'old'}]){const failed=burgundyModule.handleTool(run,{scopeId:s.id,playerId:'p0',decisionId:request.decisionId,tool:'game_act',args:{revision:request.revision,action}} as any);expect(failed.state).toBeUndefined();expect(failed.result.isError).toBe(true);expect(s).toEqual(before);}
    } finally {clock.mockRestore();}
  });
  it.each([2,3,4])('%i 人直接构造全程取工人：严格 25 轮、每人 50 个骰子行动，三人 B/D 特例，公开回放与恢复一致',n=>{
    let s=create(n);const seen=new Set<number>();
    while(s.phase!=='finished'){
      if(!seen.has(s.phaseIndex)){seen.add(s.phaseIndex);if(n===3){const kinds=s.depots[6].map(id=>TILES[id].kind);expect(kinds.filter(k=>k==='mine')).toHaveLength(s.phaseIndex%2?1:0);expect(kinds.filter(k=>k==='castle')).toHaveLength(s.phaseIndex%2?0:1);}}
      const p=s.players[s.turn];s=applyBurgundy(s,s.turn,p.used.every(Boolean)?{type:'end_turn'}:{type:'workers',die:p.used[0]?1:0});assertBurgundy(s);
    }
    expect(s.players.every(p=>p.actionsTaken===50&&p.turnsTaken===25)).toBe(true);expect(s.goodsDepots.flat()).toHaveLength(25);expect(s.goodsPhases.flat()).toEqual([]);expect(s.roundGoods).toEqual([]);expect(seen.size).toBe(5);
    expect(replayBurgundy(s,s.events.length).players.map(p=>p.score)).toEqual(s.players.map(p=>p.score));expect(restoreBurgundy(JSON.parse(JSON.stringify(s)))).toEqual(s);
    const next=createBurgundy('next',[...roster(n).slice(1),{playerId:'new',name:'新玩家',kind:'agent'}],seeded(22),{setup:'classic'},2,s);expect(next.players[0].totalScore).toBe(s.players[1].score);expect(next.players.at(-1)!.totalScore).toBe(0);expect(next.revision).toBe(1);expect(next.events[0].seq).toBe(1);expect(next.result).toBeNull();
  });
  it('恢复拒绝丢失/重复组件及不一致的公开记录，当前局未结束不能开始下一局',()=>{
    const s=create(),bad=structuredClone(s);bad.players[0].storage.push(bad.depots[0][0]);expect(()=>restoreBurgundy(bad)).toThrow();
    const tampered=structuredClone(s);tampered.players[0].silver++;expect(()=>restoreBurgundy(tampered)).toThrow();
    expect(()=>createBurgundy('next',roster(),seeded(1),{setup:'classic'},2,s)).toThrow(/完成|结束/);
  });
  it('随机合法对局补充验证组件、资源账目、连锁时序与固定终局，不代替以上独立案例',()=>{
    for(let seed=1;seed<=9;seed++){
      let s=create(2+seed%3,seed%2?'advanced':'classic',seed),random=seeded(seed+900),steps=0;
      while(s.phase!=='finished'&&steps++<1000){const actions=legalActions(s,s.turn);expect(actions.length).toBeGreaterThan(0);const placements=actions.filter(a=>a.type==='place'),preferred=placements.length?placements:actions.filter(a=>a.type!=='decline');const choices=random()<.7&&preferred.length?preferred:actions;const action=choices[Math.floor(random()*choices.length)];s=applyBurgundy(s,s.turn,action);assertBurgundy(s);}
      expect(s.phase).toBe('finished');expect(s.players.every(p=>p.actionsTaken===50)).toBe(true);expect(s.result?.winners).toHaveLength(1);
    }
  },30000);
});
