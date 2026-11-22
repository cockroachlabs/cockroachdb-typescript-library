/** DDL string builders for multi-region schema changes. */

/** Quotes a SQL identifier. */
export function ident(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** `ALTER DATABASE <db> SET PRIMARY REGION '<region>'`. */
export function setPrimaryRegion(database: string, region: string): string {
  return `ALTER DATABASE ${ident(database)} SET PRIMARY REGION ${lit(region)}`;
}

/** `ALTER DATABASE <db> ADD REGION '<region>'`. */
export function addRegion(database: string, region: string): string {
  return `ALTER DATABASE ${ident(database)} ADD REGION ${lit(region)}`;
}

/** `ALTER TABLE <table> SET LOCALITY REGIONAL BY ROW`. */
export function setLocalityRegionalByRow(table: string): string {
  return `ALTER TABLE ${ident(table)} SET LOCALITY REGIONAL BY ROW`;
}

/** `ALTER TABLE <table> SET LOCALITY GLOBAL`. */
export function setLocalityGlobal(table: string): string {
  return `ALTER TABLE ${ident(table)} SET LOCALITY GLOBAL`;
}

/** `ALTER TABLE <table> SET LOCALITY REGIONAL BY TABLE IN '<region>'`. */
export function setLocalityRegionalByTable(table: string, region: string): string {
  return `ALTER TABLE ${ident(table)} SET LOCALITY REGIONAL BY TABLE IN ${lit(region)}`;
}
