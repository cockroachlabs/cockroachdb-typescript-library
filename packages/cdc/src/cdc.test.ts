import { describe, expect, it } from 'vitest';
import {
  CdcMetrics,
  ChangefeedSpec,
  operationOf,
  parseEnvelope,
  UnauthorizedError,
  WebhookSink,
} from './index.js';

describe('ChangefeedSpec', () => {
  it('builds basic SQL', () => {
    const sql = ChangefeedSpec.builder()
      .table('accounts')
      .webhookTarget('https://sink.example/cdc')
      .build()
      .toSql();
    expect(sql).toBe('CREATE CHANGEFEED FOR TABLE "accounts" INTO \'https://sink.example/cdc\'');
  });

  it('includes sorted options and columns', () => {
    const sql = ChangefeedSpec.builder()
      .table('accounts')
      .columns(['id', 'balance'])
      .webhookTarget('https://sink.example/cdc')
      .withUpdated()
      .resolved('10s')
      .build()
      .toSql();
    expect(sql).toBe(
      'CREATE CHANGEFEED FOR TABLE "accounts" ("id", "balance") ' +
        "INTO 'https://sink.example/cdc' WITH resolved = '10s', updated",
    );
  });

  it('requires table and sink', () => {
    expect(() => ChangefeedSpec.builder().webhookTarget('x').build()).toThrow(/table/);
    expect(() => ChangefeedSpec.builder().table('t').build()).toThrow(/sink/);
  });
});

describe('event parsing', () => {
  it('infers operations', () => {
    expect(operationOf({ after: { id: 1 } })).toBe('insert');
    expect(operationOf({ after: { id: 1 }, before: { id: 1 } })).toBe('update');
    expect(operationOf({ after: null, before: { id: 1 } })).toBe('delete');
    expect(operationOf({})).toBe('delete');
  });

  it('detects resolved markers', () => {
    const env = parseEnvelope('{"resolved":"1700000000.0"}');
    expect(env.resolved).toBe('1700000000.0');
  });
});

describe('WebhookSink', () => {
  const batch = '{"payload":[{"after":{"id":1}},{"after":{"id":2}}],"length":2}';

  it('dispatches each row and records metrics', async () => {
    let seen = 0;
    const metrics = new CdcMetrics();
    const sink = new WebhookSink(async () => {
      seen += 1;
    }, { metrics });
    const outcome = await sink.handle(undefined, batch);
    expect(outcome.processed).toBe(2);
    expect(seen).toBe(2);
    expect(metrics.snapshot().events).toBe(2);
  });

  it('skips resolved markers', async () => {
    const metrics = new CdcMetrics();
    const sink = new WebhookSink(async () => {}, { metrics });
    const outcome = await sink.handle(undefined, '{"resolved":"1700000000.0"}');
    expect(outcome.resolved).toBe(true);
    expect(metrics.snapshot().resolved).toBe(1);
  });

  it('rejects bad auth and accepts the right token', async () => {
    const metrics = new CdcMetrics();
    const sink = new WebhookSink(async () => {}, { authToken: 's3cret', metrics });
    await expect(sink.handle('Bearer wrong', batch)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(metrics.snapshot().authFailures).toBe(1);
    const ok = await sink.handle('Bearer s3cret', batch);
    expect(ok.processed).toBe(2);
  });

  it('propagates and counts handler errors', async () => {
    const metrics = new CdcMetrics();
    const sink = new WebhookSink(async () => {
      throw new Error('nope');
    }, { metrics });
    await expect(sink.handle(undefined, batch)).rejects.toThrow('nope');
    expect(metrics.snapshot().errors).toBe(1);
  });
});
