export * from './types';
export * from './cards';
export * from './combinations';
export * from './doudizhu';
export * from './rules';
export * from './holdem';
export * from './games';
import { doudizhu } from './doudizhu';
export const gameCatalog = [{ id: doudizhu.id, name: doudizhu.name, minPlayers: 3, maxPlayers: 3, available: true }, { id: 'holdem', name: '德州扑克', minPlayers: 2, maxPlayers: 9, available: true }];
