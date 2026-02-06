/**
 * Integration test: Logging
 *
 * Tests Logger file output end-to-end with real temp directories.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Logger } from '../../src/infrastructure/logging/Logger';
import type { ILoggerOptions } from '../../src/domain/interfaces/ILogger';

describe('Integration: Logging', () => {
  let tempDir: string;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'git-mem-integ-logging-'));
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function makeOptions(overrides?: Partial<ILoggerOptions>): ILoggerOptions {
    return {
      level: 'info',
      logDir: join(tempDir, 'logs'),
      enableConsole: false,
      enableFile: true,
      retentionDays: 7,
      ...overrides,
    };
  }

  function getLogContent(logDir: string): string {
    const files = readdirSync(logDir);
    const logFile = files.find(f => f.startsWith('git-mem-') && f.endsWith('.log'));
    if (!logFile) return '';
    return readFileSync(join(logDir, logFile), 'utf8');
  }

  it('should create log directory if missing', () => {
    const logDir = join(tempDir, 'new-logs');
    assert.ok(!existsSync(logDir));

    const _logger = new Logger(makeOptions({ logDir }));
    assert.ok(existsSync(logDir));
  });

  it('should write to daily log file', () => {
    const logDir = join(tempDir, 'daily');
    const logger = new Logger(makeOptions({ logDir }));
    logger.info('daily log test');

    const files = readdirSync(logDir);
    const logFile = files.find(f => f.startsWith('git-mem-') && f.endsWith('.log'));
    assert.ok(logFile, 'Expected a daily log file');

    // Verify file name contains today's date
    const today = new Date().toISOString().slice(0, 10);
    assert.ok(logFile.includes(today), `Expected log file to contain date ${today}`);
  });

  it('should write expected format: timestamp level message context', () => {
    const logDir = join(tempDir, 'format');
    const logger = new Logger(makeOptions({ logDir }));
    logger.info('format test', { key: 'value' });

    const content = getLogContent(logDir);
    const lines = content.trim().split('\n');
    assert.equal(lines.length, 1);

    // Format: 2026-02-06 17:30:45.123 INFO  format test {"key":"value"}
    const line = lines[0];
    assert.ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}/.test(line), 'Expected timestamp');
    assert.ok(line.includes('INFO'), 'Expected level');
    assert.ok(line.includes('format test'), 'Expected message');
    assert.ok(line.includes('"key":"value"'), 'Expected context');
  });

  it('should append multiple log calls to same file', () => {
    const logDir = join(tempDir, 'append');
    const logger = new Logger(makeOptions({ logDir }));
    logger.info('first line');
    logger.info('second line');
    logger.info('third line');

    const content = getLogContent(logDir);
    const lines = content.trim().split('\n');
    assert.equal(lines.length, 3);
    assert.ok(lines[0].includes('first line'));
    assert.ok(lines[1].includes('second line'));
    assert.ok(lines[2].includes('third line'));
  });

  it('should include child logger context in output', () => {
    const logDir = join(tempDir, 'child');
    const logger = new Logger(makeOptions({ logDir }));
    const child = logger.child({ component: 'mcp', tool: 'remember' });
    child.info('child test');

    const content = getLogContent(logDir);
    assert.ok(content.includes('"component":"mcp"'));
    assert.ok(content.includes('"tool":"remember"'));
    assert.ok(content.includes('child test'));
  });

  it('should filter by level end-to-end', () => {
    const logDir = join(tempDir, 'filter');
    const logger = new Logger(makeOptions({ logDir, level: 'error' }));
    logger.debug('should not appear');
    logger.info('should not appear');
    logger.warn('should not appear');
    logger.error('should appear');
    logger.fatal('should also appear');

    const content = getLogContent(logDir);
    assert.ok(!content.includes('should not appear'));
    assert.ok(content.includes('should appear'));
    assert.ok(content.includes('should also appear'));
  });
});
