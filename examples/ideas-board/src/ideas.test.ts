import { describe, expect, it } from 'vitest';
import { ChangefeedSpec } from '@cockroachdb/cdc';
import { ConcurrencyRunner, RetrySimulator } from '@cockroachdb/testing';
import { core } from '@cockroachdb/pg';

describe('ideas-board offline building blocks', () => {
  it('builds a well-formed changefeed statement', () => {
    const sql = ChangefeedSpec.builder()
      .table('ideas')
      .webhookTarget('https://example.com/cdc')
      .withUpdated()
      .build()
      .toSql();
    expect(sql.startsWith('CREATE CHANGEFEED FOR TABLE "ideas"')).toBe(true);
    expect(sql).toContain("INTO 'https://example.com/cdc'");
    expect(sql).toContain('WITH updated');
  });

  it('drives a retry loop to completion under concurrency', async () => {
    const sim = RetrySimulator.serializationFailures(2);
    const report = await new ConcurrencyRunner(4, 3).run(async () => {
      for (let i = 0; i < 10; i++) {
        try {
          await sim.run();
          return;
        } catch (err) {
          if (!core.isRetryable(err)) throw err;
        }
      }
      throw new Error('exhausted');
    });
    expect(report.total).toBe(12);
    expect(report.failures).toBe(0);
  });
});
