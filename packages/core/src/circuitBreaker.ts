/** A three-state circuit breaker (closed / open / half-open). */

export type CircuitState = 'closed' | 'open' | 'half-open';

/** Thrown when the breaker is open and rejects a call. */
export class CircuitBreakerOpenError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super(`circuit breaker is open, retry after ${retryAfterMs}ms`);
    this.name = 'CircuitBreakerOpenError';
  }
}

/** Options for {@link CircuitBreaker}. */
export interface CircuitBreakerOptions {
  /** Consecutive failures that trip the breaker open (default 5). */
  failureThreshold?: number;
  /** How long the breaker stays open before probing, in ms (default 30000). */
  breakDurationMs?: number;
  /** Callback on every `(from, to)` state transition. */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

/** A three-state circuit breaker. */
export class CircuitBreaker {
  private current: CircuitState = 'closed';
  private failures = 0;
  private openedAt = 0;
  private readonly failureThreshold: number;
  private readonly breakDurationMs: number;
  private readonly onStateChange?: (from: CircuitState, to: CircuitState) => void;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.breakDurationMs = options.breakDurationMs ?? 30_000;
    this.onStateChange = options.onStateChange;
  }

  /** The current state. */
  get state(): CircuitState {
    return this.current;
  }

  /** The current consecutive-failure count. */
  get failureCount(): number {
    return this.failures;
  }

  /** Forces the breaker closed and clears the failure count. */
  reset(): void {
    this.failures = 0;
    this.openedAt = 0;
    this.transition('closed');
  }

  /** Runs `fn` through the breaker. */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.current === 'open') {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.breakDurationMs) {
        this.transition('half-open');
      } else {
        throw new CircuitBreakerOpenError(this.breakDurationMs - elapsed);
      }
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.current === 'half-open') {
      this.transition('closed');
    }
  }

  private onFailure(): void {
    this.failures += 1;
    const trip =
      this.current === 'half-open' ||
      (this.current === 'closed' && this.failures >= this.failureThreshold);
    if (trip) {
      this.openedAt = Date.now();
      this.transition('open');
    }
  }

  private transition(to: CircuitState): void {
    if (to !== this.current) {
      const from = this.current;
      this.current = to;
      this.onStateChange?.(from, to);
    }
  }
}
