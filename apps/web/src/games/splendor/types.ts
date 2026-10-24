export const COLORS = ['white', 'blue', 'green', 'red', 'black'] as const;
export const GEMS = [...COLORS, 'gold'] as const;
export type Color = typeof COLORS[number];
export type Gem = typeof GEMS[number];
export type Level = 1 | 2 | 3;
export const LEVELS: Level[] = [1, 2, 3];
export type Cost = Record<Color, number>;
export type Tokens = Record<Gem, number>;
export const GEM_NAMES: Record<Gem, string> = {white:'白钻', blue:'蓝宝石', green:'祖母绿', red:'红宝石', black:'缟玛瑙', gold:'黄金'};
export interface Card { id:string; level:Level; bonus:Color; points:number; cost:Cost }
export interface Noble { id:string; points:number; cost:Cost }
export interface Reserved { cardId:string; level:Level; source:'market'|'deck'; revealed:boolean }
export interface Player {
  playerId:string; name:string; kind:'human'|'agent'; seat:number;
  tokens:Tokens; bought:string[]; reserved:Reserved[]; nobles:string[];
  wins:number; totalPoints:number;
}
export type Action =
  | {type:'take'; colors:Color[]}
  | {type:'pair'; color:Color}
  | {type:'reserve'; cardId:string}
  | {type:'reserveDeck'; level:Level}
  | {type:'buy'; cardId:string; payment?:Partial<Tokens>}
  | {type:'return'; tokens:Partial<Tokens>}
  | {type:'noble'; nobleId:string}
  | {type:'pass'};
export interface LegalAction { id:string; label:string; action:Action }
export interface Event {
  seq:number; time:string; type:string; text:string; seat?:number;
  cards?:string[]; nobleId?:string; level?:Level; tokens?:Partial<Tokens>;
}
export interface Result { winners:number[]; scores:number[]; cardCounts:number[] }
export interface SplendorState {
  gameId:'splendor'; id:string; round:number; createdAt:string; revision:number;
  phase:'action'|'return'|'noble'|'finished'; turn:number; firstSeat:number; turnsTaken:number[];
  players:Player[]; bank:Tokens; initialTokens:Tokens;
  decks:Record<Level,string[]>; market:Record<Level,Array<string|null>>; nobles:string[];
  finalRound:boolean; result:Result|null; events:Event[];
}
export interface PlayerView extends Omit<Player, 'bought'|'reserved'|'nobles'> {
  bought:Card[]; reserved:Array<{level:Level; source:'market'|'deck'; card:Card|null}>;
  nobles:Noble[]; bonuses:Cost; points:number;
}
export interface SplendorView {
  gameId:'splendor'; id:string; round:number; revision:number; phase:SplendorState['phase'];
  turn:number; firstSeat:number; turnsTaken:number[]; finalRound:boolean; viewer:number|null;
  players:PlayerView[]; bank:Tokens; deckCounts:Record<Level,number>;
  market:Record<Level,Array<Card|null>>; nobles:Noble[]; events:Event[]; result:Result|null;
  legalActions:LegalAction[]; returnCount:number; eligibleNobles:string[];
}
