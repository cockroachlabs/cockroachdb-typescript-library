import { SQLSTATE_SERIALIZATION_FAILURE } from '@cockroachdb/core';

/** An error carrying a SQLSTATE `code`, like the ones `pg` throws. */
export class FakeDbError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'FakeDbError';
  }

  /** An error carrying `code` as its SQLSTATE. */
  static withCode(code: string): FakeDbError {
    return new FakeDbError(`fake db error (SQLSTATE ${code})`, code);
  }

  /** A serialization-failure error (`40001`). */
  static serializationFailure(): FakeDbError {
    return FakeDbError.withCode(SQLSTATE_SERIALIZATION_FAILURE);
  }
}
