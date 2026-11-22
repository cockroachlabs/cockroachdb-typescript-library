import type { PoolClient } from 'pg';

/** Transaction quality-of-service level. */
export type Priority = 'regular' | 'critical' | 'background';

/** A vCluster tagging context: an application name and a QoS priority. */
export class VClusterContext {
  constructor(
    readonly application?: string,
    readonly priority: Priority = 'regular',
  ) {}

  /** `SET` statements applying this context; run first inside a transaction. */
  applyStatements(): string[] {
    const stmts = [`SET default_transaction_quality_of_service = '${this.priority}'`];
    if (this.application) {
      stmts.push(`SET application_name = '${this.application.replace(/'/g, "''")}'`);
    }
    return stmts;
  }

  /** Applies the context on a transaction client (inside an `executeTx` callback). */
  async applyTo(client: PoolClient): Promise<void> {
    for (const stmt of this.applyStatements()) {
      await client.query(stmt);
    }
  }
}
