/**
 * MemoryContextLoader unit tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryContextLoader } from '../../../../src/application/services/MemoryContextLoader';
import type { IMemoryRepository, IMemoryQueryOptions, IMemoryQueryResult } from '../../../../src/domain/interfaces/IMemoryRepository';
import type { IMemoryEntity } from '../../../../src/domain/entities/IMemoryEntity';

function createMemory(overrides?: Partial<IMemoryEntity>): IMemoryEntity {
  return {
    id: 'mem-1',
    content: 'Test memory',
    type: 'fact',
    sha: 'abc123',
    confidence: 'high',
    source: 'user-explicit',
    lifecycle: 'project',
    tags: [],
    createdAt: '2026-02-12T10:00:00Z',
    updatedAt: '2026-02-12T10:00:00Z',
    ...overrides,
  };
}

function createMockLogger() {
  let warnCalled = false;
  return {
    info: () => {},
    warn: () => { warnCalled = true; },
    error: () => {},
    debug: () => {},
    get warnCalled() { return warnCalled; },
  };
}

function createMockRepository(memories: IMemoryEntity[]): IMemoryRepository {
  return {
    create: () => memories[0]!,
    getById: () => null,
    delete: () => false,
    query: (options?: IMemoryQueryOptions): IMemoryQueryResult => {
      let result = [...memories];

      if (options?.since) {
        result = result.filter(m => m.createdAt >= options.since!);
      }
      if (options?.tag) {
        result = result.filter(m => m.tags.includes(options.tag!));
      }
      if (options?.limit) {
        result = result.slice(0, options.limit);
      }

      return { memories: result, total: memories.length };
    },
  };
}

describe('MemoryContextLoader', () => {
  it('should load all memories when no filters specified', () => {
    const memories = [createMemory({ id: '1' }), createMemory({ id: '2' })];
    const repo = createMockRepository(memories);
    const loader = new MemoryContextLoader(repo);

    const result = loader.load();

    assert.equal(result.total, 2);
    assert.equal(result.filtered, 2);
    assert.equal(result.memories.length, 2);
  });

  it('should apply limit filter', () => {
    const memories = [
      createMemory({ id: '1' }),
      createMemory({ id: '2' }),
      createMemory({ id: '3' }),
    ];
    const repo = createMockRepository(memories);
    const loader = new MemoryContextLoader(repo);

    const result = loader.load({ limit: 2 });

    assert.equal(result.total, 3);
    assert.equal(result.filtered, 2);
  });

  it('should return zero memories for empty store', () => {
    const repo = createMockRepository([]);
    const loader = new MemoryContextLoader(repo);

    const result = loader.load();

    assert.equal(result.total, 0);
    assert.equal(result.filtered, 0);
    assert.equal(result.memories.length, 0);
  });

  it('should pass cwd through to repository', () => {
    let capturedCwd: string | undefined;
    const repo: IMemoryRepository = {
      create: () => createMemory(),
      getById: () => null,
      delete: () => false,
      query: (options?: IMemoryQueryOptions) => {
        capturedCwd = options?.cwd;
        return { memories: [], total: 0 };
      },
    };
    const loader = new MemoryContextLoader(repo);

    loader.load({ cwd: '/tmp/test-repo' });

    assert.equal(capturedCwd, '/tmp/test-repo');
  });

  it('should filter by tag', () => {
    const memories = [
      createMemory({ id: '1', tags: ['arch'] }),
      createMemory({ id: '2', tags: ['debug'] }),
    ];
    const repo = createMockRepository(memories);
    const loader = new MemoryContextLoader(repo);

    const result = loader.load({ tags: ['arch'] });

    assert.equal(result.filtered, 1);
    assert.equal(result.memories[0]!.tags[0], 'arch');
  });

  it('should warn when multiple tags provided', () => {
    const memories = [createMemory({ id: '1', tags: ['arch'] })];
    const repo = createMockRepository(memories);
    const logger = createMockLogger();
    const loader = new MemoryContextLoader(repo, logger);

    loader.load({ tags: ['arch', 'debug'] });

    assert.ok(logger.warnCalled, 'expected logger.warn to be called for multiple tags');
  });

  it('should not warn when single tag provided', () => {
    const memories = [createMemory({ id: '1', tags: ['arch'] })];
    const repo = createMockRepository(memories);
    const logger = createMockLogger();
    const loader = new MemoryContextLoader(repo, logger);

    loader.load({ tags: ['arch'] });

    assert.ok(!logger.warnCalled, 'expected logger.warn NOT to be called for single tag');
  });

  it('should pass since filter to repository', () => {
    const memories = [
      createMemory({ id: '1', createdAt: '2026-01-01T00:00:00Z' }),
      createMemory({ id: '2', createdAt: '2026-02-12T00:00:00Z' }),
    ];
    const repo = createMockRepository(memories);
    const loader = new MemoryContextLoader(repo);

    const result = loader.load({ since: '2026-02-01' });

    assert.equal(result.filtered, 1);
  });

  describe('loadWithQuery', () => {
    function createMockMemoryService(memories: IMemoryEntity[]) {
      return {
        remember: () => memories[0]!,
        recall: (query?: string, options?: { limit?: number; cwd?: string }) => {
          let result = [...memories];
          if (query) {
            result = result.filter(m =>
              m.content.toLowerCase().includes(query.toLowerCase())
            );
          }
          if (options?.limit) {
            result = result.slice(0, options.limit);
          }
          return { memories: result, total: memories.length };
        },
        get: () => null,
        delete: () => false,
      };
    }

    it('should search memories using MemoryService.recall', () => {
      const memories = [
        createMemory({ id: '1', content: 'JWT authentication decision' }),
        createMemory({ id: '2', content: 'Database migration gotcha' }),
      ];
      const repo = createMockRepository(memories);
      const service = createMockMemoryService(memories);
      const loader = new MemoryContextLoader(repo, undefined, service);

      const result = loader.loadWithQuery('JWT');

      assert.equal(result.filtered, 1);
      assert.ok(result.memories[0]!.content.includes('JWT'));
    });

    it('should fall back to load() when MemoryService not available', () => {
      const memories = [
        createMemory({ id: '1', content: 'Test memory' }),
        createMemory({ id: '2', content: 'Another memory' }),
      ];
      const repo = createMockRepository(memories);
      const logger = createMockLogger();
      const loader = new MemoryContextLoader(repo, logger);

      const result = loader.loadWithQuery('anything');

      assert.equal(result.total, 2);
      assert.equal(result.filtered, 2);
      assert.ok(logger.warnCalled, 'expected warning about fallback');
    });

    it('should apply limit when using MemoryService', () => {
      const memories = [
        createMemory({ id: '1', content: 'Auth memory' }),
        createMemory({ id: '2', content: 'Auth decision' }),
        createMemory({ id: '3', content: 'Auth gotcha' }),
      ];
      const repo = createMockRepository(memories);
      const service = createMockMemoryService(memories);
      const loader = new MemoryContextLoader(repo, undefined, service);

      const result = loader.loadWithQuery('Auth', 2);

      assert.equal(result.filtered, 2);
    });

    it('should pass cwd to MemoryService', () => {
      let capturedCwd: string | undefined;
      const repo = createMockRepository([]);
      const service = {
        remember: () => createMemory(),
        recall: (_query?: string, options?: { cwd?: string }) => {
          capturedCwd = options?.cwd;
          return { memories: [], total: 0 };
        },
        get: () => null,
        delete: () => false,
      };
      const loader = new MemoryContextLoader(repo, undefined, service);

      loader.loadWithQuery('test', 10, '/custom/path');

      assert.equal(capturedCwd, '/custom/path');
    });

    it('should return total from repository for accurate stats', () => {
      const repoMemories = [
        createMemory({ id: '1' }),
        createMemory({ id: '2' }),
        createMemory({ id: '3' }),
      ];
      const repo = createMockRepository(repoMemories);
      const service = createMockMemoryService([createMemory({ id: '1' })]);
      const loader = new MemoryContextLoader(repo, undefined, service);

      const result = loader.loadWithQuery('test');

      assert.equal(result.total, 3, 'total should come from repository');
      assert.equal(result.filtered, 1, 'filtered should come from query result');
    });
  });
});
