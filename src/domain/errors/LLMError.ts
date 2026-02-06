/**
 * Error thrown when LLM operations fail.
 */

import { GitMemError } from './GitMemError';

export class LLMError extends GitMemError {
  constructor(message: string, data?: Record<string, unknown>) {
    super(message, 'LLM_ERROR', data);
    this.name = 'LLMError';
  }
}
