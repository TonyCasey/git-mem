/**
 * retrofit command handler
 */

import { RetrofitService } from '../application/services/RetrofitService';
import { GitTriageService } from '../application/services/GitTriageService';
import { MemoryRepository } from '../infrastructure/repositories/MemoryRepository';
import { NotesService } from '../infrastructure/services/NotesService';
import { GitClient } from '../infrastructure/git/GitClient';

interface IRetrofitCommandOptions {
  since?: string;
  max?: string;
  dryRun?: boolean;
  threshold?: string;
}

export async function retrofitCommand(options: IRetrofitCommandOptions): Promise<void> {
  const gitClient = new GitClient();
  const triageService = new GitTriageService(gitClient);
  const notesService = new NotesService();
  const memoryRepo = new MemoryRepository(notesService);
  const retrofitService = new RetrofitService(triageService, memoryRepo);

  const since = options.since ? new Date(options.since) : undefined;
  const maxCommits = options.max ? parseInt(options.max, 10) : undefined;
  const threshold = options.threshold ? parseInt(options.threshold, 10) : undefined;

  if (options.dryRun) {
    console.log('Dry run — no notes will be written.\n');
  }

  const result = await retrofitService.retrofit({
    since,
    maxCommits,
    dryRun: options.dryRun,
    threshold,
  });

  console.log(`Commits scanned:   ${result.commitsScanned}`);
  console.log(`Commits annotated: ${result.commitsAnnotated}`);
  console.log(`Facts extracted:   ${result.factsExtracted}`);
  console.log(`Duration:          ${result.durationMs}ms`);

  if (result.annotations.length > 0) {
    console.log('\nAnnotations:');
    for (const ann of result.annotations) {
      console.log(`  ${ann.sha.slice(0, 7)} (score: ${ann.score}) ${ann.subject}`);
      console.log(`    ${ann.factsExtracted} fact(s): ${ann.factTypes.join(', ')}`);
    }
  }
}
