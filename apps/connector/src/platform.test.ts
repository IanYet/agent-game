import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { dataDirectory, macSearchPath } from './platform';

describe('platform paths', () => {
  it('uses Application Support on macOS and preserves explicit data directories', () => {
    expect(dataDirectory('darwin', '/Users/test', {})).toBe(join('/Users/test', 'Library/Application Support/AgentArcade'));
    expect(dataDirectory('win32', 'C:/test', { LOCALAPPDATA: 'C:/local' })).toBe(join('C:/local', 'AgentArcade'));
    expect(dataDirectory('darwin', '/Users/test', { AGENT_GAME_DATA_DIR: '/custom' })).toBe('/custom');
  });
  it('finds CLI shims from a Finder PATH without trusting relative or empty entries', () => {
    const parts = macSearchPath('/Users/test', '/App/Resources/runtime', '/usr/bin:.:/bin', '/custom/bin:/usr/bin', ['v24.0.0']).split(':');
    expect(parts[0]).toBe('/App/Resources/runtime');
    expect(parts).toContain('/opt/homebrew/bin');
    expect(parts).toContain('/usr/local/bin');
    expect(parts).toContain('/Users/test/.nvm/versions/node/v24.0.0/bin');
    expect(parts).toContain('/custom/bin');
    expect(new Set(parts).size).toBe(parts.length);
    expect(parts).not.toContain('.'); expect(parts).not.toContain('');
  });
});
