/**
 * shutdown utility unit tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setupShutdown } from '../../../../src/hooks/utils/shutdown';

describe('setupShutdown', () => {
  it('should return a timer object', () => {
    const timer = setupShutdown(30_000);

    assert.ok(timer);
    assert.ok(typeof timer === 'object');

    // Clean up — don't let the timer persist
    clearTimeout(timer);
  });

  it('should allow clearing the timer', () => {
    const timer = setupShutdown(30_000);

    // Should not throw
    clearTimeout(timer);
  });
});
