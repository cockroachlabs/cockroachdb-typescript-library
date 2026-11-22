/** `CREATE CHANGEFEED` statement builder. */

function ident(name: string): string {
  if (name.trim() === '') throw new Error(`cdc: invalid identifier ${JSON.stringify(name)}`);
  return `"${name.replace(/"/g, '""')}"`;
}

function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Fluent builder for a `CREATE CHANGEFEED` statement. */
export class ChangefeedSpecBuilder {
  private tableName?: string;
  private cols: string[] = [];
  private sinkUri?: string;
  private readonly options = new Map<string, string>();

  table(table: string): this {
    this.tableName = table;
    return this;
  }

  columns(columns: string[]): this {
    this.cols = [...columns];
    return this;
  }

  webhookTarget(url: string): this {
    this.sinkUri = url;
    return this;
  }

  /** Adds a raw `WITH` option; an empty value renders as a bare flag. */
  option(key: string, value = ''): this {
    this.options.set(key, value);
    return this;
  }

  withUpdated(): this {
    return this.option('updated');
  }

  withDiff(): this {
    return this.option('diff');
  }

  resolved(interval: string): this {
    return this.option('resolved', interval);
  }

  envelope(envelope: string): this {
    return this.option('envelope', envelope);
  }

  build(): ChangefeedSpec {
    if (!this.tableName || this.tableName.trim() === '') {
      throw new Error('cdc: changefeed requires a table');
    }
    if (!this.sinkUri || this.sinkUri.trim() === '') {
      throw new Error('cdc: changefeed requires a sink (webhook target)');
    }
    return new ChangefeedSpec(
      this.tableName,
      [...this.cols],
      this.sinkUri,
      new Map([...this.options].sort(([a], [b]) => a.localeCompare(b))),
    );
  }
}

/** A validated changefeed specification. */
export class ChangefeedSpec {
  constructor(
    readonly table: string,
    readonly columns: string[],
    readonly sink: string,
    readonly options: Map<string, string>,
  ) {}

  static builder(): ChangefeedSpecBuilder {
    return new ChangefeedSpecBuilder();
  }

  /** Renders the `CREATE CHANGEFEED` statement (options sorted for determinism). */
  toSql(): string {
    let sql = `CREATE CHANGEFEED FOR TABLE ${ident(this.table)}`;
    if (this.columns.length > 0) {
      sql += ` (${this.columns.map(ident).join(', ')})`;
    }
    sql += ` INTO ${lit(this.sink)}`;
    if (this.options.size > 0) {
      const opts = [...this.options].map(([k, v]) => (v === '' ? k : `${k} = ${lit(v)}`));
      sql += ` WITH ${opts.join(', ')}`;
    }
    return sql;
  }
}
