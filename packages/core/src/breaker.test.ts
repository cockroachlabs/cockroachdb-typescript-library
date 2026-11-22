import { describe, expect, it } from 'vitest';
import { CircuitBreaker, CircuitBreakerOpenError } from './circuitBreaker.js';
import { InMemoryRecorder } from './metrics.js';
import { ddl } from './index.js';

const ok = async () => 1;
const fail = async (): Promise<number> => {
  throw new Error('boom');
};

describe('CircuitBreaker', () => {
  it('stays closed on success', async () => {
    const cb = new CircuitBreaker();
    await cb.execute(ok);
    expect(cb.state).toBe('closed');
  });

  it('trips open at the threshold', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });
    for (let i = 0; i < 3; i++) await cb.execute(fail).catch(() => {});
    expect(cb.state).toBe('open');
  });

  it('blocks while open, then probes half-open and closes', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, breakDurationMs: 20 });
    await cb.execute(fail).catch(() => {});
    expect(cb.state).toBe('open');
    await expect(cb.execute(ok)).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    await new Promise((r) => setTimeout(r, 30));
    await cb.execute(ok);
    expect(cb.state).toBe('closed');
  });

  it('reopens on a failed probe', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, breakDurationMs: 20 });
    await cb.execute(fail).catch(() => {});
    await new Promise((r) => setTimeout(r, 30));
    await cb.execute(fail).catch(() => {});
    expect(cb.state).toBe('open');
  });

  it('reports state transitions', async () => {
    let transitions = 0;
    const cb = new CircuitBreaker({ failureThreshold: 1, onStateChange: () => (transitions += 1) });
    await cb.execute(fail).catch(() => {});
    expect(transitions).toBeGreaterThanOrEqual(1);
  });
});

describe('InMemoryRecorder', () => {
  it('aggregates counters', () => {
    const r = new InMemoryRecorder();
    r.recordTransaction(10, 2, true);
    r.recordTransaction(5, 0, false);
    r.recordRetry(50);
    r.recordFollowerRead(3);
    const s = r.snapshot();
    expect(s.transactionCount).toBe(2);
    expect(s.transactionSuccessCount).toBe(1);
    expect(s.transactionFailureCount).toBe(1);
    expect(s.retryCount).toBe(2);
    expect(s.followerReadCount).toBe(1);
    expect(s.totalTransactionMs).toBe(15);
  });
});

describe('ddl', () => {
  it('builds region/locality statements', () => {
    expect(ddl.setLocalityRegionalByRow('accounts')).toBe(
      'ALTER TABLE "accounts" SET LOCALITY REGIONAL BY ROW',
    );
    expect(ddl.addRegion('bank', 'eu-west1')).toBe(
      "ALTER DATABASE \"bank\" ADD REGION 'eu-west1'",
    );
  });
});
