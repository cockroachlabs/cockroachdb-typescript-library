import { describe, expect, it } from 'vitest';
import {
  CONTRADICTION,
  evaluate,
  failsStartup,
  MultiregionReport,
  parseIdentifier,
  regionalByRowColumn,
  type DeclaredTable,
  type MultiregionState,
} from './multiregion.js';
import { ident } from './ddl.js';

function tableKey(schema: string, table: string): string {
  return `${schema} ${table}`;
}

interface TableInfoLike {
  locality: string | null;
  columnTypes?: Record<string, string>;
}

function state(opts: Partial<MultiregionState> & { found?: Record<string, TableInfoLike> } = {}): MultiregionState {
  const tables = new Map<string, { locality: string | null; columnTypes: Map<string, string> }>();
  for (const [key, info] of Object.entries(opts.found ?? {})) {
    tables.set(key, {
      locality: info.locality,
      columnTypes: new Map(Object.entries(info.columnTypes ?? {})),
    });
  }
  return {
    database: opts.database ?? 'app',
    currentSchema: opts.currentSchema ?? 'public',
    primaryRegion: opts.primaryRegion === undefined ? 'us-east1' : opts.primaryRegion,
    clusterRegions: opts.clusterRegions ?? ['us-east1'],
    tables,
  };
}

const global = (entity = 'Currency', table = 'currencies'): DeclaredTable => ({ entity, table, kind: 'GLOBAL' });
const rbr = (entity = 'Order', table = 'orders', regionColumn?: string): DeclaredTable => ({
  entity,
  table,
  kind: 'REGIONAL_BY_ROW',
  regionColumn,
});

describe('evaluate — database not multi-region', () => {
  it('reports once and suggests SET/ADD PRIMARY REGION when the cluster has regions', () => {
    const s = state({
      primaryRegion: null,
      clusterRegions: ['us-east1', 'us-west1'],
      found: {
        [tableKey('public', 'currencies')]: { locality: null },
        [tableKey('public', 'orders')]: { locality: null },
      },
    });
    const r = evaluate(s, [global(), rbr()]);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toContain('is not multi-region');
    expect(r.problems[0]).toContain('Currency, Order');
    expect(r.statements).toContain('ALTER DATABASE "app" SET PRIMARY REGION \'us-east1\';');
    expect(r.statements).toContain('ALTER DATABASE "app" ADD REGION \'us-west1\';');
    expect(r.hasContradictions()).toBe(false);
  });

  it('explains the missing --locality when the cluster has no regions', () => {
    const s = state({ primaryRegion: null, clusterRegions: [] });
    const r = evaluate(s, [global()]);
    expect(r.problems[0]).toContain('cluster has no regions');
    expect(r.statements.filter((x) => x.includes('ALTER DATABASE'))).toHaveLength(0);
  });
});

describe('evaluate — GLOBAL marker', () => {
  it('passes when the table is GLOBAL', () => {
    const s = state({ found: { [tableKey('public', 'currencies')]: { locality: 'GLOBAL' } } });
    expect(evaluate(s, [global()]).isEmpty()).toBe(true);
  });

  it('contradiction when the table is REGIONAL BY ROW', () => {
    const s = state({ found: { [tableKey('public', 'currencies')]: { locality: 'REGIONAL BY ROW' } } });
    const r = evaluate(s, [global()]);
    expect(r.hasContradictions()).toBe(true);
    expect(r.problems[0]).toContain(CONTRADICTION);
    expect(r.statements).toContain('ALTER TABLE "currencies" SET LOCALITY GLOBAL;');
  });

  it('plain problem (not contradiction) when the table is REGIONAL BY TABLE', () => {
    const s = state({ found: { [tableKey('public', 'currencies')]: { locality: 'REGIONAL BY TABLE IN "us-east1"' } } });
    const r = evaluate(s, [global()]);
    expect(r.hasContradictions()).toBe(false);
    expect(r.problems[0]).toContain('not GLOBAL');
    expect(r.statements).toContain('ALTER TABLE "currencies" SET LOCALITY GLOBAL;');
  });

  it('reports a missing table', () => {
    const r = evaluate(state(), [global()]);
    expect(r.problems[0]).toContain('does not exist');
  });
});

describe('evaluate — REGIONAL BY ROW marker', () => {
  it('passes when the table is REGIONAL BY ROW with the implicit column', () => {
    const s = state({ found: { [tableKey('public', 'orders')]: { locality: 'REGIONAL BY ROW' } } });
    expect(evaluate(s, [rbr()]).isEmpty()).toBe(true);
  });

  it('contradiction when the table is GLOBAL', () => {
    const s = state({ found: { [tableKey('public', 'orders')]: { locality: 'GLOBAL' } } });
    const r = evaluate(s, [rbr()]);
    expect(r.hasContradictions()).toBe(true);
    expect(r.statements).toContain('ALTER TABLE "orders" SET LOCALITY REGIONAL BY ROW;  -- rewrites the table');
  });

  it('suggests AS <column> for a custom region column, quoted', () => {
    const s = state({
      found: {
        [tableKey('public', 'orders')]: { locality: 'REGIONAL BY ROW', columnTypes: { region: 'crdb_internal_region' } },
      },
    });
    const r = evaluate(s, [rbr('Order', 'orders', 'region')]);
    expect(r.statements).toContain('ALTER TABLE "orders" SET LOCALITY REGIONAL BY ROW AS "region";  -- rewrites the table');
  });

  it('flags a region column of the wrong type', () => {
    const s = state({
      found: {
        [tableKey('public', 'orders')]: { locality: 'GLOBAL', columnTypes: { region: 'STRING' } },
      },
    });
    const r = evaluate(s, [rbr('Order', 'orders', 'region')]);
    expect(r.problems.some((p) => p.includes('needs a crdb_internal_region column'))).toBe(true);
  });

  it('flags a custom region column that does not exist', () => {
    const s = state({ found: { [tableKey('public', 'orders')]: { locality: 'GLOBAL', columnTypes: {} } } });
    const r = evaluate(s, [rbr('Order', 'orders', 'region')]);
    expect(r.problems.some((p) => p.includes('does not exist'))).toBe(true);
  });
});

describe('evaluate — unmarked entity on a multi-region table', () => {
  it('asks to add a GLOBAL marker', () => {
    const s = state({ found: { [tableKey('public', 'currencies')]: { locality: 'GLOBAL' } } });
    const r = evaluate(s, [{ entity: 'Currency', table: 'currencies', kind: 'NONE' }]);
    expect(r.problems[0]).toContain("locality: 'GLOBAL'");
    expect(r.hasContradictions()).toBe(false);
  });

  it('asks to add a REGIONAL BY ROW marker', () => {
    const s = state({ found: { [tableKey('public', 'orders')]: { locality: 'REGIONAL BY ROW' } } });
    const r = evaluate(s, [{ entity: 'Order', table: 'orders', kind: 'NONE' }]);
    expect(r.problems[0]).toContain("locality: 'REGIONAL_BY_ROW'");
  });
});

describe('evaluate — conflicting markers (contradictions)', () => {
  it('one entity marked both ways', () => {
    const s = state({ found: { [tableKey('public', 'orders')]: { locality: 'GLOBAL' } } });
    const r = evaluate(s, [{ entity: 'Order', table: 'orders', kind: 'BOTH' }]);
    expect(r.hasContradictions()).toBe(true);
    expect(r.problems[0]).toContain('keep one');
  });

  it('two entities on the same table with different markers', () => {
    const s = state({ found: { [tableKey('public', 'orders')]: { locality: 'GLOBAL' } } });
    const r = evaluate(s, [global('A', 'orders'), rbr('B', 'orders')]);
    expect(r.hasContradictions()).toBe(true);
    expect(r.problems[0]).toContain('conflicting markers');
  });
});

describe('identifier quoting', () => {
  it('quotes keyword and special-character table names in the report', () => {
    const r = evaluate(state(), [global('Ord', 'order')]);
    expect(r.problems[0]).toContain('"order"');
    expect(ident('we"ird')).toBe('"we""ird"');
  });

  it('parses REGIONAL BY ROW AS "col" to its stored column name', () => {
    expect(regionalByRowColumn('REGIONAL BY ROW')).toBe('crdb_region');
    expect(regionalByRowColumn('REGIONAL BY ROW AS "Region"')).toBe('Region');
    expect(regionalByRowColumn('REGIONAL BY ROW AS region')).toBe('region');
    expect(regionalByRowColumn('GLOBAL')).toBeNull();
  });
});

describe('failsStartup — contradictions fail even in warn (teeth-check)', () => {
  it('warn + contradiction fails startup', () => {
    const r = new MultiregionReport();
    r.contradiction('x');
    expect(failsStartup(r, 'warn')).toBe(true);
  });

  it('warn + plain problem does not fail startup', () => {
    const r = new MultiregionReport();
    r.problem('x');
    expect(failsStartup(r, 'warn')).toBe(false);
  });

  it('validate fails on any problem', () => {
    const r = new MultiregionReport();
    r.problem('x');
    expect(failsStartup(r, 'validate')).toBe(true);
  });
});

describe('report formatting', () => {
  it('includes the header, contradiction note, suggested SQL and link', () => {
    const s = state({ found: { [tableKey('public', 'currencies')]: { locality: 'REGIONAL BY ROW' } } });
    const out = evaluate(s, [global()]).format('warn');
    expect(out).toContain('CockroachDB multiregion check');
    expect(out).toContain('mode=warn');
    expect(out).toContain('Contradictions stop startup');
    expect(out).toContain('Suggested SQL');
    expect(out).toContain('multiregion-overview');
  });
});
