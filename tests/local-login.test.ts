import { describe, expect, it, vi } from 'vitest';
import { runLocalLogin, authStatus, authLogout } from '../src/auth/local-login.js';
import type { TokenStore } from '../src/auth/token-store.js';

class MemoryTokenStore implements TokenStore {
  token: string | undefined;
  async read() { return this.token; }
  async write(token: string) { this.token = token; }
  async clear() { this.token = undefined; }
}

describe('local login service', () => {
  it('validates a captured GreeksSurge token before storing it and closes only the launched browser', async () => {
    const store = new MemoryTokenStore();
    const close = vi.fn();
    const validateToken = vi.fn(async () => ({ tier: 'premium' }));

    const result = await runLocalLogin({
      loginUrl: new URL('https://csp.greekssurge.com/login'),
      store,
      launchBrowser: async () => ({ profileDir: '/tmp/profile', close }),
      waitForToken: async () => 'site-token',
      validateToken,
    });

    expect(validateToken).toHaveBeenCalledWith('site-token');
    expect(store.token).toBe('site-token');
    expect(close).toHaveBeenCalledOnce();
    expect(result).toEqual({ status: 'authenticated', tier: 'premium' });
  });

  it('does not store tokens that fail validation', async () => {
    const store = new MemoryTokenStore();
    await expect(runLocalLogin({
      loginUrl: new URL('https://csp.greekssurge.com/login'),
      store,
      launchBrowser: async () => ({ profileDir: '/tmp/profile', close: vi.fn() }),
      waitForToken: async () => 'bad-token',
      validateToken: async () => { throw new Error('AUTH_REQUIRED'); },
    })).rejects.toThrow(/Unable to validate/);
    expect(store.token).toBeUndefined();
  });

  it('supports timeout or cancellation before token capture', async () => {
    const store = new MemoryTokenStore();
    await expect(runLocalLogin({
      loginUrl: new URL('https://csp.greekssurge.com/login'),
      store,
      launchBrowser: async () => ({ profileDir: '/tmp/profile', close: vi.fn() }),
      waitForToken: async () => undefined,
      validateToken: async () => ({ tier: 'premium' }),
    })).rejects.toThrow(/timed out|cancelled/i);
    expect(store.token).toBeUndefined();
  });

  it('reports auth status and logout without exposing tokens', async () => {
    const store = new MemoryTokenStore();
    expect(await authStatus(store)).toEqual({ authenticated: false });
    await store.write('site-token');
    expect(await authStatus(store)).toEqual({ authenticated: true });
    await authLogout(store);
    expect(await authStatus(store)).toEqual({ authenticated: false });
  });
});
