/**
 * ILogger
 *
 * Domain-layer logging interfaces. Zero dependencies.
 * Infrastructure layer provides concrete implementations (Logger, NullLogger).
 */

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface ILoggerOptions {
  level: LogLevel;
  logDir: string;           // Default: '.git-mem/logs'
  enableConsole: boolean;   // Default: false
  enableFile: boolean;      // Default: true
  retentionDays: number;    // Default: 7
}

export interface ILogger {
  trace(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  fatal(message: string, context?: Record<string, unknown>): void;

  child(bindings: Record<string, unknown>): ILogger;
  isLevelEnabled(level: LogLevel): boolean;
}
