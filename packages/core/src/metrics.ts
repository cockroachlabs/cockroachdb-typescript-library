/** Metrics recorder interface and an in-memory implementation. */

/** A point-in-time view of recorded metrics. */
export interface Snapshot {
  transactionCount: number;
  transactionSuccessCount: number;
  transactionFailureCount: number;
  retryCount: number;
  followerReadCount: number;
  totalTransactionMs: number;
  totalRetryDelayMs: number;
  totalFollowerReadMs: number;
}

/** Records CockroachDB operation metrics. */
export interface MetricsRecorder {
  recordTransaction(durationMs: number, retries: number, success: boolean): void;
  recordRetry(delayMs: number): void;
  recordFollowerRead(durationMs: number): void;
}

/** An in-memory {@link MetricsRecorder}, ideal for tests. */
export class InMemoryRecorder implements MetricsRecorder {
  private s: Snapshot = {
    transactionCount: 0,
    transactionSuccessCount: 0,
    transactionFailureCount: 0,
    retryCount: 0,
    followerReadCount: 0,
    totalTransactionMs: 0,
    totalRetryDelayMs: 0,
    totalFollowerReadMs: 0,
  };

  recordTransaction(durationMs: number, retries: number, success: boolean): void {
    this.s.transactionCount += 1;
    if (success) this.s.transactionSuccessCount += 1;
    else this.s.transactionFailureCount += 1;
    this.s.retryCount += retries;
    this.s.totalTransactionMs += durationMs;
  }

  recordRetry(delayMs: number): void {
    this.s.totalRetryDelayMs += delayMs;
  }

  recordFollowerRead(durationMs: number): void {
    this.s.followerReadCount += 1;
    this.s.totalFollowerReadMs += durationMs;
  }

  /** Returns a copy of the current counters. */
  snapshot(): Snapshot {
    return { ...this.s };
  }
}
