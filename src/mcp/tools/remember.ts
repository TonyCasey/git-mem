/**
 * MCP Tool: git_mem_remember
 *
 * Store a memory attached to the current or specified commit.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MemoryService } from '../../application/services/MemoryService';
import { MemoryRepository } from '../../infrastructure/repositories/MemoryRepository';
import { NotesService } from '../../infrastructure/services/NotesService';
import { createLogger } from '../../infrastructure/logging/factory';
import type { MemoryType } from '../../domain/entities/IMemoryEntity';
import type { ConfidenceLevel } from '../../domain/types/IMemoryQuality';
import type { MemoryLifecycle } from '../../domain/types/IMemoryLifecycle';

export function registerRememberTool(server: McpServer): void {
  server.tool(
    'git_mem_remember',
    'Store a memory (decision, gotcha, convention, fact) attached to a git commit',
    {
      text: z.string().describe('The memory content to store'),
      type: z.enum(['decision', 'gotcha', 'convention', 'fact']).optional().describe('Memory type (default: fact)'),
      commit: z.string().optional().describe('SHA to attach to (default: HEAD)'),
      confidence: z.enum(['verified', 'high', 'medium', 'low']).optional().describe('Confidence level (default: high)'),
      tags: z.string().optional().describe('Comma-separated tags'),
      lifecycle: z.enum(['permanent', 'project', 'session']).optional().describe('Lifecycle tier (default: project)'),
    },
    async (args) => {
      try {
        const logger = createLogger().child({ tool: 'remember' });
        const notesService = new NotesService();
        const memoryRepo = new MemoryRepository(notesService);
        const memoryService = new MemoryService(memoryRepo, logger);

        const memory = memoryService.remember(args.text, {
          sha: args.commit,
          type: (args.type || 'fact') as MemoryType,
          confidence: (args.confidence || 'high') as ConfidenceLevel,
          lifecycle: (args.lifecycle || 'project') as MemoryLifecycle,
          tags: args.tags,
        });

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'stored',
              id: memory.id,
              content: memory.content,
              type: memory.type,
              sha: memory.sha,
              confidence: memory.confidence,
              tags: memory.tags,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error storing memory: ${err instanceof Error ? err.message : String(err)}`,
          }],
          isError: true,
        };
      }
    }
  );
}
