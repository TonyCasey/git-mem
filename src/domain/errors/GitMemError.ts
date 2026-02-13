/**
 * Base error class for git-mem domain errors.
 */
export class GitMemError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly data?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'GitMemError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error thrown when commit trailer operations fail.
 */
export class TrailerError extends GitMemError {
  constructor(message: string, data?: Record<string, unknown>) {
    super(message, 'TRAILER_ERROR', data);
    this.name = 'TrailerError';
  }
}

/**
 * Error thrown when git notes operations fail.
 */
export class NotesError extends GitMemError {
  constructor(message: string, data?: Record<string, unknown>) {
    super(message, 'NOTES_ERROR', data);
    this.name = 'NotesError';
  }
}

/**
 * Error thrown when memory operations fail.
 */
export class MemoryError extends GitMemError {
  constructor(message: string, data?: Record<string, unknown>) {
    super(message, 'MEMORY_ERROR', data);
    this.name = 'MemoryError';
  }
}

/**
 * Error thrown when git client operations fail.
 */
export class GitClientError extends GitMemError {
  constructor(message: string, data?: Record<string, unknown>) {
    super(message, 'GIT_CLIENT_ERROR', data);
    this.name = 'GitClientError';
  }
}

/**
 * Error thrown when extract operations fail.
 */
export class ExtractError extends GitMemError {
  constructor(message: string, data?: Record<string, unknown>) {
    super(message, 'EXTRACT_ERROR', data);
    this.name = 'ExtractError';
  }
}
