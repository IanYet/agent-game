import {holdemModule} from './definition';
import {HoldemTable} from './ui';
import {Cover} from './cover';
import {ConfigFields} from './config';
import {CardReplay} from '../CardReplay';
export const game={...holdemModule,ui:{Table:HoldemTable,Replay:CardReplay,ConfigFields,Cover,cardClass:'poker-feature'}};
