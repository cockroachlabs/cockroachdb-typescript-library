# cockroachdb-typescript-library

CockroachDB client library for TypeScript/Node: automatic transaction retries on
serialization conflicts (`SQLSTATE 40001`), follower reads, multi-region row
homing, CDC changefeeds, vector search, Continuum support, metrics, circuit
breaker, and health checks.

> **Using an AI coding agent?** See [`docs/agents/AGENTS.md`](docs/agents/AGENTS.md)
> for what the library already handles so agents don't rebuild retries, region homing,
> CDC, or Continuum by hand. It ships in **two places**: bundled in the
> `@cockroachdb/core` npm package (at `node_modules/@cockroachdb/core/AGENTS.md`), and
> published on the registry site at
> <https://cockroachlabs.github.io/cockroachdb-typescript-library/agents/AGENTS.md>
> (indexed by `/llms.txt`).

The TypeScript sibling of the
[Spring Boot Starter](https://github.com/cockroachlabs/cockroachdb-spring-boot-starter),
[Go](https://github.com/cockroachlabs/cockroachdb-go-library),
[Python](https://github.com/cockroachlabs/cockroachdb-python-library),
[.NET](https://github.com/cockroachlabs/cockroachdb-dotnet-library), and
[Rust](https://github.com/cockroachlabs/cockroachdb-rust-library) libraries. Same
**core + adapter** shape: a driver-agnostic core, a primary
[node-postgres](https://node-postgres.com/) adapter, and Drizzle / Prisma ORM
adapters.

> Node has no runtime AOP, but `AsyncLocalStorage` is its thread-local equivalent —
> the mechanism Spring's AOP relies on. So the `@transactional` decorator provides
> an ambient transaction the method body picks up via `requireTx()`, alongside the
> plain closure form (`pool.executeTx(async (tx) => …)`).

## Packages

| Package | Purpose |
|---------|---------|
| `@cockroachdb/core` | Driver-agnostic: retry policy, SQLSTATE classification, isolation, follower-read builders, `crdb_region` homing, circuit breaker, metrics/health, DDL. |
| `@cockroachdb/pg` | **Primary adapter.** `CrdbPool` over `pg.Pool`, `executeTx` retry, follower reads, `@transactional` decorator + ambient `requireTx()`. |
| `@cockroachdb/drizzle` | Drizzle ORM adapter (retry around `db.transaction`). |
| `@cockroachdb/prisma` | Prisma adapter (retry around `$transaction`, incl. `P2034`). |
| `@cockroachdb/cdc` | Changefeed SQL builder + webhook sink handler + metrics. |
| `@cockroachdb/ai` | pgvector `VECTOR` / C-SPANN search + RAG retrieval. |
| `@cockroachdb/continuum` | vCluster QoS, Plenum storage, Aegis, MCP, Cloud. |
| `@cockroachdb/testing` | Concurrency runner, retry simulator, fake SQLSTATE error. |

## Installation

Served from this repository's GitHub Pages registry — no token. In `.npmrc`:

```
@cockroachdb:registry=https://cockroachlabs.github.io/cockroachdb-typescript-library/
```

```bash
npm install @cockroachdb/pg
```

## Quick start

```ts
import { CrdbPool } from '@cockroachdb/pg';

const pool = CrdbPool.connect(process.env.CRDB_URL!, { region: 'us-east1' });

// Retried automatically on serialization conflicts (40001).
await pool.executeTx(async (tx) => {
  await tx.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [100, 'a']);
  await tx.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [100, 'b']);
});

// Low-latency historical read from the nearest replica.
const recent = await pool.followerReadTx(5000, (tx) =>
  tx.query('SELECT id, balance FROM accounts'),
);
```

See [`examples/ideas-board`](examples/ideas-board) for a runnable demo.

## License

Apache-2.0. See [LICENSE](LICENSE).
