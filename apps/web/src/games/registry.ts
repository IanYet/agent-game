import {GameRegistry} from '../runtime/types';
import {game as doudizhu} from './doudizhu';
import {game as guandan} from './guandan';
import {game as holdem} from './holdem';
import {game as baohuang} from './baohuang';
import {game as chess} from './chess';
import {game as splendor} from './splendor';
import {game as azul} from './azul';
import {game as citadels} from './citadels';
import {game as catan} from './catan';
import {game as burgundy} from './castles-of-burgundy';
import {game as puertoRico} from './puerto-rico';
// Adding a game changes its module folder and this registration only.
export const gameRegistry=new GameRegistry([doudizhu,guandan,holdem,baohuang,chess,azul,citadels,splendor,catan,burgundy,puertoRico]);
