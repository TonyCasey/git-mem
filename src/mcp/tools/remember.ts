/**
 * MCP Tool: git_mem_remember
 *
 * Store a memory attached to the current or specified commit.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createContainer } from '../../infrastructure/di';
import { resolveAgent, resolveModel } from '../../infrastructure/detect-agent';
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
      agent: z.string().optional().describe('AI agent name (default: auto-detect from $GIT_MEM_AGENT / $CLAUDECODE / $CLAUDE_CODE)'),
      model: z.string().optional().describe('AI model identifier (default: $GIT_MEM_MODEL / $ANTHROPIC_MODEL)'),
      trailers: z.boolean().optional().describe('Write AI-* trailers to commit message (default: true)'),
    },
    async (args) => {
      const container = createContainer({ scope: 'mcp:remember' });
      const { memoryService, logger } = container.cradle;
      try {
        logger.info('Tool invoked', { type: args.type || 'fact' });

        const agent = resolveAgent(args.agent);
        const model = resolveModel(args.model);

        const memory = memoryService.remember(args.text, {
          sha: args.commit,
          type: (args.type || 'fact') as MemoryType,
          confidence: (args.confidence || 'high') as ConfidenceLevel,
          lifecycle: (args.lifecycle || 'project') as MemoryLifecycle,
          tags: args.tags,
          trailers: args.trailers,
          agent,
          model,
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
        logger.error('Tool failed', { error: err instanceof Error ? err.message : String(err) });
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
