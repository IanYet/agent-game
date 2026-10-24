import type {Card,PlayerConfig} from '@agent-game/core';

export type Team=0|1;
export type Phase='tribute'|'return'|'playing'|'finished';
export type CombinationKind='single'|'pair'|'triple'|'full_house'|'straight'|'pair_run'|'triple_run'|'bomb'|'straight_flush'|'four_jokers';
export interface Combination {key:string;kind:CombinationKind;rank:number;size:number;label:string;suit?:Card['suit'];pairRank?:number}
export interface Play {seat:number;cards:Card[];combination:Combination}
export type Action={type:'play';cards:string[];combination:string}|{type:'pass'}|{type:'tribute'|'return';card:string};
export interface LegalAction {id:string;action:Action;label:string;cards:Card[];combination?:Combination}
export interface Player extends PlayerConfig {seat:number;team:Team;hand:Card[]}
export interface Exchange {from:number;to:number;tribute:Card;returned?:Card}
export interface Tribute {donors:number[];receivers:number[];offers:Array<{seat:number;card:Card}>;exchanges:Exchange[];leader:number;anti:boolean}
export interface Result {order:number[];doubleDown:boolean;winner:Team;advance:number;levelsBefore:[number,number];levelsAfter:[number,number];matchWinner:Team|null}
export interface GameEvent {seq:number;time:string;type:'deal'|'tribute'|'return'|'anti'|'start'|'play'|'pass'|'wind'|'rank'|'finish';seat?:number;text:string;cards?:Card[];combination?:Combination}
export interface GuandanState {
  gameId:'guandan';id:string;round:number;revision:number;createdAt:string;
  phase:Phase;players:Player[];turn:number;level:number;levelTeam:Team;levels:[number,number];
  matchNumber:number;matchWins:[number,number];tribute:Tribute|null;
  lastPlay:Play|null;lastActions:Array<{type:'play'|'pass';cards:Card[];label:string}|null>;passed:number[];
  finishOrder:number[];played:Card[];events:GameEvent[];result:Result|null;
}
export interface PlayerView extends Omit<Player,'hand'> {count:number;hand?:Card[];knownCards:Card[];place:string}
export interface GameView extends Omit<GuandanState,'players'|'played'> {players:PlayerView[];viewer:number|null;legalActions:LegalAction[];legalActionNote:string}
