/**
 * TagInference unit tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isKnownDomain,
  extractDomainsFromPaths,
  extractLanguageTags,
  inferTags,
  KNOWN_DOMAINS,
} from '../../../../src/application/services/TagInference';
import type { IPatternMatch } from '../../../../src/infrastructure/services/patterns/HeuristicPatterns';

describe('TagInference', () => {
  describe('isKnownDomain', () => {
    it('should return true for known domains', () => {
      assert.ok(isKnownDomain('api'));
      assert.ok(isKnownDomain('auth'));
      assert.ok(isKnownDomain('database'));
      assert.ok(isKnownDomain('middleware'));
    });

    it('should return false for unknown domains', () => {
      assert.equal(isKnownDomain('foo'), false);
      assert.equal(isKnownDomain('bar'), false);
      assert.equal(isKnownDomain('mycomponent'), false);
    });

    it('should be case insensitive', () => {
      assert.ok(isKnownDomain('API'));
      assert.ok(isKnownDomain('Auth'));
      assert.ok(isKnownDomain('DATABASE'));
    });

    it('should include common infrastructure domains', () => {
      assert.ok(KNOWN_DOMAINS.includes('ci'));
      assert.ok(KNOWN_DOMAINS.includes('docker'));
      assert.ok(KNOWN_DOMAINS.includes('infra'));
    });
  });

  describe('extractDomainsFromPaths', () => {
    it('should extract api from path', () => {
      const result = extractDomainsFromPaths(['src/api/users.ts']);
      assert.ok(result.includes('api'));
    });

    it('should extract multiple domains from multiple files', () => {
      const result = extractDomainsFromPaths([
        'src/api/users.ts',
        'src/database/pool.ts',
        'src/middleware/handlers.ts',
      ]);

      assert.ok(result.includes('api'));
      assert.ok(result.includes('database'));
      assert.ok(result.includes('middleware'));
    });

    it('should skip src and dist directories', () => {
      const result = extractDomainsFromPaths(['src/api/users.ts', 'dist/index.js']);

      assert.equal(result.includes('src'), false);
      assert.equal(result.includes('dist'), false);
    });

    it('should skip node_modules', () => {
      const result = extractDomainsFromPaths(['node_modules/lodash/index.js']);

      assert.equal(result.includes('node_modules'), false);
    });

    it('should deduplicate domains', () => {
      const result = extractDomainsFromPaths([
        'src/api/users.ts',
        'src/api/posts.ts',
        'src/api/comments.ts',
      ]);

      assert.equal(result.filter(d => d === 'api').length, 1);
    });

    it('should return empty array for paths without known domains', () => {
      const result = extractDomainsFromPaths(['README.md', 'package.json']);

      assert.deepEqual(result, []);
    });

    it('should handle nested paths', () => {
      const result = extractDomainsFromPaths([
        'src/infrastructure/database/repositories/UserRepo.ts',
      ]);

      assert.ok(result.includes('infrastructure'));
      assert.ok(result.includes('database'));
    });
  });

  describe('extractLanguageTags', () => {
    it('should extract typescript from .ts files', () => {
      const result = extractLanguageTags(['src/index.ts', 'src/utils.ts']);
      assert.ok(result.includes('typescript'));
    });

    it('should extract react from .tsx files', () => {
      const result = extractLanguageTags(['src/App.tsx', 'src/Button.tsx']);
      assert.ok(result.includes('react'));
    });

    it('should extract python from .py files', () => {
      const result = extractLanguageTags(['main.py', 'utils.py']);
      assert.ok(result.includes('python'));
    });

    it('should extract config from .json/.yml files', () => {
      const result = extractLanguageTags(['tsconfig.json', 'config.yml']);
      assert.ok(result.includes('config'));
    });

    it('should extract sql from .sql files', () => {
      const result = extractLanguageTags(['migrations/001.sql']);
      assert.ok(result.includes('sql'));
    });

    it('should deduplicate language tags', () => {
      const result = extractLanguageTags(['a.ts', 'b.ts', 'c.ts']);
      assert.equal(result.filter(t => t === 'typescript').length, 1);
    });

    it('should handle files without extensions', () => {
      const result = extractLanguageTags(['Makefile', 'README']);
      assert.deepEqual(result, []);
    });

    it('should detect Dockerfile', () => {
      const result = extractLanguageTags(['Dockerfile', 'docker/Dockerfile']);
      assert.ok(result.includes('docker'));
    });
  });

  describe('inferTags', () => {
    it('should include scope as first tag', () => {
      const result = inferTags('auth', [], []);
      assert.ok(result.includes('auth'));
    });

    it('should include domains from file paths', () => {
      const result = inferTags(null, ['src/api/users.ts'], []);
      assert.ok(result.includes('api'));
    });

    it('should include pattern names with prefix', () => {
      const patterns: IPatternMatch[] = [
        {
          text: 'test content',
          factType: 'decision',
          patternName: 'because-clause',
          confidence: 'high',
          startIndex: 0,
        },
      ];

      const result = inferTags(null, [], patterns);
      assert.ok(result.includes('pattern:because-clause'));
    });

    it('should combine all tag sources', () => {
      const patterns: IPatternMatch[] = [
        {
          text: 'test',
          factType: 'decision',
          patternName: 'decided-to',
          confidence: 'high',
          startIndex: 0,
        },
      ];

      const result = inferTags('auth', ['src/api/users.ts', 'src/database/pool.ts'], patterns);

      assert.ok(result.includes('auth'));
      assert.ok(result.includes('api'));
      assert.ok(result.includes('database'));
      assert.ok(result.includes('pattern:decided-to'));
    });

    it('should limit to 10 tags', () => {
      const files = [
        'src/api/a.ts',
        'src/auth/b.ts',
        'src/database/c.ts',
        'src/middleware/d.ts',
        'src/handlers/e.ts',
        'src/events/f.ts',
        'src/infrastructure/g.ts',
        'src/application/h.ts',
        'src/domain/i.ts',
        'src/config/j.ts',
        'src/hooks/k.ts',
        'src/test/l.ts',
      ];

      const result = inferTags('scope', files, []);
      assert.ok(result.length <= 10);
    });

    it('should add language tags when few other tags', () => {
      const result = inferTags(null, ['script.py'], []);

      // With only 1 domain tag (none found) and 0 patterns, language tags should be added
      assert.ok(result.includes('python'));
    });

    it('should normalize scope to lowercase', () => {
      const result = inferTags('AUTH', [], []);
      assert.ok(result.includes('auth'));
      assert.equal(result.includes('AUTH'), false);
    });

    it('should handle null scope', () => {
      const result = inferTags(null, ['src/api/users.ts'], []);
      assert.ok(result.includes('api'));
      assert.equal(result.includes('null'), false);
    });

    it('should handle empty inputs', () => {
      const result = inferTags(null, [], []);
      assert.deepEqual(result, []);
    });
  });
});
