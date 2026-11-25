# AGENTS.md — cockroachdb-typescript-library (consumer guide)

For coding agents working in a **TypeScript/Node app that depends on this library**.
It makes CockroachDB's distributed-SQL behavior automatic. Use the provided symbols;
don't reimplement them. Full detail: [`README.md`](../../README.md).

## Already handled — do NOT rebuild it

- **Serialization retry (`SQLSTATE 40001`) is automatic.** Wrap writes in
  `CrdbPool.executeTx(async (tx) => …)` (`@cockroachdb/pg`), or use the
  `@transactional` decorator with ambient `requireTx()` (backed by
  `AsyncLocalStorage`). Never hand-roll a 40001 retry loop. ORM adapters retry too:
  `@cockroachdb/drizzle` around `db.transaction`, `@cockroachdb/prisma` around
  `$transaction` (incl. Prisma `P2034`).
- **Multi-region startup check**, metrics/health, circuit breaker, and Continuum
  plumbing ship in the library — don't reimplement them.
- Transactions run at **SERIALIZABLE**; that's what surfaces 40001 so retry works.
  Don't downgrade isolation to dodge conflicts.

## Which helper for each job

- **Follower reads** (low-latency historical, nearest replica):
  `pool.followerReadTx(stalenessMs, (tx) => …)` — don't append `AS OF SYSTEM TIME` by hand.
- **Region homing / regional-by-row**: set the **`crdb_region` COLUMN** on the row
  (via the `@cockroachdb/core` homing/DDL helpers). There is **no `SET crdb_region`
  session variable** — never emit that statement.
- **CDC changefeeds**: `@cockroachdb/cdc` (changefeed SQL builder + webhook sink
  handler + metrics). Don't write changefeed SQL or sink plumbing by hand.
- **Vector search / RAG**: `@cockroachdb/ai` (pgvector `VECTOR` / C-SPANN + RAG retrieval).
- **Continuum / MCP / Cloud**: `@cockroachdb/continuum` (vCluster QoS, Plenum storage,
  Aegis, MCP, Cloud).

## Config that matters

- Connection + region: `CrdbPool.connect(url, { region })`.
- Retry max attempts and follower-read staleness window are configured on the pool /
  via `@cockroachdb/core` retry policy — tune there, not in app code.
- On web services, carry the region via the `X-CockroachDB-Region` header.

## Anti-patterns

- Hand-rolled 40001 retry loop → use `executeTx` / `@transactional`.
- Raw `SET crdb_region` → set the `crdb_region` **column** instead.
- Hand-written changefeed/sink plumbing → use `@cockroachdb/cdc`.
- Opening a result stream then committing in the same tx → finish reads before commit
  (vector-search gotcha).

## Testing

Use `@cockroachdb/testing`: concurrency runner, retry simulator, fake SQLSTATE error
for deterministic 40001 tests.

> Types are strict (`strict: true`); honor non-nullable signatures rather than
> casting around them.
