/**
 * Test harness for CockroachDB client code — no live cluster required.
 *
 * {@link FakeDbError} carries a chosen SQLSTATE; {@link RetrySimulator} fails then
 * succeeds deterministically; {@link ConcurrencyRunner} drives concurrent workers.
 */
export * from './fakeError.js';
export * from './retrySimulator.js';
export * from './concurrency.js';
