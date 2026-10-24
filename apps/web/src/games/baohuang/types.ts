import type {Card} from '@agent-game/core';

export interface BaoCard extends Card {mark?:'emperor'|'guard'}
export interface BaoPlayer {playerId:string;name:string;kind:'human'|'agent';seat:number;hand:BaoCard[];score:number;rank:number|null}
export type BaoAction={type:'enthrone'}|{type:'cede'}|{type:'declare';open:boolean}|{type:'play';cards:string[]}|{type:'pass'};
export interface BaoChoice {id:string;label:string;action:BaoAction;cards?:BaoCard[]}
export interface BaoEvent {seq:number;time:string;type:string;text:string;seat?:number;cards?:BaoCard[]}
export interface BaoPlay {seat:number;cards:BaoCard[];label:string}
export interface BaoResult {winner:'royal'|'civilian'|'draw';deltas:number[];emperor:number;guard:number;solo:boolean;open:boolean;reason:string;rankSum?:number}
export interface BaoState {
  gameId:'baohuang';id:string;round:number;baseScore:number;createdAt:string;revision:number;
  phase:'enthrone'|'declare'|'playing'|'finished';players:BaoPlayer[];
  turn:number;initialEmperor:number;emperor:number;guard:number;cedes:number;
  declarations:Array<boolean|null>;open:boolean;guardPublic:boolean;
  trick:number;lastPlay:BaoPlay|null;responders:number[];lastActions:Array<BaoPlay|'pass'|null>;
  order:number[];played:BaoCard[];events:BaoEvent[];result:BaoResult|null;
}
export type BaoRole='emperor'|'guard'|'solo'|'civilian'|null;
export interface BaoView {
  gameId:'baohuang';id:string;round:number;baseScore:number;revision:number;phase:BaoState['phase'];viewer:number|null;
  players:Array<Omit<BaoPlayer,'hand'>&{hand?:BaoCard[];count:number;role:BaoRole}>;
  turn:number|null;emperor:number;guard:number|null;open:boolean;guardPublic:boolean;cedes:number;
  ready:number[];trick:number;lastPlay:BaoPlay|null;lastActions:BaoState['lastActions'];order:number[];
  events:BaoEvent[];result:BaoResult|null;legalActions:BaoChoice[];
}
