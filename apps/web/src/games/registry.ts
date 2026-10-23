import {GameRegistry} from '../runtime/types';
import {game as doudizhu} from './doudizhu';
import {game as holdem} from './holdem';
// Adding a game changes its module folder and this registration only.
export const gameRegistry=new GameRegistry([doudizhu,holdem]);
