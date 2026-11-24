/**
 * Multi-region schema check: compares declared entity locality (GLOBAL /
 * REGIONAL BY ROW) against the live database and tables, and suggests SQL for
 * every difference. It only reads; it never changes the schema.
 *
 * A faithful port of the Spring starter's startup check
 * (`com.cockroachlabs.data.multiregion.MultiregionCheck`). Adapters
 * (`@cockroachdb/drizzle`, `@cockroachdb/prisma`) enumerate the user's schema
 * into {@link DeclaredTable}s; this module does the introspection, the diff,
 * the report and the fix-up SQL.
 *
 * All queries use `SHOW` statements and `information_schema`, not
 * `crdb_internal`, which recent CockroachDB versions restrict by default.
 */

import { addRegion, ident, setLocalityGlobal, setLocalityRegionalByRow, setPrimaryRegion } from './ddl.js';

/** How the check reacts to problems. `warn` is the default. */
export type MultiregionMode = 'none' | 'warn' | 'validate';

/** What an entity's markers expect of its table. `NONE` for an unmarked entity. */
export type DeclaredKind = 'NONE' | 'GLOBAL' | 'REGIONAL_BY_ROW' | 'BOTH';

/**
 * The table of an entity and what its locality marker, if any, expects of it.
 * Names are as CockroachDB stores them (the adapter reads them from the ORM
 * metamodel, so quoted / cased names survive).
 */
export interface DeclaredTable {
  /** The entity's name, for messages (e.g. the schema export key or model name). */
  entity: string;
  /** The table's schema, or undefined for the connection's current schema. */
  schema?: string;
  /** The table's name. */
  table: string;
  /** What the markers expect; `NONE` for an entity with neither. */
  kind: DeclaredKind;
  /** The region column of a `@CrdbRegion`-equivalent field, or undefined. */
  regionColumn?: string;
}

/** A pg-style query runner. Both pg `Pool`/`PoolClient` and the adapters satisfy it. */
export interface Queryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/** Options for {@link verifyDeclaredTables}. */
export interface VerifyMultiregionOptions {
  /** `warn` (default), `validate`, or `none`. */
  mode?: MultiregionMode;
  /** Where to write the report in `warn` mode. Defaults to `console.warn`. */
  logger?: (message: string) => void;
}

const REGION_TYPE = 'crdb_internal_region';
const IMPLICIT_REGION_COLUMN = 'crdb_region';
const REGIONAL_BY_ROW = 'REGIONAL BY ROW';
const OVERVIEW = 'https://www.cockroachlabs.com/docs/stable/multiregion-overview';
const SOURCE = '@cockroachdb/core verifyMultiregionSchema';
const PROPERTY = 'mode';

/** Prefix the report puts on a problem that stops startup even in `warn`. */
export const CONTRADICTION = 'Contradiction: ';

interface TableInfo {
  /** As `SHOW TABLES` reports it, null outside a multi-region database. */
  locality: string | null;
  /** Column types (`information_schema.columns.crdb_sql_type`), only for columns the check needs. */
  columnTypes: Map<string, string>;
}

/** What the check reads from CockroachDB. */
export interface MultiregionState {
  database: string;
  currentSchema: string;
  /** The database's primary region, or null when it is not multi-region. */
  primaryRegion: string | null;
  /** The cluster's node regions, empty when no node has a region locality. */
  clusterRegions: string[];
  /** The checked tables that exist, keyed by {@link tableKey}. */
  tables: Map<string, TableInfo>;
}

function tableKey(schema: string, table: string): string {
  return `${schema} ${table}`;
}

/**
 * The problems the check found, and SQL that fixes them. A contradiction (a
 * marker that names one locality while the table has the other, or markers that
 * disagree) stops startup even in `warn`.
 */
export class MultiregionReport {
  readonly problems: string[] = [];
  readonly statements: string[] = [];
  private contradictions = 0;

  problem(problem: string): void {
    this.problems.push(problem);
  }

  contradiction(problem: string): void {
    this.problems.push(CONTRADICTION + problem);
    this.contradictions += 1;
  }

  statement(statement: string): void {
    this.statements.push(statement);
  }

  isEmpty(): boolean {
    return this.problems.length === 0;
  }

  hasContradictions(): boolean {
    return this.contradictions > 0;
  }

  /** The report as one message. */
  format(mode: MultiregionMode): string {
    const n = this.problems.length;
    let out =
      `CockroachDB multiregion check (${SOURCE}, ${PROPERTY}=${mode}) found ` +
      `${n} ${n === 1 ? 'problem:' : 'problems:'}`;
    for (const problem of this.problems) {
      out += `\n  - ${problem.replace(/\n/g, '\n    ')}`;
    }
    if (this.contradictions > 0) {
      out +=
        '\n\nContradictions stop startup in every mode but none: the markers and the schema' +
        ' disagree about where rows live, so one of them is wrong.';
    }
    if (this.statements.length > 0) {
      out += '\n\nSuggested SQL (review, then add to a migration; or alter the markers):';
      for (const statement of this.statements) {
        out += `\n  ${statement}`;
      }
    }
    out += `\n\nSee also: ${OVERVIEW}`;
    return out;
  }
}

/** Whether the report must stop startup in `mode`. A contradiction fails even in `warn`. */
export function failsStartup(report: MultiregionReport, mode: MultiregionMode): boolean {
  return mode === 'validate' || report.hasContradictions();
}

/** Whether `exec` is to CockroachDB. Stays quiet (false) when the probe fails. */
export async function isCockroachDB(exec: Queryable): Promise<boolean> {
  try {
    const r = await exec.query('SELECT version() AS v');
    const v = r.rows[0]?.v;
    return typeof v === 'string' && v.includes('CockroachDB');
  } catch {
    return false;
  }
}

async function columnTypes(exec: Queryable, schema: string, table: string): Promise<Map<string, string>> {
  const r = await exec.query(
    'SELECT column_name, crdb_sql_type FROM information_schema.columns ' +
      'WHERE table_catalog = current_database() AND table_schema = $1 AND table_name = $2',
    [schema, table],
  );
  const types = new Map<string, string>();
  for (const row of r.rows) {
    types.set(String(row.column_name), String(row.crdb_sql_type));
  }
  return types;
}

/** Reads what {@link evaluate} needs for `tables` over `exec`. */
export async function loadState(exec: Queryable, tables: DeclaredTable[]): Promise<MultiregionState> {
  const meta = await exec.query('SELECT current_database() AS db, current_schema() AS sch');
  const metaRow = meta.rows[0] ?? {};
  const database = String(metaRow.db);
  const currentSchema = metaRow.sch != null ? String(metaRow.sch) : 'public';

  const pr = await exec.query('SELECT primary_region FROM [SHOW DATABASES] WHERE database_name = $1', [database]);
  const primaryRegion = pr.rows.length > 0 && pr.rows[0]?.primary_region != null ? String(pr.rows[0].primary_region) : null;

  const cr = await exec.query('SELECT region FROM [SHOW REGIONS FROM CLUSTER] ORDER BY region');
  const clusterRegions = cr.rows.map((row) => String(row.region));

  const wanted = new Set(tables.map((t) => tableKey(t.schema ?? currentSchema, t.table)));
  const found = new Map<string, TableInfo>();
  const st = await exec.query("SELECT schema_name, table_name, locality FROM [SHOW TABLES] WHERE type = 'table'");
  for (const row of st.rows) {
    const k = tableKey(String(row.schema_name), String(row.table_name));
    if (wanted.has(k)) {
      found.set(k, { locality: row.locality != null ? String(row.locality) : null, columnTypes: new Map() });
    }
  }

  for (const t of tables) {
    if (t.kind !== 'REGIONAL_BY_ROW') continue;
    const schema = t.schema ?? currentSchema;
    const info = found.get(tableKey(schema, t.table));
    if (info) {
      info.columnTypes = await columnTypes(exec, schema, t.table);
    }
  }

  return { database, currentSchema, primaryRegion, clusterRegions, tables: found };
}

/**
 * Lists every difference between `tables` and `state`, with SQL to fix the
 * schema or a description of the marker to fix. Pure: no I/O, so every branch
 * is unit-testable with a hand-built {@link MultiregionState}.
 */
export function evaluate(state: MultiregionState, tables: DeclaredTable[]): MultiregionReport {
  const report = new MultiregionReport();
  const multiregion = state.primaryRegion != null;
  const annotatedList = tables.filter((t) => t.kind !== 'NONE');

  if (!multiregion && annotatedList.length > 0) {
    const database = ident(state.database);
    const names = annotatedList.map((t) => t.entity).join(', ');
    const affected = `GLOBAL/REGIONAL BY ROW markers on ${count(annotatedList.length, 'entity', 'entities')} (${names}) have no effect.`;
    if (state.clusterRegions.length === 0) {
      report.problem(
        `Database ${database} is not multi-region; ${affected}` +
          "\nThe cluster has no regions, so the database can't be made multi-region yet:" +
          ' start every node with --locality=region=<region>.',
      );
    } else {
      report.problem(
        `Database ${database} is not multi-region; ${affected}` +
          `\nThe cluster has regions: ${state.clusterRegions.join(', ')}. ` +
          'Choose the primary region deliberately; the SQL below uses the first one.',
      );
      const regions = state.clusterRegions;
      report.statement(`${setPrimaryRegion(state.database, regions[0]!)};`);
      for (const region of regions.slice(1)) {
        report.statement(`${addRegion(state.database, region)};`);
      }
    }
  }

  const byTable = new Map<string, DeclaredTable[]>();
  for (const t of tables) {
    const k = tableKey(t.schema ?? state.currentSchema, t.table);
    let list = byTable.get(k);
    if (!list) {
      list = [];
      byTable.set(k, list);
    }
    list.push(t);
  }

  for (const [key, group] of byTable) {
    const first = group[0]!;
    const schema = first.schema ?? state.currentSchema;
    const qualified = `${ident(schema)}.${ident(first.table)}`;
    const info = state.tables.get(key);

    const annotated = group.filter((t) => t.kind !== 'NONE');
    const kinds = new Set(annotated.map((t) => t.kind));

    if (kinds.size === 0) {
      unannotated(report, qualified, info, group, multiregion);
    } else if (kinds.size > 1 || kinds.has('BOTH')) {
      conflicting(report, qualified, annotated);
    } else {
      const table = annotated[0]!;
      if (table.kind === 'GLOBAL') {
        global(report, qualified, info, table, multiregion);
      } else {
        regionalByRow(report, table, qualified, info, multiregion);
      }
    }
  }

  return report;
}

function global(
  report: MultiregionReport,
  qualified: string,
  info: TableInfo | undefined,
  table: DeclaredTable,
  multiregion: boolean,
): void {
  if (!info) {
    missing(report, qualified, 'GLOBAL marker', table);
    return;
  }
  if (!multiregion || info.locality !== 'GLOBAL') {
    if (multiregion) {
      const problem = `Table ${qualified} (GLOBAL marker ${table.entity}) is ${info.locality}, not GLOBAL.`;
      if (regionalByRowColumn(info.locality) != null) {
        report.contradiction(problem);
      } else {
        report.problem(problem);
      }
    }
    report.statement(`${setLocalityGlobal(table.table)};`);
  }
}

function unannotated(
  report: MultiregionReport,
  qualified: string,
  info: TableInfo | undefined,
  entities: DeclaredTable[],
  multiregion: boolean,
): void {
  if (!info || !multiregion) return;
  const names = entities.map((e) => e.entity).join(', ');
  if (info.locality === 'GLOBAL') {
    report.problem(
      `Table ${qualified} is GLOBAL, but entity ${names} has no GLOBAL marker. ` +
        "Add crdbLocality(..., { locality: 'GLOBAL' }) to it.",
    );
    return;
  }
  const column = regionalByRowColumn(info.locality);
  if (column != null) {
    report.problem(
      `Table ${qualified} is ${info.locality}, but entity ${names} has no REGIONAL BY ROW marker. ` +
        `Add crdbLocality(..., { locality: 'REGIONAL_BY_ROW', regionColumn: '${column}' }) ` +
        'so rows are homed in the transaction’s region.',
    );
  }
}

function conflicting(report: MultiregionReport, qualified: string, entities: DeclaredTable[]): void {
  if (entities.length === 1) {
    report.contradiction(
      `Entity ${entities[0]!.entity} is marked both GLOBAL and REGIONAL BY ROW; keep one.`,
    );
    return;
  }
  const described = entities
    .map((t) => `${t.entity} (${markerName(t.kind)})`)
    .join(', ');
  report.contradiction(
    `Table ${qualified} is mapped by entities with conflicting markers: ${described}. Mark them alike.`,
  );
}

function regionalByRow(
  report: MultiregionReport,
  table: DeclaredTable,
  qualified: string,
  info: TableInfo | undefined,
  multiregion: boolean,
): void {
  if (!info) {
    missing(report, qualified, 'REGIONAL BY ROW marker', table);
    return;
  }
  const wantedColumn = table.regionColumn ?? null;
  const currentColumn = regionalByRowColumn(info.locality);
  if (multiregion && currentColumn != null && (wantedColumn == null || wantedColumn === currentColumn)) {
    return;
  }

  const column = wantedColumn ?? IMPLICIT_REGION_COLUMN;
  const quotedColumn = ident(column);
  const type = info.columnTypes.get(column);
  const description = `Table ${qualified} (REGIONAL BY ROW marker ${table.entity})`;
  const target = column === IMPLICIT_REGION_COLUMN ? REGIONAL_BY_ROW : `${REGIONAL_BY_ROW} AS ${quotedColumn}`;
  const isGlobal = multiregion && info.locality === 'GLOBAL';
  if (isGlobal) {
    report.contradiction(`${description} is GLOBAL, not ${target}.`);
  }
  if (type !== undefined && !isRegionType(type)) {
    report.problem(
      `${description}: column ${quotedColumn} is ${type}, but REGIONAL BY ROW needs a ${REGION_TYPE} column. ` +
        'Change it with your migrations.',
    );
    return;
  }
  if (type === undefined && column !== IMPLICIT_REGION_COLUMN) {
    report.problem(
      `${description}: column ${quotedColumn} of the region field does not exist. ` +
        `Create it, as a ${REGION_TYPE} column, with your migrations.`,
    );
    return;
  }

  if (multiregion && !isGlobal) {
    report.problem(`${description} is ${info.locality}, not ${target}.`);
  }
  const stmt = column === IMPLICIT_REGION_COLUMN
    ? setLocalityRegionalByRow(table.table)
    : `${setLocalityRegionalByRow(table.table)} AS ${quotedColumn}`;
  report.statement(`${stmt};  -- rewrites the table`);
}

function missing(report: MultiregionReport, qualified: string, marker: string, table: DeclaredTable): void {
  report.problem(
    `Table ${qualified} (${marker} ${table.entity}) does not exist. Create it with your migrations.`,
  );
}

function markerName(kind: DeclaredKind): string {
  if (kind === 'GLOBAL') return 'GLOBAL';
  if (kind === 'REGIONAL_BY_ROW') return 'REGIONAL BY ROW';
  return 'GLOBAL and REGIONAL BY ROW';
}

/** The region column of a `REGIONAL BY ROW` locality, or null for any other locality. */
export function regionalByRowColumn(locality: string | null): string | null {
  if (locality == null || !locality.startsWith(REGIONAL_BY_ROW)) {
    return null;
  }
  const rest = locality.slice(REGIONAL_BY_ROW.length).trim();
  if (rest === '') {
    return IMPLICIT_REGION_COLUMN;
  }
  if (rest.startsWith('AS ')) {
    return parseIdentifier(rest.slice(3).trim())[0] ?? null;
  }
  return null;
}

function isRegionType(type: string): boolean {
  return type === REGION_TYPE || type.endsWith(`.${REGION_TYPE}`);
}

/**
 * Splits a possibly qualified, possibly quoted name such as `app."Orders"` into
 * its parts, the way CockroachDB stores them: unquoted names fold to lower case,
 * quoted names are kept verbatim.
 */
export function parseIdentifier(rendered: string): string[] {
  const parts: string[] = [];
  let part = '';
  let inQuotes = false;
  let quoted = false;
  for (let i = 0; i < rendered.length; i++) {
    const c = rendered[i]!;
    if (inQuotes) {
      if (c !== '"') {
        part += c;
      } else if (i + 1 < rendered.length && rendered[i + 1] === '"') {
        part += '"';
        i++;
      } else {
        inQuotes = false;
      }
    } else if (c === '"') {
      inQuotes = true;
      quoted = true;
    } else if (c === '.') {
      parts.push(finish(part, quoted));
      part = '';
      quoted = false;
    } else {
      part += c;
    }
  }
  parts.push(finish(part, quoted));
  return parts;
}

function finish(part: string, quoted: boolean): string {
  return quoted ? part : part.trim().toLowerCase();
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Runs the multi-region check over pre-enumerated `tables`: skips in `none`
 * mode or against a non-CockroachDB database, otherwise reads the live schema,
 * diffs it, and in `validate` mode (or on any contradiction) throws to fail
 * startup; in `warn` mode it logs.
 */
export async function verifyDeclaredTables(
  exec: Queryable,
  tables: DeclaredTable[],
  opts?: VerifyMultiregionOptions,
): Promise<MultiregionReport> {
  const mode = opts?.mode ?? 'warn';
  if (mode === 'none') return new MultiregionReport();
  if (!(await isCockroachDB(exec))) return new MultiregionReport();

  const state = await loadState(exec, tables);
  const report = evaluate(state, tables);
  if (!report.isEmpty()) {
    const message = report.format(mode);
    if (failsStartup(report, mode)) {
      throw new Error(message);
    }
    (opts?.logger ?? ((m: string) => console.warn(m)))(message);
  }
  return report;
}
