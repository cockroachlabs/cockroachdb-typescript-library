/**
 * node-postgres adapter for CockroachDB — the primary adapter.
 *
 * {@link CrdbPool} wraps a `pg.Pool` with serialization-conflict retries,
 * follower reads, metrics, and health. {@link transactional} is the AOP-style
 * decorator; {@link currentTx} / {@link requireTx} expose the ambient transaction.
 */
export * from './pool.js';
export * from './transactional.js';

/** Re-export of the driver-agnostic core for convenience. */
export * as core from '@cockroachdb/core';
