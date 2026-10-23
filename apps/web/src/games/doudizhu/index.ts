import {doudizhuModule} from './definition';
import {DoudizhuTable} from './ui';
import {Cover} from './cover';
import {CardReplay} from '../CardReplay';
export const game={...doudizhuModule,ui:{Table:DoudizhuTable,Replay:CardReplay,Cover}};
