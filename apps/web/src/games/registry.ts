import {GameRegistry} from '../runtime/types';
import {game as doudizhu} from './doudizhu';
import {game as holdem} from './holdem';
import {game as baohuang} from './baohuang';
import {game as chess} from './chess';
import {game as azul} from './azul';
import {game as citadels} from './citadels';
import {game as guandan} from './guandan';
// Adding a game changes its module folder and this registration only.
export const gameRegistry=new GameRegistry([doudizhu,holdem,baohuang,chess,azul,citadels,guandan]);
