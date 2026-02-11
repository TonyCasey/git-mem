import { ILogger, LogLevel } from '../../domain/interfaces/ILogger';

export class NullLogger implements ILogger {
  trace(): void { /* no-op */ }
  debug(): void { /* no-op */ }
  info(): void { /* no-op */ }
  warn(): void { /* no-op */ }
  error(): void { /* no-op */ }
  fatal(): void { /* no-op */ }

  child(): ILogger {
    return this;
  }

  isLevelEnabled(_level: LogLevel): boolean {
    return false;
  }
}
