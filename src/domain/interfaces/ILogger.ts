export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface ILoggerOptions {
  level: LogLevel;
  logDir: string;
  enableConsole: boolean;
  enableFile: boolean;
  retentionDays: number;
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
