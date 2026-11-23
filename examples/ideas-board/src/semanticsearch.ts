import type { CrdbPool } from '@cockroachdb/pg';
import { VectorStore, vectorConfig, type Embedder, type SearchResult } from '@cockroachdb/ai';
import { createHash } from 'node:crypto';
import type { Idea } from './service.js';

const DIMS = 32;

// tag::vector-search[]
/**
 * A deterministic, dependency-free embedder: it hashes each word into one of
 * `dims` buckets (a bag-of-words sketch) and L2-normalizes the result. Real apps
 * swap in an embedding model by implementing `Embedder` — the rest is unchanged.
 */
export class HashingEmbedder implements Embedder {
  constructor(private readonly dims: number) {}

  async embed(text: string): Promise<number[]> {
    const v = new Array<number>(this.dims).fill(0);
    for (const token of text.toLowerCase().split(/\s+/).filter(Boolean)) {
      const i = this.bucket(token);
      v[i] = (v[i] ?? 0) + 1;
    }
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    return norm > 0 ? v.map((x) => x / norm) : v;
  }

  private bucket(token: string): number {
    return createHash('sha1').update(token).digest().readUInt32BE(0) % this.dims;
  }
}

/**
 * Stores ideas as vectors and finds the ones most similar to a query. Pairs a
 * `VectorStore` (the CockroachDB-backed index) with an `Embedder` (how text
 * becomes a vector); cosine distance ranks the hits.
 */
export class SemanticIdeaService {
  private readonly vectors: VectorStore;
  private readonly embedder: HashingEmbedder;

  constructor(pool: CrdbPool) {
    this.vectors = new VectorStore(pool, vectorConfig('idea_docs', DIMS, { metric: 'cosine' }));
    this.embedder = new HashingEmbedder(DIMS);
  }

  /**
   * Creates the vector table and (best-effort) the C-SPANN index. The index needs
   * CockroachDB v26.2+; without it, search falls back to brute force, so an index
   * failure is logged, not fatal.
   */
  async ensureSchema(): Promise<void> {
    await this.vectors.ensureTable();
    try {
      await this.vectors.ensureIndex();
    } catch (e) {
      console.error(`vector index not created (needs v26.2+): ${(e as Error).message}`);
    }
  }

  /** Embeds and stores each idea's title. */
  async store(ideas: Idea[]): Promise<void> {
    for (const idea of ideas) {
      await this.vectors.add(idea.title, await this.embedder.embed(idea.title));
    }
  }

  /** Returns the `k` ideas most similar to `query`, nearest first. */
  async findSimilar(query: string, k: number): Promise<SearchResult[]> {
    return this.vectors.semanticSearch(this.embedder, query, k);
  }
}
// end::vector-search[]
