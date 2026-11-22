import { isResolved, parseEnvelope, type Payload } from './event.js';
import { CdcMetrics } from './metrics.js';

/** Thrown when a webhook request fails bearer-token authentication. */
export class UnauthorizedError extends Error {
  constructor() {
    super('unauthorized webhook request');
    this.name = 'UnauthorizedError';
  }
}

/** Handles one row change. Throwing stops the batch and signals a retry. */
export type EventHandler = (payload: Payload) => Promise<void>;

/** The result of handling one webhook delivery. */
export interface Outcome {
  processed: number;
  resolved: boolean;
}

/** Options for {@link WebhookSink}. */
export interface WebhookSinkOptions {
  /** Require `Authorization: Bearer <token>` on every delivery. */
  authToken?: string;
  /** Metrics recorder. */
  metrics?: CdcMetrics;
}

/**
 * A framework-agnostic CockroachDB webhook sink. Feed it the raw body and (if
 * auth is configured) the `Authorization` header from your HTTP server.
 */
export class WebhookSink {
  constructor(
    private readonly handler: EventHandler,
    private readonly options: WebhookSinkOptions = {},
  ) {}

  async handle(authHeader: string | undefined, body: string | Uint8Array): Promise<Outcome> {
    const { authToken, metrics } = this.options;
    if (authToken !== undefined) {
      const provided = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : undefined;
      if (provided !== authToken) {
        metrics?.recordAuthFailure();
        throw new UnauthorizedError();
      }
    }

    const env = parseEnvelope(body);
    if (isResolved(env)) {
      metrics?.recordResolved();
      return { processed: 0, resolved: true };
    }

    let processed = 0;
    for (const payload of env.payload ?? []) {
      const start = Date.now();
      try {
        await this.handler(payload);
        metrics?.recordEvent(Date.now() - start, false);
      } catch (err) {
        metrics?.recordEvent(Date.now() - start, true);
        throw err;
      }
      processed += 1;
    }
    return { processed, resolved: false };
  }
}
