/**
 * MCP Tool: git_mem_context
 *
 * Retrieve memories relevant to currently staged changes.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ContextService } from '../../application/services/ContextService';
import { MemoryRepository } from '../../infrastructure/repositories/MemoryRepository';
import { NotesService } from '../../infrastructure/services/NotesService';
import { GitClient } from '../../infrastructure/git/GitClient';

export function registerContextTool(server: McpServer): void {
  server.tool(
    'git_mem_context',
    'Get memories relevant to currently staged git changes. Use before committing to surface related decisions, gotchas, and conventions.',
    {
      limit: z.number().optional().describe('Max results (default: 10)'),
      threshold: z.number().optional().describe('Min relevance score 0-1 (default: 0.1)'),
    },
    async (args) => {
      try {
        const gitClient = new GitClient();
        const notesService = new NotesService();
        const memoryRepo = new MemoryRepository(notesService);
        const contextService = new ContextService(gitClient, memoryRepo);

        const result = contextService.getContext({
          limit: args.limit || 10,
          threshold: args.threshold || 0.1,
        });

        if (result.files.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: 'No staged changes. Stage files with `git add` first.',
            }],
          };
        }

        if (result.memories.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: `Analyzed ${result.files.length} staged file(s). No relevant memories found.`,
            }],
          };
        }

        const memories = result.memories.map(m => ({
          id: m.memory.id,
          content: m.memory.content,
          type: m.memory.type,
          score: Math.round(m.score * 100) / 100,
          reason: m.reason,
          tags: m.memory.tags,
        }));

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              files: result.files,
              totalScanned: result.totalScanned,
              relevant: memories.length,
              memories,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error getting context: ${err instanceof Error ? err.message : String(err)}`,
          }],
          isError: true,
        };
      }
    }
  );
}
