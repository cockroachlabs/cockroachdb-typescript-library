import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

const pkg = (name: string): string =>
  resolve(import.meta.dirname, `packages/${name}/src/index.ts`);

// Resolve @cockroachdb/* to TypeScript source so tests run without a build step.
export default defineConfig({
  resolve: {
    alias: {
      '@cockroachdb/core': pkg('core'),
      '@cockroachdb/pg': pkg('pg'),
      '@cockroachdb/cdc': pkg('cdc'),
      '@cockroachdb/ai': pkg('ai'),
      '@cockroachdb/continuum': pkg('continuum'),
      '@cockroachdb/drizzle': pkg('drizzle'),
      '@cockroachdb/prisma': pkg('prisma'),
      '@cockroachdb/testing': pkg('testing'),
    },
  },
  test: {
    include: ['packages/**/src/**/*.test.ts', 'examples/**/src/**/*.test.ts'],
  },
});
