import {
  backoffDelayMs,
  DEFAULT_RETRY_POLICY,
  isRetryable,
  sleep,
  type RetryPolicy,
} from '@cockroachdb/core';

export { isRetryable } from '@cockroachdb/core';

/**
 * The slice of a Drizzle database used here: an interactive `transaction`.
 * Typed structurally so this adapter doesn't pin a specific drizzle-orm version;
 * any `NodePgDatabase` (or compatible) satisfies it.
 */
export interface DrizzleLike<Tx> {
  transaction<T>(fn: (tx: Tx) => Promise<T>, config?: unknown): Promise<T>;
}

/**
 * Runs a Drizzle transaction, retrying the whole callback on serialization
 * conflicts (`40001`) with exponential backoff.
 *
 * > Note: Drizzle has had a bug where `drizzle-kit push` can disable Postgres
 * > row-level security. If you rely on RLS for multi-region isolation, manage
 * > migrations as SQL and re-check RLS after deploy.
 */
export async function executeTx<Tx, T>(
  db: DrizzleLike<Tx>,
  fn: (tx: Tx) => Promise<T>,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await db.transaction(fn);
    } catch (err) {
      if (isRetryable(err) && attempt < policy.maxRetries) {
        attempt += 1;
        await sleep(backoffDelayMs(policy, attempt - 1));
        continue;
      }
      throw err;
    }
  }
}
