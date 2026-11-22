/** Vector distance metrics and pure SQL builders for vector search. */

/** A vector similarity metric; the operator is pgvector-compatible. */
export type DistanceMetric = 'l2' | 'cosine' | 'inner_product';

/** The distance operator for `ORDER BY embedding <op> $1`. */
export function distanceOperator(metric: DistanceMetric): string {
  switch (metric) {
    case 'l2':
      return '<->';
    case 'cosine':
      return '<=>';
    case 'inner_product':
      return '<#>';
  }
}

/** Quotes a SQL identifier. */
export function ident(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Formats a vector as a CockroachDB vector literal, e.g. `[0.1,0.2,0.3]`. */
export function vectorLiteral(v: readonly number[]): string {
  return `[${v.join(',')}]`;
}

/** `CREATE TABLE IF NOT EXISTS` for a vector store. */
export function createTableSql(
  table: string,
  idCol: string,
  contentCol: string,
  embeddingCol: string,
  dims: number,
): string {
  return (
    `CREATE TABLE IF NOT EXISTS ${ident(table)} (` +
    `${ident(idCol)} STRING PRIMARY KEY DEFAULT gen_random_uuid()::STRING, ` +
    `${ident(contentCol)} STRING NOT NULL, ` +
    `${ident(embeddingCol)} VECTOR(${dims}), ` +
    `metadata JSONB)`
  );
}

/** `CREATE VECTOR INDEX IF NOT EXISTS` (C-SPANN). Requires CockroachDB v26.2+. */
export function createVectorIndexSql(indexName: string, table: string, embeddingCol: string): string {
  return `CREATE VECTOR INDEX IF NOT EXISTS ${ident(indexName)} ON ${ident(table)} (${ident(embeddingCol)})`;
}

/** `INSERT ... RETURNING id`: `$1` content, `$2::vector` embedding, `$3::jsonb` metadata. */
export function insertSql(table: string, idCol: string, contentCol: string, embeddingCol: string): string {
  return (
    `INSERT INTO ${ident(table)} (${ident(contentCol)}, ${ident(embeddingCol)}, metadata) ` +
    `VALUES ($1, $2::vector, $3::jsonb) RETURNING ${ident(idCol)}::text AS id`
  );
}

/** Nearest-neighbour search SQL; `$1` vector, `$2` limit, optional filter from `$3`. */
export function searchSql(
  table: string,
  idCol: string,
  contentCol: string,
  embeddingCol: string,
  metric: DistanceMetric,
  filterSql?: string,
): string {
  const op = distanceOperator(metric);
  const emb = ident(embeddingCol);
  const where = filterSql && filterSql.trim() !== '' ? ` WHERE ${filterSql}` : '';
  return (
    `SELECT ${ident(idCol)}::text AS id, ${ident(contentCol)} AS content, ` +
    `${emb} ${op} $1::vector AS distance ` +
    `FROM ${ident(table)}${where} ORDER BY ${emb} ${op} $1::vector LIMIT $2`
  );
}
