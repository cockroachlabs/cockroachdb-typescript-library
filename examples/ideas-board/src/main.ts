/**
 * Ideas-board — the reference app for the CockroachDB TypeScript library.
 *
 * Runs offline demos always (changefeed SQL, vCluster tagging, a retry simulator
 * under concurrency). Set `CRDB_URL` to also run the live-database demo.
 *
 *   node --experimental-strip-types src/main.ts
 *   CRDB_URL=postgres://root@localhost:26257/defaultdb?sslmode=disable node --experimental-strip-types src/main.ts
 */
import { ChangefeedSpec } from '@cockroachdb/cdc';
import { VClusterContext } from '@cockroachdb/continuum';
import { ConcurrencyRunner, RetrySimulator } from '@cockroachdb/testing';
import { CrdbPool, core } from '@cockroachdb/pg';
import { IdeaService } from './service.js';

async function offlineDemos(): Promise<void> {
  const spec = ChangefeedSpec.builder()
    .table('ideas')
    .webhookTarget('https://example.com/cdc')
    .withUpdated()
    .resolved('10s')
    .build();
  console.log(`changefeed SQL:\n  ${spec.toSql()}\n`);

  console.log('vCluster tagging:');
  for (const stmt of new VClusterContext('ideas-board', 'background').applyStatements()) {
    console.log(`  ${stmt}`);
  }

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
  console.log(
    `\nconcurrency run: ${report.total} ops, ${report.successes} ok, ${report.failures} failed`,
  );
}

async function liveDemo(url: string): Promise<void> {
  console.log('\n-- live database demo --');
  const metrics = new core.InMemoryRecorder();
  const pool = CrdbPool.connect(url, { region: 'us-east1' }).withMetrics(metrics);
  try {
    const svc = new IdeaService(pool);
    await svc.ensureSchema();
    const id = await svc.createIdea('Add a dark mode');
    await svc.upvote(id);
    await svc.upvote(id);
    await svc.createIdea('Export to CSV');

    // A follower read runs AS OF SYSTEM TIME in the past. Against schema created
    // moments ago (as here) that timestamp can predate the table, so the read
    // reports the relation as missing. In a running system the data is far older
    // than the staleness window; this only surfaces right after setup.
    try {
      const top = await svc.topIdeas(5);
      console.log('top ideas (follower read):');
      for (const idea of top) {
        console.log(`  ${String(idea.votes).padStart(3)} votes — ${idea.title}`);
      }
    } catch (err) {
      console.log(
        `top ideas (follower read): snapshot not yet caught up (${(err as Error).message})`,
      );
    }

    await pool.check();
    console.log('health: up');

    const snap = metrics.snapshot();
    console.log(
      `metrics: ${snap.transactionCount} transactions (${snap.transactionSuccessCount} ok), ` +
        `${snap.followerReadCount} follower reads`,
    );
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  console.log('== CockroachDB TypeScript library — ideas-board demo ==\n');
  await offlineDemos();
  const url = process.env.CRDB_URL;
  if (url) {
    await liveDemo(url);
  } else {
    console.log('\nCRDB_URL not set — skipped live database demo.');
  }
}

await main();
