/**
 * remember command handler
 */

import { createContainer } from '../infrastructure/di';
import type { MemoryType } from '../domain/entities/IMemoryEntity';
import type { ConfidenceLevel } from '../domain/types/IMemoryQuality';
import type { MemoryLifecycle } from '../domain/types/IMemoryLifecycle';
import type { ILogger } from '../domain/interfaces/ILogger';

interface IRememberOptions {
  commit?: string;
  type?: string;
  confidence?: string;
  lifecycle?: string;
  tags?: string;
  noTrailers?: boolean;
  agent?: string;
  model?: string;
}

export async function rememberCommand(text: string, options: IRememberOptions, logger?: ILogger): Promise<void> {
  const container = createContainer({ logger, scope: 'remember' });
  const { memoryService, logger: log } = container.cradle;
  log.info('Command invoked', { type: options.type || 'fact' });

  // Resolve agent: explicit flag > $GIT_MEM_AGENT > $CLAUDE_CODE heuristic
  const agent = options.agent
    || process.env.GIT_MEM_AGENT
    || (process.env.CLAUDE_CODE ? 'Claude-Code' : undefined);

  // Resolve model: explicit flag > $GIT_MEM_MODEL
  const model = options.model || process.env.GIT_MEM_MODEL || undefined;

  const memory = memoryService.remember(text, {
    sha: options.commit,
    type: (options.type || 'fact') as MemoryType,
    confidence: (options.confidence || 'high') as ConfidenceLevel,
    lifecycle: (options.lifecycle || 'project') as MemoryLifecycle,
    tags: options.tags,
    trailers: !options.noTrailers,
    agent,
    model,
  });

  console.log(`Remembered: ${memory.content}`);
  console.log(`  id:         ${memory.id}`);
  console.log(`  type:       ${memory.type}`);
  console.log(`  confidence: ${memory.confidence}`);
  console.log(`  sha:        ${memory.sha}`);
  if (memory.tags.length > 0) {
    console.log(`  tags:       ${memory.tags.join(', ')}`);
  }
}
