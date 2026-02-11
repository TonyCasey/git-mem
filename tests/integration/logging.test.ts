import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Logger } from '../../src/infrastructure/logging/Logger';
import type { ILoggerOptions } from '../../src/domain/interfaces/ILogger';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'git-mem-log-integ-'));
}

function createOptions(logDir: string): ILoggerOptions {
  return {
    level: 'trace',
    logDir,
    enableConsole: false,
    enableFile: true,
    retentionDays: 7,
  };
}

function readLogFile(logDir: string): string {
  const files = fs.readdirSync(logDir).filter(f => f.startsWith('git-mem-'));
  if (files.length === 0) return '';
  return fs.readFileSync(path.join(logDir, files[0]!), 'utf8');
}

describe('Integration: Logging', () => {
  const tempDirs: string[] = [];

  after(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should create log directory if missing', () => {
    const baseDir = createTempDir();
    tempDirs.push(baseDir);
    const logDir = path.join(baseDir, 'new-logs');
    const logger = new Logger(createOptions(logDir));

    logger.info('first message');

    assert.ok(fs.existsSync(logDir));
  });

  it('should write to daily log file', () => {
    const logDir = createTempDir();
    tempDirs.push(logDir);
    const logger = new Logger(createOptions(logDir));

    logger.info('test message');

    const files = fs.readdirSync(logDir);
    assert.equal(files.length, 1);

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    assert.ok(files[0]!.includes(dateStr));
  });

  it('should write expected format', () => {
    const logDir = createTempDir();
    tempDirs.push(logDir);
    const logger = new Logger(createOptions(logDir));

    logger.info('hello world', { key: 'val' });

    const content = readLogFile(logDir);
    // Format: YYYY-MM-DD HH:mm:ss.SSS INFO  hello world {"key":"val"}
    assert.ok(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} INFO/.test(content));
    assert.ok(content.includes('hello world'));
    assert.ok(content.includes('"key":"val"'));
  });

  it('should append multiple log calls to same file', () => {
    const logDir = createTempDir();
    tempDirs.push(logDir);
    const logger = new Logger(createOptions(logDir));

    logger.info('message one');
    logger.info('message two');
    logger.info('message three');

    const content = readLogFile(logDir);
    const lines = content.trim().split('\n');
    assert.equal(lines.length, 3);
    assert.ok(lines[0]!.includes('message one'));
    assert.ok(lines[1]!.includes('message two'));
    assert.ok(lines[2]!.includes('message three'));
  });

  it('should include child logger context in output', () => {
    const logDir = createTempDir();
    tempDirs.push(logDir);
    const root = new Logger(createOptions(logDir));
    const child = root.child({ component: 'mcp', tool: 'remember' });

    child.info('stored');

    const content = readLogFile(logDir);
    assert.ok(content.includes('"component":"mcp"'));
    assert.ok(content.includes('"tool":"remember"'));
    assert.ok(content.includes('stored'));
  });

  it('should filter by level end-to-end', () => {
    const logDir = createTempDir();
    tempDirs.push(logDir);
    const opts = createOptions(logDir);
    opts.level = 'warn';
    const logger = new Logger(opts);

    logger.debug('invisible');
    logger.info('invisible');
    logger.warn('visible warn');
    logger.error('visible error');

    const content = readLogFile(logDir);
    assert.ok(!content.includes('invisible'));
    assert.ok(content.includes('visible warn'));
    assert.ok(content.includes('visible error'));
  });
});
