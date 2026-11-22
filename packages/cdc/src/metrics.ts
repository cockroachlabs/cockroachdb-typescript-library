/** Metrics for the webhook sink. */

/** A point-in-time view of {@link CdcMetrics}. */
export interface CdcSnapshot {
  events: number;
  resolved: number;
  errors: number;
  authFailures: number;
  totalLatencyMs: number;
}

/** Counters for webhook deliveries. */
export class CdcMetrics {
  private s: CdcSnapshot = {
    events: 0,
    resolved: 0,
    errors: 0,
    authFailures: 0,
    totalLatencyMs: 0,
  };

  recordEvent(latencyMs: number, isError: boolean): void {
    this.s.events += 1;
    if (isError) this.s.errors += 1;
    this.s.totalLatencyMs += latencyMs;
  }

  recordResolved(): void {
    this.s.resolved += 1;
  }

  recordAuthFailure(): void {
    this.s.authFailures += 1;
  }

  snapshot(): CdcSnapshot {
    return { ...this.s };
  }
}
