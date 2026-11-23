import { describe, expect, it } from 'vitest';
import { ConcurrencyRunner, RetrySimulator } from '@cockroachdb/testing';
import { CrdbPool, core } from '@cockroachdb/pg';
import { IdeaService } from './service.js';

// Run the DB-backed tests only when a cluster is configured.
const dbit = process.env.CRDB_URL ? it : it.skip;
const url = process.env.CRDB_URL ?? 'postgres://root@localhost:26257/defaultdb?sslmode=disable';

describe('ideas-board fundamentals', () => {
  // tag::unit-test[]
  // A fast, no-database check of the retry *mechanism*: a simulated `40001` that
  // clears after two attempts is driven to success under concurrency. A fake
  // can't produce a real serialization conflict, so the end-to-end contention
  // proof lives in the integration test below.
  it('absorbs simulated serialization conflicts under concurrency', async () => {
    const sim = RetrySimulator.serializationFailures(2);
    const report = await new ConcurrencyRunner(8, 5).run(async () => {
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
    expect(report.total).toBe(40);
    expect(report.failures).toBe(0);
  });
  // end::unit-test[]

  // tag::concurrency-test[]
  // End-to-end contention proof against a live cluster (set CRDB_URL). Fires
  // 3 × 20 concurrent upvotes through the retrying `upvote`; every vote must land
  // (final count 60). Skipped when no cluster is configured.
  dbit('lands every vote under contention', async () => {
    const pool = CrdbPool.connect(url);
    try {
      const svc = new IdeaService(pool);
      await svc.ensureSchema();
      const id = await svc.createIdea('Add dark mode');

      const report = await new ConcurrencyRunner(3, 20).run(() => svc.upvote(id));
      expect(report.failures).toBe(0);

      const res = await pool.pool.query('SELECT votes FROM ideas WHERE id = $1', [id]);
      expect(Number((res.rows[0] as { votes: string | number }).votes)).toBe(60);
    } finally {
      await pool.end();
    }
  });
  // end::concurrency-test[]
});
