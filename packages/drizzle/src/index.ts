import {
  backoffDelayMs,
  DEFAULT_RETRY_POLICY,
  isRetryable,
  sleep,
  verifyDeclaredTables,
  type DeclaredKind,
  type DeclaredTable,
  type MultiregionReport,
  type Queryable,
  type RetryPolicy,
  type VerifyMultiregionOptions,
} from '@cockroachdb/core';

export { isRetryable } from '@cockroachdb/core';
export type { MultiregionReport, MultiregionMode, VerifyMultiregionOptions } from '@cockroachdb/core';

/**
 * The slice of a Drizzle database used here: an interactive `transaction`.
 * Typed structurally so this adapter doesn't pin a specific drizzle-orm version;
 * any `NodePgDatabase` (or compatible) satisfies it.
 */
export interface DrizzleLike<Tx> {
  transaction<T>(fn: (tx: Tx) => Promise<T>, config?: unknown): Promise<T>;
}

/**
 * Runs a Drizzle transaction, retrying the whole callback on serialization
 * conflicts (`40001`) with exponential backoff.
 *
 * > Note: Drizzle has had a bug where `drizzle-kit push` can disable Postgres
 * > row-level security. If you rely on RLS for multi-region isolation, manage
 * > migrations as SQL and re-check RLS after deploy.
 */
export async function executeTx<Tx, T>(
  db: DrizzleLike<Tx>,
  fn: (tx: Tx) => Promise<T>,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await db.transaction(fn);
    } catch (err) {
      if (isRetryable(err) && attempt < policy.maxRetries) {
        attempt += 1;
        await sleep(backoffDelayMs(policy, attempt - 1));
        continue;
      }
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Declarative multi-region locality marker + startup check.
// ---------------------------------------------------------------------------

/** The locality a table should have. */
export interface LocalityMark {
  locality: 'GLOBAL' | 'REGIONAL_BY_ROW';
  /** For REGIONAL_BY_ROW: the region column, when it is not the implicit `crdb_region`. */
  regionColumn?: string;
}

// Keyed by the drizzle table object, so the marker is a sidecar that never
// touches the user's schema definition. A Set catches a table marked both ways.
const marks = new WeakMap<object, Set<'GLOBAL' | 'REGIONAL_BY_ROW'>>();
const regionColumns = new WeakMap<object, string>();

/**
 * Records that `table`'s locality should be GLOBAL or REGIONAL BY ROW, for
 * {@link verifyMultiregionSchema} to check against the live schema. Returns the
 * table unchanged, so it can wrap a `pgTable(...)` definition inline.
 */
export function crdbLocality<T extends object>(table: T, mark: LocalityMark): T {
  let set = marks.get(table);
  if (!set) {
    set = new Set();
    marks.set(table, set);
  }
  set.add(mark.locality);
  if (mark.regionColumn) {
    regionColumns.set(table, mark.regionColumn);
  }
  return table;
}

function kindOf(set: Set<'GLOBAL' | 'REGIONAL_BY_ROW'> | undefined): DeclaredKind {
  if (!set || set.size === 0) return 'NONE';
  if (set.size > 1) return 'BOTH';
  return set.has('GLOBAL') ? 'GLOBAL' : 'REGIONAL_BY_ROW';
}

/** The slice of `drizzle-orm` used here, typed structurally to avoid pinning a version. */
interface DrizzleOrm {
  is(value: unknown, type: unknown): boolean;
  Table: unknown;
  getTableName(table: unknown): string;
}

async function enumerate(schema: Record<string, unknown>): Promise<DeclaredTable[]> {
  // Dynamic, specifier-as-expression so TS does not resolve the optional peer at build.
  const orm = (await import('drizzle-orm' as string)) as DrizzleOrm;
  const out: DeclaredTable[] = [];
  for (const [entity, value] of Object.entries(schema)) {
    if (!value || typeof value !== 'object' || !orm.is(value, orm.Table)) continue;
    out.push({
      entity,
      table: orm.getTableName(value),
      kind: kindOf(marks.get(value)),
      regionColumn: regionColumns.get(value),
    });
  }
  return out;
}

/**
 * Checks every table in a drizzle `schema` object against the live CockroachDB
 * multi-region configuration, comparing it with the markers set by
 * {@link crdbLocality}. Opt-in; pass `{ mode: 'validate' }` to throw on any
 * problem (a contradiction throws even in the default `warn`).
 *
 * `db` is a pg `Pool`/`PoolClient` (or anything with pg's `query`), used for
 * the read-only introspection queries.
 */
export async function verifyMultiregionSchema(
  db: Queryable,
  schema: Record<string, unknown>,
  opts?: VerifyMultiregionOptions,
): Promise<MultiregionReport> {
  return verifyDeclaredTables(db, await enumerate(schema), opts);
}
