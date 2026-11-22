import { describe, expect, it } from 'vitest';
import {
  distanceOperator,
  ragContext,
  searchSql,
  vectorConfig,
  vectorLiteral,
  type SearchResult,
} from './index.js';

describe('query builders', () => {
  it('maps metrics to operators', () => {
    expect(distanceOperator('l2')).toBe('<->');
    expect(distanceOperator('cosine')).toBe('<=>');
    expect(distanceOperator('inner_product')).toBe('<#>');
  });

  it('formats vector literals', () => {
    expect(vectorLiteral([0.1, 0.2, 0.3])).toBe('[0.1,0.2,0.3]');
    expect(vectorLiteral([])).toBe('[]');
  });

  it('builds search SQL with and without a filter', () => {
    expect(searchSql('docs', 'id', 'content', 'embedding', 'l2')).toBe(
      'SELECT "id"::text AS id, "content" AS content, "embedding" <-> $1::vector AS distance ' +
        'FROM "docs" ORDER BY "embedding" <-> $1::vector LIMIT $2',
    );
    const filtered = searchSql('docs', 'id', 'content', 'embedding', 'cosine', "metadata->>'lang' = $3");
    expect(filtered).toContain('<=>');
    expect(filtered).toContain("WHERE metadata->>'lang' = $3");
  });
});

describe('config + rag', () => {
  it('fills defaults', () => {
    const c = vectorConfig('docs', 1536);
    expect(c).toMatchObject({ idCol: 'id', contentCol: 'content', embeddingCol: 'embedding', metric: 'l2' });
  });

  it('joins content for RAG', () => {
    const results: SearchResult[] = [
      { id: '1', content: 'alpha', distance: 0.1 },
      { id: '2', content: 'beta', distance: 0.2 },
    ];
    expect(ragContext(results, '\n---\n')).toBe('alpha\n---\nbeta');
  });
});
