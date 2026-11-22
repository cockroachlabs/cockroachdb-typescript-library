import { AsyncLocalStorage } from 'node:async_hooks';
import type { PoolClient } from 'pg';
import type { CrdbPool, TxOptions } from './pool.js';

/**
 * Ambient transaction context.
 *
 * `AsyncLocalStorage` is Node's thread-local equivalent — the same mechanism
 * Spring's AOP uses for thread-bound connections. The {@link transactional}
 * decorator runs a method inside a transaction stored here; the body retrieves
 * it with {@link currentTx} / {@link requireTx}.
 */
const txStorage = new AsyncLocalStorage<PoolClient>();

/** The transaction client bound to the current async context, if any. */
export function currentTx(): PoolClient | undefined {
  return txStorage.getStore();
}

/** Like {@link currentTx}, but throws if there is no active transaction. */
export function requireTx(): PoolClient {
  const tx = txStorage.getStore();
  if (!tx) {
    throw new Error(
      '@cockroachdb/pg: no active transaction (call within @transactional or executeTx)',
    );
  }
  return tx;
}

/** Runs `fn` with `client` bound as the ambient transaction. */
export function runInTx<T>(client: PoolClient, fn: () => Promise<T>): Promise<T> {
  return txStorage.run(client, fn);
}

/** Options for {@link transactional}. */
export interface TransactionalOptions extends TxOptions {
  /** Instance property holding the {@link CrdbPool} (default `"pool"`). */
  poolProperty?: string;
}

/**
 * Method decorator that runs the method in a retrying transaction. The instance
 * must expose a {@link CrdbPool} (on `pool` by default). Inside the method, use
 * {@link requireTx} to get the transaction client.
 *
 * ```ts
 * class Accounts {
 *   constructor(private pool: CrdbPool) {}
 *   @transactional()
 *   async transfer(from: string, to: string, cents: number) {
 *     const tx = requireTx();
 *     await tx.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [cents, from]);
 *     await tx.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [cents, to]);
 *   }
 * }
 * ```
 */
export function transactional(options: TransactionalOptions = {}) {
  const poolProperty = options.poolProperty ?? 'pool';
  // Legacy (experimentalDecorators) method decorator — supported by both tsc and
  // the esbuild transform vitest uses, unlike the TC39 proposal.
  return function (
    _target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const original = descriptor.value as (...args: unknown[]) => Promise<unknown>;
    descriptor.value = function (this: Record<string, unknown>, ...args: unknown[]): Promise<unknown> {
      const pool = this[poolProperty] as CrdbPool | undefined;
      if (!pool) {
        throw new Error(
          `@cockroachdb/pg: @transactional on '${String(propertyKey)}' could not find a CrdbPool on '${poolProperty}'`,
        );
      }
      return pool.executeTx((client) => runInTx(client, () => original.apply(this, args)), {
        isolation: options.isolation,
        readOnly: options.readOnly,
      });
    };
    return descriptor;
  };
}
