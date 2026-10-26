import {describe,expect,it} from 'vitest';
import {Chess} from 'chess.js';
import {applyChessAction,createChess,DEFAULT_CHESS_OPTIONS,legalChessActions,legalChessMoves,positionCount,restoreChess,viewChess,type ChessState} from './engine';
import {definition} from './definition';
import type {StoredRun} from '../../runtime/types';

const players=[{playerId:'alice',name:'甲',kind:'human' as const},{playerId:'bob',name:'乙',kind:'agent' as const}];
const create=(fen?:string)=>createChess('game-1',players,DEFAULT_CHESS_OPTIONS,()=>.2,1,undefined,fen);
const play=(s:ChessState,...moves:string[])=>moves.reduce((state,uci)=>applyChessAction(state,state.turn,{type:'move',uci}),s);
const run=(s:ChessState):StoredRun<ChessState>=>({moduleId:'chess',moduleVersion:'1.0.0',stateVersion:1,roomId:'room',runId:s.id,index:s.round,roster:[{...players[0],kind:'human'},{...players[1],kind:'codex'}],config:s.options,state:s});
const cycle=['g1f3','g8f6','f3g1','f6g8'];

describe('国际象棋 · 人数、合法走子与王的安全',()=>{
  it.each([
    [{type:'accept_draw'},/没有.*提和/],
    [{type:'decline_draw'},/没有.*提和/],
    [{type:'claim_draw',reason:'threefold'},/三次重复/],
    [{type:'claim_draw',reason:'fifty'},/50/],
    [{type:'move',uci:'e2e5'},/合法棋步|移动/],
  ])('非法申请或棋步 %j 提供可修正原因，棋盘、提议、棋谱和分数保持原状',(action,reason)=>{
    const s=create(),before=structuredClone(s);expect(()=>applyChessAction(s,0,action)).toThrow(reason);expect(s).toEqual(before);
  });
  it('拒绝升变遗漏、非法预定棋步和越权后，可继续正确升变',()=>{
    const s=create('7k/P7/8/8/8/8/8/4K3 w - - 0 1'),before=structuredClone(s);
    expect(()=>applyChessAction(s,0,{type:'move',uci:'a7a8'})).toThrow('升变');
    expect(()=>applyChessAction(s,0,{type:'claim_draw',reason:'fifty',uci:'a7b8q'})).toThrow();
    expect(()=>applyChessAction(s,1,{type:'move',uci:'h8g8'})).toThrow();expect(s).toEqual(before);
    expect(applyChessAction(s,0,{type:'move',uci:'a7a8r'}).moves.at(-1)?.promotion).toBe('r');
  });
  it('标准开局 32 子、20 着，白方先行；初始状态不可被修改',()=>{
    const s=create(),before=structuredClone(s),next=play(s,'e2e4');
    expect(viewChess(s,null).board).toHaveLength(32);expect(legalChessMoves(s)).toHaveLength(20);expect(s.turn).toBe(0);expect(next.turn).toBe(1);expect(s).toEqual(before);expect(next.revision).toBe(2);
  });
  it('两位不同玩家、明确有效配置；首局支持指定黑白与随机',()=>{
    expect(()=>createChess('x',[players[0]],DEFAULT_CHESS_OPTIONS)).toThrow();expect(()=>createChess('x',[players[0],players[0]],DEFAULT_CHESS_OPTIONS)).toThrow();
    expect(()=>createChess('x',players,{firstWhite:'bad',alternateColors:true} as any)).toThrow();
    expect(createChess('x',players,{firstWhite:'second',alternateColors:true}).turn).toBe(1);expect(createChess('x',players,{firstWhite:'random',alternateColors:true},()=>.9).turn).toBe(1);
  });
  it('不能越权行棋、跳过兵或输入非法 / 空着',()=>{
    const s=create();expect(()=>applyChessAction(s,1,{type:'move',uci:'e7e5'})).toThrow();for(const uci of ['e2e5','a1a3','e1e8','0000','e2e4q','e4'])expect(()=>play(s,uci)).toThrow();
  });
  it('被钉的棋子不得暴露王；将军时必须应将',()=>{
    const s=create('4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1');expect(()=>play(s,'e2d2')).toThrow();expect(legalChessMoves(s).some(m=>m.uci==='e2e8')).toBe(true);
    const check=create('4r1k1/8/8/8/8/8/P7/4K3 w - - 0 1');expect(viewChess(check,null).checkSquare).toBe('e1');expect(()=>play(check,'a2a3')).toThrow();
  });
  it('王不可进入受攻击格，也不可与敌王相邻',()=>{
    const s=create('8/8/8/8/8/4k3/8/4K2R w - - 0 1');expect(()=>play(s,'e1e2')).toThrow();
  });
});

describe('国际象棋 · 王车易位',()=>{
  it('短易位和长易位同时移动正确的王与车',()=>{
    const s=play(create('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'),'e1g1','e8c8'),c=new Chess(s.fen);
    expect(c.get('g1')?.type).toBe('k');expect(c.get('f1')?.type).toBe('r');expect(c.get('c8')?.type).toBe('k');expect(c.get('d8')?.type).toBe('r');expect(s.moves.every(m=>m.castle)).toBe(true);
  });
  it('正在将军、穿越受攻击格、路径有子都不能易位',()=>{
    expect(()=>play(create('4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1'),'e1g1')).toThrow();
    expect(()=>play(create('4k3/8/8/8/2b5/8/8/R3K2R w KQ - 0 1'),'e1g1')).toThrow();expect(()=>play(create(),'e1g1')).toThrow();
    expect(()=>play(create('4k3/8/8/8/8/8/8/RN2K2R w KQ - 0 1'),'e1c1')).toThrow();
  });
  it('车或王离开原位再返回永久失去相应易位权',()=>{
    const rook=play(create('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'),'h1h2','h8h7','h2h1','h7h8');expect(()=>play(rook,'e1g1')).toThrow();expect(legalChessMoves(rook).some(m=>m.uci==='e1c1')).toBe(true);
    const king=play(create('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'),'e1f1','e8f8','f1e1','f8e8');expect(legalChessMoves(king).some(m=>m.castle)).toBe(false);
  });
  it('长易位不要求 b1 不受攻击，只要求经过的王格安全',()=>{
    expect(legalChessMoves(create('1r2k3/8/8/8/8/8/8/R3K3 w Q - 0 1')).some(m=>m.uci==='e1c1')).toBe(true);
  });
});

describe('国际象棋 · 吃过路兵与升变',()=>{
  const ep=()=>play(create(),'e2e4','a7a6','e4e5','d7d5');
  it('紧接双步可吃过路兵，移除旁边的敌兵而非落点棋子',()=>{
    const s=play(ep(),'e5d6'),c=new Chess(s.fen);expect(c.get('d5')).toBeUndefined();expect(c.get('d6')).toEqual({color:'w',type:'p'});expect(s.moves.at(-1)).toMatchObject({enPassant:true,captured:'p'});expect(viewChess(s,null).board).toHaveLength(31);
  });
  it('吃过路兵机会仅持续一回合，且不能暴露己王',()=>{
    const s=play(ep(),'g1f3','g8f6');expect(()=>play(s,'e5d6')).toThrow();
    const pinned=create('4k3/8/8/r4pPK/8/8/8/8 w - f6 0 1');expect(()=>play(pinned,'g5f6')).toThrow();expect(pinned.fen.split(' ')[3]).toBe('-');
  });
  it.each(['q','r','b','n'])('升变为 %s，必须明确后缀；总棋子数不增加',promotion=>{
    const start=create('7k/P7/8/8/8/8/8/4K3 w - - 0 1');expect(legalChessMoves(start).filter(m=>m.from==='a7')).toHaveLength(4);expect(()=>play(start,'a7a8')).toThrow();
    const s=play(start,`a7a8${promotion}`);expect(new Chess(s.fen).get('a8')?.type).toBe(promotion);expect(viewChess(s,null).board).toHaveLength(3);expect(s.moves.at(-1)?.promotion).toBe(promotion);
  });
  it('吃子升变可选择已有的后，不受原子数量限制',()=>{
    const s=play(create('1r5k/P7/8/8/8/8/8/3QK3 w - - 0 1'),'a7b8q');expect(viewChess(s,null).board.filter(p=>p.type==='q')).toHaveLength(2);expect(s.moves.at(-1)?.captured).toBe('r');
  });
});

describe('国际象棋 · 将死、逼和与计分',()=>{
  it('愚人将杀立即结束，黑方得 1 分且不能再行棋',()=>{
    const s=play(create(),'f2f3','e7e5','g2g4','d8h4');expect(s.result).toMatchObject({reason:'checkmate',winner:1,outcome:'0-1',deltas:[0,1]});expect(s.players.map(p=>p.score)).toEqual([0,1]);expect(s.players[0].losses).toBe(1);expect(legalChessMoves(s)).toEqual([]);expect(()=>play(s,'a2a3')).toThrow();
  });
  it('无棋可走但未将军为逼和，各 0.5 分',()=>{
    const s=play(create('k7/8/1QK5/8/8/8/8/8 w - - 0 1'),'b6c7');expect(s.result).toMatchObject({reason:'stalemate',winner:null,deltas:[.5,.5]});expect(viewChess(s,null).check).toBe(false);
  });
  it.each(['7k/8/8/8/8/8/8/K7 w - - 0 1','7k/8/8/8/8/8/8/KB6 w - - 0 1','7k/8/8/8/8/8/8/KN6 w - - 0 1','5b1k/8/8/8/8/8/8/K1B5 w - - 0 1'])('子力不足自动和棋：%s',fen=>{expect(create(fen).result?.reason).toBe('insufficient');});
  it('双马对王、异色格象不判子力不足',()=>{
    expect(create('7k/8/8/8/8/8/8/KNN5 w - - 0 1').phase).toBe('playing');expect(create('6bk/8/8/8/8/8/8/K1B5 w - - 0 1').phase).toBe('playing');
  });
  it('正常认输对方得分；对方仅剩王时认输判和',()=>{
    expect(applyChessAction(create(),0,{type:'resign'}).result).toMatchObject({reason:'resignation',winner:1});
    expect(applyChessAction(create('7k/8/8/8/8/8/8/KR6 w - - 0 1'),0,{type:'resign'}).result).toMatchObject({reason:'resignation-no-mate',winner:null});
  });
  it('认输给无兵无马且仅同色格象的对方，不能错误地判负',()=>{
    expect(applyChessAction(create('6bk/8/8/8/8/8/8/KR6 w - - 0 1'),0,{type:'resign'}).result?.winner).toBe(null);
    expect(applyChessAction(create('6nk/8/8/8/8/8/8/KQ6 w - - 0 1'),0,{type:'resign'}).result?.winner).toBe(null);
  });
});

describe('国际象棋 · 申请和棋与自动和棋严格区分',()=>{
  it('三次重复只提供申请，不自动结束；申请后结算',()=>{
    const s=play(create(),...cycle,...cycle);expect(positionCount(s)).toBe(3);expect(s.phase).toBe('playing');expect(viewChess(s,0).claimable).toContain('threefold');
    expect(applyChessAction(s,0,{type:'claim_draw',reason:'threefold'}).result?.reason).toBe('threefold');expect(()=>applyChessAction(create(),0,{type:'claim_draw',reason:'threefold'})).toThrow();
  });
  it('预定棋步将产生第三次局面时，可在落子前申请；棋谱不执行该步',()=>{
    const s=play(create(),...cycle,...cycle.slice(0,3)),before=s.fen;
    expect(legalChessActions(s,s.turn).some(a=>a.id==='claim:threefold:f6g8')).toBe(true);
    const result=applyChessAction(s,s.turn,{type:'claim_draw',reason:'threefold',uci:'f6g8'});expect(result.result?.reason).toBe('threefold');expect(result.fen).toBe(before);expect(result.moves).toHaveLength(7);
  });
  it('重复局面计入易位权，曾返回同一棋盘不意味着恢复易位权',()=>{
    const s=play(create('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'),'h1h2','h8h7','h2h1','h7h8');expect(positionCount(s)).toBe(1);
  });
  it('重复局面区分合法吃过路兵权，不能把有权与无权局面合并',()=>{
    const s=play(create('4k1n1/8/8/3pP3/8/8/8/4K1N1 w - d6 0 1'),...cycle);expect(positionCount(s)).toBe(1);
  });
  it('五次重复自动结束，无需任何玩家申请',()=>{
    const s=play(create(),...cycle,...cycle,...cycle,...cycle);expect(positionCount(s)).toBe(5);expect(s.result?.reason).toBe('fivefold');
  });
  it('50 回合可以申请并可拒绝申请继续行棋，75 回合自动结束',()=>{
    const s=create('7k/8/8/8/8/8/8/KR6 w - - 100 51');expect(s.phase).toBe('playing');expect(applyChessAction(s,0,{type:'claim_draw',reason:'fifty'}).result?.reason).toBe('fifty');
    expect(play(s,'b1b2').phase).toBe('playing');expect(play(create('7k/8/8/8/8/8/8/KR6 w - - 149 75'),'b1b2').result?.reason).toBe('seventy-five');
  });
  it('第 99 半回合能预定安静棋申请 50 回合；兵步或吃子不能申请',()=>{
    const s=create('7k/8/8/8/8/8/P7/KR6 w - - 99 51');expect(legalChessActions(s,0).some(a=>a.id==='claim:fifty:b1b2')).toBe(true);expect(()=>applyChessAction(s,0,{type:'claim_draw',reason:'fifty',uci:'a2a3'})).toThrow();
    const claimed=applyChessAction(s,0,{type:'claim_draw',reason:'fifty',uci:'b1b2'});expect(claimed.moves).toHaveLength(0);expect(claimed.fen).toBe(s.fen);
  });
  it('吃子和兵移动归零无进展计数',()=>{
    expect(viewChess(play(create('7k/8/8/8/8/8/P7/KR6 w - - 99 51'),'a2a3'),null).halfmoveClock).toBe(0);
    expect(viewChess(play(create('7k/8/8/8/8/8/1n6/KR6 w - - 99 51'),'b1b2'),null).halfmoveClock).toBe(0);
  });
  it('第 150 半回合将死优先于 75 回合自动和棋',()=>{
    const s=play(create('7k/8/5KQ1/8/8/8/8/8 w - - 149 75'),'g6g7');expect(s.result?.reason).toBe('checkmate');
  });
  it('提和随走子提交，双方各走一步后可接受；不得接受自己的提议',()=>{
    const s=applyChessAction(play(create(),'e2e4'),1,{type:'move',uci:'e7e5',offerDraw:true});expect(s.drawOffer?.by).toBe(1);
    expect(applyChessAction(s,0,{type:'accept_draw'}).result?.reason).toBe('agreement');expect(()=>applyChessAction(s,1,{type:'accept_draw'})).toThrow();
    const early=applyChessAction(create(),0,{type:'move',uci:'e2e4',offerDraw:true});expect(()=>applyChessAction(early,1,{type:'accept_draw'})).toThrow();
  });
  it('拒绝提和保留行棋权但推进决策；实际走子也拒绝提和',()=>{
    const offered=applyChessAction(play(create(),'e2e4'),1,{type:'move',uci:'e7e5',offerDraw:true});
    const declined=applyChessAction(offered,0,{type:'decline_draw'});expect(declined.turn).toBe(0);expect(declined.revision).toBe(offered.revision+1);expect(declined.drawOffer).toBeNull();
    expect(play(offered,'g1f3').drawOffer).toBeNull();expect(()=>applyChessAction(create(),0,{type:'accept_draw'})).toThrow();
  });
});

describe('国际象棋 · 公开信息、保存棋局与跨局积分',()=>{
  it('双方与观众看到相同棋盘与完整公开记录，观察没有 Harness 私有对话',()=>{
    const s=play(create(),'e2e4','d7d5','e4d5'),a=definition.observe(run(s),'alice'),b=definition.observe(run(s),'bob'),publicView=definition.observe(run(s),null);
    expect(a.board).toEqual(b.board);expect(a.board).toEqual(publicView.board);expect(a.events).toEqual(s.events);expect(b.events).toEqual(s.events);expect(b.players[1]).not.toHaveProperty('model');expect(a).not.toHaveProperty('conversations');expect(b.legalActions.length).toBeGreaterThan(0);expect(a.legalActions).toEqual([]);expect(()=>definition.observe(run(s),'outsider')).toThrow();
  });
  it('只给当前行棋方领域决策，旧决策与错误玩家不能落子',()=>{
    const s=create(),r=run(s),d=definition.decisions(r)[0];expect(d.actorId).toBe('alice');
    const req={id:'req',scopeId:'game-1',playerId:'bob',decisionId:d.decisionId,tool:'game_act',args:{revision:1,actionId:'move:e2e4'}};
    expect(()=>definition.handleTool(r,req)).toThrow();expect(()=>definition.handleTool(r,{...req,playerId:'alice',decisionId:'old'})).toThrow();
    expect(definition.handleTool(r,{...req,playerId:'alice'}).state?.moves.at(-1)?.uci).toBe('e2e4');
  });
  it('同桌下一局交换黑白，按身份而非座位继承积分；新玩家从零开始',()=>{
    const end=applyChessAction(create(),0,{type:'resign'}),next=createChess('game-2',[players[1],players[0]],DEFAULT_CHESS_OPTIONS,()=>0,2,end);
    expect(next.players[0]).toMatchObject({playerId:'bob',color:'w',score:1,wins:1});expect(next.players[1]).toMatchObject({playerId:'alice',color:'b',score:0,losses:1});
    const changed=createChess('game-2',[players[0],{...players[1],playerId:'new'}],DEFAULT_CHESS_OPTIONS,()=>0,2,end);expect(changed.players[1].score).toBe(0);
    expect(()=>createChess('x',players,DEFAULT_CHESS_OPTIONS,()=>0,2,create())).toThrow();
  });
  it('关闭交换选项保留同一人的棋色',()=>{
    const s=applyChessAction(create(),0,{type:'resign'}),n=createChess('x',[players[1],players[0]],{firstWhite:'first',alternateColors:false},()=>0,2,s);expect(n.players[1].color).toBe('w');
  });
  it('用公开行动恢复棋谱、提和、预定申请与已结算结果，拒绝伪造棋步 / 积分 / 事件',()=>{
    const states=[create(),play(create(),'e2e4','e7e5'),applyChessAction(play(create(),'e2e4'),1,{type:'move',uci:'e7e5',offerDraw:true}),play(create(),'f2f3','e7e5','g2g4','d8h4'),applyChessAction(play(create(),...cycle,...cycle.slice(0,3)),1,{type:'claim_draw',reason:'threefold',uci:'f6g8'}),create('7k/8/8/8/8/8/8/K7 w - - 0 1')];
    for(const s of states)expect(restoreChess(JSON.parse(JSON.stringify(s)),1)).toEqual(s);
    const bad=structuredClone(states[1]);bad.moves[0].uci='e2e5';expect(()=>restoreChess(bad,1)).toThrow();
    const score=structuredClone(states[3]);score.result!.winner=0;expect(()=>restoreChess(score,1)).toThrow();
    const event=structuredClone(states[1]);event.events.pop();expect(()=>restoreChess(event,1)).toThrow();expect(()=>restoreChess(states[0],2)).toThrow();
  });
  it('保存与恢复不丢失易位 / 吃过路兵 / 重复权利',()=>{
    const s=play(create(),...cycle,...cycle);expect(viewChess(restoreChess(s,1),0).claimable).toContain('threefold');
    const ep=play(create(),'e2e4','a7a6','e4e5','d7d5');expect(legalChessMoves(restoreChess(ep,1)).some(m=>m.enPassant)).toBe(true);
  });
  it('可解析的 PGN 保留完整棋步与最终比分',()=>{
    const s=play(create(),'f2f3','e7e5','g2g4','d8h4'),pgn=viewChess(s,null).pgn,c=new Chess();c.loadPgn(pgn);expect(c.fen()).toBe(s.fen);expect(c.getHeaders().Result).toBe('0-1');
  });
  it('可复现合法行动序列始终保留双王、子数守恒、轮转与结算总分',()=>{
    let seed=42;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
    for(let game=0;game<4;game++){
      let s=create();for(let ply=0;ply<200&&s.phase==='playing';ply++){
        const moves=legalChessMoves(s),m=moves[Math.floor(random()*moves.length)],old=s.turn;s=play(s,m.uci);
        const board=new Chess(s.fen).board().flat().filter(p=>p!==null);expect(board.filter(p=>p.type==='k')).toHaveLength(2);expect(board.length+s.moves.filter(m=>m.captured).length).toBe(32);expect(s.turn).toBe(1-old);
      }
      if(s.phase==='playing')s=applyChessAction(s,s.turn,{type:'resign'});
      expect(s.players.reduce((sum,p)=>sum+p.score,0)).toBe(1);expect(restoreChess(s,1)).toEqual(s);
    }
  },20000);
});
