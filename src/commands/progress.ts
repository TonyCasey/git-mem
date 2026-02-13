/**
 * Shared stderr progress handler for liberate operations.
 */

import type { ILiberateProgress } from '../application/interfaces/ILiberateService';

/**
 * Create a progress callback that writes liberate progress to stderr.
 * Each progress update is written on its own line.
 */
export function createStderrProgressHandler(): (p: ILiberateProgress) => void {
  return (p: ILiberateProgress): void => {
    if (p.phase === 'triage') {
      process.stderr.write(`Found ${p.total} high-interest commits to analyze.\n`);
    } else if (p.phase === 'processing') {
      const sha = p.sha.slice(0, 7);
      const subject = p.subject.length > 60 ? p.subject.slice(0, 57) + '...' : p.subject;
      process.stderr.write(`  [${p.current}/${p.total}] ${sha} ${subject}  (${p.factsExtracted} facts)\n`);
    } else if (p.phase === 'complete') {
      process.stderr.write(`Done — ${p.factsExtracted} facts extracted from ${p.total} commits.\n`);
    }
  };
}
