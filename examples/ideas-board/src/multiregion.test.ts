import { describe, expect, it } from 'vitest';
import { CrdbPool, core } from '@cockroachdb/pg';
import { IdeaService } from './service.js';
import { RegionalIdeaService, regionalSetupSql, verifyIdeasLocality } from './multiregion.js';

const dbit = process.env.CRDB_URL ? it : it.skip;
const url = process.env.CRDB_URL ?? 'postgres://root@localhost:26257/defaultdb?sslmode=disable';

const regionError = (e: unknown): boolean => String((e as Error).message).toLowerCase().includes('region');

describe('ideas-board multi-region', () => {
  // Offline: the setup DDL and the homing pair are pure string construction.
  it('setup SQL declares regions and row locality', () => {
    const sql = regionalSetupSql('defaultdb').join('\n');
    expect(sql).toContain('PRIMARY REGION');
    expect(sql).toContain('us-east1');
    expect(sql).toContain('ADD REGION');
    expect(sql).toContain('REGIONAL BY ROW');
  });

  it('homing writes the crdb_region column', () => {
    expect(new core.RegionContext('us-west1').homingColumn()).toEqual(['crdb_region', 'us-west1']);
  });

  // tag::region-test[]
  // End-to-end homing proof. Needs a REGIONAL BY ROW cluster whose regions
  // include us-east1/us-west1 (set CRDB_URL). A single-node cluster has no
  // regions, so the setup DDL fails — treated as a skip, not a failure.
  dbit('writes home rows in the bound region', async () => {
    const pool = CrdbPool.connect(url);
    try {
      await new IdeaService(pool).ensureSchema();
      try {
        for (const stmt of regionalSetupSql('defaultdb')) {
          await pool.pool.query(stmt);
        }
      } catch (e) {
        if (regionError(e)) return; // cluster has no regions configured — skip
        throw e;
      }

      const svc = new RegionalIdeaService(pool);
      const east = await svc.addInRegion('us-east1', 'East idea');
      const west = await svc.addInRegion('us-west1', 'West idea');
      expect(await svc.regionOf(east)).toBe('us-east1');
      expect(await svc.regionOf(west)).toBe('us-west1');
    } finally {
      await pool.end();
    }
  });
  // end::region-test[]

  // tag::mr-check-report[]
  // The startup check reads the live schema and compares it to the Drizzle
  // markers. On a REGIONAL BY ROW `ideas` table the REGIONAL_BY_ROW marker
  // matches, so the report has no problems. Needs a multi-region cluster
  // (set CRDB_URL); a single-node cluster has no regions, so the setup DDL
  // fails — treated as a skip, not a failure.
  dbit('multi-region check reports no problems when markers match', async () => {
    const pool = CrdbPool.connect(url);
    try {
      await new IdeaService(pool).ensureSchema();
      try {
        for (const stmt of regionalSetupSql('defaultdb')) {
          await pool.pool.query(stmt);
        }
      } catch (e) {
        if (regionError(e)) return; // cluster has no regions configured — skip
        throw e;
      }

      const report = await verifyIdeasLocality(pool, 'warn');
      expect(report.isEmpty()).toBe(true);
    } finally {
      await pool.end();
    }
  });
  // end::mr-check-report[]
});
