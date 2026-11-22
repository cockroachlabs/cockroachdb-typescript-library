# Support

The CockroachDB TypeScript library is maintained by Cockroach Labs under Apache-2.0.

## Getting help

- **Bugs / feature requests** — open a GitHub issue with a minimal reproduction
  (library version, Node version, driver, CockroachDB version, cluster topology,
  and a short code sample).
- **Questions** — GitHub Discussions or the CockroachDB community Slack.
- **Security issues** — do **not** open a public issue; email security@cockroachlabs.com.

## In scope

- The `@cockroachdb/*` packages in this workspace.
- CockroachDB-specific behaviour: `40001` retries, follower reads, multi-region
  row homing, CDC, vector search, vCluster QoS, metrics/health.

## Out of scope

- Bugs in `pg`, Drizzle, Prisma, or the Postgres protocol itself (report upstream).
- General TypeScript/Node questions unrelated to this library.

## Compatibility

| Area | Supported |
|------|-----------|
| Node | 20+ (ESM; built for Node 22) |
| TypeScript | 5.x |
| CockroachDB | v23.2+ for retries/follower reads/multi-region; **v26.2+** for `CREATE VECTOR INDEX` (C-SPANN) |
| `pg` | 8.x |
| Drizzle | >= 0.30 (peer) |
| Prisma | >= 6 (peer) |
