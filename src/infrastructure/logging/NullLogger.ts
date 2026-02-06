import type { ILogger, LogLevel } from '../../domain/interfaces/ILogger';

/**
 * No-op logger for testing or when logging is disabled.
 */
export class NullLogger implements ILogger {
  trace(_message: string, _context?: Record<string, unknown>): void {}
  debug(_message: string, _context?: Record<string, unknown>): void {}
  info(_message: string, _context?: Record<string, unknown>): void {}
  warn(_message: string, _context?: Record<string, unknown>): void {}
  error(_message: string, _context?: Record<string, unknown>): void {}
  fatal(_message: string, _context?: Record<string, unknown>): void {}

  child(_bindings: Record<string, unknown>): ILogger {
    return this;
  }

  isLevelEnabled(_level: LogLevel): boolean {
    return false;
  }
}
