import type { ILogger, ILoggerOptions, LogLevel } from '../../domain/interfaces/ILogger';
import { Logger, DEFAULT_LOGGER_OPTIONS } from './Logger';
import { NullLogger } from './NullLogger';

const VALID_LEVELS: readonly LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

/**
 * Load logger options from environment variables with defaults.
 *
 * | Env Var              | Default          |
 * |----------------------|------------------|
 * | LOG_LEVEL            | info             |
 * | LOG_DIR              | .git-mem/logs    |
 * | LOG_CONSOLE          | false            |
 * | LOG_FILE             | true             |
 * | LOG_RETENTION_DAYS   | 7                |
 */
export function loadLoggerOptions(): ILoggerOptions {
  const level = (
    process.env.LOG_LEVEL ?? DEFAULT_LOGGER_OPTIONS.level
  ).toLowerCase() as LogLevel;

  const logDir = process.env.LOG_DIR ?? DEFAULT_LOGGER_OPTIONS.logDir;

  const enableConsole = (
    process.env.LOG_CONSOLE ?? String(DEFAULT_LOGGER_OPTIONS.enableConsole)
  ).toLowerCase() === 'true';

  const enableFile = (
    process.env.LOG_FILE ?? String(DEFAULT_LOGGER_OPTIONS.enableFile)
  ).toLowerCase() === 'true';

  const retentionDays = parseInt(
    process.env.LOG_RETENTION_DAYS ?? String(DEFAULT_LOGGER_OPTIONS.retentionDays),
    10,
  );

  const validatedLevel = VALID_LEVELS.includes(level) ? level : DEFAULT_LOGGER_OPTIONS.level;

  return {
    level: validatedLevel,
    logDir,
    enableConsole,
    enableFile,
    retentionDays: isNaN(retentionDays) ? DEFAULT_LOGGER_OPTIONS.retentionDays : retentionDays,
  };
}

/**
 * Create a logger with the given options merged over env-based defaults.
 */
export function createLogger(options?: Partial<ILoggerOptions>): ILogger {
  const resolved: ILoggerOptions = {
    ...loadLoggerOptions(),
    ...options,
  };
  return new Logger(resolved);
}

/**
 * Create a no-op logger. Useful for tests or when logging is disabled.
 */
export function createNullLogger(): ILogger {
  return new NullLogger();
}
