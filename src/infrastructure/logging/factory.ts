import { ILogger, ILoggerOptions, LogLevel } from '../../domain/interfaces/ILogger';
import { Logger } from './Logger';
import { NullLogger } from './NullLogger';

const VALID_LEVELS: readonly LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

function isValidLogLevel(value: string): value is LogLevel {
  return VALID_LEVELS.includes(value as LogLevel);
}

export function loadLoggerOptions(): ILoggerOptions {
  const levelEnv = process.env['LOG_LEVEL']?.toLowerCase() ?? '';
  const level: LogLevel = isValidLogLevel(levelEnv) ? levelEnv : 'info';

  return {
    level,
    logDir: process.env['LOG_DIR'] ?? '.git-mem/logs',
    enableConsole: process.env['LOG_CONSOLE'] === 'true',
    enableFile: process.env['LOG_FILE'] !== 'false',
    retentionDays: parseInt(process.env['LOG_RETENTION_DAYS'] ?? '7', 10) || 7,
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
