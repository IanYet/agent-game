export * from './types';
export * from './cards';
export * from './combinations';
export * from './doudizhu';
export * from './rules';
import { doudizhu } from './doudizhu';
export const gameCatalog = [{ id: doudizhu.id, name: doudizhu.name, playerCount: 3, available: true }];
