import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractPatternMatches,
  extractByFactType,
  DECISION_PATTERNS,
  GOTCHA_PATTERNS,
  CONVENTION_PATTERNS,
} from '../../../../../src/infrastructure/services/patterns/HeuristicPatterns';

describe('HeuristicPatterns', () => {
  describe('extractPatternMatches', () => {
    it('should extract decision from "because" clause', () => {
      const text = 'We went with JWT because it allows stateless authentication across multiple services without shared session storage.';
      const matches = extractPatternMatches(text, DECISION_PATTERNS);
      assert.ok(matches.length >= 1);
      assert.equal(matches[0].factType, 'decision');
      assert.ok(matches[0].text.includes('stateless authentication'));
    });

    it('should extract decision from "instead of" clause', () => {
      const text = 'Used PostgreSQL instead of MongoDB for strong consistency guarantees and relational data.';
      const matches = extractPatternMatches(text, DECISION_PATTERNS);
      assert.ok(matches.length >= 1);
      assert.equal(matches[0].factType, 'decision');
    });

    it('should extract gotcha from "watch out" clause', () => {
      const text = 'Watch out: the Redis connection pool has a hard limit of 50 connections per node.';
      const matches = extractPatternMatches(text, GOTCHA_PATTERNS);
      assert.ok(matches.length >= 1);
      assert.equal(matches[0].factType, 'gotcha');
    });

    it('should extract convention from "always" clause', () => {
      const text = 'Always use constructor injection for dependencies in service classes.';
      const matches = extractPatternMatches(text, CONVENTION_PATTERNS);
      assert.ok(matches.length >= 1);
      assert.equal(matches[0].factType, 'convention');
    });

    it('should return empty array for empty text', () => {
      assert.equal(extractPatternMatches('').length, 0);
      assert.equal(extractPatternMatches('  ').length, 0);
    });

    it('should skip matches below minimum length', () => {
      const text = 'Because yes.';
      const matches = extractPatternMatches(text, DECISION_PATTERNS);
      assert.equal(matches.length, 0);
    });

    it('should deduplicate identical matches', () => {
      const text = 'Because the API needs stateless auth. Because the API needs stateless auth.';
      const matches = extractPatternMatches(text, DECISION_PATTERNS);
      // Should only find one unique match
      const uniqueTexts = new Set(matches.map(m => m.text.toLowerCase()));
      assert.equal(uniqueTexts.size, matches.length);
    });
  });

  describe('extractByFactType', () => {
    it('should only return matches for specified type', () => {
      const text = [
        'Decided to use TypeScript for type safety across the entire codebase.',
        'Watch out: the build step takes 30 seconds on cold start in CI.',
        'Always prefix interfaces with I per our coding standards.',
      ].join('\n');

      const decisions = extractByFactType(text, 'decision');
      assert.ok(decisions.every(m => m.factType === 'decision'));

      const gotchas = extractByFactType(text, 'gotcha');
      assert.ok(gotchas.every(m => m.factType === 'gotcha'));
    });
  });
});
