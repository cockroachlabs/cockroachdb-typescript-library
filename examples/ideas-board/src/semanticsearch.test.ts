import { describe, expect, it } from 'vitest';
import { CrdbPool } from '@cockroachdb/pg';
import { HashingEmbedder, SemanticIdeaService } from './semanticsearch.js';
import type { Idea } from './service.js';

const dbit = process.env.CRDB_URL ? it : it.skip;
const url = process.env.CRDB_URL ?? 'postgres://root@localhost:26257/defaultdb?sslmode=disable';

const idea = (title: string): Idea => ({ id: '', title, votes: 0 });
const vectorUnsupported = (e: unknown): boolean => {
  const m = String((e as Error).message).toLowerCase();
  return m.includes('vector') && (m.includes('unsupported') || m.includes('unknown'));
};

describe('ideas-board semantic search', () => {
  // Offline: the embedder is pure. Assert it is deterministic and unit-normed,
  // and that different text yields different vectors.
  it('embedding is deterministic and normalized', async () => {
    const e = new HashingEmbedder(32);
    const a = await e.embed('add dark mode');
    expect(await e.embed('add dark mode')).toEqual(a);
    const norm = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
    expect(Math.abs(norm - 1)).toBeLessThan(1e-6);
  });

  it('distinct text differs', async () => {
    const e = new HashingEmbedder(32);
    expect(await e.embed('export to csv')).not.toEqual(await e.embed('full text search'));
  });

  // tag::vector-it[]
  // End-to-end ranking proof. Needs CockroachDB v25.2+ for the VECTOR type (set
  // CRDB_URL). Stores three unrelated ideas, then a query sharing words with one
  // must rank that idea first. Search is brute-force; the C-SPANN index is
  // best-effort, so this runs on v25.2. Skips if the VECTOR type is unsupported.
  dbit('find similar returns the nearest idea first', async () => {
    const pool = CrdbPool.connect(url);
    try {
      const svc = new SemanticIdeaService(pool);
      try {
        await svc.ensureSchema();
      } catch (e) {
        if (vectorUnsupported(e)) return; // no VECTOR type on this cluster — skip
        throw e;
      }
      await svc.store([
        idea('Add a dark mode theme'),
        idea('Export reports to CSV'),
        idea('Full text search over ideas'),
      ]);

      const hits = await svc.findSimilar('dark mode', 1);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].content).toBe('Add a dark mode theme');
    } finally {
      await pool.end();
    }
  });
  // end::vector-it[]
});
