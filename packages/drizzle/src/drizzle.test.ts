import { describe, expect, it } from 'vitest';
import { executeTx } from './index.js';

interface FakeTx {
  readonly marker: 'tx';
}

/** A drizzle-like db whose transaction throws 40001 `failTimes`, then succeeds. */
function fakeDb(failTimes: number): { calls: number } & {
  transaction<T>(fn: (tx: FakeTx) => Promise<T>): Promise<T>;
} {
  const state = { calls: 0 };
  return {
    get calls() {
      return state.calls;
    },
    async transaction<T>(fn: (tx: FakeTx) => Promise<T>): Promise<T> {
      state.calls += 1;
      if (state.calls <= failTimes) {
        const e = new Error('restart transaction') as Error & { code?: string };
        e.code = '40001';
        throw e;
      }
      return fn({ marker: 'tx' });
    },
  };
}

const fast = { maxRetries: 5, initialDelayMs: 1, maxDelayMs: 2, multiplier: 2, jitter: false };

describe('drizzle executeTx', () => {
  it('retries 40001 then succeeds', async () => {
    const db = fakeDb(2);
    const result = await executeTx(db, async () => 'ok', fast);
    expect(result).toBe('ok');
    expect(db.calls).toBe(3);
  });

  it('propagates non-retryable errors', async () => {
    const db = {
      async transaction(): Promise<never> {
        throw new Error('fatal');
      },
    };
    await expect(executeTx(db, async () => 'ok', fast)).rejects.toThrow('fatal');
  });
});
