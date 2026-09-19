import { beforeEach, describe, expect, it } from 'vitest';
import { Session } from './session';

const KEY = 'sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';

describe('Session', () => {
  beforeEach(() => localStorage.clear());

  it('keeps a normal token', () => {
    localStorage.setItem('ll_token', 'demo');
    expect(new Session().token()).toBe('demo');
    expect(localStorage.getItem('ll_token')).toBe('demo');
  });

  it('removes an API key that was stored by mistake, and does not use it', () => {
    localStorage.setItem('ll_token', KEY);
    const s = new Session();
    expect(s.token()).toBe('');
    expect(localStorage.getItem('ll_token')).toBeNull();
  });

  it('refuses to store an API key through update()', () => {
    const s = new Session();
    s.update(KEY, 'esp32s3-01');
    expect(s.token()).toBe('');
    expect(localStorage.getItem('ll_token')).toBeNull();
    s.update('  demo ', ' dev-1 ');
    expect(s.token()).toBe('demo');
    expect(s.device()).toBe('dev-1');
  });
});
