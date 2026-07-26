import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { CdpSession, readGsTokenFromTab } from '../src/auth/cdp.js';

class FakeTransport extends EventEmitter {
  sent: unknown[] = [];
  send(data: string) {
    const message = JSON.parse(data) as { id: number; method: string };
    this.sent.push(message);
    setImmediate(() => this.emit('message', JSON.stringify({ id: message.id, result: { result: { type: 'string', value: 'site-token' } } })));
  }
  close() {}
}

describe('CDP session', () => {
  it('correlates command responses by id', async () => {
    const transport = new FakeTransport();
    const session = new CdpSession(transport);

    const result = await session.sendCommand('Runtime.evaluate', { expression: '1+1' });

    expect(result).toEqual({ result: { type: 'string', value: 'site-token' } });
    expect(transport.sent).toMatchObject([{ id: 1, method: 'Runtime.evaluate' }]);
  });

  it('evaluates only gs_token on the exact GreeksSurge origin', async () => {
    const transport = new FakeTransport();
    const token = await readGsTokenFromTab(new CdpSession(transport), 'https://csp.greekssurge.com/dashboard');

    expect(token).toBe('site-token');
    expect(JSON.stringify(transport.sent)).toContain("localStorage.getItem('gs_token')");
  });

  it('refuses to evaluate on Google or lookalike origins', async () => {
    const session = new CdpSession(new FakeTransport());
    await expect(readGsTokenFromTab(session, 'https://accounts.google.com/signin')).rejects.toThrow(/exact GreeksSurge origin/);
    await expect(readGsTokenFromTab(session, 'https://evil-csp.greekssurge.com/')).rejects.toThrow(/exact GreeksSurge origin/);
  });
});
