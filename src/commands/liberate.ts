/**
 * liberate command handler
 */

import { createContainer } from '../infrastructure/di';
import type { ILogger } from '../domain/interfaces/ILogger';

interface ILiberateCommandOptions {
  since?: string;
  max?: string;
  dryRun?: boolean;
  threshold?: string;
  enrich?: boolean;
}

export async function liberateCommand(options: ILiberateCommandOptions, logger?: ILogger): Promise<void> {
  const container = createContainer({ logger, scope: 'liberate', enrich: options.enrich });
  const { liberateService, llmClient, logger: log } = container.cradle;

  if (options.enrich && !llmClient) {
    console.log('Warning: --enrich specified but no API key found. Set ANTHROPIC_API_KEY.');
    console.log('Falling back to heuristic extraction only.\n');
  }

  log.info('Command invoked', { dryRun: options.dryRun, enrich: options.enrich, max: options.max });

  const since = options.since ? new Date(options.since) : undefined;
  const maxCommits = options.max ? parseInt(options.max, 10) : undefined;
  const threshold = options.threshold ? parseInt(options.threshold, 10) : undefined;

  if (options.dryRun) {
    console.log('Dry run — no notes will be written.\n');
  }

  const result = await liberateService.liberate({
    since,
    maxCommits,
    dryRun: options.dryRun,
    threshold,
    enrich: options.enrich,
  });

  console.log(`Commits scanned:   ${result.commitsScanned}`);
  console.log(`Commits annotated: ${result.commitsAnnotated}`);
  console.log(`Facts extracted:   ${result.factsExtracted}`);
  console.log(`Duration:          ${result.durationMs}ms`);

  if (result.annotations.length > 0) {
    console.log('\nAnnotations:');
    for (const ann of result.annotations) {
      const llmTag = ann.enrichedByLLM ? ' [LLM]' : '';
      console.log(`  ${ann.sha.slice(0, 7)} (score: ${ann.score})${llmTag} ${ann.subject}`);
      console.log(`    ${ann.factsExtracted} fact(s): ${ann.factTypes.join(', ')}`);
    }
  }

  if (result.enrichment) {
    console.log('\nLLM Enrichment:');
    console.log(`  Commits enriched: ${result.enrichment.commitsEnriched}`);
    console.log(`  Commits failed:   ${result.enrichment.commitsFailed}`);
    console.log(`  LLM facts:        ${result.enrichment.factsExtracted}`);
    console.log(`  Input tokens:     ${result.enrichment.totalInputTokens}`);
    console.log(`  Output tokens:    ${result.enrichment.totalOutputTokens}`);
  }
}
