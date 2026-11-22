import type { RetryPolicy } from './retry.js';
import { DEFAULT_RETRY_POLICY } from './retry.js';
import type { IsolationLevel } from './isolation.js';
import { DEFAULT_ISOLATION } from './isolation.js';

/** CockroachDB-aware configuration shared by the adapters. */
export interface CrdbConfig {
  /** Retry policy for serialization conflicts. */
  retry: RetryPolicy;
  /** Home region for REGIONAL BY ROW writes. */
  region?: string;
  /** Whether follower reads are enabled by default. */
  followerReads: boolean;
  /** Default follower-read staleness in ms (`0` = `follower_read_timestamp()`). */
  stalenessMs: number;
  /** Default transaction isolation level. */
  isolation: IsolationLevel;
  /** Whether transactions are read-only by default. */
  readOnly: boolean;
}

/** Defaults: serializable, no region, follower reads off, read-write. */
export const DEFAULT_CONFIG: CrdbConfig = {
  retry: DEFAULT_RETRY_POLICY,
  followerReads: false,
  stalenessMs: 0,
  isolation: DEFAULT_ISOLATION,
  readOnly: false,
};

/** Merges a partial config over the defaults (retry is merged field-wise). */
export function resolveConfig(partial?: Partial<CrdbConfig>): CrdbConfig {
  return {
    ...DEFAULT_CONFIG,
    ...partial,
    retry: { ...DEFAULT_RETRY_POLICY, ...partial?.retry },
  };
}
