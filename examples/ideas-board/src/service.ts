import type { CrdbPool } from '@cockroachdb/pg';
import { requireTx, transactional } from '@cockroachdb/pg';

// tag::entity[]
/** An idea on the board: an id, its title, and a running vote count. */
export interface Idea {
  id: string;
  title: string;
  votes: number;
}
// end::entity[]

/**
 * Ideas-board service: the fundamentals story — a read-modify-write upvote that
 * loses votes under contention, and the one-decorator fix that absorbs the
 * resulting `40001` serialization conflicts.
 */
export class IdeaService {
  constructor(private readonly pool: CrdbPool) {}

  /** Creates the `ideas` table if absent (autocommit DDL). */
  async ensureSchema(): Promise<void> {
    await this.pool.pool.query(
      'CREATE TABLE IF NOT EXISTS ideas (' +
        'id STRING PRIMARY KEY DEFAULT gen_random_uuid()::STRING, ' +
        'title STRING NOT NULL, votes INT8 NOT NULL DEFAULT 0)',
    );
  }

  // tag::retry[]
  /**
   * Insert an idea, returning its id. The `@transactional()` decorator opens a
   * transaction, runs the body via the ambient {@link requireTx} client, and
   * retries the whole method on a `40001` serialization failure.
   */
  @transactional()
  async createIdea(title: string): Promise<string> {
    const tx = requireTx();
    const res = await tx.query('INSERT INTO ideas (title) VALUES ($1) RETURNING id::text AS id', [
      title,
    ]);
    return String((res.rows[0] as { id: string }).id);
  }

  /**
   * Upvote **with** retry: read-modify-write inside one `@transactional` method.
   * Under `SERIALIZABLE` isolation a conflicting write makes the commit fail with
   * `40001`; the decorator re-runs the whole method with backoff until it
   * commits — so every vote lands.
   */
  @transactional()
  async upvote(id: string): Promise<void> {
    const tx = requireTx();
    const votes = (
      await tx.query('SELECT votes FROM ideas WHERE id = $1', [id])
    ).rows[0] as { votes: string | number };
    await tx.query('UPDATE ideas SET votes = $1 WHERE id = $2', [Number(votes.votes) + 1, id]);
  }
  // end::retry[]

  // tag::plain[]
  /**
   * Upvote **without** retry: read the current count, then write `count + 1` as
   * two separate autocommit statements. Under concurrency the reads overlap,
   * every writer computes the same `count + 1`, and later writes clobber earlier
   * ones — votes are silently lost.
   */
  async upvoteWithoutRetry(id: string): Promise<void> {
    const votes = (
      await this.pool.pool.query('SELECT votes FROM ideas WHERE id = $1', [id])
    ).rows[0] as { votes: string | number };
    await this.pool.pool.query('UPDATE ideas SET votes = $1 WHERE id = $2', [
      Number(votes.votes) + 1,
      id,
    ]);
  }
  // end::plain[]
}
