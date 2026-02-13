import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  truncateDiff,
  extractFileNames,
  mergeFacts,
} from '../../../../src/application/services/ExtractService';
import type { IPatternMatch } from '../../../../src/infrastructure/services/patterns/HeuristicPatterns';
import type { ILLMExtractedFact } from '../../../../src/domain/interfaces/ILLMClient';

describe('ExtractService helpers', () => {
  describe('truncateDiff', () => {
    it('should return diff unchanged if under limit', () => {
      const diff = 'line1\nline2\nline3';
      assert.equal(truncateDiff(diff, 1000), diff);
    });

    it('should truncate at line boundary', () => {
      const diff = 'line1\nline2\nline3\nline4';
      const result = truncateDiff(diff, 12);
      assert.equal(result, 'line1\nline2');
    });

    it('should handle single long line', () => {
      const diff = 'a'.repeat(100);
      const result = truncateDiff(diff, 50);
      assert.equal(result.length, 50);
    });

    it('should handle empty diff', () => {
      assert.equal(truncateDiff('', 100), '');
    });
  });

  describe('extractFileNames', () => {
    it('should extract file names from unified diff', () => {
      const diff = [
        'diff --git a/src/foo.ts b/src/foo.ts',
        '--- a/src/foo.ts',
        '+++ b/src/foo.ts',
        '@@ -1,3 +1,4 @@',
        '+new line',
        'diff --git a/src/bar.ts b/src/bar.ts',
        '--- a/src/bar.ts',
        '+++ b/src/bar.ts',
      ].join('\n');

      const files = extractFileNames(diff);
      assert.deepEqual(files, ['src/foo.ts', 'src/bar.ts']);
    });

    it('should return empty array for empty diff', () => {
      assert.deepEqual(extractFileNames(''), []);
    });

    it('should return empty array for diff without file headers', () => {
      assert.deepEqual(extractFileNames('+some line\n-other line'), []);
    });
  });

  describe('mergeFacts', () => {
    const heuristicMatch = (text: string, patternName = 'because'): IPatternMatch => ({
      text,
      factType: 'decision',
      patternName,
      confidence: 'low',
      startIndex: 0,
    });

    const llmFact = (content: string, type = 'decision' as const): ILLMExtractedFact => ({
      content,
      type,
      confidence: 'high',
      tags: ['auth'],
    });

    it('should return heuristic facts when no LLM facts', () => {
      const result = mergeFacts(
        [heuristicMatch('Use JWT because stateless')],
        []
      );
      assert.equal(result.length, 1);
      assert.equal(result[0]!.source, 'heuristic-extraction');
    });

    it('should return LLM facts when no heuristic matches', () => {
      const result = mergeFacts(
        [],
        [llmFact('Using JWT for stateless authentication')]
      );
      assert.equal(result.length, 1);
      assert.equal(result[0]!.source, 'llm-enrichment');
    });

    it('should deduplicate similar facts, keeping LLM version', () => {
      // Nearly identical content — well above 0.7 Jaccard threshold
      const result = mergeFacts(
        [heuristicMatch('JWT stateless authentication API server')],
        [llmFact('JWT stateless authentication API server chosen')]
      );

      // Should keep LLM version, drop heuristic duplicate
      assert.equal(result.length, 1);
      assert.equal(result[0]!.source, 'llm-enrichment');
    });

    it('should keep both facts when they are different', () => {
      const result = mergeFacts(
        [heuristicMatch('Watch out for race conditions in token refresh')],
        [llmFact('Using JWT for stateless authentication')]
      );

      assert.equal(result.length, 2);
      const sources = result.map(f => f.source);
      assert.ok(sources.includes('llm-enrichment'));
      assert.ok(sources.includes('heuristic-extraction'));
    });

    it('should handle multiple facts from both sources', () => {
      const result = mergeFacts(
        [
          heuristicMatch('Use Redis because it supports TTL'),
          heuristicMatch('Watch out for connection pool exhaustion'),
        ],
        [
          llmFact('Redis chosen for caching with TTL support'),
          llmFact('Added circuit breaker for external API calls', 'gotcha'),
        ]
      );

      // Redis facts should dedup (similar content), others should remain
      assert.ok(result.length >= 3); // at least LLM facts + unique heuristic
      const llmCount = result.filter(f => f.source === 'llm-enrichment').length;
      assert.equal(llmCount, 2); // both LLM facts always included
    });

    it('should return empty when both sources are empty', () => {
      const result = mergeFacts([], []);
      assert.equal(result.length, 0);
    });

    it('should preserve tags from both sources', () => {
      const result = mergeFacts(
        [heuristicMatch('Some unique heuristic fact', 'always')],
        [llmFact('Some unique LLM fact')]
      );

      const hFact = result.find(f => f.source === 'heuristic-extraction');
      const lFact = result.find(f => f.source === 'llm-enrichment');
      assert.ok(hFact);
      assert.ok(lFact);
      assert.deepEqual(hFact!.tags, ['pattern:always']);
      assert.deepEqual(lFact!.tags, ['auth']);
    });
  });
});
