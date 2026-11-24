import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import {
  isCockroachDB,
  verifyDeclaredTables,
  type DeclaredTable,
} from '@cockroachdb/core';

// Gated: runs only when CRDB_URL points at a live cluster (CI `integration` job,
// or a local `cockroach start-single-node`). Skips quietly otherwise.
const url = process.env.CRDB_URL;

describe.skipIf(!url)('verifyMultiregionSchema (live cluster)', () => {
  const pool = new Pool({ connectionString: url, max: 2 });
  const table = `mr_check_${Date.now()}`;

  beforeAll(async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS ${table} (id UUID PRIMARY KEY DEFAULT gen_random_uuid())`);
    // Fresh-schema timing: a just-created table can lag in SHOW TABLES. Poll
    // until it is visible before the diff runs (same caution follower-read ITs use).
    for (let i = 0; i < 30; i++) {
      const r = await pool.query("SELECT 1 FROM [SHOW TABLES] WHERE table_name = $1", [table]);
      if (r.rowCount && r.rowCount > 0) break;
      await new Promise((res) => setTimeout(res, 200));
    }
  });

  afterAll(async () => {
    await pool.query(`DROP TABLE IF EXISTS ${table}`);
    await pool.end();
  });

  it('detects CockroachDB', async () => {
    expect(await isCockroachDB(pool)).toBe(true);
  });

  it('reports a non-multi-region database when an entity is marked', async () => {
    const tables: DeclaredTable[] = [{ entity: 'Marked', table, kind: 'GLOBAL' }];
    const report = await verifyDeclaredTables(pool, tables, { mode: 'warn', logger: () => {} });
    expect(report.isEmpty()).toBe(false);
    expect(report.problems[0]).toContain('is not multi-region');
  });

  it('mode none skips entirely', async () => {
    const tables: DeclaredTable[] = [{ entity: 'Marked', table, kind: 'GLOBAL' }];
    const report = await verifyDeclaredTables(pool, tables, { mode: 'none' });
    expect(report.isEmpty()).toBe(true);
  });

  it('a contradiction throws even in warn mode', async () => {
    const tables: DeclaredTable[] = [{ entity: 'Marked', table, kind: 'BOTH' }];
    await expect(verifyDeclaredTables(pool, tables, { mode: 'warn', logger: () => {} })).rejects.toThrow(
      /Contradiction/,
    );
  });
});
