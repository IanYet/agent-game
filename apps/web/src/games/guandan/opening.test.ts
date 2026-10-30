import {describe,expect,it} from 'vitest';
import {guandanModule as game} from './definition';

function random(seed:number){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};}

describe('掼蛋 · 新桌开局顺序',()=>{
  it.each([4])('%i 人按重排后的名单由 1 号玩家先开始，稳定身份不变',count=>{
    const orderedIds=Array.from({length:count},(_,seat)=>`identity-${count-seat}`);
    const roster=orderedIds.map(playerId=>({playerId,name:playerId,kind:'codex-acp' as const}));
    const meta={moduleId:game.id,moduleVersion:game.version,stateVersion:game.stateVersion,roomId:'ordered-room',runId:'ordered-run',index:1,roster,config:structuredClone(game.defaultConfig)};
    for(const seed of [1,99,2048]){
      const state=game.create(meta,random(seed));
      expect(state.players.map(player=>player.playerId)).toEqual(orderedIds);
      expect(state.turn).toBe(0);
      expect(game.decisions({...meta,state})[0].actorId).toBe(orderedIds[0]);
      expect(state.players.map(player=>player.team)).toEqual([0,1,0,1]);
      expect(state.tribute).toBeNull();
    }
  });
});
