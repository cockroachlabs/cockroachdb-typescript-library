/** Aggregate outcome of a {@link ConcurrencyRunner.run}. */
export interface RunReport {
  total: number;
  successes: number;
  failures: number;
}

/**
 * Runs an async operation across many concurrent workers to stress-test
 * serialization behaviour. Each of `concurrency` workers performs `iterations`
 * operations; successes and failures are tallied.
 */
export class ConcurrencyRunner {
  constructor(
    readonly concurrency: number,
    readonly iterations: number,
  ) {}

  /** Runs `op` (given a globally-unique 0-based index) across all workers. */
  async run(op: (index: number) => Promise<unknown>): Promise<RunReport> {
    const workers = Array.from({ length: this.concurrency }, async (_unused, worker) => {
      let successes = 0;
      let failures = 0;
      for (let i = 0; i < this.iterations; i++) {
        try {
          await op(worker * this.iterations + i);
          successes += 1;
        } catch {
          failures += 1;
        }
      }
      return { successes, failures };
    });

    const results = await Promise.all(workers);
    const report = results.reduce<RunReport>(
      (acc, r) => ({
        total: acc.total + r.successes + r.failures,
        successes: acc.successes + r.successes,
        failures: acc.failures + r.failures,
      }),
      { total: 0, successes: 0, failures: 0 },
    );
    return report;
  }
}
