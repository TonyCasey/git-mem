import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ILogger, ILoggerOptions, LogLevel } from '../../domain/interfaces/ILogger';
import { Logger } from './Logger';
import { NullLogger } from './NullLogger';

const VALID_LEVELS: readonly LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

function isValidLogLevel(value: string): value is LogLevel {
  return VALID_LEVELS.includes(value as LogLevel);
}

function getGitRoot(): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

export function defaultLogDir(): string {
  const base = getGitRoot() ?? process.cwd();
  return path.join(base, '.git-mem', 'logs');
}

export function loadLoggerOptions(): ILoggerOptions {
  const levelEnv = process.env['LOG_LEVEL']?.toLowerCase() ?? '';
  const level: LogLevel = isValidLogLevel(levelEnv) ? levelEnv : 'info';
  const retentionParsed = parseInt(process.env['LOG_RETENTION_DAYS'] ?? '', 10);

  return {
    level,
    logDir: process.env['LOG_DIR'] ?? defaultLogDir(),
    enableConsole: process.env['LOG_CONSOLE'] === 'true',
    enableFile: process.env['LOG_FILE'] !== 'false',
    retentionDays: Number.isNaN(retentionParsed) ? 7 : retentionParsed,
  };
}

export function createLogger(options?: Partial<ILoggerOptions>): ILogger {
  const defaults = loadLoggerOptions();
  const merged: ILoggerOptions = { ...defaults, ...options };
  return new Logger(merged);
}

export function createNullLogger(): ILogger {
  return new NullLogger();
}
