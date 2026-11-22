import type { CrdbPool } from '@cockroachdb/pg';

/** Storage used by one table. */
export interface TableStorage {
  schema: string;
  table: string;
  bytes: number;
}

/**
 * The storage-summary query. Exposed so callers can inspect/override it for
 * their CockroachDB version — the range-size columns in `crdb_internal` have
 * shifted across versions.
 */
export function summaryQuery(): string {
  return (
    'SELECT t.schema_name AS schema, t.name AS table_name, ' +
    'COALESCE(s.bytes, 0)::INT8 AS bytes ' +
    'FROM crdb_internal.tables t ' +
    'LEFT JOIN (SELECT table_id, sum(range_size)::INT8 AS bytes ' +
    'FROM crdb_internal.ranges_no_leases GROUP BY table_id) s ON s.table_id = t.table_id ' +
    "WHERE t.database_name = current_database() " +
    "AND t.schema_name NOT IN ('crdb_internal','information_schema','pg_catalog') " +
    'ORDER BY bytes DESC'
  );
}

/** Returns a per-table storage summary for the current database. */
export async function summary(pool: CrdbPool): Promise<TableStorage[]> {
  const res = await pool.pool.query(summaryQuery());
  return (res.rows as Array<{ schema: string; table_name: string; bytes: string | number }>).map(
    (r) => ({ schema: r.schema, table: r.table_name, bytes: Number(r.bytes) }),
  );
}

/** `"schema"."table"` with quoted identifiers. */
export function qualifiedName(ts: TableStorage): string {
  return `"${ts.schema.replace(/"/g, '""')}"."${ts.table.replace(/"/g, '""')}"`;
}
