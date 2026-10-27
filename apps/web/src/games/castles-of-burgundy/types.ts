export type TileKind='building'|'animal'|'knowledge'|'castle'|'mine'|'ship';
export type Building='warehouse'|'carpenter'|'church'|'market'|'boarding-house'|'bank'|'city-hall'|'watchtower';
export type Animal='cow'|'pig'|'sheep'|'chicken';
export interface Tile {id:string;kind:TileKind;back:TileKind|'black';building?:Building;animal?:Animal;count?:number;knowledge?:number}
export interface Good {id:string;type:number}
export interface Cell {id:string;q:number;r:number;color:TileKind;value:number;region:string}
export interface Region {id:string;color:TileKind;cells:string[]}
export interface EstateBoard {id:number;cells:Cell[];regions:Region[]}
export interface BurgundyConfig {setup:'classic'|'advanced'}
export interface EnginePlayer {playerId:string;name:string;kind:'human'|'agent'}
export interface BonusTile {color:TileKind;rank:1|2}
export interface ScoreParts {regions:number;animals:number;goods:number;buildings:number;colors:number}
export interface BurgundyPlayer extends EnginePlayer {
  seat:number;boardId:number|null;boardOptions:number[];startCastle:string|null;estate:(string|null)[];storage:string[];goods:string[];soldGoods:string[];
  silver:number;workers:number;dice:[number,number];used:[boolean,boolean];bridge:number;bridgeStamp:number;completedRegions:string[];bonuses:BonusTile[];
  score:number;scoreParts:ScoreParts;totalScore:number;wins:number;actionsTaken:number;turnsTaken:number;
}
export type PendingEffect={kind:'castle'|'place'|'sell'|'ship';sourceTile:string}|{kind:'take';sourceTile:string;colors:TileKind[]};
export interface FinalBonus {goods:number;silver:number;workers:number;knowledge:Array<{id:number;points:number}>;points:number}
export interface BurgundyResult {winners:number[];ranking:number[];bonuses:FinalBonus[]}
export type Action=
  |{type:'setup';boardId:number;cellId:string}
  |{type:'take';tileId:string;die?:number;workers?:number;discardTileId?:string}
  |{type:'place';tileId:string;cellId:string;die?:number;workers?:number}
  |{type:'sell';goodsType:number;die?:number;workers?:number}
  |{type:'workers';die?:number}
  |{type:'buy';tileId:string;discardTileId?:string}
  |{type:'ship';depots:number[];goodsTypes?:number[]}
  |{type:'decline'}|{type:'end_turn'};
export interface FramePlayer extends Omit<BurgundyPlayer,'soldGoods'> {soldCount:number;knowledge:number[]}
export interface BurgundyFrame {
  phase:'setup'|'play'|'finished';phaseIndex:number;round:number;turn:number;turnIndex:number;roundOrder:number[];turnOrder:number[];
  whiteDie:number;depots:string[][];goodsDepots:string[][];roundGoods:string[];poolCounts:Record<TileKind|'black',number>;players:FramePlayer[];
  bought:boolean;pending:PendingEffect|null;result:BurgundyResult|null;
}
export type FrameChanges=Partial<Omit<BurgundyFrame,'players'>>&{players?:FramePlayer[]};
export interface BurgundyEvent {seq:number;time:string;phaseIndex:number;round:number;kind:'start'|'action';text:string;seat?:number;action?:Action;changes:FrameChanges}
export type PublicEvent=Omit<BurgundyEvent,'changes'>;
export interface BurgundyState {
  gameId:'castles-of-burgundy';id:string;match:number;createdAt:string;config:BurgundyConfig;revision:number;
  phase:'setup'|'play'|'finished';phaseIndex:number;round:number;turn:number;turnIndex:number;roundOrder:number[];initialOrder:number[];bridgeClock:number;
  whiteDie:number;players:BurgundyPlayer[];depots:string[][];goodsDepots:string[][];roundGoods:string[];goodsPhases:string[][];
  pools:Record<TileKind|'black',string[]>;removedTiles:string[];unusedGoods:string[];rng:number;bought:boolean;pending:PendingEffect|null;events:BurgundyEvent[];result:BurgundyResult|null;
  audit:{silverGranted:number;silverPaid:number;workersGranted:number;workersPaid:number};
}
export interface BurgundyView extends Omit<BurgundyFrame,'players'> {
  id:string;match:number;createdAt:string;revision:number;viewer:number|null;config:BurgundyConfig;
  players:Array<FramePlayer&{soldGoods?:string[]}>;boards:EstateBoard[];tiles:Record<string,Tile>;goodsCatalog:Record<string,Good>;events:PublicEvent[];legalActions?:Action[];
}
