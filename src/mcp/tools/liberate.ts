/**
 * MCP Tool: git_mem_liberate
 *
 * Scan and annotate existing commit history with structured memory notes.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LiberateService } from '../../application/services/LiberateService';
import { GitTriageService } from '../../application/services/GitTriageService';
import { MemoryRepository } from '../../infrastructure/repositories/MemoryRepository';
import { NotesService } from '../../infrastructure/services/NotesService';
import { GitClient } from '../../infrastructure/git/GitClient';
import { createLLMClient } from '../../infrastructure/llm/LLMClientFactory';
import { createLogger } from '../../infrastructure/logging/factory';

export function registerLiberateTool(server: McpServer): void {
  server.tool(
    'git_mem_liberate',
    'Scan commit history, score commits for interest, and extract decisions/gotchas/conventions as memories',
    {
      dry_run: z.boolean().optional().describe('Preview without writing notes (default: false)'),
      since: z.string().optional().describe('Start date for scanning (ISO 8601, e.g. "2024-01-01")'),
      max_commits: z.number().optional().describe('Maximum commits to process'),
      threshold: z.number().optional().describe('Interest score threshold (default: 3)'),
      enrich: z.boolean().optional().describe('Enable LLM enrichment (requires ANTHROPIC_API_KEY)'),
    },
    async (args) => {
      const logger = createLogger().child({ tool: 'liberate' });
      try {
        const gitClient = new GitClient();
        const triageService = new GitTriageService(gitClient);
        const notesService = new NotesService();
        const memoryRepo = new MemoryRepository(notesService);

        // LLM enrichment setup
        const llmClient = args.enrich ? createLLMClient() : null;
        logger.info('Tool invoked', { dryRun: args.dry_run, enrich: args.enrich });

        const liberateService = new LiberateService(
          triageService,
          memoryRepo,
          args.enrich ? gitClient : undefined,
          llmClient ?? undefined,
          logger,
        );

        const result = await liberateService.liberate({
          dryRun: args.dry_run ?? false,
          since: args.since ? new Date(args.since) : undefined,
          maxCommits: args.max_commits,
          threshold: args.threshold,
          enrich: args.enrich,
        });

        const summary: Record<string, unknown> = {
          dryRun: result.dryRun,
          commitsScanned: result.commitsScanned,
          commitsAnnotated: result.commitsAnnotated,
          factsExtracted: result.factsExtracted,
          durationMs: result.durationMs,
          annotations: result.annotations.map(a => ({
            sha: a.sha.slice(0, 7),
            subject: a.subject,
            score: a.score,
            factsExtracted: a.factsExtracted,
            factTypes: a.factTypes,
            enrichedByLLM: a.enrichedByLLM || false,
          })),
        };

        if (result.enrichment) {
          summary.enrichment = result.enrichment;
        }

        if (args.enrich && !llmClient) {
          summary.warning = 'LLM enrichment requested but no API key found. Using heuristics only.';
        }

        if (result.commitsAnnotated === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: `Scanned ${result.commitsScanned} commit(s). No interesting patterns found.`,
            }],
          };
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(summary, null, 2),
          }],
        };
      } catch (err) {
        logger.error('Tool failed', { error: err instanceof Error ? err.message : String(err) });
        return {
          content: [{
            type: 'text' as const,
            text: `Error running liberate: ${err instanceof Error ? err.message : String(err)}`,
          }],
          isError: true,
        };
      }
    }
  );
}
