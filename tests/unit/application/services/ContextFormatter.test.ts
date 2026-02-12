/**
 * ContextFormatter unit tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ContextFormatter } from '../../../../src/application/services/ContextFormatter';
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

describe('ContextFormatter', () => {
  const formatter = new ContextFormatter();

  it('should return empty string for no memories', () => {
    const output = formatter.format([]);
    assert.equal(output, '');
  });

  it('should format memories with header and type sections', () => {
    const memories = [
      createMemory({ type: 'decision', content: 'Use awilix for DI' }),
      createMemory({ type: 'fact', content: 'Project uses CommonJS' }),
    ];

    const output = formatter.format(memories);

    assert.ok(output.includes('# Git-mem: Project Memory'));
    assert.ok(output.includes('## Decisions (1)'));
    assert.ok(output.includes('- Use awilix for DI (2026-02-12)'));
    assert.ok(output.includes('## Facts (1)'));
    assert.ok(output.includes('- Project uses CommonJS (2026-02-12)'));
  });

  it('should group multiple memories of the same type', () => {
    const memories = [
      createMemory({ type: 'decision', content: 'Decision one' }),
      createMemory({ type: 'decision', content: 'Decision two' }),
    ];

    const output = formatter.format(memories);

    assert.ok(output.includes('## Decisions (2)'));
    assert.ok(output.includes('- Decision one'));
    assert.ok(output.includes('- Decision two'));
  });

  it('should order sections: decisions, gotchas, conventions, facts', () => {
    const memories = [
      createMemory({ type: 'fact', content: 'A fact' }),
      createMemory({ type: 'decision', content: 'A decision' }),
      createMemory({ type: 'gotcha', content: 'A gotcha' }),
      createMemory({ type: 'convention', content: 'A convention' }),
    ];

    const output = formatter.format(memories);
    const decisionIdx = output.indexOf('## Decisions');
    const gotchaIdx = output.indexOf('## Gotchas');
    const conventionIdx = output.indexOf('## Conventions');
    const factIdx = output.indexOf('## Facts');

    assert.ok(decisionIdx < gotchaIdx);
    assert.ok(gotchaIdx < conventionIdx);
    assert.ok(conventionIdx < factIdx);
  });

  it('should include trigger when specified', () => {
    const memories = [createMemory()];

    const output = formatter.format(memories, { trigger: 'startup' });

    assert.ok(output.includes('Session started.'));
  });

  it('should include stats when includeStats is true', () => {
    const memories = [createMemory(), createMemory({ id: '2' })];

    const output = formatter.format(memories, { includeStats: true });

    assert.ok(output.includes('Loaded 2 memories.'));
  });

  it('should not include stats by default', () => {
    const memories = [createMemory()];

    const output = formatter.format(memories);

    assert.ok(!output.includes('Loaded'));
  });

  it('should truncate at maxLength', () => {
    const memories = [
      createMemory({ content: 'A very long memory that goes on and on and on' }),
    ];

    const output = formatter.format(memories, { maxLength: 50 });

    assert.ok(output.length <= 50);
    assert.ok(output.endsWith('...'));
  });

  it('should skip empty type sections', () => {
    const memories = [createMemory({ type: 'decision', content: 'Only decisions' })];

    const output = formatter.format(memories);

    assert.ok(output.includes('## Decisions'));
    assert.ok(!output.includes('## Facts'));
    assert.ok(!output.includes('## Gotchas'));
    assert.ok(!output.includes('## Conventions'));
  });
});
