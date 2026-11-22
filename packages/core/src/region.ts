/**
 * Multi-region row homing for REGIONAL BY ROW tables.
 *
 * Homing is done by writing a value to the hidden `crdb_region` column on insert,
 * never via a `SET crdb_region` session statement (which does not exist — a bug
 * that bit several sibling libraries).
 */

/** The hidden column CockroachDB uses for REGIONAL BY ROW homing. */
export const CRDB_REGION_COLUMN = 'crdb_region';

/** Resolves the region for the current unit of work. */
export interface RegionResolver {
  resolve(): Promise<string | undefined>;
}

/** A resolver that always returns a fixed region. */
export class StaticRegionResolver implements RegionResolver {
  constructor(private readonly region: string) {}
  async resolve(): Promise<string | undefined> {
    return this.region;
  }
}

/** Carries the region a unit of work should home its rows to. */
export class RegionContext {
  constructor(public readonly region?: string) {}

  /** The `[column, value]` pair to include in an INSERT, or `undefined`. */
  homingColumn(): [string, string] | undefined {
    return this.region ? [CRDB_REGION_COLUMN, this.region] : undefined;
  }
}
