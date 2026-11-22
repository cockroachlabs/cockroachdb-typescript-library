import type { CrdbPool } from '@cockroachdb/pg';
import * as q from './query.js';
import type { DistanceMetric } from './query.js';

/** Schema/behaviour configuration for a {@link VectorStore}. */
export interface VectorConfig {
  table: string;
  idCol: string;
  contentCol: string;
  embeddingCol: string;
  dims: number;
  metric: DistanceMetric;
}

/** Config with default column names (`id`/`content`/`embedding`) and L2 distance. */
export function vectorConfig(
  table: string,
  dims: number,
  overrides?: Partial<Omit<VectorConfig, 'table' | 'dims'>>,
): VectorConfig {
  return {
    table,
    dims,
    idCol: 'id',
    contentCol: 'content',
    embeddingCol: 'embedding',
    metric: 'l2',
    ...overrides,
  };
}

/** One search hit. */
export interface SearchResult {
  id: string;
  content: string;
  distance: number;
}

/** Produces an embedding vector for a piece of text. Bring your own model. */
export interface Embedder {
  embed(text: string): Promise<number[]>;
}

/** A vector store over a {@link CrdbPool}. */
export class VectorStore {
  constructor(
    private readonly pool: CrdbPool,
    readonly config: VectorConfig,
  ) {}

  private indexName(): string {
    return `${this.config.table}_${this.config.embeddingCol}_idx`.replace(/[^a-zA-Z0-9]/g, '_');
  }

  /** Creates the backing table (autocommit — CockroachDB requires this DDL outside a transaction). */
  async ensureTable(): Promise<void> {
    await this.pool.pool.query(
      q.createTableSql(
        this.config.table,
        this.config.idCol,
        this.config.contentCol,
        this.config.embeddingCol,
        this.config.dims,
      ),
    );
  }

  /** Creates the C-SPANN vector index. **Requires CockroachDB v26.2+.** */
  async ensureIndex(): Promise<void> {
    await this.pool.pool.query(
      q.createVectorIndexSql(this.indexName(), this.config.table, this.config.embeddingCol),
    );
  }

  /** Creates the table and the vector index. */
  async ensureSchema(): Promise<void> {
    await this.ensureTable();
    await this.ensureIndex();
  }

  /** Inserts content with its embedding and optional JSON metadata; returns the id. */
  async add(content: string, embedding: number[], metadata?: unknown): Promise<string> {
    const res = await this.pool.pool.query(
      q.insertSql(this.config.table, this.config.idCol, this.config.contentCol, this.config.embeddingCol),
      [content, q.vectorLiteral(embedding), metadata === undefined ? null : JSON.stringify(metadata)],
    );
    return String((res.rows[0] as { id: string }).id);
  }

  /** Nearest-neighbour search returning the top `k` rows. */
  async search(embedding: number[], k: number): Promise<SearchResult[]> {
    return this.runSearch(embedding, k);
  }

  /**
   * Hybrid search: nearest neighbours restricted by a SQL `filterSql`. Placeholders
   * start at `$3` and bind as text from `params` (e.g. `"metadata->>'lang' = $3"`).
   */
  async searchWithFilter(
    embedding: number[],
    k: number,
    filterSql: string,
    params: string[] = [],
  ): Promise<SearchResult[]> {
    return this.runSearch(embedding, k, filterSql, params);
  }

  /** Embeds `query` with `embedder`, then searches. */
  async semanticSearch(embedder: Embedder, query: string, k: number): Promise<SearchResult[]> {
    const embedding = await embedder.embed(query);
    return this.search(embedding, k);
  }

  private async runSearch(
    embedding: number[],
    k: number,
    filterSql?: string,
    params: string[] = [],
  ): Promise<SearchResult[]> {
    const sql = q.searchSql(
      this.config.table,
      this.config.idCol,
      this.config.contentCol,
      this.config.embeddingCol,
      this.config.metric,
      filterSql,
    );
    const res = await this.pool.pool.query(sql, [q.vectorLiteral(embedding), k, ...params]);
    return (res.rows as Array<{ id: string; content: string; distance: number }>).map((r) => ({
      id: String(r.id),
      content: String(r.content),
      distance: Number(r.distance),
    }));
  }
}

/** Joins the content of search results into a single RAG context block. */
export function ragContext(results: SearchResult[], separator: string): string {
  return results.map((r) => r.content).join(separator);
}
