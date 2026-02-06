/**
 * MCP Tool: git_mem_recall
 *
 * Search and retrieve memories.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MemoryService } from '../../application/services/MemoryService';
import { MemoryRepository } from '../../infrastructure/repositories/MemoryRepository';
import { NotesService } from '../../infrastructure/services/NotesService';
import { createLogger } from '../../infrastructure/logging/factory';
import type { MemoryType } from '../../domain/entities/IMemoryEntity';

export function registerRecallTool(server: McpServer): void {
  server.tool(
    'git_mem_recall',
    'Search and retrieve memories stored in this git repository',
    {
      query: z.string().optional().describe('Search text to match against memory content and tags'),
      type: z.enum(['decision', 'gotcha', 'convention', 'fact']).optional().describe('Filter by memory type'),
      limit: z.number().optional().describe('Max results (default: 10)'),
      since: z.string().optional().describe('Filter memories created after this date (ISO 8601)'),
      tag: z.string().optional().describe('Filter by tag'),
    },
    async (args) => {
      try {
        const logger = createLogger().child({ tool: 'recall' });
        const notesService = new NotesService();
        const memoryRepo = new MemoryRepository(notesService);
        const memoryService = new MemoryService(memoryRepo, logger);

        const result = memoryService.recall(args.query, {
          type: args.type as MemoryType | undefined,
          limit: args.limit || 10,
          since: args.since,
          tag: args.tag,
        });

        if (result.memories.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: 'No memories found.',
            }],
          };
        }

        const memories = result.memories.map(m => ({
          id: m.id,
          content: m.content,
          type: m.type,
          sha: m.sha.slice(0, 7),
          confidence: m.confidence,
          tags: m.tags,
          createdAt: m.createdAt,
        }));

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              total: result.total,
              memories,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error recalling memories: ${err instanceof Error ? err.message : String(err)}`,
          }],
          isError: true,
        };
      }
    }
  );
}
