import {describe,expect,it} from 'vitest';
import type {Card} from '@agent-game/core';
import {beats,candidatePlays,classify,windows} from './combinations';
import {applyAction,createGame,getLegalActions,restoreState,returnChoices,tributeChoices,viewGame} from './engine';
import {isWild,makeDeck,strength} from './cards';
import type {GuandanState,Result} from './types';

const roster=Array.from({length:4},(_,i)=>({name:`玩家${i+1}`,playerId:`p${i}`,kind:'agent' as const}));
function rng(seed:number){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};}
const c=(rank:number,suit:Card['suit']=rank>14?'J':'S',copy=0):Card=>({rank,suit,id:`${copy}-${suit}${rank}`});
const hand=(ranks:number[])=>ranks.map((rank,i)=>c(rank,['S','D','C','H'][i%4] as Card['suit'],Math.floor(i/4)));
function rig(hands:Card[][],level=2):GuandanState {
  const state=createGame('table',roster,{random:rng(1)});state.level=level;state.levels=[level,2];state.turn=0;
  state.players.forEach((p,i)=>{p.hand=hands[i]??[c(3+i,'C',1)];});
  const ids=state.players.flatMap(p=>p.hand.map(c=>c.id));
  if(new Set(ids).size!==ids.length)throw new Error('测试手牌重复');
  state.played=makeDeck().filter(c=>!ids.includes(c.id));return state;
}
function play(state:GuandanState,seat:number,cards=state.players[seat].hand,kind?:string){
  const combo=classify(cards,state.level).find(c=>!kind||c.kind===kind);if(!combo)throw new Error('测试出牌没有牌型');
  return applyAction(state,seat,{type:'play',cards:cards.map(c=>c.id),combination:combo.key});
}
function result(order:number[],doubleDown=false,levels:[number,number]=[2,2]):Result {
  const winner=order[0]%2 as 0|1;return {order,doubleDown,winner,advance:doubleDown?3:order.indexOf((order[0]+2)%4)===2?2:1,levelsBefore:levels,levelsAfter:levels,matchWinner:null};
}
function nextWithHands(order:number[],doubleDown:boolean,hands:Card[][]):GuandanState {
  const prev=rig(hands);prev.phase='finished';prev.result=result(order,doubleDown);
  const state=createGame('table',roster,{random:rng(55),previous:prev});
  state.players.forEach((p,i)=>{p.hand=hands[i];});
  const ids=hands.flat().map(c=>c.id);state.played=makeDeck().filter(c=>!ids.includes(c.id));
  // Re-evaluate the deal's anti-tribute against the prepared hands.
  state.tribute!.anti=false;state.phase='tribute';state.turn=state.tribute!.donors[0];state.events=state.events.filter(e=>e.type==='deal');
  return state;
}
const conservation=(s:GuandanState)=>{
  const cards=[...s.played,...s.players.flatMap(p=>p.hand)];expect(cards).toHaveLength(108);expect(new Set(cards.map(c=>c.id)).size).toBe(108);
};

describe('掼蛋牌型与声明',()=>{
  it.each([
    {cards:[c(7)],combination:{kind:'single',rank:7}},
    {cards:[c(7),c(7,'D')],combination:{kind:'pair',rank:7}},
    {cards:[c(7),c(7,'D'),c(2,'H')],combination:{kind:'triple',rank:7}},
    {cards:[c(7),c(7,'D'),c(2,'H'),c(16),c(16,'J',1)],combination:{kind:'full_house',rank:7,pairRank:16}},
    {cards:[c(4),c(5,'D'),c(6),c(7),c(2,'H')],combination:{kind:'straight',rank:8}},
    {cards:hand([14,14,2,2,3,3]),combination:{kind:'pair_run',rank:3}},
    {cards:hand([14,14,14,2,2,2]),combination:{kind:'triple_run',rank:2}},
    {cards:makeDeck().filter(c=>c.rank===8).slice(0,4),combination:{kind:'bomb',rank:8}},
    {cards:[...makeDeck().filter(c=>c.rank===8),c(2,'H'),c(2,'H',1)],combination:{kind:'bomb',rank:8}},
    {cards:[c(3),c(4),c(5),c(2,'H'),c(2,'H',1)],combination:{kind:'straight_flush',rank:7,suit:'S'}},
    {cards:makeDeck().filter(c=>c.rank>=16),combination:{kind:'four_jokers',rank:17}},
  ])('直接提交实体牌与 $combination.kind 声明，保留声明含义并推进回合',({cards,combination})=>{
    const s=rig([[...cards,c(13,'H',1)],[c(9,'D')],[c(10,'C')],[c(11,'D')]]),before=structuredClone(s);
    const next=applyAction(s,0,{type:'play',cards:cards.map(c=>c.id),combination});
    expect(next.lastPlay?.combination).toMatchObject(combination);expect(next.lastPlay?.combination.size).toBe(cards.length);
    expect(next.players[0].hand).toEqual([c(13,'H',1)]);expect(next.turn).toBe(1);conservation(next);expect(s).toEqual(before);
  });
  it('不能把配牌当王或虚报主体、带对、同花；非法声明不消费实体牌',()=>{
    const s=rig([[c(8),c(8,'D'),c(8,'C'),c(16),c(2,'H')],[c(9)],[c(10)],[c(11)]]);
    for(const combination of [{kind:'full_house',rank:8,pairRank:16},{kind:'straight_flush',rank:8,suit:'S'},{kind:'bomb',rank:17}]){
      const before=structuredClone(s);expect(()=>applyAction(s,0,{type:'play',cards:s.players[0].hand.map(c=>c.id),combination})).toThrow('声明');expect(s).toEqual(before);
    }
  });
  it('级牌在单张、对子、三张、三带对和同张数炸弹中高于 A；顺牌不升位',()=>{
    for(const n of [1,2,3,4,5,6]){
      const low=classify(hand(Array(n).fill(14)),7).find(c=>c.kind===(n===1?'single':n===2?'pair':n===3?'triple':'bomb'))!;
      const high=classify(hand(Array(n).fill(7)),7).find(c=>c.kind===low.kind)!;
      expect(beats(high,low,7)).toBe(true);
    }
    expect(beats(classify(hand([3,4,5,6,7]),7).find(c=>c.kind==='straight')!,classify(hand([4,5,6,7,8]),7).find(c=>c.kind==='straight')!,7)).toBe(false);
  });
  it('只允许五张顺子、三连对、二连三，并允许 A 作低位，禁止绕接',()=>{
    for(const [cards,kind] of [
      [[14,2,3,4,5],'straight'],[[10,11,12,13,14],'straight'],[[14,14,2,2,3,3],'pair_run'],[[12,12,13,13,14,14],'pair_run'],[[14,14,14,2,2,2],'triple_run'],[[13,13,13,14,14,14],'triple_run'],
    ] as const)expect(classify(hand([...cards]),9).some(c=>c.kind===kind)).toBe(true);
    for(const cards of [[11,12,13,14,2],[13,13,14,14,2,2],[13,13,13,2,2,2],[3,4,5,6],[3,4,5,6,7,8],[3,3,4,4],[3,3,3,4],[3,3,3,4,5],[3,3,3,4,4,4,5,5]])expect(classify(hand(cards),9)).toEqual([]);
    expect(windows(5)).toHaveLength(10);
  });
  it('逢人配可补普通牌、不同花色的同花顺和九/十张炸弹，不能补王',()=>{
    const w=[c(2,'H'),c(2,'H',1)];
    expect(classify([c(7),...w],2).some(c=>c.kind==='triple'&&c.rank===7)).toBe(true);
    expect(classify([c(16),w[0]],2)).toEqual([]);
    expect(classify([c(16),c(16,'J',1),w[0]],2)).toEqual([]);
    expect(classify([c(3),c(4),c(5),...w],2).some(c=>c.kind==='straight_flush'&&c.suit==='S'&&c.rank===7)).toBe(true);
    const allEights=makeDeck().filter(c=>c.rank===8);
    for(const count of [1,2])expect(classify([...allEights,...w.slice(0,count)],2).some(c=>c.kind==='bomb'&&c.size===8+count)).toBe(true);
    expect(classify([c(2,'H')],2).map(c=>c.rank)).toEqual([2]);
    expect(classify(w,2).map(c=>c.rank)).toEqual([2]);
    expect(classify([c(7,'S'),c(7,'S')],2)).toEqual([]);
  });
  it('大小王对子可作三带对的带对，但不能被配牌替代；三带对仅比较三张',()=>{
    const a=classify([c(8),c(8,'D'),c(8,'C'),c(16,'J'),c(16,'J',1)],2).find(c=>c.kind==='full_house')!;
    const b=classify(hand([7,7,7,14,14]),2).find(c=>c.kind==='full_house')!;
    expect(a).toBeDefined();expect(beats(a,b,2)).toBe(true);
    expect(classify([c(8),c(8,'D'),c(8,'C'),c(16,'J'),c(2,'H')],2)).toEqual([]);
  });
  it('四炸 < 五炸 < 同花顺 < 六至十炸 < 四王炸，王对子不是王炸',()=>{
    const bomb=(n:number)=>classify([...makeDeck().filter(c=>c.rank===8).slice(0,Math.min(n,8)),...makeDeck().filter(c=>isWild(c,2)).slice(0,Math.max(0,n-8))],2).find(c=>c.kind==='bomb')!;
    const flush=classify([3,4,5,6,7].map(r=>c(r)),2).find(c=>c.kind==='straight_flush')!;
    const royal=classify(makeDeck().filter(c=>c.rank>=16),2)[0];
    const order=[bomb(4),bomb(5),flush,...[6,7,8,9,10].map(bomb),royal];
    order.forEach((entry,i)=>{for(let j=0;j<i;j++){expect(beats(entry,order[j],2)).toBe(true);expect(beats(order[j],entry,2)).toBe(false);}expect(beats(entry,entry,2)).toBe(false);});
    expect(classify([c(16,'J'),c(17,'J')],2)).toEqual([]);
  });
  it('同一组逢人配牌可有多个合法声明，明确的声明决定大小',()=>{
    const combos=classify([c(4),c(5,'D'),c(6,'C'),c(7),c(2,'H')],2).filter(c=>c.kind==='straight');
    expect(combos.map(c=>c.rank)).toEqual([7,8]);
    const state=rig([[c(4),c(5,'D'),c(6,'C'),c(7),c(2,'H'),c(10)],[c(3,'C')],[c(8,'D')],[c(9,'C')]]);
    const next=applyAction(state,0,{type:'play',cards:state.players[0].hand.slice(0,5).map(c=>c.id),combination:combos[0].key});
    expect(next.lastPlay?.combination.rank).toBe(7);
    const fullHouses=classify([c(12),c(12,'D'),c(12,'C'),c(2,'H'),c(2,'H',1)],2).filter(c=>c.kind==='full_house');
    expect(fullHouses.length).toBeGreaterThan(1);expect(new Set(fullHouses.map(c=>c.key)).size).toBe(fullHouses.length);
    expect(fullHouses.some(c=>c.pairRank===3)).toBe(true);
  });
  it('代表行动涵盖每种可组成的牌型和配牌用量，且每个声明都能被引擎认可',()=>{
    const cards=[c(4),c(4,'D'),c(5),c(5,'D'),c(6),c(2,'H'),c(2,'H',1)];
    const legal=candidatePlays(cards,2,null),actual=new Set(legal.map(p=>p.combination.key));
    const possible=new Set<string>();
    for(let mask=1;mask<2**cards.length;mask++)classify(cards.filter((_,i)=>mask&(1<<i)),2).forEach(c=>possible.add(c.key));
    expect([...actual].sort()).toEqual([...possible].sort());
    legal.forEach(p=>expect(classify(p.cards,2).map(c=>c.key)).toContain(p.combination.key));
  });
});

describe('掼蛋轮转、接风与名次',()=>{
  it('发 108 张且每人 27；非法行动不修改状态，领出不能过牌',()=>{
    const state=createGame('room',roster,{random:rng(21)});state.turn=0;const before=structuredClone(state);
    expect(state.players.map(p=>p.hand.length)).toEqual([27,27,27,27]);conservation(state);
    expect(()=>applyAction(state,1,{type:'pass'})).toThrow('轮到');
    expect(()=>applyAction(state,0,{type:'pass'})).toThrow('领出');
    expect(()=>applyAction(state,0,{type:'play',cards:['fake'],combination:'single:3:1'})).toThrow('不在');
    expect(state).toEqual(before);
  });
  it('不出者在后续有人压牌后可以重新跟牌',()=>{
    let state=rig([[c(3),c(10)],[c(4)],[c(5),c(11)],[c(6)]]);
    state=play(state,0,[c(3)]);state=applyAction(state,1,{type:'pass'});state=play(state,2,[c(5)]);state=applyAction(state,3,{type:'pass'});state=applyAction(state,0,{type:'pass'});
    expect(state.turn).toBe(1);expect(getLegalActions(state,1).some(a=>a.id==='pass')).toBe(true);
  });
  it('无法压牌时只能不出，非法压牌、重复牌和错误声明均不消费手牌',()=>{
    let state=rig([[c(14),c(13)],[c(3)],[c(4)],[c(5)]]);state=play(state,0,[c(14)]);
    const before=structuredClone(state);expect(getLegalActions(state,1).map(a=>a.id)).toEqual(['pass']);
    expect(()=>applyAction(state,1,{type:'play',cards:[c(3).id],combination:'single:3:1'})).toThrow('更大');
    expect(()=>applyAction(state,1,{type:'play',cards:[c(3).id,c(3).id],combination:'pair:3:2'})).toThrow();
    expect(()=>applyAction(state,1,{type:'play',cards:[c(3).id],combination:'single:17:1'})).toThrow('声明');
    expect(state).toEqual(before);
  });
  it('出完最后一手后，全部仍有牌的玩家均可跟；全过后对家接风',()=>{
    let state=rig([[c(14)],[c(3),c(4)],[c(5),c(6)],[c(7),c(8)]]);
    state=play(state,0);expect(state.finishOrder).toEqual([0]);expect(state.turn).toBe(1);
    for(const seat of [1,2]){state=applyAction(state,seat,{type:'pass'});expect(state.lastPlay).not.toBeNull();}
    state=applyAction(state,3,{type:'pass'});expect(state.turn).toBe(2);expect(state.lastPlay).toBeNull();expect(state.events.at(-1)?.type).toBe('wind');
  });
  it('有人接住已出完者最后一手后，牌权属于接牌者',()=>{
    let state=rig([[c(3)],[c(4),c(10)],[c(5),c(11)],[c(6),c(12)]]);
    state=play(state,0);state=play(state,1,[c(4)]);state=applyAction(state,2,{type:'pass'});state=applyAction(state,3,{type:'pass'});
    expect(state.turn).toBe(1);expect(state.lastPlay).toBeNull();
  });
  it.each([[0,2,1,3,3],[0,1,2,3,2],[0,1,3,2,1]])('按游数升级 %j',(...orderAndAdvance)=>{
    const [a,b,d,e,advance]=orderAndAdvance;let state=rig([[c(3)],[c(4)],[c(5)],[c(6)]]);
    // Prepare the public prior ranks; play the final ranked player's legal last card.
    state.finishOrder=[a,b];if(b%2===a%2){state.finishOrder=[a];state.turn=b;state.players[a].hand=[];state.players[b].hand=[c(5)];}
    else{state.turn=d;state.players[a].hand=[];state.players[b].hand=[];}
    state=play(state,state.turn);
    expect(state.phase).toBe('finished');expect(state.result?.advance).toBe(advance);expect(state.result?.winner).toBe(0);
    expect(state.result?.doubleDown).toBe(advance===3);expect(state.result?.order.indexOf(e)).toBeGreaterThan(1);
  });
  it('升级停在 A；必须自己打 A 且搭档非末游才能过 A',()=>{
    const close=(level:number,levelTeam:0|1,partnerLast:boolean)=>{
      let state=rig([[c(3)],[c(4)],[c(5)],[c(6)]],level);state.levelTeam=levelTeam;state.levels=[14,level];state.level=level;
      state.finishOrder=partnerLast?[0,1]:[0,1];const actor=partnerLast?3:2;state.turn=actor;state.players[0].hand=[];state.players[1].hand=[];
      return play(state,actor);
    };
    expect(close(13,1,false).result?.matchWinner).toBeNull();
    expect(close(14,0,true).result?.matchWinner).toBeNull();
    const passed=close(14,0,false);expect(passed.result?.matchWinner).toBe(0);expect(passed.matchWins).toEqual([1,0]);
    const next=createGame('table',roster,{random:rng(3),round:2,previous:passed});expect(next.levels).toEqual([2,2]);expect(next.matchNumber).toBe(2);expect(next.matchWins).toEqual([1,0]);expect(next.tribute).toBeNull();
  });
  it('一盘内按稳定玩家身份固定座位，下一副继承级数',()=>{
    const previous=createGame('room',roster,{random:rng(1)});previous.phase='finished';previous.result={...result([1,0,3,2]),levelsAfter:[2,4]};
    const next=createGame('room',roster,{random:rng(2),previous});expect(next.level).toBe(4);expect(next.levelTeam).toBe(1);
    expect(()=>createGame('room',[roster[1],roster[0],roster[2],roster[3]],{random:rng(2),previous})).toThrow('座位');
  });
});

describe('掼蛋贡还牌与抗贡',()=>{
  it('贡还阶段的越轮、错误阶段、非最大贡和非法还牌都不部分交换',()=>{
    const s=nextWithHands([0,1,2,3],false,[[c(4),c(11)],[c(5)],[c(6)],[c(2,'H'),c(2),c(14)]]);
    for(const [seat,action] of [[0,{type:'tribute',card:c(4).id}],[3,{type:'return',card:c(14).id}],[3,{type:'tribute',card:c(14).id}],[3,{type:'tribute',card:c(2,'H').id}]] as const){
      const before=structuredClone(s);expect(()=>applyAction(s,seat,action)).toThrow();expect(s).toEqual(before);
    }
    const returned=applyAction(s,3,{type:'tribute',card:c(2).id});
    for(const action of [{type:'return',card:c(2).id},{type:'return',card:c(11).id},{type:'return',card:c(5).id},{type:'pass'}]){
      const before=structuredClone(returned);expect(()=>applyAction(returned,0,action)).toThrow();expect(returned).toEqual(before);
    }
  });
  it('贡最大且不贡逢人配，级牌高于 A；不合规贡还被拒绝',()=>{
    let state=nextWithHands([0,1,2,3],false,[[c(4),c(11)],[c(5)],[c(6)],[c(2,'H'),c(2),c(14)]]);
    expect(tributeChoices(state,3).map(c=>c.id)).toEqual([c(2).id]);
    expect(()=>applyAction(state,3,{type:'tribute',card:c(2,'H').id})).toThrow('进贡');
    state=applyAction(state,3,{type:'tribute',card:c(2).id});expect(state.phase).toBe('return');expect(state.players[0].hand).toContainEqual(c(2));
    expect(()=>applyAction(state,0,{type:'return',card:c(11).id})).toThrow('还牌');
    state=applyAction(state,0,{type:'return',card:c(4).id});expect(state.phase).toBe('playing');expect(state.turn).toBe(3);expect(state.players[3].hand).toContainEqual(c(4));conservation(state);
  });
  it('双贡按大小分给头/二游，同点按头游下家；贡大牌者/同点下家先出',()=>{
    for(const tied of [false,true]){
      let state=nextWithHands([0,2,1,3],true,[[c(4),c(11)],[c(14)],[c(5),c(12)],[tied?c(14,'D'):c(13)]]);
      state=applyAction(state,1,{type:'tribute',card:c(14).id});expect(state.phase).toBe('tribute');
      state=applyAction(state,3,{type:'tribute',card:state.players[3].hand[0].id});expect(state.tribute?.exchanges.map(e=>[e.from,e.to])).toEqual([[1,0],[3,2]]);
      state=applyAction(state,0,{type:'return',card:c(4).id});state=applyAction(state,2,{type:'return',card:c(5).id});expect(state.turn).toBe(1);conservation(state);
    }
  });
  it('单贡只看下游本人双大王，双贡看两人合计双大王，并公开亮王',()=>{
    function fixedDeal(seed:number){return createGame('r',roster,{random:rng(seed)});}
    const previous=fixedDeal(1);previous.phase='finished';previous.result=result([0,1,2,3]);
    // Find reproducible real shuffled deals with each king ownership pattern.
    let singleAnti=0,singleSplit=0,doubleAnti=0;
    for(let seed=1;seed<500;seed++){
      const deal=fixedDeal(seed),kings=deal.players.map(p=>p.hand.filter(c=>c.rank===17).length);
      if(!singleAnti&&kings[3]===2){singleAnti=seed;const s=createGame('r',roster,{random:rng(seed),previous});expect(s.tribute?.anti).toBe(true);expect(s.turn).toBe(0);expect(s.events.filter(e=>e.type==='anti').flatMap(e=>e.cards??[])).toHaveLength(2);}
      if(!singleSplit&&kings[3]===1&&kings[1]===1){singleSplit=seed;expect(createGame('r',roster,{random:rng(seed),previous}).phase).toBe('tribute');}
      if(!doubleAnti&&kings[3]===1&&kings[1]===1){doubleAnti=seed;const p=structuredClone(previous);p.result=result([0,2,1,3],true);expect(createGame('r',roster,{random:rng(seed),previous:p}).tribute?.anti).toBe(true);}
      if(singleAnti&&singleSplit&&doubleAnti)break;
    }
    expect(singleAnti*singleSplit*doubleAnti).toBeGreaterThan(0);
  });
  it('没有非级 10 以下牌时须还最小牌，正常时不能还级牌',()=>{
    let state=rig([[c(11),c(12),c(2),c(2,'H')]],2);expect(returnChoices(state,0)).toEqual([c(11)]);
    state=rig([[c(7),c(8),c(2),c(2,'H')]],2);expect(returnChoices(state,0).map(c=>c.rank)).toEqual([7,8]);
  });
});

describe('掼蛋信息范围、存档与连续合法对局',()=>{
  it('观察只含自己私牌和公开信息，观战揭牌不会改变 Agent 观察',()=>{
    const state=createGame('r',roster,{random:rng(8)}),own=viewGame(state,0),publicView=viewGame(state,null);
    expect(own.players[0].hand).toHaveLength(27);expect(own.players.slice(1).every(p=>!('hand'in p)&&p.knownCards.length===0)).toBe(true);
    expect(publicView.players.every(p=>!('hand'in p))).toBe(true);expect(publicView.legalActions).toEqual([]);expect('played'in publicView).toBe(false);
    expect(viewGame(state,null,true).players.every(p=>p.hand?.length===27)).toBe(true);expect(viewGame(state,0)).toEqual(own);
    expect(publicView.events.flatMap(e=>e.cards??[])).toEqual([]);
  });
  it('贡还牌公开且只在仍持有时列入已知手牌，不暴露其他私牌',()=>{
    let state=nextWithHands([0,1,2,3],false,[[c(4),c(11)],[c(5)],[c(6)],[c(14),c(12)]]);
    state=applyAction(state,3,{type:'tribute',card:c(14).id});state=applyAction(state,0,{type:'return',card:c(4).id});
    const view=viewGame(state,1);expect(view.players[0].knownCards).toEqual([c(14)]);expect(view.players[3].knownCards).toEqual([c(4)]);expect(view.players[0].hand).toBeUndefined();
    state=play(state,3,[c(4)]);expect(viewGame(state,null).players[3].knownCards).toEqual([]);
  });
  it('拒绝旧版本、重复或丢失牌、越界级数及错误牌面',()=>{
    const state=createGame('r',roster,{random:rng(9)});expect(restoreState(state,1)).toEqual(state);
    expect(()=>restoreState(state,0)).toThrow();
    const duplicate=structuredClone(state);duplicate.players[0].hand[0]=duplicate.players[0].hand[1];expect(()=>restoreState(duplicate,1)).toThrow();
    const invalid=structuredClone(state);invalid.players[0].hand[0].rank=99;expect(()=>restoreState(invalid,1)).toThrow();
    expect(()=>restoreState({...state,level:15},1)).toThrow();
  });
  it('拒绝伪造当前牌型或损坏的贡还结构，正常出牌可恢复',()=>{
    const state=createGame('r',roster,{random:rng(9)});state.turn=0;
    const single=getLegalActions(state,0).find(a=>a.combination?.kind==='single')!;
    const played=applyAction(state,0,single.action);expect(restoreState(played,1)).toEqual(played);
    const forged=structuredClone(played);forged.lastPlay!.combination.rank=17;expect(()=>restoreState(forged,1)).toThrow();
    expect(()=>restoreState({...state,tribute:{donors:[],receivers:[],offers:[],exchanges:[],leader:0,anti:false}},1)).toThrow();
  });
  it('60 副连续随机合法对局均结束、升级正确、108 张牌守恒、公开事件完整',()=>{
    const random=rng(20261025);let previous:GuandanState|undefined;
    for(let round=1;round<=60;round++){
      let state=createGame('r',roster,{random,previous,round}),steps=0;
      while(state.phase!=='finished'){
        conservation(state);const actions=getLegalActions(state,state.turn);expect(actions.length).toBeGreaterThan(0);
        const plays=actions.filter(a=>a.action.type!=='pass');
        const pool=state.lastPlay&&random()<.28?actions:plays.length?plays:actions;
        const action=pool[Math.floor(random()*pool.length)];const old=state;state=applyAction(state,state.turn,action.action);
        expect(old.revision+1).toBe(state.revision);expect(state.events.map(e=>e.seq)).toEqual(state.events.map((_,i)=>i+1));
        expect(++steps).toBeLessThan(700);
      }
      conservation(state);expect(state.result?.order).toHaveLength(4);expect(new Set(state.result?.order).size).toBe(4);
      expect(state.result?.winner).toBe(state.finishOrder[0]%2);expect(state.events.at(-1)?.type).toBe('finish');expect(restoreState(state,1)).toEqual(state);
      previous=state;
    }
  },30000);
});
