/**
 * Unit tests for logger factory.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger, createNullLogger, loadLoggerOptions } from '../../../../src/infrastructure/logging/factory';
import { Logger } from '../../../../src/infrastructure/logging/Logger';
import { NullLogger } from '../../../../src/infrastructure/logging/NullLogger';

describe('Logger Factory', () => {
  describe('loadLoggerOptions', () => {
    const savedEnv: Record<string, string | undefined> = {};

    before(() => {
      // Save env vars
      savedEnv.LOG_LEVEL = process.env.LOG_LEVEL;
      savedEnv.LOG_DIR = process.env.LOG_DIR;
      savedEnv.LOG_CONSOLE = process.env.LOG_CONSOLE;
      savedEnv.LOG_FILE = process.env.LOG_FILE;
      savedEnv.LOG_RETENTION_DAYS = process.env.LOG_RETENTION_DAYS;
    });

    after(() => {
      // Restore env vars
      for (const [key, value] of Object.entries(savedEnv)) {
        if (value !== undefined) {
          process.env[key] = value;
        } else {
          delete process.env[key];
        }
      }
    });

    it('should return defaults when no env vars set', () => {
      delete process.env.LOG_LEVEL;
      delete process.env.LOG_DIR;
      delete process.env.LOG_CONSOLE;
      delete process.env.LOG_FILE;
      delete process.env.LOG_RETENTION_DAYS;

      const opts = loadLoggerOptions();
      assert.equal(opts.level, 'info');
      assert.equal(opts.logDir, '.git-mem/logs');
      assert.equal(opts.enableConsole, false);
      assert.equal(opts.enableFile, true);
      assert.equal(opts.retentionDays, 7);
    });

    it('should read LOG_LEVEL from env', () => {
      process.env.LOG_LEVEL = 'debug';
      const opts = loadLoggerOptions();
      assert.equal(opts.level, 'debug');
    });

    it('should read LOG_DIR from env', () => {
      process.env.LOG_DIR = '/tmp/custom-logs';
      const opts = loadLoggerOptions();
      assert.equal(opts.logDir, '/tmp/custom-logs');
    });

    it('should read LOG_CONSOLE from env', () => {
      process.env.LOG_CONSOLE = 'true';
      const opts = loadLoggerOptions();
      assert.equal(opts.enableConsole, true);
    });

    it('should read LOG_FILE from env', () => {
      process.env.LOG_FILE = 'false';
      const opts = loadLoggerOptions();
      assert.equal(opts.enableFile, false);
    });

    it('should read LOG_RETENTION_DAYS from env', () => {
      process.env.LOG_RETENTION_DAYS = '30';
      const opts = loadLoggerOptions();
      assert.equal(opts.retentionDays, 30);
    });

    it('should fall back to default for invalid log level', () => {
      process.env.LOG_LEVEL = 'invalid';
      const opts = loadLoggerOptions();
      assert.equal(opts.level, 'info');
    });

    it('should fall back to default for invalid retention days', () => {
      process.env.LOG_RETENTION_DAYS = 'abc';
      const opts = loadLoggerOptions();
      assert.equal(opts.retentionDays, 7);
    });
  });

  describe('createLogger', () => {
    it('should return a Logger instance', () => {
      const logger = createLogger({ logDir: '/tmp/git-mem-test-factory' });
      assert.ok(logger instanceof Logger);
    });

    it('should accept partial options override', () => {
      const logger = createLogger({ level: 'debug', logDir: '/tmp/git-mem-test-factory' });
      assert.ok(logger instanceof Logger);
      assert.equal(logger.isLevelEnabled('debug'), true);
    });
  });

  describe('createNullLogger', () => {
    it('should return a NullLogger instance', () => {
      const logger = createNullLogger();
      assert.ok(logger instanceof NullLogger);
    });
  });
});
