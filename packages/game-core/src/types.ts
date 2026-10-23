export type Seat = number;
export type Suit = 'S'|'H'|'C'|'D'|'J';
export interface Card {id:string;rank:number;suit:Suit}
export interface PlayerConfig {playerId?:string;name:string;kind:'human'|'agent'}
