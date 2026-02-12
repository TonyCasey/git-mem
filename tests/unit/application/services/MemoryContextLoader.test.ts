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
});
