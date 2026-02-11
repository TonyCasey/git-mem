import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NullLogger } from '../../../../src/infrastructure/logging/NullLogger';

describe('NullLogger', () => {
  it('should not throw on any log method', () => {
    const logger = new NullLogger();

    assert.doesNotThrow(() => logger.trace('msg'));
    assert.doesNotThrow(() => logger.debug('msg'));
    assert.doesNotThrow(() => logger.info('msg'));
    assert.doesNotThrow(() => logger.warn('msg'));
    assert.doesNotThrow(() => logger.error('msg'));
    assert.doesNotThrow(() => logger.fatal('msg'));
  });

  it('should not throw with context', () => {
    const logger = new NullLogger();

    assert.doesNotThrow(() => logger.info('msg', { key: 'value' }));
  });

  it('should return same instance from child()', () => {
    const logger = new NullLogger();
    const child = logger.child({ component: 'test' });

    assert.strictEqual(child, logger);
  });

  it('should return false for isLevelEnabled', () => {
    const logger = new NullLogger();

    assert.equal(logger.isLevelEnabled('trace'), false);
    assert.equal(logger.isLevelEnabled('debug'), false);
    assert.equal(logger.isLevelEnabled('info'), false);
    assert.equal(logger.isLevelEnabled('warn'), false);
    assert.equal(logger.isLevelEnabled('error'), false);
    assert.equal(logger.isLevelEnabled('fatal'), false);
  });
});
