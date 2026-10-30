import {describe,expect,it} from 'vitest';
import {azulModule as game} from './definition';

function random(seed:number){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};}

describe('花砖物语 · 新桌开局顺序',()=>{
  it.each([2,3,4])('%i 人按重排后的名单由 1 号玩家先开始，稳定身份不变',count=>{
    const orderedIds=Array.from({length:count},(_,seat)=>`identity-${count-seat}`);
    const roster=orderedIds.map(playerId=>({playerId,name:playerId,kind:'codex-acp' as const}));
    const meta={moduleId:game.id,moduleVersion:game.version,stateVersion:game.stateVersion,roomId:'ordered-room',runId:'ordered-run',index:1,roster,config:structuredClone(game.defaultConfig)};
    for(const seed of [1,99,2048]){
      const state=game.create(meta,random(seed));
      expect(state.players.map(player=>player.playerId)).toEqual(orderedIds);
      expect(state.turn).toBe(0);
      expect(game.decisions({...meta,state})[0].actorId).toBe(orderedIds[0]);
      expect(state.roundStarter).toBe(0);
      expect(state.events[0].turn).toBe(0);
    }
  });
});
