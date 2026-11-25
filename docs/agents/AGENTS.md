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

## Learn CockroachDB fundamentals

The library handles the Node/TypeScript side; these CockroachDB docs explain the
database underneath. The links go to the Markdown version of each page, which is
easier for an agent to read; drop the `.md` for the HTML page. Every docs page has
one, and <https://docs.cockroachlabs.com/llms.txt> indexes the whole documentation site.

**Start here**

- [Developer Basics](https://docs.cockroachlabs.com/docs/stable/developer-basics.md): what's different about building on CockroachDB.
- [PostgreSQL Compatibility](https://docs.cockroachlabs.com/docs/stable/postgresql-compatibility.md): CockroachDB speaks the PostgreSQL wire protocol (use `node-postgres`/`pg`), with some differences.
- [Connection Pooling](https://docs.cockroachlabs.com/docs/stable/connection-pooling.md): sizing the `pg.Pool` that `CrdbPool` wraps.
- [Common Errors and Solutions](https://docs.cockroachlabs.com/docs/stable/common-errors.md)

**Transactions and contention**

- [Transactions](https://docs.cockroachlabs.com/docs/stable/transactions.md): SERIALIZABLE by default, and why clients see retry errors.
- [Transaction Retry Error Reference](https://docs.cockroachlabs.com/docs/stable/transaction-retry-error-reference.md): what each `40001` (`RETRY_SERIALIZABLE`, `RETRY_WRITE_TOO_OLD`, ...) means. `executeTx` / `@transactional` retry them; this tells you why they happen.
- [Reduce transaction contention](https://docs.cockroachlabs.com/docs/stable/performance-best-practices-overview.md#reduce-transaction-contention): the checklist. Keep transactions small, use `SELECT ... FOR UPDATE` for read-then-write, `UPSERT` whole rows, use historical reads where staleness is fine.
- [Understand Hotspots](https://docs.cockroachlabs.com/docs/stable/understand-hotspots.md): ranges that take far more traffic than others.
- [Performance Tuning Recipes](https://docs.cockroachlabs.com/docs/stable/performance-recipes.md): symptoms and fixes, contention included.
- [`SELECT FOR UPDATE`](https://docs.cockroachlabs.com/docs/stable/select-for-update.md)
- [Read Committed Transactions](https://docs.cockroachlabs.com/docs/stable/read-committed.md): an alternative isolation level, with trade-offs. Don't switch to it just to avoid retries.

**Schema design**

- [Database Schemas](https://docs.cockroachlabs.com/docs/stable/schema-design-overview.md): how to design and change schemas, including why to use a migration tool rather than the ORM.
- [Unique ID best practices](https://docs.cockroachlabs.com/docs/stable/performance-best-practices-overview.md#unique-id-best-practices): prefer `UUID` keys (`gen_random_uuid()`) over sequences or auto-increment, which create hotspots.
- [`UUID`](https://docs.cockroachlabs.com/docs/stable/uuid.md) and [Hash-sharded Indexes](https://docs.cockroachlabs.com/docs/stable/hash-sharded-indexes.md), for when an index must be on a sequential column.
- [Online Schema Changes](https://docs.cockroachlabs.com/docs/stable/online-schema-changes.md): schema changes run in the background.

**Multi-region**

- [Multi-Region Capabilities Overview](https://docs.cockroachlabs.com/docs/stable/multiregion-overview.md)
- [Table Localities](https://docs.cockroachlabs.com/docs/stable/table-localities.md): `REGIONAL BY TABLE`, `REGIONAL BY ROW` and `GLOBAL`; set the `crdb_region` column for `REGIONAL BY ROW`.
- [How to Choose a Multi-Region Configuration](https://docs.cockroachlabs.com/docs/stable/choosing-a-multi-region-configuration.md)
- [Follower Reads](https://docs.cockroachlabs.com/docs/stable/follower-reads.md) and [`AS OF SYSTEM TIME`](https://docs.cockroachlabs.com/docs/stable/as-of-system-time.md), behind `followerReadTx`.

**Change data capture**

- [`CREATE CHANGEFEED`](https://docs.cockroachlabs.com/docs/stable/create-changefeed.md) and [Changefeed Sinks](https://docs.cockroachlabs.com/docs/stable/changefeed-sinks.md) (the webhook sink is what `@cockroachdb/cdc` receives).

**Vector search**

- [`VECTOR`](https://docs.cockroachlabs.com/docs/stable/vector.md) and [Vector Indexes](https://docs.cockroachlabs.com/docs/stable/vector-indexes.md)
