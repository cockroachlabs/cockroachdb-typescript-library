import type { CrdbPool } from '@cockroachdb/pg';
import type { Idea } from './service.js';

// tag::follower-read[]
/**
 * Returns the top ideas by votes, served from a **follower read**.
 * `followerReadTx` scopes the query with `AS OF SYSTEM TIME`, so CockroachDB can
 * answer it from the nearest replica instead of the leaseholder — lower latency,
 * at the cost of reading data up to `stalenessMs` old.
 */
export async function topIdeasFollower(
  pool: CrdbPool,
  stalenessMs: number,
  limit: number,
): Promise<Idea[]> {
  return pool.followerReadTx(stalenessMs, async (client) => {
    const res = await client.query(
      'SELECT id::text AS id, title, votes FROM ideas ORDER BY votes DESC LIMIT $1',
      [limit],
    );
    return (res.rows as Array<{ id: string; title: string; votes: string | number }>).map((r) => ({
      id: r.id,
      title: r.title,
      votes: Number(r.votes),
    }));
  });
}
// end::follower-read[]
