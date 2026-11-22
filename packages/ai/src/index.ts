/**
 * Vector search and RAG retrieval for CockroachDB.
 *
 * {@link query} builds the SQL (pure), {@link VectorStore} runs it against a
 * {@link CrdbPool} (autocommit schema setup, buffered search), and {@link Embedder}
 * + {@link VectorStore.semanticSearch} + {@link ragContext} cover RAG retrieval.
 */
export * from './query.js';
export * from './store.js';
