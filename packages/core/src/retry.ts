/** Retry policy with exponential backoff and jitter. Defaults match the sibling libraries. */
export interface RetryPolicy {
  /** Maximum retries after the first attempt. */
  maxRetries: number;
  /** Delay before the first retry, in milliseconds. */
  initialDelayMs: number;
  /** Upper bound on any single delay, in milliseconds. */
  maxDelayMs: number;
  /** Backoff growth factor per attempt. */
  multiplier: number;
  /** Apply full jitter in `[0, computed]` when true. */
  jitter: boolean;
}

/** 5 retries, 50 ms initial, 5 s cap, 2× growth, jitter on. */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 5,
  initialDelayMs: 50,
  maxDelayMs: 5000,
  multiplier: 2,
  jitter: true,
};

/**
 * Backoff delay (ms) before retry `attempt` (0-based). Exponential, capped at
 * `maxDelayMs`, with full jitter when enabled.
 */
export function backoffDelayMs(policy: RetryPolicy, attempt: number): number {
  const base = policy.initialDelayMs * Math.pow(policy.multiplier, attempt);
  const capped = Math.min(base, policy.maxDelayMs);
  return policy.jitter ? capped * Math.random() : capped;
}

/** Promise-based sleep. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
