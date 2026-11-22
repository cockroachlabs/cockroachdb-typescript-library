import type { CrdbPool } from '@cockroachdb/pg';
import { requireTx, transactional } from '@cockroachdb/pg';

/** A ranked idea. */
export interface Idea {
  id: string;
  title: string;
  votes: number;
}

/**
 * Ideas-board service. Writes use the `@transactional` decorator (retried on
 * 40001, ambient tx via {@link requireTx}); the ranked read uses a follower read.
 */
export class IdeaService {
  constructor(private readonly pool: CrdbPool) {}

  async ensureSchema(): Promise<void> {
    await this.pool.pool.query(
      'CREATE TABLE IF NOT EXISTS ideas (' +
        'id STRING PRIMARY KEY DEFAULT gen_random_uuid()::STRING, ' +
        'title STRING NOT NULL, votes INT8 NOT NULL DEFAULT 0)',
    );
  }

  @transactional()
  async createIdea(title: string): Promise<string> {
    const tx = requireTx();
    const res = await tx.query('INSERT INTO ideas (title) VALUES ($1) RETURNING id::text AS id', [
      title,
    ]);
    return String((res.rows[0] as { id: string }).id);
  }

  @transactional()
  async upvote(id: string): Promise<void> {
    const tx = requireTx();
    await tx.query('UPDATE ideas SET votes = votes + 1 WHERE id = $1', [id]);
  }

  /** Top ideas by votes, served from a follower read. */
  async topIdeas(limit: number): Promise<Idea[]> {
    return this.pool.followerReadTx(5000, async (client) => {
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
}
