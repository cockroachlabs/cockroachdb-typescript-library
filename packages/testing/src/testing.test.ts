import { describe, expect, it } from 'vitest';
import { isRetryable } from '@cockroachdb/core';
import { ConcurrencyRunner, FakeDbError, RetrySimulator } from './index.js';

describe('FakeDbError', () => {
  it('serialization failure is retryable', () => {
    const e = FakeDbError.serializationFailure();
    expect(e.code).toBe('40001');
    expect(isRetryable(e)).toBe(true);
  });

  it('plain error is not retryable', () => {
    expect(isRetryable(new FakeDbError('boom'))).toBe(false);
  });
});

describe('RetrySimulator', () => {
  it('fails then succeeds', async () => {
    const sim = RetrySimulator.serializationFailures(2);
    await expect(sim.run()).rejects.toThrow();
    await expect(sim.run()).rejects.toThrow();
    await expect(sim.run()).resolves.toBeUndefined();
    expect(sim.calls).toBe(3);
  });
});

describe('ConcurrencyRunner', () => {
  it('counts all successes', async () => {
    const report = await new ConcurrencyRunner(4, 10).run(async () => {});
    expect(report).toEqual({ total: 40, successes: 40, failures: 0 });
  });

  it('counts failures and passes unique indices', async () => {
    const seen = new Set<number>();
    const report = await new ConcurrencyRunner(3, 4).run(async (i) => {
      seen.add(i);
      if (i % 2 === 1) throw new Error('odd');
    });
    expect(report.total).toBe(12);
    expect(seen.size).toBe(12);
    expect(report.successes + report.failures).toBe(12);
  });
});
