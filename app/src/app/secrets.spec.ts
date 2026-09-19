import { describe, expect, it } from 'vitest';
import { looksLikeApiKey } from './secrets';

describe('looksLikeApiKey', () => {
  it('recognises Anthropic-style keys, also with surrounding spaces', () => {
    expect(looksLikeApiKey('sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789')).toBe(true);
    expect(looksLikeApiKey('  sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789\n')).toBe(true);
    expect(looksLikeApiKey('sk-proj_abcdefghijklmnopqrstuvwxyz')).toBe(true);
  });
  it('lets normal LeafLimits tokens through', () => {
    for (const t of ['demo', 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718', 'my-long-random-token-123', '']) {
      expect(looksLikeApiKey(t)).toBe(false);
    }
  });
  it('handles missing values', () => {
    expect(looksLikeApiKey(null)).toBe(false);
    expect(looksLikeApiKey(undefined)).toBe(false);
  });
});
