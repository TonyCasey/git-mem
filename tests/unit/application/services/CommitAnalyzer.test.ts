/**
 * CommitAnalyzer unit tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CommitAnalyzer } from '../../../../src/application/services/CommitAnalyzer';

describe('CommitAnalyzer', () => {
  const analyzer = new CommitAnalyzer();

  describe('parseConventionalCommit', () => {
    it('should parse feat commit with scope', () => {
      const result = analyzer.parseConventionalCommit('feat(auth): add JWT validation');

      assert.equal(result.type, 'feat');
      assert.equal(result.scope, 'auth');
      assert.equal(result.breaking, false);
      assert.equal(result.description, 'add JWT validation');
    });

    it('should parse fix commit without scope', () => {
      const result = analyzer.parseConventionalCommit('fix: handle null response');

      assert.equal(result.type, 'fix');
      assert.equal(result.scope, null);
      assert.equal(result.breaking, false);
      assert.equal(result.description, 'handle null response');
    });

    it('should detect breaking change with !', () => {
      const result = analyzer.parseConventionalCommit('feat(api)!: remove deprecated endpoint');

      assert.equal(result.type, 'feat');
      assert.equal(result.scope, 'api');
      assert.equal(result.breaking, true);
      assert.equal(result.description, 'remove deprecated endpoint');
    });

    it('should handle non-conventional commit', () => {
      const result = analyzer.parseConventionalCommit('Update README');

      assert.equal(result.type, null);
      assert.equal(result.scope, null);
      assert.equal(result.breaking, false);
      assert.equal(result.description, 'Update README');
    });

    it('should extract body from multiline message', () => {
      const message = `feat(auth): add JWT validation

This commit adds JWT-based authentication because sessions
don't scale horizontally.

Co-Authored-By: Test`;

      const result = analyzer.parseConventionalCommit(message);

      assert.equal(result.type, 'feat');
      assert.equal(result.scope, 'auth');
      assert.ok(result.body.includes('JWT-based authentication'));
      assert.ok(result.body.includes("don't scale horizontally"));
    });

    it('should handle refactor type', () => {
      const result = analyzer.parseConventionalCommit('refactor(core): extract validation to middleware');

      assert.equal(result.type, 'refactor');
      assert.equal(result.scope, 'core');
      assert.equal(result.description, 'extract validation to middleware');
    });

    it('should be case insensitive for type', () => {
      const result = analyzer.parseConventionalCommit('FEAT(api): add endpoint');

      assert.equal(result.type, 'feat');
      assert.equal(result.scope, 'api');
    });
  });

  describe('analyze', () => {
    it('should detect decision from because-clause pattern', () => {
      const message = `feat(auth): add JWT support

Using JWT because sessions don't scale horizontally with our architecture.`;

      const result = analyzer.analyze(message, ['src/auth/jwt.ts']);

      assert.equal(result.type, 'decision');
      assert.equal(result.conventionalType, 'feat');
      assert.equal(result.scope, 'auth');
      assert.ok(result.content?.includes('sessions'));
      assert.ok(result.patternName?.includes('because'));
    });

    it('should detect gotcha from watch-out pattern', () => {
      const message = `fix(api): handle timeout edge case

Watch out: the API returns 504 when queue is full, not 503.`;

      const result = analyzer.analyze(message, ['src/api/client.ts']);

      assert.equal(result.type, 'gotcha');
      assert.equal(result.conventionalType, 'fix');
      assert.ok(result.patternName?.includes('watch-out'));
    });

    it('should detect convention from always pattern', () => {
      const message = `refactor: update error handling

Always wrap async operations in try-catch for consistent error handling.`;

      const result = analyzer.analyze(message, ['src/utils/async.ts']);

      assert.equal(result.type, 'convention');
      assert.ok(result.patternName?.includes('always'));
    });

    it('should fall back to conventional type mapping for feat', () => {
      const message = 'feat(search): add full-text search';
      const result = analyzer.analyze(message, ['src/search/index.ts']);

      assert.equal(result.type, 'decision');
      assert.equal(result.conventionalType, 'feat');
      assert.ok(result.patternName?.includes('conventional:feat'));
    });

    it('should fall back to conventional type mapping for fix', () => {
      const message = 'fix(db): prevent connection leak';
      const result = analyzer.analyze(message, ['src/db/pool.ts']);

      assert.equal(result.type, 'gotcha');
      assert.equal(result.conventionalType, 'fix');
    });

    it('should fall back to conventional type mapping for refactor', () => {
      const message = 'refactor: simplify error handling';
      const result = analyzer.analyze(message, ['src/error.ts']);

      assert.equal(result.type, 'convention');
      assert.equal(result.conventionalType, 'refactor');
    });

    it('should return null type for non-conventional commit without patterns', () => {
      const message = 'Update README';
      const result = analyzer.analyze(message, ['README.md']);

      assert.equal(result.type, null);
      assert.equal(result.conventionalType, null);
    });

    it('should infer tags from conventional scope', () => {
      const message = 'feat(auth): add login endpoint';
      const result = analyzer.analyze(message, ['src/api/auth.ts']);

      assert.ok(result.tags.includes('auth'));
    });

    it('should infer tags from file paths', () => {
      const message = 'fix: update database queries';
      const result = analyzer.analyze(message, [
        'src/infrastructure/database/pool.ts',
        'src/api/users.ts',
      ]);

      assert.ok(result.tags.includes('database') || result.tags.includes('db'));
      assert.ok(result.tags.includes('api'));
    });

    it('should include pattern name in tags', () => {
      const message = `feat: add feature

Because this approach is simpler than the alternative.`;

      const result = analyzer.analyze(message, ['src/feature.ts']);

      assert.ok(result.tags.some(t => t.startsWith('pattern:')));
    });

    it('should calculate high confidence for breaking changes', () => {
      const message = 'feat(api)!: remove deprecated endpoint';
      const result = analyzer.analyze(message, ['src/api/routes.ts']);

      assert.equal(result.confidence, 'high');
    });

    it('should calculate medium confidence for feat/fix without patterns', () => {
      const message = 'feat: add new feature';
      const result = analyzer.analyze(message, ['src/feature.ts']);

      assert.equal(result.confidence, 'medium');
    });

    it('should return empty analysis for empty message', () => {
      const result = analyzer.analyze('', []);

      assert.equal(result.type, null);
      assert.equal(result.content, null);
      assert.equal(result.confidence, 'low');
      assert.deepEqual(result.tags, []);
    });

    it('should handle message with only whitespace', () => {
      const result = analyzer.analyze('   \n\t  ', []);

      assert.equal(result.type, null);
    });

    it('should prioritize pattern matches over conventional type', () => {
      // Even though this is a 'fix' commit (normally gotcha), the explicit
      // "decided to" pattern should make it a decision
      const message = `fix(api): change response format

Decided to use JSON:API format for consistency across all endpoints.`;

      const result = analyzer.analyze(message, ['src/api/response.ts']);

      assert.equal(result.type, 'decision');
      assert.ok(result.patternName?.includes('decided'));
    });

    it('should extract content from pattern match', () => {
      const message = `feat: update config

Because the old format was harder to parse and maintain across environments.`;

      const result = analyzer.analyze(message, ['config/settings.ts']);

      assert.ok(result.content?.includes('old format'));
      assert.ok(result.content?.includes('harder to parse'));
    });

    it('should handle docs commit type as fact', () => {
      const message = 'docs: update API documentation';
      const result = analyzer.analyze(message, ['docs/api.md']);

      assert.equal(result.type, 'fact');
      assert.equal(result.conventionalType, 'docs');
    });

    it('should handle perf commit type as decision', () => {
      const message = 'perf(cache): add Redis caching layer';
      const result = analyzer.analyze(message, ['src/cache/redis.ts']);

      assert.equal(result.type, 'decision');
      assert.equal(result.conventionalType, 'perf');
    });
  });
});
