/**
 * Follower-read `AS OF SYSTEM TIME` clause builders.
 *
 * The clause scopes a read to a slightly stale timestamp served from the nearest
 * replica. The SQLx/pg adapters splice it into a transaction, never into the
 * query string (appending to the query is a syntax error in CockroachDB).
 */

/** `AS OF SYSTEM TIME follower_read_timestamp()` — let CockroachDB choose. */
export function followerReadTimestamp(): string {
  return 'AS OF SYSTEM TIME follower_read_timestamp()';
}

/** `AS OF SYSTEM TIME '-<staleness>'` for a fixed staleness (ms). Must be positive. */
export function followerReadWithStaleness(stalenessMs: number): string {
  if (stalenessMs <= 0) {
    throw new Error(`crdb: follower read staleness must be positive, got ${stalenessMs}`);
  }
  const body = stalenessMs % 1000 === 0 ? `${stalenessMs / 1000}s` : `${stalenessMs}ms`;
  return `AS OF SYSTEM TIME '-${body}'`;
}

/** `0` uses `follower_read_timestamp()`, otherwise a fixed `-<staleness>`. */
export function followerReadClause(stalenessMs: number): string {
  return stalenessMs <= 0 ? followerReadTimestamp() : followerReadWithStaleness(stalenessMs);
}

/** `AS OF SYSTEM TIME '<timestamp>'` for an exact point in time (ISO 8601 string). */
export function asOfSystemTime(timestamp: string): string {
  return `AS OF SYSTEM TIME '${timestamp}'`;
}
