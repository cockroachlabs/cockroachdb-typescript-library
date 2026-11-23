import { describe, expect, it } from 'vitest';
import { CrdbPool } from '@cockroachdb/pg';
import { IdeaService } from './service.js';
import { topIdeasFollower } from './followerread.js';

const dbit = process.env.CRDB_URL ? it : it.skip;
const url = process.env.CRDB_URL ?? 'postgres://root@localhost:26257/defaultdb?sslmode=disable';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('ideas-board follower reads', () => {
  // tag::follower-read-it[]
  // Follower reads are ~4.8s stale, so freshly-seeded rows are invisible until
  // the staleness window passes. Seed, then poll until the snapshot catches up
  // (tolerating the transient "as of a time before the table existed" error).
  dbit(
    'follower read catches up to seeded ideas',
    async () => {
      const pool = CrdbPool.connect(url);
      try {
        const svc = new IdeaService(pool);
        await svc.ensureSchema();
        for (const title of ['Dark mode', 'CSV export', 'Full-text search']) {
          await svc.createIdea(title);
        }

        const deadline = Date.now() + 30_000;
        let seen = 0;
        while (Date.now() < deadline) {
          try {
            seen = (await topIdeasFollower(pool, 5000, 10)).length;
            if (seen >= 3) break;
          } catch {
            // snapshot predates the table — keep waiting
          }
          await sleep(500);
        }
        expect(seen).toBeGreaterThanOrEqual(3);
      } finally {
        await pool.end();
      }
    },
    35_000,
  );
  // end::follower-read-it[]
});
