import { Pool } from 'pg';
import type { PoolClient, PoolConfig } from 'pg';
import {
  backoffDelayMs,
  followerReadClause,
  isolationSql,
  isRetryable,
  resolveConfig,
  sleep,
  type CrdbConfig,
  type HealthChecker,
  type IsolationLevel,
  type MetricsRecorder,
} from '@cockroachdb/core';

/** Per-transaction overrides for {@link CrdbPool.executeTx}. */
export interface TxOptions {
  isolation?: IsolationLevel;
  readOnly?: boolean;
}

/** A CockroachDB-aware wrapper over a node-postgres `Pool`. */
export class CrdbPool implements HealthChecker {
  readonly config: CrdbConfig;
  private metrics?: MetricsRecorder;

  constructor(
    readonly pool: Pool,
    config?: Partial<CrdbConfig>,
  ) {
    this.config = resolveConfig(config);
  }

  /** Connects using a connection string (or pg `PoolConfig`). */
  static connect(connection: string | PoolConfig, config?: Partial<CrdbConfig>): CrdbPool {
    const poolConfig: PoolConfig =
      typeof connection === 'string' ? { connectionString: connection } : connection;
    return new CrdbPool(new Pool(poolConfig), config);
  }

  /** Attaches a metrics recorder. */
  withMetrics(recorder: MetricsRecorder): this {
    this.metrics = recorder;
    return this;
  }

  /** Closes the pool. */
  async end(): Promise<void> {
    await this.pool.end();
  }

  /** `SELECT 1` health probe. */
  async check(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  /**
   * Runs `fn` in a transaction, retrying on serialization conflicts (`40001`)
   * with exponential backoff. Commits on success, rolls back and retries on a
   * retryable error, and rethrows once the retry budget is exhausted.
   */
  async executeTx<T>(fn: (client: PoolClient) => Promise<T>, opts?: TxOptions): Promise<T> {
    const isolation = opts?.isolation ?? this.config.isolation;
    const readOnly = opts?.readOnly ?? this.config.readOnly;
    const policy = this.config.retry;
    const start = Date.now();
    let attempt = 0;

    for (;;) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SET TRANSACTION ISOLATION LEVEL ${isolationSql(isolation)}`);
        if (readOnly) await client.query('SET TRANSACTION READ ONLY');
        const result = await fn(client);
        await client.query('COMMIT');
        this.metrics?.recordTransaction(Date.now() - start, attempt, true);
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        if (isRetryable(err) && attempt < policy.maxRetries) {
          attempt += 1;
          const delay = backoffDelayMs(policy, attempt - 1);
          this.metrics?.recordRetry(delay);
          await sleep(delay);
          continue;
        }
        this.metrics?.recordTransaction(Date.now() - start, attempt, false);
        throw err;
      } finally {
        client.release();
      }
    }
  }

  /**
   * Runs `fn` inside a transaction scoped to a follower-read timestamp
   * (`SET TRANSACTION AS OF SYSTEM TIME ...`). `0` staleness uses
   * `follower_read_timestamp()`.
   */
  async followerReadTx<T>(
    stalenessMs: number,
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const clause = followerReadClause(stalenessMs);
    const start = Date.now();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET TRANSACTION ${clause}`);
      const result = await fn(client);
      await client.query('COMMIT');
      this.metrics?.recordFollowerRead(Date.now() - start);
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
}
