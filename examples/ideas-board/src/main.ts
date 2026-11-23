/**
 * Ideas-board — the reference app for the CockroachDB TypeScript library.
 *
 * Runs offline demos always (changefeed SQL, vCluster tagging, a CDC projection,
 * multi-region DDL, a retry simulator under concurrency). Set `CRDB_URL` to also
 * run the live-database demo.
 *
 *   node dist/main.js
 *   CRDB_URL=postgres://root@localhost:26257/defaultdb?sslmode=disable node dist/main.js
 */
import { ChangefeedSpec } from '@cockroachdb/cdc';
import { VClusterContext } from '@cockroachdb/continuum';
import { ConcurrencyRunner, RetrySimulator } from '@cockroachdb/testing';
import { core } from '@cockroachdb/pg';
import { IdeaService, type Idea } from './service.js';
import { topIdeasFollower } from './followerread.js';
import { meteredPool, printMetrics } from './metrics.js';
import { IdeaChangefeedHandler } from './cdc.js';
import { RegionalIdeaService, regionalSetupSql } from './multiregion.js';
import { SemanticIdeaService } from './semanticsearch.js';

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

  // Project a sample changefeed delivery through the CDC handler — no DB needed.
  const handler = new IdeaChangefeedHandler();
  await handler.handle({ after: { id: 'a', title: 'Dark mode', votes: 3 } });
  await handler.handle({ after: null, before: { id: 'a' } });
  console.log(
    `\ncdc handler: projected ${handler.handled().length} idea(s), ${handler.deletes()} delete(s)`,
  );

  console.log('\nmulti-region setup SQL:');
  for (const stmt of regionalSetupSql('defaultdb')) {
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
  const { pool, recorder } = meteredPool(url, { region: 'us-east1' });
  try {
    const svc = new IdeaService(pool);
    await svc.ensureSchema();
    const id = await svc.createIdea('Add a dark mode');

    const landed = await new ConcurrencyRunner(3, 20).run(() => svc.upvote(id));
    console.log(`fired 60 concurrent upvotes, ${landed.successes} landed`);

    // A follower read runs AS OF SYSTEM TIME in the past. Against schema created
    // moments ago that timestamp can predate the table, so the read reports the
    // relation as missing. In a running system the data is far older than the
    // staleness window; this only surfaces right after setup.
    try {
      const top = await topIdeasFollower(pool, 5000, 5);
      console.log('top ideas (follower read):');
      for (const idea of top) {
        console.log(`  ${String(idea.votes).padStart(3)} votes — ${idea.title}`);
      }
    } catch (err) {
      console.log(
        `top ideas (follower read): snapshot not yet caught up (${(err as Error).message})`,
      );
    }

    // Multi-region homing only runs against a REGIONAL BY ROW cluster; opt in with
    // CRDB_MULTIREGION=1 so the single-node demo stays green by default.
    if (process.env.CRDB_MULTIREGION) {
      try {
        for (const stmt of regionalSetupSql('defaultdb')) {
          await pool.pool.query(stmt);
        }
        const regional = new RegionalIdeaService(pool);
        const rid = await regional.addInRegion('us-east1', 'A regional idea');
        console.log(`homed idea ${rid} to region ${await regional.regionOf(rid)}`);
      } catch (e) {
        console.error(`multi-region unavailable: ${(e as Error).message}`);
      }
    }

    // Semantic search needs the VECTOR type (v25.2+); best-effort so an older
    // cluster still finishes the demo cleanly.
    const sem = new SemanticIdeaService(pool);
    try {
      await sem.ensureSchema();
      const seed: Idea[] = [
        { id: '', title: 'Add a dark mode theme', votes: 0 },
        { id: '', title: 'Export reports to CSV', votes: 0 },
      ];
      await sem.store(seed);
      const hits = await sem.findSimilar('dark mode', 1);
      if (hits[0]) {
        console.log(`most similar idea to 'dark mode': ${hits[0].content}`);
      }
    } catch (e) {
      console.error(`semantic search unavailable: ${(e as Error).message}`);
    }

    await pool.check();
    console.log('health: up');
    printMetrics(recorder);
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
