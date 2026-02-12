/**
 * stdin utility unit tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'stream';

// We test readStdin by replacing process.stdin with a custom readable
import { readStdin } from '../../../../src/hooks/utils/stdin';

function createMockStdin(data: string): void {
  const readable = new Readable({
    read() {
      this.push(data);
      this.push(null);
    },
  });

  Object.defineProperty(process, 'stdin', {
    value: readable,
    writable: true,
    configurable: true,
  });
}

describe('readStdin', () => {
  it('should parse valid JSON from stdin', async () => {
    createMockStdin('{"session_id":"abc","source":"startup"}');

    const result = await readStdin<{ session_id: string; source: string }>();

    assert.equal(result.session_id, 'abc');
    assert.equal(result.source, 'startup');
  });

  it('should return empty object for empty stdin', async () => {
    createMockStdin('');

    const result = await readStdin();

    assert.deepEqual(result, {});
  });

  it('should return empty object for invalid JSON', async () => {
    createMockStdin('not-json{{{');

    const result = await readStdin();

    assert.deepEqual(result, {});
  });

  it('should handle complex JSON objects', async () => {
    const input = {
      session_id: 'test-123',
      source: 'resume',
      cwd: '/tmp/repo',
      model: 'claude-sonnet-4-5-20250929',
    };
    createMockStdin(JSON.stringify(input));

    const result = await readStdin<typeof input>();

    assert.deepEqual(result, input);
  });
});
