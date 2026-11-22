# Contributing

Thanks for helping improve the CockroachDB TypeScript library.

## Workspace layout

An npm workspace of eight packages plus a reference app:

```
packages/
  core        # driver-agnostic: retry, follower, region, circuit breaker, metrics/health, ddl
  pg          # primary adapter: CrdbPool, executeTx, follower reads, @transactional
  drizzle     # Drizzle ORM retry adapter
  prisma      # Prisma retry adapter (incl. P2034)
  cdc         # changefeed builder + webhook sink
  ai          # pgvector search + RAG retrieval
  continuum   # vCluster / Plenum / Aegis / MCP / Cloud
  testing     # concurrency runner, retry simulator, fake errors
examples/ideas-board   # quickstart reference app
```

## Build & test

```bash
npm install
npm test            # vitest (runs against TS source; no build needed)
npm run build       # tsc -b (project references; emits dist + .d.ts)
```

Vitest resolves `@cockroachdb/*` to source via aliases in `vitest.config.ts`, so
tests need no build. `tsc -b` is the type gate and produces the published output.

Database-dependent behaviour (vector search, live transactions) is covered by the
example app and by tests gated on `CRDB_URL`; CI runs them against CockroachDB.
The vector index needs **CockroachDB v26.2+**.

## Conventions

- Match the sibling libraries' names and semantics where a parallel exists.
- Keep driver-agnostic logic in `@cockroachdb/core`; driver specifics in adapters.
- ESM only, `NodeNext` module resolution (relative imports use `.js`), `strict` TS.
- Every non-trivial change ships a vitest test. No AI attribution in commits/PRs.

## Releasing

Versions come from each package's `package.json` (shared `0.1.0`), bumped via PR
to the protected `main` branch. On push to `main`, `pages.yml` builds the static
npm registry and deploys it to GitHub Pages — that feed is what customers install
from. See [PACKAGING.md](PACKAGING.md).
