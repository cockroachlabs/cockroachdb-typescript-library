import {
  backoffDelayMs,
  DEFAULT_RETRY_POLICY,
  isRetryable,
  sleep,
  verifyDeclaredTables,
  type DeclaredTable,
  type MultiregionReport,
  type Queryable,
  type RetryPolicy,
  type VerifyMultiregionOptions,
} from '@cockroachdb/core';

export type { MultiregionReport, MultiregionMode, VerifyMultiregionOptions } from '@cockroachdb/core';

/** Prisma's write-conflict / deadlock code (mapped from `40001`). */
export const PRISMA_WRITE_CONFLICT = 'P2034';

/**
 * Retryable if the underlying SQLSTATE is `40001`/`40P01` **or** Prisma reports a
 * write conflict (`P2034`). Prisma surfaces serialization conflicts as `P2034`,
 * not the raw SQLSTATE, so both must be checked.
 */
export function isPrismaRetryable(err: unknown): boolean {
  if (isRetryable(err)) return true;
  const code = (err as { code?: unknown })?.code;
  return code === PRISMA_WRITE_CONFLICT;
}

/**
 * The slice of a Prisma client used here: interactive `$transaction`. Typed
 * structurally so this adapter doesn't pin a generated client type.
 */
export interface PrismaLike<Tx> {
  $transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

/**
 * Runs a Prisma interactive transaction, retrying on serialization conflicts
 * (`40001` / `P2034`) with exponential backoff.
 */
export async function executeTx<Tx, T>(
  prisma: PrismaLike<Tx>,
  fn: (tx: Tx) => Promise<T>,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await prisma.$transaction(fn);
    } catch (err) {
      if (isPrismaRetryable(err) && attempt < policy.maxRetries) {
        attempt += 1;
        await sleep(backoffDelayMs(policy, attempt - 1));
        continue;
      }
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Declarative multi-region locality config + startup check.
// ---------------------------------------------------------------------------

/** Locality for one model. */
export interface PrismaLocality {
  locality: 'GLOBAL' | 'REGIONAL_BY_ROW';
  /** For REGIONAL_BY_ROW: the region field/column, when not the implicit `crdb_region`. */
  regionColumn?: string;
}

/**
 * Maps a Prisma model name (or table name) to its intended locality. A sidecar
 * object, not doc-comment parsing: `{ Order: { locality: 'REGIONAL_BY_ROW' } }`.
 */
export type PrismaLocalityConfig = Record<string, PrismaLocality>;

/** A Prisma client, read structurally for its runtime data model. */
interface PrismaClientLike {
  _runtimeDataModel?: { models: Record<string, PrismaModel> };
  $queryRawUnsafe?: (sql: string, ...params: unknown[]) => Promise<unknown>;
}

interface PrismaModel {
  dbName?: string | null;
  fields: Array<{ name: string; dbName?: string | null }>;
}

function toQueryable(client: PrismaClientLike | Queryable): Queryable {
  const prisma = client as PrismaClientLike;
  if (typeof prisma.$queryRawUnsafe === 'function') {
    return {
      query: async (sql, params = []) => ({
        rows: (await prisma.$queryRawUnsafe!(sql, ...params)) as Array<Record<string, unknown>>,
      }),
    };
  }
  return client as Queryable;
}

function enumerate(client: PrismaClientLike, config: PrismaLocalityConfig): DeclaredTable[] {
  const models = client._runtimeDataModel?.models;
  if (!models) return [];
  const out: DeclaredTable[] = [];
  for (const [modelName, model] of Object.entries(models)) {
    const table = model.dbName ?? modelName;
    const cfg = config[modelName] ?? config[table];
    let regionColumn: string | undefined;
    if (cfg?.regionColumn) {
      const field = model.fields.find((f) => f.name === cfg.regionColumn);
      regionColumn = field ? (field.dbName ?? field.name) : cfg.regionColumn;
    }
    out.push({
      entity: modelName,
      table,
      kind: cfg ? cfg.locality : 'NONE',
      regionColumn,
    });
  }
  return out;
}

/**
 * Checks every Prisma model against the live CockroachDB multi-region
 * configuration, comparing it with `config`. Opt-in; pass `{ mode: 'validate' }`
 * to throw on any problem (a contradiction throws even in the default `warn`).
 *
 * `client` is a `PrismaClient` (introspection runs via `$queryRawUnsafe`) or a
 * pg `Pool`/`PoolClient`; the model list is always read from the Prisma client.
 */
export async function verifyMultiregionSchema(
  client: PrismaClientLike & Partial<Queryable>,
  config: PrismaLocalityConfig,
  opts?: VerifyMultiregionOptions,
): Promise<MultiregionReport> {
  return verifyDeclaredTables(toQueryable(client), enumerate(client, config), opts);
}
