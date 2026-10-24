import {describe,expect,it} from 'vitest';
import {COLORS,FLOOR_PENALTIES,adjacentScore,applyAzul,assertAzul,bonuses,createAzul,legalActions,replayAzul,viewAzul,wallColor,type AzulState,type Color} from './engine';
import {azulModule} from './definition';
import type {StoredRun} from '../../runtime/types';

const roster=(n=2)=>Array.from({length:n},(_,i)=>({playerId:`p${i}`,name:`玩家${i+1}`,kind:'agent' as const}));
function seeded(seed:number){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function fixture(n=2){
  const s=createAzul('test',roster(n),seeded(99));s.turn=0;s.roundStarter=0;s.factories=Array.from({length:n*2+1},()=>[]);s.center=[];s.bag=COLORS.flatMap(c=>Array<Color>(20).fill(c));s.discard=[];
  const take=(color:Color,count=1)=>{for(let i=0;i<count;i++){const at=s.bag.indexOf(color);if(at<0)throw new Error('fixture overdraw');s.bag.splice(at,1);}return Array<Color>(count).fill(color);};
  return {s,take,wall:(seat:number,row:number,col:number)=>s.players[seat].wall[row][col]=take(wallColor(row,col))[0]};
}
const draft=(s:AzulState,source:number,color:Color,row:number)=>applyAzul(s,s.turn,{source,color,row});
function runOf(s:AzulState):StoredRun<AzulState>{return {moduleId:'azul',moduleVersion:'1.0.0',stateVersion:1,roomId:'room',runId:s.id,index:s.match,config:{},roster:roster(s.players.length).map(p=>({...p,kind:'codex' as const})),state:s};}

describe('花砖物语原版有色墙',()=>{
  it.each([2,3,4])('%i 人按官方工厂数开局且每色恰好 20 片',n=>{
    const s=createAzul('a',roster(n),seeded(n));expect(s.factories).toHaveLength(n*2+1);expect(s.factories.every(f=>f.length===4)).toBe(true);expect(s.bag).toHaveLength(100-(n*2+1)*4);expect(()=>assertAzul(s)).not.toThrow();
  });
  it('拒绝错误人数与重复身份',()=>{
    expect(()=>createAzul('a',roster(1),seeded(1))).toThrow();expect(()=>createAzul('a',roster(5),seeded(1))).toThrow();expect(()=>createAzul('a',[roster()[0],roster()[0]],seeded(1))).toThrow();
  });
  it('拿走工厂同色全部，余砖入中央，按顺时针轮转且不修改旧状态',()=>{
    const {s,take}=fixture();s.factories[0]=[...take('blue',2),...take('red',2)];const before=structuredClone(s);
    const next=draft(s,1,'blue',3);expect(next.players[0].pattern[2]).toEqual(['blue','blue']);expect(next.center).toEqual(['red','red']);expect(next.factories[0]).toEqual([]);expect(next.turn).toBe(1);expect(s).toEqual(before);
  });
  it('拒绝非当前玩家、空来源、未知颜色、越界行与额外控制参数',()=>{
    const {s,take}=fixture();s.factories[0]=take('blue');
    expect(legalActions(s,1)).toEqual([]);
    for(const [seat,action] of [[1,{source:1,color:'blue',row:1}],[0,{source:0,color:'blue',row:1}],[0,{source:1,color:'green',row:1}],[0,{source:1,color:'blue',row:6}],[0,{source:1,color:'blue',row:1,seat:1}]] as const)expect(()=>applyAzul(s,seat,action)).toThrow();
  });
  it('同组砖只放一条图案行，溢出全部落地，不可拆到另一行',()=>{
    const {s,take}=fixture();s.factories[0]=take('yellow',4);s.factories[1]=take('red');
    const next=draft(s,1,'yellow',2);expect(next.players[0].pattern[1]).toHaveLength(2);expect(next.players[0].floor).toEqual(['yellow','yellow']);expect(next.players[0].pattern[0]).toEqual([]);
  });
  it('已有颜色、满行、墙行同色会限制落点；不同图案行可以同色',()=>{
    const {s,take,wall}=fixture();s.factories[0]=take('blue',2);s.players[0].pattern[1]=take('red');s.players[0].pattern[2]=take('blue',3);wall(0,3,3);
    const rows=legalActions(s,0).map(a=>a.action.row);expect(rows).toContain(1);expect(rows).toContain(5);expect(rows).toContain(0);expect(rows).not.toContain(2);expect(rows).not.toContain(3);expect(rows).not.toContain(4);
    s.players[0].pattern[2].pop();s.bag.push('blue');expect(legalActions(s,0).some(a=>a.action.row===3)).toBe(true);
  });
  it('首取中央先放标记再放溢砖，不能单拿标记',()=>{
    const {s,take}=fixture();s.center=take('blue',2);s.factories[0]=take('red');s.players[0].floor=take('white',5);
    const choice=legalActions(s,0).find(a=>a.action.source===0&&a.action.row===0)!;expect(choice.takesFirst).toBe(true);expect(choice.floorCost).toBe(6);
    const next=draft(s,0,'blue',0);expect(next.players[0].floor).toEqual(['white','white','white','white','white','first','blue']);expect(next.discard).toEqual(['blue']);expect(next.firstOwner).toBe(0);expect(next.markerInCenter).toBe(false);expect(legalActions(next,1).every(a=>!a.takesFirst)).toBe(true);
  });
  it('地板满时把先手标记置旁边，仍取得下轮先手且多余彩砖立即回收',()=>{
    const {s,take}=fixture();s.center=take('blue',2);s.factories[0]=take('red');s.players[0].floor=take('white',7);
    const next=draft(s,0,'blue',0);expect(next.players[0].floor).toHaveLength(7);expect(next.players[0].floor).not.toContain('first');expect(next.firstOwner).toBe(0);expect(next.discard).toEqual(['blue','blue']);expect(()=>assertAzul(next)).not.toThrow();
  });
  it('孤立、单向连续、双向十字按相邻长度计分，不跨空格',()=>{
    const wall=Array.from({length:5},()=>Array<Color|null>(5).fill(null));wall[2][2]='blue';expect(adjacentScore(wall,2,2)).toBe(1);
    wall[2][1]='red';wall[2][3]='white';wall[2][4]='black';expect(adjacentScore(wall,2,2)).toBe(4);
    wall[1][2]='red';wall[3][2]='white';expect(adjacentScore(wall,2,2)).toBe(7);
    wall[2][1]=null;wall[2][0]='blue';expect(adjacentScore(wall,2,2)).toBe(6);
  });
  it('轮末自上而下铺墙，新铺的上方砖参与后续纵向计分',()=>{
    const {s,take}=fixture();s.players[0].pattern[0]=take('blue');s.players[0].pattern[1]=take('white',2);s.factories[0]=take('red');
    const next=draft(s,1,'red',0);expect(next.players[0].wall[0][0]).toBe('blue');expect(next.players[0].wall[1][0]).toBe('white');expect(next.events.filter(e=>e.kind==='wall').map(e=>e.points)).toEqual([1,2]);expect(next.players[0].wallPoints).toBe(3);
  });
  it('未满行跨轮保留，满行多余砖回收，先手标记决定新轮首位',()=>{
    const {s,take}=fixture();s.turn=1;s.center=take('red');s.players[0].pattern[2]=take('yellow',2);s.players[0].pattern[1]=take('blue',2);
    const next=draft(s,0,'red',0);expect(next.round).toBe(2);expect(next.turn).toBe(1);expect(next.roundStarter).toBe(1);expect(next.markerInCenter).toBe(true);expect(next.players[0].pattern[2]).toEqual(['yellow','yellow']);expect(next.players[0].pattern[1]).toEqual([]);expect(next.discard).toContain('blue');expect(next.players[1].floor).toEqual([]);
  });
  it('整轮没人拿中央时由原先手续开；标记单独留中央不阻止结算',()=>{
    const {s,take}=fixture();s.factories[0]=take('red');const next=draft(s,1,'red',1);expect(next.round).toBe(2);expect(next.turn).toBe(0);expect(next.markerInCenter).toBe(true);
  });
  it('地板七格分别扣分，先手也扣分，分数最低零',()=>{
    expect(FLOOR_PENALTIES.reduce((s,n)=>s+n,0)).toBe(14);
    const {s,take}=fixture();s.players[0].score=4;s.players[0].wallPoints=4;s.players[0].floor=take('white',6);s.center=take('red');
    const next=draft(s,0,'red',0);expect(next.players[0].score).toBe(0);expect(next.players[0].floorLoss).toBe(4);expect(next.events.find(e=>e.kind==='floor'&&e.seat===0)?.penalty).toBe(14);
  });
  it('袋空后回收盒洗入补盘，袋盒总量仍不足时保留部分空盘',()=>{
    const {s,take}=fixture(4);for(let seat=0;seat<4;seat++)for(let row=1;row<5;row++)for(let col=0;col<4;col++)s.players[seat].wall[row][col]=take(wallColor(row,col))[0];
    s.discard.push(...s.bag.splice(0));s.center=s.discard.splice(0,1);const next=draft(s,0,s.center[0],1);
    expect(next.round).toBe(2);expect(next.factories.flat().length).toBeLessThan(36);expect(next.bag).toEqual([]);expect(next.discard).toEqual([]);expect(()=>assertAzul(next)).not.toThrow();
  });
  it('横行触发终局仍结算所有玩家，并加横行、竖列、同色奖励',()=>{
    const {s,take,wall}=fixture();for(let col=1;col<5;col++)wall(0,0,col);s.players[0].pattern[0]=take('blue');s.players[1].pattern[1]=take('red',2);s.factories[0]=take('yellow');
    const next=draft(s,1,'yellow',0);expect(next.phase).toBe('finished');expect(next.players[1].wall[1][3]).toBe('red');expect(next.result?.bonuses[0].rows).toBe(1);expect(next.players[0].score).toBe(6);expect(next.events.at(-1)?.kind).toBe('finish');expect(next.result?.winners).toEqual([0]);expect(legalActions(next,0)).toEqual([]);
  });
  it('奖励对完整行列和五色套装分别统计',()=>{
    const {s,take}=fixture();for(let r=0;r<5;r++)for(let c=0;c<5;c++)s.players[0].wall[r][c]=take(wallColor(r,c))[0];expect(bonuses(s.players[0])).toEqual({rows:5,columns:5,colors:5,points:95});
  });
  it('同分先比完整横行数，再相同共享胜利',()=>{
    const {s,take,wall}=fixture();for(let seat=0;seat<2;seat++){for(let col=0;col<5;col++)wall(seat,0,col);s.players[seat].score=10;s.players[seat].wallPoints=10;}
    s.factories[0]=take('red');const next=draft(s,1,'red',4);expect(next.result?.winners).toEqual([0,1]);expect(next.players.map(p=>p.wins)).toEqual([1,1]);
    const f=fixture();for(let seat=0;seat<2;seat++)for(let col=0;col<5;col++)f.wall(seat,0,col);for(let col=0;col<5;col++)f.wall(1,1,col);f.s.players[0].score=12;f.s.players[1].score=10;f.s.factories[0]=f.take('red');
    const broken=draft(f.s,1,'red',4);expect(broken.players.map(p=>p.score)).toEqual([14,14]);expect(broken.result?.winners).toEqual([1]);
  });
  it('下一局按稳定身份继承累计分和胜场，重新入袋全部花砖并允许人数变更',()=>{
    const {s,take,wall}=fixture();for(let col=0;col<5;col++)wall(0,0,col);s.players[0].score=5;s.factories[0]=take('red');const end=draft(s,1,'red',0);
    const next=createAzul('next',[...roster(3)].reverse(),seeded(3),2,end);expect(next.match).toBe(2);expect(next.players[2].playerId).toBe('p0');expect(next.players[2].totalScore).toBe(end.players[0].score);expect(next.players[2].wins).toBe(1);expect(next.players.every(p=>p.score===0&&p.wall.flat().every(c=>c===null))).toBe(true);expect(()=>createAzul('invalid',roster(),seeded(1),2,next)).toThrow();
  });
  it('所有玩家与公开视图可见完整棋盘和事件，但不能读取袋顺序、内部种子或修改状态',()=>{
    const s=createAzul('test',roster(),seeded(1));const publicView=viewAzul(s,null),own=viewAzul(s,s.turn);expect(publicView.players).toEqual(own.players);expect(publicView.events).toEqual(s.events);expect(publicView.legalActions).toEqual([]);expect(own.legalActions.length).toBeGreaterThan(0);
    for(const v of [publicView,own]){expect(v).not.toHaveProperty('bag');expect(v).not.toHaveProperty('rng');expect(JSON.stringify(v.events)).not.toContain('rng');}own.factories[0].pop();expect(s.factories[0]).toHaveLength(4);
  });
  it('游戏决策拒绝过期行动、冒用座位及错误局身份，工具列表跨阶段固定',()=>{
    const s=createAzul('test',roster(),seeded(1)),run=runOf(s),d=azulModule.decisions(run)[0],a=legalActions(s,s.turn)[0];const base={id:'req',scopeId:s.id,playerId:d.actorId,decisionId:d.decisionId,tool:'game_act',args:{revision:s.revision,actionId:a.id}};
    expect(azulModule.handleTool(run,{...base,playerId:run.roster[(s.turn+1)%2].playerId}).result.isError).toBe(true);expect(azulModule.handleTool(run,{...base,decisionId:'old'}).result.isError).toBe(true);expect(azulModule.handleTool(run,{...base,scopeId:'wrong'}).result.isError).toBe(true);
    const result=azulModule.handleTool(run,base);expect(result.state?.revision).toBe(2);expect(azulModule.tools(run,d.actorId)).toEqual(azulModule.tools({...run,state:result.state!},d.actorId));expect(azulModule.handleTool({...run,state:result.state!},base).result.isError).toBe(true);
  });
  it('恢复拒绝缺砖、错墙、超容量、重复标记或旧版本的存档',()=>{
    const s=createAzul('test',roster(),seeded(1));expect(()=>azulModule.restore(s,1)).not.toThrow();expect(()=>azulModule.restore(s,0)).toThrow();
    for(const mutate of [(s:AzulState)=>s.bag.pop(),(s:AzulState)=>s.players[0].wall[0][0]='red',(s:AzulState)=>s.players[0].pattern[0]=['blue','blue'],(s:AzulState)=>s.players[0].floor=['first','first']]){const copy=structuredClone(s);mutate(copy);expect(()=>assertAzul(copy)).toThrow();}
  });
  it('恢复核对完整公开记录，不接受篡改得分或缺失的选砖事件',()=>{
    const initial=createAzul('test',roster(),seeded(13)),s=applyAzul(initial,initial.turn,legalActions(initial,initial.turn)[0].action);
    expect(azulModule.restore(s,1)).toEqual(s);const altered=structuredClone(s);altered.players[0].score++;
    expect(()=>azulModule.restore(altered,1)).toThrow('公开记录');const missing=structuredClone(s);missing.events.pop();expect(()=>azulModule.restore(missing,1)).toThrow('公开记录');
  });
  it('公开事件可以重建每步局面，最终分数与墙面相符且不需要袋顺序',()=>{
    let s=createAzul('replay',roster(),seeded(42));for(let i=0;i<500&&s.phase!=='finished';i++){
      const choices=legalActions(s,s.turn).sort((a,b)=>(b.placed*4-b.overflow*3+(b.action.row===1?5:0))-(a.placed*4-a.overflow*3+(a.action.row===1?5:0)));
      s=applyAzul(s,s.turn,choices[0].action);
    }
    expect(s.phase).toBe('finished');const frame=replayAzul(s,s.events.length);expect(frame.players.map(p=>({score:p.score,wall:p.wall,pattern:p.pattern,floor:p.floor}))).toEqual(s.players.map(p=>({score:p.score,wall:p.wall,pattern:p.pattern,floor:p.floor})));expect(frame.factories).toEqual(s.factories);expect(frame.center).toEqual(s.center);
    expect(azulModule.restore(s,1)).toEqual(s);const altered=structuredClone(s);altered.result!.winners=[1-s.result!.winners[0]];expect(()=>azulModule.restore(altered,1)).toThrow('胜负');
  });
  it('100 局 2–4 人合法行动序列全部结束，每步每色 20 片且分数账本相符',()=>{
    for(let seed=1;seed<=100;seed++){
      const rng=seeded(seed);let s=createAzul(`random-${seed}`,roster(2+seed%3),rng),steps=0;
      while(s.phase!=='finished'&&steps++<1800){
        const all=legalActions(s,s.turn);expect(all.length).toBeGreaterThan(0);
        const productive=all.filter(a=>a.placed>0),pool=rng()<.15||!productive.length?all:productive;
        const action=pool[Math.floor(rng()*pool.length)].action;s=applyAzul(s,s.turn,action);assertAzul(s);
      }
      expect(s.phase).toBe('finished');for(const p of s.players){expect(p.score).toBe(p.wallPoints-p.floorLoss+bonuses(p).points);expect(p.totalScore).toBe(p.score);expect(p.score).toBeGreaterThanOrEqual(0);}
    }
  },30000);
});
