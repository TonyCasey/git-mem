/**
 * Unit tests for NullLogger.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NullLogger } from '../../../../src/infrastructure/logging/NullLogger';

describe('NullLogger', () => {
  it('should not throw on any log method', () => {
    const logger = new NullLogger();
    assert.doesNotThrow(() => logger.trace('test'));
    assert.doesNotThrow(() => logger.debug('test'));
    assert.doesNotThrow(() => logger.info('test'));
    assert.doesNotThrow(() => logger.warn('test'));
    assert.doesNotThrow(() => logger.error('test'));
    assert.doesNotThrow(() => logger.fatal('test'));
  });

  it('should not throw when context is provided', () => {
    const logger = new NullLogger();
    assert.doesNotThrow(() => logger.info('test', { key: 'value' }));
    assert.doesNotThrow(() => logger.error('test', { error: 'something' }));
  });

  it('should return itself from child()', () => {
    const logger = new NullLogger();
    const child = logger.child({ component: 'test' });
    assert.equal(child, logger);
  });

  it('should return false for isLevelEnabled()', () => {
    const logger = new NullLogger();
    assert.equal(logger.isLevelEnabled('trace'), false);
    assert.equal(logger.isLevelEnabled('debug'), false);
    assert.equal(logger.isLevelEnabled('info'), false);
    assert.equal(logger.isLevelEnabled('warn'), false);
    assert.equal(logger.isLevelEnabled('error'), false);
    assert.equal(logger.isLevelEnabled('fatal'), false);
  });
});
