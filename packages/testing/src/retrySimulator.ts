import { SQLSTATE_SERIALIZATION_FAILURE } from '@cockroachdb/core';
import { FakeDbError } from './fakeError.js';

/**
 * Fails with a retryable error the first `failTimes` calls, then succeeds. Drives
 * a retry loop deterministically without contention or a live cluster.
 */
export class RetrySimulator {
  private attempts = 0;

  constructor(
    private readonly failTimes: number,
    private readonly code: string = SQLSTATE_SERIALIZATION_FAILURE,
  ) {}

  /** Fails `failTimes` times with `40001`, then succeeds. */
  static serializationFailures(failTimes: number): RetrySimulator {
    return new RetrySimulator(failTimes);
  }

  /** How many times {@link RetrySimulator.run} has been called. */
  get calls(): number {
    return this.attempts;
  }

  /** Advances the simulator: throws for the first `failTimes` calls, then resolves. */
  async run(): Promise<void> {
    const n = this.attempts;
    this.attempts += 1;
    if (n < this.failTimes) {
      throw FakeDbError.withCode(this.code);
    }
  }
}
