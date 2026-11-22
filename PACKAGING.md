# Packaging & distribution

The CockroachDB TypeScript library ships the same way as the other developer
libraries: an **anonymous, no-token feed served from GitHub Pages**. For
TypeScript that feed is a **static npm registry** — the analogue of the Maven /
PEP 503 / NuGet / sparse-Cargo feeds.

> We deliberately do **not** publish to npmjs.com (the public registry this family
> avoids) or GitHub Packages (which requires a token). A direct tarball-URL
> dependency is the zero-infrastructure fallback (see the end).

## How consumers install

In `.npmrc` (project or `~/.npmrc`):

```
@cockroachdb:registry=https://cockroachlabs.github.io/cockroachdb-typescript-library/
```

```bash
npm install @cockroachdb/pg
```

No token, no auth. npm fetches each package's metadata and tarball from the Pages
site. Inter-package deps (`@cockroachdb/core`) resolve from the same feed; external
deps (`pg`) resolve from npmjs.com as usual.

## What the feed contains

```
@cockroachdb/<name>        # packument JSON (dist-tags + versions + dist.tarball/integrity)
@cockroachdb%2F<name>      # same packument at the %2F-encoded path (CDN hedge, see below)
-/<name>-<version>.tgz     # the package tarballs (flat path)
index.html                 # landing page
```

A static npm registry is just files — what GitHub Pages serves. Tarballs live on a
**flat `/-/` path** rather than under the package name, so the packument file and
the tarball directory don't collide on the filesystem.

## How it is built — `scripts/build-registry.mjs`

Run by `.github/workflows/pages.yml` on push to `main` (and on release / manual
dispatch). For each publishable package it runs `npm pack` (which also produces the
sha512 `integrity` and sha1 `shasum`), copies the tarball to `-/`, and writes the
packument with a Pages tarball URL.

Build it locally to inspect (no publish):

```bash
npm run build
node scripts/build-registry.mjs _site
```

## The one deploy-time caveat

npm requests scoped package metadata at `<registry>/@cockroachdb%2Fcore` (the `/`
is percent-encoded). CDNs differ on whether they decode `%2F` back to `/`:

- if **decoded**, the request resolves to `@cockroachdb/core` (the canonical file);
- if **kept literal**, it resolves to `@cockroachdb%2Fcore`.

The generator writes the packument at **both** paths, so either behaviour works.
Confirm on first deploy with `npm install @cockroachdb/core` against the live feed.

## Versioning & release

- Versions come from each package's `package.json` (shared `0.1.0`), bumped via PR
  to the protected `main` branch.
- Merging to `main` triggers `pages.yml`, which rebuilds the feed — that deploy is
  the release customers install from.

## Zero-infrastructure fallback: tarball URL

npm accepts a remote tarball as a dependency spec, which needs no registry at all:

```jsonc
{
  "dependencies": {
    "@cockroachdb/pg": "https://cockroachlabs.github.io/cockroachdb-typescript-library/-/cockroachdb-pg-0.1.0.tgz"
  }
}
```

This is anonymous and always works, but pins to a URL (no semver resolution). The
static registry is the primary, family-consistent path.
