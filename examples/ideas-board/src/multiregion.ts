import { CrdbPool, core } from '@cockroachdb/pg';
import { bigint, pgTable, text } from 'drizzle-orm/pg-core';
import {
  crdbLocality,
  verifyMultiregionSchema,
  type MultiregionMode,
  type MultiregionReport,
} from '@cockroachdb/drizzle';

// tag::mr-check-entity[]
/**
 * The `ideas` table declared for Drizzle, marked REGIONAL BY ROW. `crdbLocality`
 * is a sidecar marker: it records the intended locality and returns the table
 * unchanged, so it wraps the `pgTable(...)` inline. No `regionColumn` is given,
 * so the check expects the implicit `crdb_region` homing column.
 */
export const ideas = crdbLocality(
  pgTable('ideas', {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    votes: bigint('votes', { mode: 'number' }).notNull(),
  }),
  { locality: 'REGIONAL_BY_ROW' },
);

/** The Drizzle schema the multi-region check enumerates. */
export const schema = { ideas };
// end::mr-check-entity[]

// tag::mr-check-usage[]
/**
 * Opt-in startup check: compare the Drizzle markers against the live schema.
 * `mode: 'warn'` (the default) logs any mismatch; `validate` throws on any
 * problem; and a contradiction (markers and schema disagree on where rows live)
 * throws even in `warn`. Pass the node-postgres pool for the read-only probes.
 */
export async function verifyIdeasLocality(
  pool: CrdbPool,
  mode: MultiregionMode = 'warn',
): Promise<MultiregionReport> {
  return verifyMultiregionSchema(pool.pool, schema, { mode });
}
// end::mr-check-usage[]


// tag::region-config[]
/**
 * DDL that turns the board into a multi-region, REGIONAL BY ROW deployment:
 * declare the database's regions, then set the table's locality so every row
 * carries a `crdb_region` homing column. Run these once per cluster (adding a
 * non-primary region needs nodes in that locality).
 */
export function regionalSetupSql(database: string): string[] {
  return [
    core.ddl.setPrimaryRegion(database, 'us-east1'),
    core.ddl.addRegion(database, 'us-west1'),
    core.ddl.setLocalityRegionalByRow('ideas'),
  ];
}
// end::region-config[]

// tag::inregion-usage[]
/**
 * Writes ideas homed to a caller-chosen region. The region travels as the row's
 * `crdb_region` **column value** on insert — there is no `SET crdb_region`
 * session statement (it does not exist). Homing is per-row data.
 */
export class RegionalIdeaService {
  constructor(private readonly pool: CrdbPool) {}

  /**
   * Inserts an idea homed to `region`, returning its id. The `[column, value]`
   * pair comes from `RegionContext.homingColumn()`; the column name is the fixed
   * `crdb_region`, never caller input, so interpolating it is safe.
   */
  async addInRegion(region: string, title: string): Promise<string> {
    const homing = new core.RegionContext(region).homingColumn();
    if (!homing) throw new Error('region is required');
    const [col, value] = homing;
    const sql = `INSERT INTO ideas (title, ${col}) VALUES ($1, $2) RETURNING id::text AS id`;
    return this.pool.executeTx(async (tx) => {
      const res = await tx.query(sql, [title, value]);
      return String((res.rows[0] as { id: string }).id);
    });
  }

  /** Reads back the region a row is homed to. */
  async regionOf(id: string): Promise<string> {
    const res = await this.pool.pool.query(
      `SELECT ${core.CRDB_REGION_COLUMN}::text AS region FROM ideas WHERE id = $1`,
      [id],
    );
    return String((res.rows[0] as { region: string }).region);
  }
}
// end::inregion-usage[]
