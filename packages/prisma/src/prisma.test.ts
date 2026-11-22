import { describe, expect, it } from 'vitest';
import { executeTx, isPrismaRetryable } from './index.js';

const fast = { maxRetries: 5, initialDelayMs: 1, maxDelayMs: 2, multiplier: 2, jitter: false };

describe('isPrismaRetryable', () => {
  it('matches SQLSTATE 40001 and Prisma P2034', () => {
    expect(isPrismaRetryable({ code: '40001' })).toBe(true);
    expect(isPrismaRetryable({ code: 'P2034' })).toBe(true);
    expect(isPrismaRetryable({ code: 'P2002' })).toBe(false);
  });
});

describe('prisma executeTx', () => {
  it('retries a P2034 write conflict then succeeds', async () => {
    let calls = 0;
    const prisma = {
      async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
        calls += 1;
        if (calls <= 2) {
          const e = new Error('write conflict') as Error & { code?: string };
          e.code = 'P2034';
          throw e;
        }
        return fn({});
      },
    };
    const result = await executeTx(prisma, async () => 'ok', fast);
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('propagates non-retryable errors', async () => {
    const prisma = {
      async $transaction(): Promise<never> {
        const e = new Error('unique violation') as Error & { code?: string };
        e.code = 'P2002';
        throw e;
      },
    };
    await expect(executeTx(prisma, async () => 'ok', fast)).rejects.toThrow('unique violation');
  });
});
