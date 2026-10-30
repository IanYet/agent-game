import { describe, expect, it } from 'vitest';
import { applyHoldemAction as act, assertHoldemChips, compareRanks, createHoldem, createPokerDeck, evaluateHoldem, getHoldemLegalActions, holdemBetting, nextHoldemHand, viewHoldem, type HoldemState } from './engine';
import type { Card, PlayerConfig } from '@agent-game/core';
import {holdemModule} from './definition';

const players = (n: number): PlayerConfig[] => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, kind: 'agent' }));
const cards = (ids: string[]) => ids.map(id => ({ id, suit: id[0] as Card['suit'], rank: Number(id.slice(1)) }));
function seeded(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; }; }
function runOut(state: HoldemState) {
  for (let i = 0; state.phase !== 'finished' && i < 200; i++) {
    const actions = getHoldemLegalActions(state, state.turn);
    state = act(state, state.turn, (actions.find(a => a.id === 'check') ?? actions.find(a => a.id === 'call') ?? actions[0]).action);
  }
  expect(state.phase).toBe('finished'); return state;
}
function riverFixture() {
  const s = createHoldem('fixture', players(3), { initialChips: 10, smallBlind: 1, bigBlind: 2 });
  s.phase = 'river'; s.board = cards(['S10', 'S11', 'S12', 'S13', 'S14']); s.currentBet = 0; s.turn = 1;
  s.players.forEach((p, i) => { p.hand = cards([`H${i + 2}`, `D${i + 2}`]); p.chips = 5; p.committed = 5; p.streetBet = 0; p.allIn = false; p.actedAtBet = null; });
  return s;
}

describe('德州扑克牌力', () => {
  it.each([
    [['S14','S13','S12','S11','S10'], 8], [['S14','H14','C14','D14','H2'], 7], [['S14','H14','C14','D2','H2'], 6],
    [['S14','S12','S9','S4','S2'], 5], [['S14','H2','C3','D4','H5'], 4], [['S14','H14','C14','D4','H5'], 3],
    [['S14','H14','C3','D3','H5'], 2], [['S14','H14','C3','D4','H5'], 1], [['S14','H10','C3','D4','H5'], 0],
  ])('识别 %j 为类别 %s', (ids, category) => expect(evaluateHoldem(cards(ids as string[])).category).toBe(category));
  it('正确处理 A2345、两组三条组成葫芦、踢脚和公共牌平手', () => {
    const rank = (ids: string[]) => evaluateHoldem(cards(ids));
    expect(compareRanks(rank(['S14','H2','C3','D4','H5']), rank(['S2','H3','C4','D5','H6']))).toBeLessThan(0);
    expect(rank(['S14','H14','C14','S13','H13','C13','D2']).values).toEqual([14,13]);
    expect(compareRanks(rank(['S14','H14','C13','D12','H9']), rank(['C14','D14','S13','H12','C8']))).toBeGreaterThan(0);
    expect(compareRanks(rank(['S14','S13','S12','S11','S10','H2','D3']), rank(['S14','S13','S12','S11','S10','H8','D9']))).toBe(0);
  });
});

describe('无限注流程、底池与隔离', () => {
  it('自行决定未列为快捷选项的加注额，仍准确扣款并经跟注、弃牌、过牌进入翻牌',()=>{
    const initial=createHoldem('direct',players(3),{random:seeded(1)}),before=structuredClone(initial);
    let s=act(initial,0,{type:'raise',amount:37});
    expect(s.players[0]).toMatchObject({chips:963,streetBet:37,committed:37});expect(s.lastFullRaise).toBe(27);
    s=act(s,1,{type:'call'});expect(s.players[1].streetBet).toBe(37);
    s=act(s,2,{type:'fold'});expect(s.phase).toBe('flop');expect(s.turn).toBe(1);
    s=act(s,1,{type:'check'});expect(s.turn).toBe(0);assertHoldemChips(s);expect(initial).toEqual(before);
  });
  it('拒绝非法下注时，筹码、底池、加注权、牌库和历史全部保持原状',()=>{
    const initial=createHoldem('invalid',players(3),{random:seeded(1)});
    const checked=act(act(initial,0,{type:'call'}),1,{type:'call'});
    const cases:Array<[HoldemState,number,Parameters<typeof act>[2]]>=[
      [initial,1,{type:'call'}],[initial,0,{type:'check'}],
      ...[0,10,19,20.5,1001,NaN,Infinity].map(amount=>[initial,0,{type:'raise',amount}] as [HoldemState,number,Parameters<typeof act>[2]]),
      [checked,2,{type:'call'}],
    ];
    for(const [s,seat,action] of cases){const before=structuredClone(s);expect(()=>act(s,seat,action)).toThrow();expect(s).toEqual(before);assertHoldemChips(s);}
  });
  it('Agent 可读取本手完整下注与公共牌记录，隐藏暗牌且下一手重置记录', () => {
    const meta={moduleId:'holdem',moduleVersion:'1.0.0',stateVersion:1,roomId:'history-room',runId:'history-run',index:1,config:{initialChips:1000,smallBlind:5,bigBlind:10},roster:Array.from({length:9},(_,i)=>({playerId:`p${i}`,name:`P${i}`,kind:'codex' as const}))};
    const run={...meta,state:holdemModule.create(meta,seeded(5))};
    run.state=act(run.state,run.state.turn,{type:'raise',amount:20});
    run.state=act(run.state,run.state.turn,{type:'fold'});
    while(run.state.events.length<=35){
      const actions=getHoldemLegalActions(run.state,run.state.turn),choice=actions.find(a=>a.id==='check')??actions.find(a=>a.id==='call');
      run.state=act(run.state,run.state.turn,choice!.action);
    }
    expect(run.state.phase).toBe('river');
    const expected=structuredClone(run.state.events);
    expect(expected.length).toBeGreaterThan(35);
    expect(expected.map(e=>e.seq)).toEqual(Array.from({length:expected.length},(_,i)=>i+1));
    expect(new Set(expected.map(e=>e.type))).toEqual(new Set(['deal','blind','raise','call','fold','street','check']));
    expect(expected.flatMap(e=>e.cards??[])).toEqual(run.state.board);
    for(const player of run.roster){
      const view=holdemModule.handleTool(run,{id:'history',scopeId:run.runId,playerId:player.playerId,tool:'game_get_state',args:{}}).result.structuredContent as any;
      expect(view.events).toEqual(expected);
      expect(view.players.filter((p:any)=>p.hand).map((p:any)=>p.playerId)).toEqual([player.playerId]);
      expect('deck' in view).toBe(false);expect('burned' in view).toBe(false);
      expect(JSON.parse(holdemModule.decisionPrompt(run,{decisionId:'view',actorId:player.playerId}).split('当前观察：')[1]).events).toEqual(expected);
    }
    const decision=holdemModule.decisions(run)[0];
    expect(JSON.parse(holdemModule.decisionPrompt(run,decision).split('当前观察：')[1]).events).toEqual(expected);
    run.state=runOut(run.state);
    const nextMeta={...meta,runId:'history-run-2',index:2},next={...nextMeta,state:holdemModule.next(run,nextMeta,seeded(6))};
    const nextView=holdemModule.handleTool(next,{id:'new-history',scopeId:next.runId,playerId:'p1',tool:'game_get_state',args:{}}).result.structuredContent as any;
    expect(nextView.round).toBe(2);expect(nextView.events.map((e:any)=>e.type)).toEqual(['deal','blind','blind']);
    expect(nextView.events.map((e:any)=>e.seq)).toEqual([1,2,3]);
  });
  it('观战翻开全部底牌，但不披露牌库、烧牌或改变 Agent 的私有信息', () => {
    const meta={moduleId:'holdem',moduleVersion:'1.0.0',stateVersion:1,roomId:'room',runId:'run',index:1,config:{initialChips:100,smallBlind:1,bigBlind:2},roster:Array.from({length:3},(_,i)=>({playerId:`p${i}`,name:`P${i}`,kind:'codex' as const}))};
    const run={...meta,state:holdemModule.create(meta,seeded(1))},before=structuredClone(run.state);
    const table=holdemModule.tableView(run,null,{revealHands:true});
    expect(table.players.map((p:any)=>p.hand)).toEqual(run.state.players.map(p=>p.hand));
    expect('deck' in table).toBe(false);expect('burned' in table).toBe(false);expect(table.legalActions).toEqual([]);expect(table.betting).toBe(null);
    for(const player of run.roster){
      expect(holdemModule.observe(run,player.playerId).players.filter((p:any)=>p.hand).map((p:any)=>p.playerId)).toEqual([player.playerId]);
      expect(JSON.parse(holdemModule.decisionPrompt(run,{decisionId:'view',actorId:player.playerId}).split('当前观察：')[1]).players.filter((p:any)=>p.hand).map((p:any)=>p.playerId)).toEqual([player.playerId]);
      const result=holdemModule.handleTool(run,{id:'read',scopeId:'run',playerId:player.playerId,tool:'game_get_state',args:{}}).result.structuredContent as any;
      expect(result.players.filter((p:any)=>p.hand).map((p:any)=>p.playerId)).toEqual([player.playerId]);
    }
    expect(run.state).toEqual(before);
  });
  it('结算可显式翻开弃牌者和未摊牌赢家，关闭时维持正常摊牌范围', () => {
    let folded=createHoldem('folded',players(3));folded=act(folded,0,{type:'fold'});folded=act(folded,1,{type:'fold'});
    expect(viewHoldem(folded,null).players.every(p=>!p.hand)).toBe(true);
    expect(viewHoldem(folded,null,true).players.map(p=>p.hand)).toEqual(folded.players.map(p=>p.hand));
    let showdown=riverFixture();showdown.players[0].folded=true;showdown=act(showdown,1,{type:'check'});showdown=act(showdown,2,{type:'check'});
    expect(viewHoldem(showdown,null,true).players.map(p=>p.hand)).toEqual(showdown.players.map(p=>p.hand));
    expect(viewHoldem(showdown,null).players.filter(p=>p.hand).map(p=>p.seat)).toEqual([1,2]);
  });
  it('2–9 人动态发牌，标准52张不重复；单挑按钮规则与多人不同', () => {
    for (let n = 2; n <= 9; n++) {
      const s = createHoldem('table', players(n));
      expect(new Set([...s.players.flatMap(p => p.hand), ...s.deck].map(c => c.id)).size).toBe(52);
      expect(s.players.every(p => p.hand.length === 2)).toBe(true);
      expect([s.smallBlindSeat, s.bigBlindSeat, s.turn]).toEqual(n === 2 ? [0,1,0] : [1,2,3 % n]);
      assertHoldemChips(s);
    }
    expect(() => createHoldem('x', players(10))).toThrow('2–9');
    expect(() => createHoldem('x', [{name:'A',kind:'human'},{name:'B',kind:'human'}])).toThrow('最多');
  });
  it('翻牌前大盲有过牌/加注机会；单挑翻牌后大盲先行动', () => {
    let s = createHoldem('x', players(2)); s = act(s, 0, {type:'call'});
    expect(s.phase).toBe('preflop'); expect(s.turn).toBe(1); s = act(s, 1, {type:'check'});
    expect(s.phase).toBe('flop'); expect(s.turn).toBe(1); expect(s.board).toHaveLength(3); expect(s.burned).toHaveLength(1);
    s = runOut(s); expect(s.board).toHaveLength(5); expect(s.burned).toHaveLength(3);
    expect(new Set([...s.board, ...s.burned, ...s.deck, ...s.players.flatMap(p => p.hand)].map(c=>c.id)).size).toBe(52);
  });
  it('不足额盲注仍保留大盲基准；全下时自动发完并退回超额', () => {
    let s = createHoldem('x', players(3), {chips:[100,100,3]});
    expect(holdemBetting(s,0)?.toCall).toBe(10); s = act(s,0,{type:'call'}); s=act(s,1,{type:'fold'});
    expect(s.phase).toBe('finished'); expect(s.board).toHaveLength(5);
    expect(s.events.some(e=>e.type==='return' && e.text.includes('5'))).toBe(true); assertHoldemChips(s);
    expect(createHoldem('x', players(2), {chips:[3,2]}).phase).toBe('finished');
    const short=createHoldem('short',players(2),{smallBlind:1,bigBlind:10,chips:[100,3]});
    expect(holdemBetting(short,0)).toMatchObject({toCall:2,canRaise:false});
  });
  it('任意合法整数加注、最小再加注、不足额全下不重开加注权', () => {
    let s = createHoldem('x', players(3), {chips:[1000,25,1000]});
    const before = structuredClone(s);
    expect(()=>act(s,0,{type:'raise',amount:19})).toThrow();
    s = act(s,0,{type:'raise',amount:20}); expect(holdemBetting(s,1)?.minRaiseTo).toBe(30);
    s = act(s,1,{type:'raise',amount:25}); s = act(s,2,{type:'call'});
    expect(holdemBetting(s,0)).toMatchObject({toCall:5,canRaise:false});
    expect(()=>act(s,0,{type:'raise',amount:40})).toThrow('未重开');
    expect(before.players[0].chips).toBe(1000);
    s = act(s,0,{type:'call'}); expect(s.phase).toBe('flop');
  });
  it('多次不足额全下累计达到完整加注幅度时重开加注权', () => {
    let s = createHoldem('x', players(4), {chips:[25,30,1000,1000]});
    s = act(s,3,{type:'raise',amount:20}); s = act(s,0,{type:'raise',amount:25}); s = act(s,1,{type:'raise',amount:30}); s = act(s,2,{type:'call'});
    expect(holdemBetting(s,3)).toMatchObject({toCall:10,canRaise:true,minRaiseTo:40});
  });
  it('不足额开注不能补全，已过牌玩家须面对完整下注才重开；不对单独全下对手额外加注', () => {
    let s = createHoldem('x', players(3), {chips:[1000,1000,15]});
    s=act(s,0,{type:'call'}); s=act(s,1,{type:'call'}); s=act(s,2,{type:'check'});
    s=act(s,1,{type:'check'}); s=act(s,2,{type:'raise',amount:5});
    expect(holdemBetting(s,0)).toMatchObject({canRaise:true,minRaiseTo:15});
    const called=act(s,0,{type:'call'}); expect(holdemBetting(called,1)?.canRaise).toBe(false);
    s=act(s,0,{type:'raise',amount:15}); expect(holdemBetting(s,1)).toMatchObject({canRaise:true,minRaiseTo:25});
    let h=createHoldem('h',players(2),{chips:[1000,20]}); h=act(h,0,{type:'raise',amount:30}); h=act(h,1,{type:'call'});
    expect(h.phase).toBe('finished'); assertHoldemChips(h);
  });
  it('全下、主池、边池与未跟注退款分别结算', () => {
    let s = createHoldem('x', players(3), {chips:[200,100,50]});
    s.players[0].hand=cards(['S11','H11']); s.players[1].hand=cards(['S13','H13']); s.players[2].hand=cards(['S12','H12']);
    // 每轮烧牌后的五张公共牌固定，下注仍走完整真实流程。
    s.deck=cards(['S2','C12','D2','C3','S4','D4','S5','H7',...createPokerDeck().filter(c=>!['S11','H11','S13','H13','S12','H12','S2','C12','D2','C3','S4','D4','S5','H7'].includes(c.id)).map(c=>c.id)]);
    s=act(s,0,{type:'raise',amount:200}); s=act(s,1,{type:'call'}); s=act(s,2,{type:'call'});
    expect(s.result?.pots.map(p=>[p.amount,p.winners])).toEqual([[150,[2]],[100,[1]]]);
    expect(s.players.map(p=>p.chips)).toEqual([100,100,150]); expect(s.result?.deltas).toEqual([-100,0,100]); assertHoldemChips(s);
  });
  it('弃牌筹码留池、平分底池零头从按钮左侧起分配，摊牌不展示弃牌者', () => {
    let s=riverFixture(); s.players[0].folded=true; s=act(s,1,{type:'check'}); s=act(s,2,{type:'check'});
    expect(s.result?.pots[0].awards).toEqual([{seat:1,amount:8},{seat:2,amount:7}]); expect(s.players.map(p=>p.chips)).toEqual([5,13,12]);
    expect(viewHoldem(s,null).players.filter(p=>p.hand).map(p=>p.seat)).toEqual([1,2]);
  });
  it('连续弃牌立即结束且不泄露赢家底牌、牌库、烧牌', () => {
    let s=createHoldem('x',players(3)); const view=viewHoldem(s,0);
    expect(view.players.filter(p=>p.hand).map(p=>p.seat)).toEqual([0]); expect('deck' in view).toBe(false); expect('burned' in view).toBe(false);
    s=act(s,0,{type:'fold'}); s=act(s,1,{type:'fold'});
    expect(s.phase).toBe('finished'); expect(s.board).toHaveLength(0); expect(viewHoldem(s,null).players.some(p=>p.hand)).toBe(false); assertHoldemChips(s);
  });
  it('1000 手随机合法行动，各种人数与短筹码均保持筹码和牌守恒并结束', () => {
    for (let seed=1;seed<=1000;seed++) {
      const random=seeded(seed), count=2+seed%8;
      let s=createHoldem(`t${seed}`,players(count),{random,chips:Array.from({length:count},()=>1+Math.floor(random()*1000))});
      let turns=0;
      while(s.phase!=='finished' && turns++<500) {
        const legal=getHoldemLegalActions(s,s.turn); expect(legal.length).toBeGreaterThan(0);
        s=act(s,s.turn,legal[Math.floor(random()*legal.length)].action); assertHoldemChips(s);
        expect(new Set([...s.players.flatMap(p=>p.hand),...s.deck,...s.board,...s.burned].map(c=>c.id)).size).toBe(52);
      }
      expect(s.phase,`seed ${seed}`).toBe('finished'); expect(s.result!.deltas.reduce((a,b)=>a+b,0)).toBe(0);
    }
  });
});

describe('牌桌与一手牌的独立生命周期', () => {
  it('长期买入后超过首桌总额的筹码仍可继承，同时拒绝不安全的总额',()=>{
    let s=createHoldem('large',players(2),{chips:[10_000_000_000,1000]});
    s=act(s,s.turn,{type:'fold'});
    const next=nextHoldemHand(s,[...s.players,{name:'新买入',kind:'agent'}]);
    expect(next.players[0].startingChips).toBe(s.players[0].chips); expect(next.totalChips).toBe(10_000_002_000); assertHoldemChips(next);
    expect(()=>createHoldem('overflow',players(2),{chips:[Number.MAX_SAFE_INTEGER,1000]})).toThrow('筹码守恒');
  });
  it('下手换 Agent 保留身份筹码，新增买入、离桌兑现、庄家移动并重建 handId', () => {
    let first=runOut(createHoldem('table',players(3),{random:seeded(4)}));
    const keep=first.players.slice(0,2).map(p=>({...p,kind:'agent' as const,name:'新 Agent'}));
    const next=nextHoldemHand(first,[...keep,{name:'新玩家',kind:'agent'}],{random:seeded(5)});
    expect(next.id).toBe(first.id); expect(next.handId).not.toBe(first.handId); expect(next.round).toBe(2);
    expect(next.players.slice(0,2).map(p=>p.startingChips)).toEqual(first.players.slice(0,2).map(p=>p.chips));
    expect(next.players[2].startingChips).toBe(1000); expect(next.dealer).toBe(1);
    expect(next.ledger.slice(-2).map(e=>e.type)).toEqual(['cash-out','buy-in']); assertHoldemChips(next);
    const fresh=createHoldem('new-table',keep); expect(fresh.players.every(p=>p.startingChips===1000)).toBe(true); expect(fresh.ledger).toHaveLength(2);
  });
  it('牌中不换阵容，不接受重复身份或归零玩家继续', () => {
    let s=createHoldem('x',players(2)); expect(()=>nextHoldemHand(s,s.players)).toThrow('进行中'); s=runOut(s);
    expect(()=>nextHoldemHand(s,[s.players[0],s.players[0]])).toThrow('重复');
    const busted=structuredClone(s); busted.players[0].chips=0;
    expect(()=>nextHoldemHand(busted,busted.players)).toThrow('归零');
  });
  it('三人转为单挑时按钮调整，上一手大盲不会连续承担大盲',()=>{
    const s=runOut(createHoldem('x',players(3)));
    const next=nextHoldemHand(s,s.players.filter(p=>p.seat!==s.dealer));
    expect(next.players[next.dealer].playerId).toBe(s.players[s.bigBlindSeat].playerId);
    expect(next.players[next.bigBlindSeat].playerId).not.toBe(s.players[s.bigBlindSeat].playerId);
  });
});
