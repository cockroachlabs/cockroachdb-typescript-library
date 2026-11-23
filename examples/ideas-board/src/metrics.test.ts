import { describe, expect, it } from 'vitest';
import { ConcurrencyRunner } from '@cockroachdb/testing';
import { meteredPool } from './metrics.js';
import { IdeaService } from './service.js';

const dbit = process.env.CRDB_URL ? it : it.skip;
const url = process.env.CRDB_URL ?? 'postgres://root@localhost:26257/defaultdb?sslmode=disable';

describe('ideas-board metrics', () => {
  // tag::metrics-it[]
  // End-to-end metrics proof (set CRDB_URL). Fires 60 concurrent upvotes through
  // the metered pool; the recorder must show at least 60 committed transactions,
  // and — because the upvotes genuinely contend — a non-zero retry count.
  dbit('counts transactions and retries under contention', async () => {
    const { pool, recorder } = meteredPool(url, { region: 'us-east1' });
    try {
      const svc = new IdeaService(pool);
      await svc.ensureSchema();
      const id = await svc.createIdea('Metered idea');

      await new ConcurrencyRunner(3, 20).run(() => svc.upvote(id));

      const s = recorder.snapshot();
      expect(s.transactionCount).toBeGreaterThanOrEqual(60);
      expect(s.retryCount).toBeGreaterThan(0);
    } finally {
      await pool.end();
    }
  });
  // end::metrics-it[]
});
