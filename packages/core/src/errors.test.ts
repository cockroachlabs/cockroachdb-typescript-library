import { describe, expect, it } from 'vitest';
import {
  isRetryable,
  isRetryableCode,
  isSerializationFailure,
  sqlStateOf,
} from './errors.js';

describe('errors', () => {
  it('classifies known codes', () => {
    expect(isRetryableCode('40001')).toBe(true);
    expect(isRetryableCode('40P01')).toBe(true);
    expect(isRetryableCode('23505')).toBe(false);
  });

  it('reads code from an error object', () => {
    expect(isRetryable({ code: '40001' })).toBe(true);
    expect(isSerializationFailure({ code: '40001' })).toBe(true);
    expect(isSerializationFailure({ code: '40P01' })).toBe(false);
    expect(isRetryable({})).toBe(false);
  });

  it('walks the cause chain', () => {
    const wrapped = new Error('outer', { cause: { code: '40001' } });
    expect(sqlStateOf(wrapped)).toBe('40001');
    expect(isRetryable(wrapped)).toBe(true);
  });

  it('tolerates cause cycles', () => {
    const a: Record<string, unknown> = {};
    const b: Record<string, unknown> = { cause: a };
    a.cause = b;
    expect(sqlStateOf(a)).toBeUndefined();
  });
});
