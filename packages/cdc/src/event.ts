/** Parsing of the JSON a CockroachDB webhook sink posts. */

/** The kind of change a payload represents. */
export type Operation = 'insert' | 'update' | 'delete';

/** A single row change. */
export interface Payload {
  after?: unknown;
  before?: unknown;
  key?: unknown;
  topic?: string;
  updated?: string;
}

/** The `wrapped` webhook envelope: row changes and/or a resolved marker. */
export interface Envelope {
  payload?: Payload[];
  length?: number;
  resolved?: string;
}

/** `true` when the envelope is a resolved-timestamp heartbeat. */
export function isResolved(env: Envelope): boolean {
  return env.resolved !== undefined && (env.payload === undefined || env.payload.length === 0);
}

/**
 * Infers the operation from a payload's row images: missing/null `after` is a
 * delete; a present `before` (only with `WITH diff`) means update; otherwise insert.
 */
export function operationOf(payload: Payload): Operation {
  const afterPresent = payload.after !== undefined && payload.after !== null;
  if (!afterPresent) return 'delete';
  const beforePresent = payload.before !== undefined && payload.before !== null;
  return beforePresent ? 'update' : 'insert';
}

/** Parses a webhook body (string or bytes) into an {@link Envelope}. */
export function parseEnvelope(body: string | Uint8Array): Envelope {
  const text = typeof body === 'string' ? body : new TextDecoder().decode(body);
  return JSON.parse(text) as Envelope;
}
