import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Logger } from '../../../../src/infrastructure/logging/Logger';
import type { ILoggerOptions } from '../../../../src/domain/interfaces/ILogger';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'git-mem-log-'));
}

function createOptions(overrides?: Partial<ILoggerOptions>): ILoggerOptions {
  return {
    level: 'trace',
    logDir: createTempDir(),
    enableConsole: false,
    enableFile: true,
    retentionDays: 7,
    ...overrides,
  };
}

function readLogFile(logDir: string): string {
  const files = fs.readdirSync(logDir).filter(f => f.startsWith('git-mem-'));
  if (files.length === 0) return '';
  return fs.readFileSync(path.join(logDir, files[0]!), 'utf8');
}

describe('Logger', () => {
  const tempDirs: string[] = [];

  after(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  describe('level filtering', () => {
    it('should write messages at or above configured level', () => {
      const opts = createOptions({ level: 'warn' });
      tempDirs.push(opts.logDir);
      const logger = new Logger(opts);

      logger.trace('trace msg');
      logger.debug('debug msg');
      logger.info('info msg');
      logger.warn('warn msg');
      logger.error('error msg');

      const content = readLogFile(opts.logDir);
      assert.ok(!content.includes('trace msg'));
      assert.ok(!content.includes('debug msg'));
      assert.ok(!content.includes('info msg'));
      assert.ok(content.includes('warn msg'));
      assert.ok(content.includes('error msg'));
    });

    it('should not write messages below configured level', () => {
      const opts = createOptions({ level: 'error' });
      tempDirs.push(opts.logDir);
      const logger = new Logger(opts);

      logger.info('should not appear');
      logger.warn('should not appear');

      const content = readLogFile(opts.logDir);
      assert.equal(content, '');
    });
  });

  describe('isLevelEnabled', () => {
    it('should return true for levels at or above configured level', () => {
      const opts = createOptions({ level: 'info' });
      tempDirs.push(opts.logDir);
      const logger = new Logger(opts);

      assert.equal(logger.isLevelEnabled('trace'), false);
      assert.equal(logger.isLevelEnabled('debug'), false);
      assert.equal(logger.isLevelEnabled('info'), true);
      assert.equal(logger.isLevelEnabled('warn'), true);
      assert.equal(logger.isLevelEnabled('error'), true);
      assert.equal(logger.isLevelEnabled('fatal'), true);
    });
  });

  describe('all log levels', () => {
    it('should write all 6 log levels when level is trace', () => {
      const opts = createOptions({ level: 'trace' });
      tempDirs.push(opts.logDir);
      const logger = new Logger(opts);

      logger.trace('t');
      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');
      logger.fatal('f');

      const content = readLogFile(opts.logDir);
      assert.ok(content.includes('TRACE'));
      assert.ok(content.includes('DEBUG'));
      assert.ok(content.includes('INFO'));
      assert.ok(content.includes('WARN'));
      assert.ok(content.includes('ERROR'));
      assert.ok(content.includes('FATAL'));
    });
  });

  describe('context', () => {
    it('should include context in log output', () => {
      const opts = createOptions();
      tempDirs.push(opts.logDir);
      const logger = new Logger(opts);

      logger.info('test message', { userId: '123', action: 'login' });

      const content = readLogFile(opts.logDir);
      assert.ok(content.includes('"userId":"123"'));
      assert.ok(content.includes('"action":"login"'));
    });
  });

  describe('child loggers', () => {
    it('should merge parent bindings with child bindings', () => {
      const opts = createOptions();
      tempDirs.push(opts.logDir);
      const parent = new Logger(opts);
      const child = parent.child({ component: 'auth' });

      child.info('child message', { extra: true });

      const content = readLogFile(opts.logDir);
      assert.ok(content.includes('"component":"auth"'));
      assert.ok(content.includes('"extra":true'));
    });

    it('should allow nested child loggers', () => {
      const opts = createOptions();
      tempDirs.push(opts.logDir);
      const root = new Logger(opts);
      const child = root.child({ level1: true });
      const grandchild = child.child({ level2: true });

      grandchild.info('nested');

      const content = readLogFile(opts.logDir);
      assert.ok(content.includes('"level1":true'));
      assert.ok(content.includes('"level2":true'));
    });
  });

  describe('timestamp format', () => {
    it('should include correctly formatted timestamp', () => {
      const opts = createOptions();
      tempDirs.push(opts.logDir);
      const logger = new Logger(opts);

      logger.info('timestamp test');

      const content = readLogFile(opts.logDir);
      // Pattern: YYYY-MM-DD HH:mm:ss.SSS
      assert.ok(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}/.test(content));
    });
  });

  describe('file output disabled', () => {
    it('should not create log file when enableFile is false', () => {
      const opts = createOptions({ enableFile: false });
      tempDirs.push(opts.logDir);
      const logger = new Logger(opts);

      logger.info('should not be written');

      const files = fs.readdirSync(opts.logDir);
      assert.equal(files.length, 0);
    });
  });

  describe('log directory creation', () => {
    it('should create logDir if it does not exist', () => {
      const baseDir = createTempDir();
      const logDir = path.join(baseDir, 'nested', 'logs');
      tempDirs.push(baseDir);
      const opts = createOptions({ logDir });
      const logger = new Logger(opts);

      logger.info('creates directory');

      assert.ok(fs.existsSync(logDir));
      const content = readLogFile(logDir);
      assert.ok(content.includes('creates directory'));
    });
  });
});
