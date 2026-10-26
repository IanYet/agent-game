import { describe, expect, it } from 'vitest';
import {createDeck,RuleError} from '@agent-game/core';
import {applyAction,createGame,getLegalActions,viewGame} from './engine';
import {classify,enumeratePlays,beats} from './combinations';
import {doudizhuModule} from './definition';
import type { Card, PlayerConfig, Seat } from '@agent-game/core';

const players: PlayerConfig[] = [{ name: '你', kind: 'human' }, { name: 'Atlas', kind: 'agent' }, { name: 'Nova', kind: 'agent' }];
const deck = createDeck();
function cards(ranks: number[]): Card[] {
  const used = new Set<string>();
  return ranks.map(rank => { const card = deck.find(c => c.rank === rank && !used.has(c.id)); if (!card) throw Error('invalid fixture'); used.add(card.id); return card; });
}
function seeded(seed: number) { return () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; }; }

describe('斗地主牌型与比较', () => {
  it.each([
    [[3], 'single'], [[15, 15], 'pair'], [[3, 3, 3], 'triple'], [[3, 3, 3, 4], 'triple_single'],
    [[3, 3, 3, 4, 4], 'triple_pair'], [[10, 11, 12, 13, 14], 'straight'], [[3, 3, 4, 4, 5, 5], 'pair_straight'],
    [[3, 3, 3, 4, 4, 4], 'airplane'], [[3, 3, 3, 4, 4, 4, 5, 5], 'airplane_single'],
    [[3, 3, 3, 4, 4, 4, 5, 5, 6, 6], 'airplane_pair'], [[3, 3, 3, 3, 4, 4], 'four_two_single'],
    [[3, 3, 3, 3, 4, 4, 5, 5], 'four_two_pair'], [[3, 3, 3, 3], 'bomb'], [[16, 17], 'rocket'],
  ])('%j → %s', (ranks, kind) => expect(classify(cards(ranks as number[]))?.kind).toBe(kind));
  it.each([[11, 12, 13, 14, 15], [3, 4, 5, 6], [3, 3, 4, 4], [3, 3, 3, 4, 4, 4, 4, 5], [3, 3, 3, 3, 4, 4, 4, 4]])('拒绝非法组合 %j', (...ranks) => expect(classify(cards(ranks))).toBeNull());
  it('炸弹与王炸遵守优先级，普通牌必须同型同长', () => {
    const c = (r: number[]) => classify(cards(r))!;
    expect(beats(c([3, 3, 3, 3]), c([15, 15]))).toBe(true);
    expect(beats(c([16, 17]), c([15, 15, 15, 15]))).toBe(true);
    expect(beats(c([15, 15, 15, 15]), c([16, 17]))).toBe(false);
    expect(beats(c([3, 4, 5, 6, 7, 8]), c([3, 4, 5, 6, 7]))).toBe(false);
    expect(beats(c([4, 4]), c([3, 3]))).toBe(true);
  });
  it('枚举出的行动都合法且不包含重复或不存在的牌', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const state = createGame('test', players, { random: seeded(seed) });
      const hand = [...state.players[0].hand, ...state.bottom];
      for (const play of enumeratePlays(hand)) {
        expect(classify(play.cards)).toEqual(play.combination);
        expect(new Set(play.cards.map(c => c.id)).size).toBe(play.cards.length);
        expect(play.cards.every(c => hand.some(h => h.id === c.id))).toBe(true);
      }
    }
  });
});

describe('牌局、权限与计分', () => {
  it('发出54张不重复的牌，最多一个真人', () => {
    const state = createGame('test', players);
    const all = [...state.players.flatMap(p => p.hand), ...state.bottom];
    expect(new Set(all.map(c => c.id)).size).toBe(54);
    expect(state.players.map(p => p.hand.length)).toEqual([17, 17, 17]);
    expect(() => createGame('bad', [...players.slice(0, 2), { name: 'B', kind: 'human' }])).toThrow(RuleError);
    expect(() => createGame('agents', players.map(p => ({ ...p, kind: 'agent' })))).not.toThrow();
  });
  it('私有视图只披露自己手牌；公共记录隐藏所有手牌和叫分时的底牌', () => {
    const state = createGame('test', players);
    for (const seat of [0, 1, 2] as Seat[]) {
      const view = viewGame(state, seat);
      expect(view.players.filter(p => p.hand).map(p => p.seat)).toEqual([seat]);
      expect(view.bottom).toEqual([]);
      expect('highBidder' in view).toBe(false);
    }
    expect(viewGame(state, null).players.every(p => !p.hand)).toBe(true);
    expect(viewGame(state, null).legalActions).toEqual([]);
  });
  it('观战可翻开所有手牌，仍隐藏叫分底牌，且不会改变 Agent 的提示和工具视图', () => {
    const meta={moduleId:'doudizhu',moduleVersion:'1.0.0',stateVersion:1,roomId:'room',runId:'run',index:1,config:{},roster:Array.from({length:3},(_,i)=>({playerId:`p${i}`,name:`P${i}`,kind:'codex' as const}))};
    const run={...meta,state:doudizhuModule.create(meta,seeded(1))},before=structuredClone(run.state);
    const table=doudizhuModule.tableView(run,null,{revealHands:true});
    expect(table.players.map((p:any)=>p.hand)).toEqual(run.state.players.map(p=>p.hand));
    expect(table.bottom).toEqual([]);expect(table.legalActions).toEqual([]);
    for(const player of run.roster){
      const privateView=doudizhuModule.observe(run,player.playerId);
      expect(privateView.players.filter((p:any)=>p.hand).map((p:any)=>p.playerId)).toEqual([player.playerId]);
      const prompt=doudizhuModule.decisionPrompt(run,{decisionId:'view',actorId:player.playerId});
      expect(JSON.parse(prompt.split('当前观察：')[1]).players.filter((p:any)=>p.hand).map((p:any)=>p.playerId)).toEqual([player.playerId]);
      const result=doudizhuModule.handleTool(run,{id:'read',scopeId:'run',playerId:player.playerId,tool:'game_get_state',args:{}}).result.structuredContent as any;
      expect(result.players.filter((p:any)=>p.hand).map((p:any)=>p.playerId)).toEqual([player.playerId]);
    }
    expect(run.state).toEqual(before);
  });
  it('结算余牌由牌桌显式翻开；关闭时仍只展示自己的牌', () => {
    let state=applyAction(createGame('reveal',players),0,{type:'bid',value:3});
    const card=state.players[0].hand[0];state.players[0].hand=[card];
    state=applyAction(state,0,{type:'play',cards:[card.id]});
    expect(state.phase).toBe('finished');
    expect(viewGame(state,0).players.filter(p=>p.hand).map(p=>p.seat)).toEqual([0]);
    expect(viewGame(state,0,true).players.map(p=>p.hand)).toEqual(state.players.map(p=>p.hand));
    expect(viewGame(state,null).players.every(p=>!p.hand)).toBe(true);
  });
  it('Agent 可读取超过界面条数的完整出牌与不出记录，下一局从新记录开始', () => {
    const meta={moduleId:'doudizhu',moduleVersion:'1.0.0',stateVersion:1,roomId:'history-room',runId:'history-run',index:1,config:{},roster:Array.from({length:3},(_,i)=>({playerId:`p${i}`,name:`P${i}`,kind:'codex' as const}))};
    const run={...meta,state:applyAction(doudizhuModule.create(meta,seeded(5)),0,{type:'bid',value:3})};
    const step=()=>{const legal=getLegalActions(run.state,run.state.turn),choice=legal.find(a=>a.action.type==='pass')??legal.find(a=>a.action.type==='play'&&a.cards.length===1)!;run.state=applyAction(run.state,run.state.turn,choice.action);};
    while(run.state.events.length<45)step();
    expect(run.state.phase).toBe('playing');
    const expected=structuredClone(run.state.events);
    expect(expected.length).toBeGreaterThan(35);
    expect(expected.map(e=>e.seq)).toEqual(Array.from({length:expected.length},(_,i)=>i+1));
    expect(expected.some(e=>e.type==='play'&&e.cards?.length&&e.combination)).toBe(true);
    expect(expected.some(e=>e.type==='pass')).toBe(true);
    for(const player of run.roster){
      const view=doudizhuModule.handleTool(run,{id:'history',scopeId:run.runId,playerId:player.playerId,tool:'game_get_state',args:{}}).result.structuredContent as any;
      expect(view.events).toEqual(expected);
      expect(view.players.filter((p:any)=>p.hand).map((p:any)=>p.playerId)).toEqual([player.playerId]);
      expect(JSON.parse(doudizhuModule.decisionPrompt(run,{decisionId:'view',actorId:player.playerId}).split('当前观察：')[1]).events).toEqual(expected);
    }
    const decision=doudizhuModule.decisions(run)[0];
    expect(JSON.parse(doudizhuModule.decisionPrompt(run,decision).split('当前观察：')[1]).events).toEqual(expected);
    const recent=JSON.parse(doudizhuModule.decisionPrompt(run,decision,35).split('当前观察：')[1]);
    expect(recent.events).toEqual(expected.filter(e=>e.seq>35));expect(recent.eventsAfter).toBe(35);expect(recent.eventsThrough).toBe(expected.at(-1)!.seq);
    expect(recent.players.filter((p:any)=>p.hand).map((p:any)=>p.playerId)).toEqual([decision.actorId]);
    const publicCards=new Set([...run.state.bottom,...expected.filter(e=>e.type==='play').flatMap(e=>e.cards??[])].map(c=>c.id));
    expect(expected.flatMap(e=>e.cards??[]).every(c=>publicCards.has(c.id))).toBe(true);
    while(run.state.phase!=='finished')step();
    const nextMeta={...meta,runId:'history-run-2',index:2},next={...nextMeta,state:doudizhuModule.next(run,nextMeta,seeded(6))};
    const nextView=doudizhuModule.handleTool(next,{id:'new-history',scopeId:next.runId,playerId:'p1',tool:'game_get_state',args:{}}).result.structuredContent as any;
    expect(nextView.round).toBe(2);expect(nextView.events).toEqual([expect.objectContaining({seq:1,type:'deal'})]);
  });
  it('叫3分直接当地主；三人不叫重新发牌且版本递增', () => {
    let state = createGame('test', players);
    const before = structuredClone(state);
    const playing = applyAction(state, 0, { type: 'bid', value: 3 });
    expect(playing.landlord).toBe(0); expect(playing.players[0].hand).toHaveLength(20);
    expect(playing.phase).toBe('playing'); expect(state).toEqual(before);
    for (const seat of [0, 1, 2] as Seat[]) state = applyAction(state, seat, { type: 'bid', value: 0 });
    expect(state.phase).toBe('bidding'); expect(state.revision).toBe(4); expect(state.turn).toBe(1);
  });
  it('阻止越轮、冒用手牌、重复牌和领出时不出', () => {
    let state = createGame('test', players);
    expect(() => applyAction(state, 1, { type: 'bid', value: 1 })).toThrow('还没有轮到你');
    state = applyAction(state, 0, { type: 'bid', value: 3 });
    expect(() => applyAction(state, 0, { type: 'pass' })).toThrow('不能不出');
    expect(() => applyAction(state, 0, { type: 'play', cards: [state.players[1].hand[0].id] })).toThrow('不属于自己');
    expect(() => applyAction(state, 0, { type: 'play', cards: [state.players[0].hand[0].id, state.players[0].hand[0].id] })).toThrow('不重复');
  });
  it('两人不出后重新领出', () => {
    let state = applyAction(createGame('test', players), 0, { type: 'bid', value: 3 });
    state = applyAction(state, 0, { type: 'play', cards: [state.players[0].hand.at(-1)!.id] });
    state = applyAction(state, 1, { type: 'pass' });
    state = applyAction(state, 2, { type: 'pass' });
    expect(state.turn).toBe(0); expect(state.lastPlay).toBeNull();
    expect(getLegalActions(state, 0).some(a => a.action.type === 'pass')).toBe(false);
  });
  it('地主春天翻倍，团队输赢与零和结算正确', () => {
    let state = applyAction(createGame('test', players), 0, { type: 'bid', value: 3 });
    state.players[0].hand = cards([3, 3, 3, 3]);
    state = applyAction(state, 0, { type: 'play', cards: state.players[0].hand.map(c => c.id) });
    expect(state.result).toMatchObject({ winner: 'landlord', spring: true, multiplier: 4, deltas: [24, -12, -12] });
    expect(viewGame(state, null, true).players.every(p => p.hand)).toBe(true);
  });
  it('100局自动对弈最终结束；每步牌守恒、手牌互斥、分数零和', () => {
    for (let seed = 1; seed <= 100; seed++) {
      let state = createGame('simulation', players, { random: seeded(seed) });
      let steps = 0;
      while (state.phase !== 'finished' && steps++ < 600) {
        const legal = getLegalActions(state, state.turn);
        const action = state.phase === 'bidding' ? legal.find(a => a.id === 'bid-3')! : legal.find(a => a.action.type === 'play') ?? legal[0];
        state = applyAction(state, state.turn, action.action);
        const held = state.players.flatMap(p => p.hand.map(c => c.id));
        const played = state.events.filter(e => e.type === 'play').flatMap(e => e.cards!.map(c => c.id));
        if (state.phase !== 'bidding') {
          expect(new Set([...held, ...played]).size).toBe(54);
          expect(held.length + played.length).toBe(54);
        }
      }
      expect(state.phase, `seed ${seed}`).toBe('finished');
      expect(state.result!.deltas.reduce((a, b) => a + b)).toBe(0);
    }
  });
});
