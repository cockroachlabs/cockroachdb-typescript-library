/** SQLSTATE-based error classification. */

/** `40001` — serialization failure (the retryable CockroachDB conflict). */
export const SQLSTATE_SERIALIZATION_FAILURE = '40001';

/** `40P01` — deadlock detected (also safe to retry). */
export const SQLSTATE_DEADLOCK = '40P01';

/** Returns `true` for SQLSTATE codes that should be retried. */
export function isRetryableCode(code: string): boolean {
  return code === SQLSTATE_SERIALIZATION_FAILURE || code === SQLSTATE_DEADLOCK;
}

/**
 * Extracts a Postgres SQLSTATE from an error, walking the `cause` chain.
 * `pg` sets `error.code` to the SQLSTATE string.
 */
export function sqlStateOf(err: unknown): string | undefined {
  let cur: unknown = err;
  const seen = new Set<unknown>();
  while (cur && typeof cur === 'object' && !seen.has(cur)) {
    seen.add(cur);
    const code = (cur as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Returns `true` if `err` carries a retryable SQLSTATE anywhere in its cause chain. */
export function isRetryable(err: unknown): boolean {
  const code = sqlStateOf(err);
  return code !== undefined && isRetryableCode(code);
}

/** Returns `true` if `err` is specifically a serialization failure (`40001`). */
export function isSerializationFailure(err: unknown): boolean {
  return sqlStateOf(err) === SQLSTATE_SERIALIZATION_FAILURE;
}
