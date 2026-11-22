import { describe, expect, it } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { InMemoryRecorder } from '@cockroachdb/core';
import { CrdbPool } from './pool.js';
import { currentTx, requireTx, transactional } from './transactional.js';

/** A pg.Pool stand-in: connect() yields a no-op client; query() is a no-op. */
function fakePool(): Pool {
  const client = {
    query: async () => ({ rows: [], rowCount: 0 }),
    release: () => {},
  } as unknown as PoolClient;
  return {
    connect: async () => client,
    query: async () => ({ rows: [], rowCount: 0 }),
    end: async () => {},
  } as unknown as Pool;
}

const fastRetry = {
  retry: { maxRetries: 5, initialDelayMs: 1, maxDelayMs: 2, multiplier: 2, jitter: false },
};

function conflict(): Error {
  const e = new Error('restart transaction') as Error & { code?: string };
  e.code = '40001';
  return e;
}

describe('CrdbPool.executeTx', () => {
  it('retries 40001 then succeeds, recording metrics', async () => {
    const metrics = new InMemoryRecorder();
    const pool = new CrdbPool(fakePool(), fastRetry).withMetrics(metrics);
    let calls = 0;
    const result = await pool.executeTx(async () => {
      calls += 1;
      if (calls <= 2) throw conflict();
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(calls).toBe(3);
    const s = metrics.snapshot();
    expect(s.transactionCount).toBe(1);
    expect(s.transactionSuccessCount).toBe(1);
    expect(s.retryCount).toBe(2);
  });

  it('does not retry non-retryable errors', async () => {
    const pool = new CrdbPool(fakePool());
    let calls = 0;
    await expect(
      pool.executeTx(async () => {
        calls += 1;
        throw new Error('fatal');
      }),
    ).rejects.toThrow('fatal');
    expect(calls).toBe(1);
  });

  it('gives up after the retry budget', async () => {
    const pool = new CrdbPool(fakePool(), {
      retry: { maxRetries: 2, initialDelayMs: 1, maxDelayMs: 2, multiplier: 2, jitter: false },
    });
    let calls = 0;
    await expect(
      pool.executeTx(async () => {
        calls += 1;
        throw conflict();
      }),
    ).rejects.toMatchObject({ code: '40001' });
    expect(calls).toBe(3); // 1 initial + 2 retries
  });
});

describe('@transactional + ambient tx', () => {
  class Accounts {
    constructor(public pool: CrdbPool) {}

    @transactional()
    async hasTx(): Promise<boolean> {
      return currentTx() !== undefined;
    }
  }

  it('binds the transaction client for the method body', async () => {
    const svc = new Accounts(new CrdbPool(fakePool()));
    expect(await svc.hasTx()).toBe(true);
  });

  it('requireTx throws outside a transaction', () => {
    expect(() => requireTx()).toThrow();
  });
});
