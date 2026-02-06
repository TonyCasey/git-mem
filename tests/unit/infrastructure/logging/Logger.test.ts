/**
 * Unit tests for Logger.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Logger, DEFAULT_LOGGER_OPTIONS } from '../../../../src/infrastructure/logging/Logger';
import type { ILoggerOptions } from '../../../../src/domain/interfaces/ILogger';

describe('Logger', () => {
  let tempDir: string;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'git-mem-logger-test-'));
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function makeOptions(overrides?: Partial<ILoggerOptions>): ILoggerOptions {
    return {
      ...DEFAULT_LOGGER_OPTIONS,
      logDir: tempDir,
      enableFile: true,
      enableConsole: false,
      ...overrides,
    };
  }

  function readLogFile(): string {
    const files = require('fs').readdirSync(tempDir) as string[];
    const logFile = files.find((f: string) => f.startsWith('git-mem-') && f.endsWith('.log'));
    if (!logFile) return '';
    return readFileSync(join(tempDir, logFile), 'utf8');
  }

  describe('level filtering', () => {
    it('should not write messages below threshold', () => {
      const logger = new Logger(makeOptions({ level: 'warn' }));
      logger.info('should not appear');
      logger.debug('should not appear');

      const content = readLogFile();
      assert.ok(!content.includes('should not appear'));
    });

    it('should write messages at or above threshold', () => {
      const logger = new Logger(makeOptions({ level: 'info' }));
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      const content = readLogFile();
      assert.ok(content.includes('info message'));
      assert.ok(content.includes('warn message'));
      assert.ok(content.includes('error message'));
    });
  });

  describe('isLevelEnabled', () => {
    it('should return true for levels at or above threshold', () => {
      const logger = new Logger(makeOptions({ level: 'warn' }));
      assert.equal(logger.isLevelEnabled('trace'), false);
      assert.equal(logger.isLevelEnabled('debug'), false);
      assert.equal(logger.isLevelEnabled('info'), false);
      assert.equal(logger.isLevelEnabled('warn'), true);
      assert.equal(logger.isLevelEnabled('error'), true);
      assert.equal(logger.isLevelEnabled('fatal'), true);
    });
  });

  describe('all log levels', () => {
    it('should write at trace level when threshold is trace', () => {
      const logger = new Logger(makeOptions({ level: 'trace' }));
      logger.trace('trace msg');
      logger.debug('debug msg');
      logger.info('info msg');
      logger.warn('warn msg');
      logger.error('error msg');
      logger.fatal('fatal msg');

      const content = readLogFile();
      assert.ok(content.includes('TRACE'));
      assert.ok(content.includes('DEBUG'));
      assert.ok(content.includes('INFO'));
      assert.ok(content.includes('WARN'));
      assert.ok(content.includes('ERROR'));
      assert.ok(content.includes('FATAL'));
    });
  });

  describe('context', () => {
    it('should include context in output', () => {
      const logger = new Logger(makeOptions({ level: 'info' }));
      logger.info('test message', { userId: '123', action: 'login' });

      const content = readLogFile();
      assert.ok(content.includes('"userId":"123"'));
      assert.ok(content.includes('"action":"login"'));
    });
  });

  describe('child logger', () => {
    it('should merge bindings into context', () => {
      const logger = new Logger(makeOptions({ level: 'info' }));
      const child = logger.child({ component: 'mcp' });
      child.info('child message', { tool: 'remember' });

      const content = readLogFile();
      assert.ok(content.includes('"component":"mcp"'));
      assert.ok(content.includes('"tool":"remember"'));
    });

    it('should inherit parent level', () => {
      const logger = new Logger(makeOptions({ level: 'warn' }));
      const child = logger.child({ component: 'test' });
      assert.equal(child.isLevelEnabled('info'), false);
      assert.equal(child.isLevelEnabled('warn'), true);
    });
  });

  describe('timestamp format', () => {
    it('should write timestamps in YYYY-MM-DD HH:mm:ss.SSS format', () => {
      const logger = new Logger(makeOptions({ level: 'info' }));
      logger.info('timestamp test');

      const content = readLogFile();
      // Match pattern: 2026-02-06 17:30:45.123
      assert.ok(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}/.test(content));
    });
  });

  describe('file output', () => {
    it('should not write when enableFile is false', () => {
      const noFileDir = mkdtempSync(join(tmpdir(), 'git-mem-nofile-'));
      try {
        const logger = new Logger(makeOptions({ enableFile: false, logDir: noFileDir }));
        logger.info('should not be written to file');

        const files = require('fs').readdirSync(noFileDir) as string[];
        const logFile = files.find((f: string) => f.endsWith('.log'));
        assert.equal(logFile, undefined);
      } finally {
        rmSync(noFileDir, { recursive: true, force: true });
      }
    });
  });

  describe('defaults', () => {
    it('should have correct default options', () => {
      assert.equal(DEFAULT_LOGGER_OPTIONS.level, 'info');
      assert.equal(DEFAULT_LOGGER_OPTIONS.logDir, '.git-mem/logs');
      assert.equal(DEFAULT_LOGGER_OPTIONS.enableConsole, false);
      assert.equal(DEFAULT_LOGGER_OPTIONS.enableFile, true);
      assert.equal(DEFAULT_LOGGER_OPTIONS.retentionDays, 7);
    });
  });
});
