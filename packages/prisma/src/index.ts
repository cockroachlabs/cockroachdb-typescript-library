import {
  backoffDelayMs,
  DEFAULT_RETRY_POLICY,
  isRetryable,
  sleep,
  type RetryPolicy,
} from '@cockroachdb/core';

/** Prisma's write-conflict / deadlock code (mapped from `40001`). */
export const PRISMA_WRITE_CONFLICT = 'P2034';

/**
 * Retryable if the underlying SQLSTATE is `40001`/`40P01` **or** Prisma reports a
 * write conflict (`P2034`). Prisma surfaces serialization conflicts as `P2034`,
 * not the raw SQLSTATE, so both must be checked.
 */
export function isPrismaRetryable(err: unknown): boolean {
  if (isRetryable(err)) return true;
  const code = (err as { code?: unknown })?.code;
  return code === PRISMA_WRITE_CONFLICT;
}

/**
 * The slice of a Prisma client used here: interactive `$transaction`. Typed
 * structurally so this adapter doesn't pin a generated client type.
 */
export interface PrismaLike<Tx> {
  $transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

/**
 * Runs a Prisma interactive transaction, retrying on serialization conflicts
 * (`40001` / `P2034`) with exponential backoff.
 */
export async function executeTx<Tx, T>(
  prisma: PrismaLike<Tx>,
  fn: (tx: Tx) => Promise<T>,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await prisma.$transaction(fn);
    } catch (err) {
      if (isPrismaRetryable(err) && attempt < policy.maxRetries) {
        attempt += 1;
        await sleep(backoffDelayMs(policy, attempt - 1));
        continue;
      }
      throw err;
    }
  }
}
