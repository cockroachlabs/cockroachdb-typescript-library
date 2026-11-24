/**
 * Driver-agnostic core for the CockroachDB TypeScript library.
 *
 * Retry policy, SQLSTATE classification, isolation levels, follower-read
 * `AS OF SYSTEM TIME` builders, multi-region row homing, a circuit breaker,
 * composable middleware, and metrics/health interfaces. The `@cockroachdb/pg`
 * adapter wires these into a connection pool.
 */

export * from './errors.js';
export * from './retry.js';
export * from './isolation.js';
export * from './config.js';
export * from './follower.js';
export * from './region.js';
export * from './circuitBreaker.js';
export * from './metrics.js';
export * from './health.js';
export * from './middleware.js';
export * from './multiregion.js';
export * as ddl from './ddl.js';
