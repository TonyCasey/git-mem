import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger, createNullLogger, loadLoggerOptions } from '../../../../src/infrastructure/logging/factory';
import { Logger } from '../../../../src/infrastructure/logging/Logger';
import { NullLogger } from '../../../../src/infrastructure/logging/NullLogger';

describe('Logging factory', () => {
  // Save original env vars
  const origEnv: Record<string, string | undefined> = {};

  before(() => {
    origEnv['LOG_LEVEL'] = process.env['LOG_LEVEL'];
    origEnv['LOG_DIR'] = process.env['LOG_DIR'];
    origEnv['LOG_CONSOLE'] = process.env['LOG_CONSOLE'];
    origEnv['LOG_FILE'] = process.env['LOG_FILE'];
    origEnv['LOG_RETENTION_DAYS'] = process.env['LOG_RETENTION_DAYS'];
  });

  after(() => {
    // Restore env vars
    for (const [key, value] of Object.entries(origEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  describe('loadLoggerOptions', () => {
    it('should return defaults when no env vars set', () => {
      delete process.env['LOG_LEVEL'];
      delete process.env['LOG_DIR'];
      delete process.env['LOG_CONSOLE'];
      delete process.env['LOG_FILE'];
      delete process.env['LOG_RETENTION_DAYS'];

      const opts = loadLoggerOptions();

      assert.equal(opts.level, 'info');
      assert.equal(opts.logDir, '.git-mem/logs');
      assert.equal(opts.enableConsole, false);
      assert.equal(opts.enableFile, true);
      assert.equal(opts.retentionDays, 7);
    });

    it('should read env vars correctly', () => {
      process.env['LOG_LEVEL'] = 'debug';
      process.env['LOG_DIR'] = '/tmp/custom-logs';
      process.env['LOG_CONSOLE'] = 'true';
      process.env['LOG_FILE'] = 'false';
      process.env['LOG_RETENTION_DAYS'] = '14';

      const opts = loadLoggerOptions();

      assert.equal(opts.level, 'debug');
      assert.equal(opts.logDir, '/tmp/custom-logs');
      assert.equal(opts.enableConsole, true);
      assert.equal(opts.enableFile, false);
      assert.equal(opts.retentionDays, 14);
    });

    it('should default to info for invalid LOG_LEVEL', () => {
      process.env['LOG_LEVEL'] = 'invalid';

      const opts = loadLoggerOptions();

      assert.equal(opts.level, 'info');
    });
  });

  describe('createLogger', () => {
    it('should return a Logger instance', () => {
      delete process.env['LOG_LEVEL'];
      const logger = createLogger({ enableFile: false });

      assert.ok(logger instanceof Logger);
    });

    it('should override defaults with explicit options', () => {
      const logger = createLogger({ level: 'error', enableFile: false });

      assert.equal(logger.isLevelEnabled('warn'), false);
      assert.equal(logger.isLevelEnabled('error'), true);
    });
  });

  describe('createNullLogger', () => {
    it('should return a NullLogger instance', () => {
      const logger = createNullLogger();

      assert.ok(logger instanceof NullLogger);
    });
  });
});
