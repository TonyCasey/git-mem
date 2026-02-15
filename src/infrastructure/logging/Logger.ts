import * as fs from 'node:fs';
import * as path from 'node:path';
import { ILogger, ILoggerOptions, LogLevel } from '../../domain/interfaces/ILogger';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  trace: '\x1b[90m',   // gray
  debug: '\x1b[90m',   // gray
  info: '\x1b[34m',    // blue
  warn: '\x1b[33m',    // yellow
  error: '\x1b[31m',   // red
  fatal: '\x1b[35m',   // magenta
};

const RESET = '\x1b[0m';

/** JSON.stringify that handles circular references and Error objects. */
function safeStringify(obj: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (_key, value) => {
    if (value instanceof Error) {
      return { message: value.message, stack: value.stack };
    }
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    return value;
  });
}

function formatTimestamp(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;
}

function formatDate(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export class Logger implements ILogger {
  private readonly minPriority: number;
  private readonly bindings: Record<string, unknown>;
  private readonly state: { dirCreated: boolean };

  constructor(
    private readonly options: ILoggerOptions,
    bindings?: Record<string, unknown>,
    state?: { dirCreated: boolean },
  ) {
    this.minPriority = LEVEL_PRIORITY[options.level];
    this.bindings = bindings ?? {};
    this.state = state ?? { dirCreated: false };
  }

  trace(message: string, context?: Record<string, unknown>): void {
    this.log('trace', message, context);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context);
  }

  fatal(message: string, context?: Record<string, unknown>): void {
    this.log('fatal', message, context);
  }

  child(bindings: Record<string, unknown>): ILogger {
    return new Logger(this.options, { ...this.bindings, ...bindings }, this.state);
  }

  isLevelEnabled(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= this.minPriority;
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!this.isLevelEnabled(level)) return;

    const merged = { ...this.bindings, ...context };
    const contextStr = Object.keys(merged).length > 0 ? ` ${safeStringify(merged)}` : '';
    const timestamp = formatTimestamp();
    const levelUpper = level.toUpperCase().padEnd(5);

    if (this.options.enableFile) {
      this.writeToFile(`${timestamp} ${levelUpper} ${message}${contextStr}\n`);
    }

    if (this.options.enableConsole) {
      const color = LEVEL_COLORS[level];
      process.stderr.write(`${color}${timestamp} ${levelUpper}${RESET} ${message}${contextStr}\n`);
    }
  }

  private writeToFile(line: string): void {
    try {
      if (!this.state.dirCreated) {
        fs.mkdirSync(this.options.logDir, { recursive: true });
        this.state.dirCreated = true;
        this.cleanExpiredLogs();
      }
      const filename = `git-mem-${formatDate()}.log`;
      const filepath = path.join(this.options.logDir, filename);
      fs.appendFileSync(filepath, line, 'utf8');
    } catch {
      // Logging should never crash the app
    }
  }

  private cleanExpiredLogs(): void {
    try {
      if (this.options.retentionDays <= 0) return;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - this.options.retentionDays);
      const files = fs.readdirSync(this.options.logDir);
      for (const file of files) {
        if (!file.startsWith('git-mem-') || !file.endsWith('.log')) continue;
        const dateStr = file.slice(8, 18);
        const fileDate = new Date(dateStr);
        if (!isNaN(fileDate.getTime()) && fileDate < cutoff) {
          fs.unlinkSync(path.join(this.options.logDir, file));
        }
      }
    } catch {
      // Cleanup failure should not affect logging
    }
  }
}
