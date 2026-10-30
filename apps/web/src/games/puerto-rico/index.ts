import {puertoRicoModule} from './definition';
import {PuertoRicoTable,PuertoRicoConfig,PuertoRicoReplay} from './ui';
export const game={...puertoRicoModule,ui:{Table:PuertoRicoTable,ConfigFields:PuertoRicoConfig,Replay:PuertoRicoReplay}};
