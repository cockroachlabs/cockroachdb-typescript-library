import { CrdbPool, core } from '@cockroachdb/pg';

// tag::metrics-config[]
/**
 * Connects a pool wired to an in-memory metrics recorder. Every transaction,
 * retry, and follower read the pool runs is counted — `withMetrics` is the only
 * extra call versus a plain connect. Returns both so callers can read the
 * snapshot after exercising the pool.
 */
export function meteredPool(
  url: string,
  config?: Partial<core.CrdbConfig>,
): { pool: CrdbPool; recorder: core.InMemoryRecorder } {
  const recorder = new core.InMemoryRecorder();
  const pool = CrdbPool.connect(url, config).withMetrics(recorder);
  return { pool, recorder };
}

/** Prints a one-line summary of the recorder's counters. */
export function printMetrics(recorder: core.InMemoryRecorder): void {
  const s = recorder.snapshot();
  console.log(
    `metrics: ${s.transactionCount} transactions (${s.transactionSuccessCount} ok, ` +
      `${s.retryCount} retries), ${s.followerReadCount} follower reads`,
  );
}
// end::metrics-config[]
