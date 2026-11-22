// Build a static npm registry (+ landing page) for GitHub Pages.
//
// A static npm registry is just files served over HTTPS:
//
//   <out>/@cockroachdb/<name>        # packument JSON (also written at the
//   <out>/@cockroachdb%2F<name>      #   %2F-encoded path some CDNs request)
//   <out>/-/<name>-<version>.tgz     # tarballs (flat path avoids a file/dir clash)
//
// Consumers add to .npmrc:
//   @cockroachdb:registry=https://cockroachlabs.github.io/cockroachdb-typescript-library/
//
// This script runs `npm pack` per publishable package (which also yields the
// sha512 integrity + sha1 shasum), writes tarballs and packuments, and emits a
// landing page. It only writes under <out>; it publishes nothing.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://cockroachlabs.github.io/cockroachdb-typescript-library';
const out = process.argv[2] ?? '_site';
const pkgsDir = 'packages';

mkdirSync(join(out, '-'), { recursive: true });
mkdirSync(join(out, '@cockroachdb'), { recursive: true });

const published = [];

for (const dir of readdirSync(pkgsDir)) {
  const pkgPath = join(pkgsDir, dir, 'package.json');
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch {
    continue; // not a package dir
  }
  if (pkg.private || !pkg.name) continue;

  const packed = JSON.parse(
    execFileSync(
      'npm',
      ['pack', '--json', '--pack-destination', join(out, '-'), `./${join(pkgsDir, dir)}`],
      { encoding: 'utf8' },
    ),
  );
  const info = packed[0];

  const version = pkg.version;
  const short = pkg.name.split('/')[1];
  const packument = {
    name: pkg.name,
    'dist-tags': { latest: version },
    versions: {
      [version]: {
        ...pkg,
        dist: {
          tarball: `${BASE}/-/${info.filename}`,
          shasum: info.shasum,
          integrity: info.integrity,
        },
      },
    },
  };

  const json = JSON.stringify(packument);
  writeFileSync(join(out, '@cockroachdb', short), json);
  // Hedge against CDNs that keep %2F literal in the scoped-metadata request.
  writeFileSync(join(out, `@cockroachdb%2F${short}`), json);
  published.push(pkg.name);
  process.stderr.write(`packed ${pkg.name}@${version} (${info.filename})\n`);
}

const items = published.map((n) => `<li><code>${n}</code></li>`).join('');
writeFileSync(
  join(out, 'index.html'),
  '<!doctype html><meta charset=utf-8>' +
    '<title>CockroachDB TypeScript library</title>' +
    '<h1>CockroachDB TypeScript library</h1>' +
    '<p>Anonymous npm registry. In <code>.npmrc</code>:</p>' +
    `<pre>@cockroachdb:registry=${BASE}/</pre>` +
    `<p>Packages:</p><ul>${items}</ul>`,
);

process.stderr.write(`wrote registry for ${published.length} packages to ${out}\n`);
