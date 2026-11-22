/**
 * Change data capture (CDC) for CockroachDB.
 *
 * {@link ChangefeedSpec} builds the `CREATE CHANGEFEED` SQL (run it with your own
 * pool — this package is driver-agnostic); {@link WebhookSink} validates auth,
 * parses the envelope, and dispatches each row change to your handler.
 */
export * from './changefeed.js';
export * from './event.js';
export * from './handler.js';
export * from './metrics.js';
