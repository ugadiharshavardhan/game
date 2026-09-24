import { describe, expect, it } from 'vitest';
import { isTeamCode, normaliseTeamCode } from './identity';

describe('team codes', () => {
  it('accepts a code however it was typed', () => {
    expect(normaliseTeamCode(' ms7k2p ')).toBe('MS7K2P');
    expect(normaliseTeamCode('ms7-k2p')).toBe('MS7K2P');
    expect(normaliseTeamCode('MS 7K 2P')).toBe('MS7K2P');
  });

  it('only calls six unambiguous characters a code', () => {
    expect(isTeamCode('MS7K2P')).toBe(true);
    expect(isTeamCode('MS7K2')).toBe(false);
    expect(isTeamCode('MO0I1P')).toBe(false);
    expect(isTeamCode('ms7k2p')).toBe(false);
  });
});
