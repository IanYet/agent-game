import {holdemModule} from './definition';
import {HoldemTable} from './ui';
import {ConfigFields} from './config';
import {CardReplay} from '../CardReplay';
export const game={...holdemModule,ui:{Table:HoldemTable,Replay:CardReplay,ConfigFields}};
