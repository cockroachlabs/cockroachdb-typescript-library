import { describe, expect, it } from 'vitest';
import { backoffDelayMs, DEFAULT_RETRY_POLICY } from './retry.js';
import { followerReadClause, followerReadTimestamp, followerReadWithStaleness } from './follower.js';
import { isolationSql } from './isolation.js';
import { resolveConfig } from './config.js';

describe('retry', () => {
  it('has sibling-matching defaults', () => {
    expect(DEFAULT_RETRY_POLICY).toMatchObject({
      maxRetries: 5,
      initialDelayMs: 50,
      maxDelayMs: 5000,
      multiplier: 2,
      jitter: true,
    });
  });

  it('is exponential without jitter', () => {
    const p = { ...DEFAULT_RETRY_POLICY, jitter: false };
    expect(backoffDelayMs(p, 0)).toBe(50);
    expect(backoffDelayMs(p, 1)).toBe(100);
    expect(backoffDelayMs(p, 2)).toBe(200);
  });

  it('is capped', () => {
    const p = { ...DEFAULT_RETRY_POLICY, jitter: false };
    expect(backoffDelayMs(p, 10)).toBe(5000);
  });

  it('jitter stays within the cap', () => {
    for (let a = 0; a < 6; a++) {
      const ceiling = Math.min(50 * 2 ** a, 5000);
      expect(backoffDelayMs(DEFAULT_RETRY_POLICY, a)).toBeLessThanOrEqual(ceiling);
    }
  });
});

describe('follower', () => {
  it('builds clauses matching the sibling libraries', () => {
    expect(followerReadTimestamp()).toBe('AS OF SYSTEM TIME follower_read_timestamp()');
    expect(followerReadWithStaleness(10_000)).toBe("AS OF SYSTEM TIME '-10s'");
    expect(followerReadWithStaleness(1500)).toBe("AS OF SYSTEM TIME '-1500ms'");
    expect(followerReadClause(0)).toBe('AS OF SYSTEM TIME follower_read_timestamp()');
    expect(() => followerReadWithStaleness(0)).toThrow();
  });
});

describe('isolation + config', () => {
  it('maps isolation to sql', () => {
    expect(isolationSql('serializable')).toBe('SERIALIZABLE');
    expect(isolationSql('read committed')).toBe('READ COMMITTED');
  });

  it('merges config over defaults', () => {
    const c = resolveConfig({ region: 'us-east1', retry: { maxRetries: 9 } as never });
    expect(c.region).toBe('us-east1');
    expect(c.retry.maxRetries).toBe(9);
    expect(c.retry.initialDelayMs).toBe(50); // default preserved
    expect(c.isolation).toBe('serializable');
  });
});
