/**
 * Shared stderr progress handler for liberate operations.
 */

import type { ILiberateProgress } from '../application/interfaces/ILiberateService';

/**
 * Create a progress callback that writes liberate progress to stderr.
 * Uses in-place `\r` updates when stderr is a TTY, newline-based otherwise.
 */
export function createStderrProgressHandler(): (p: ILiberateProgress) => void {
  const isTTY = process.stderr.isTTY;
  let lastLineLength = 0;
  let inPlaceStarted = false;

  return (p: ILiberateProgress): void => {
    if (p.phase === 'triage') {
      process.stderr.write(`Found ${p.total} high-interest commits to analyze.\n`);
    } else if (p.phase === 'processing') {
      const sha = p.sha.slice(0, 7);
      const subject = p.subject.length > 60 ? p.subject.slice(0, 57) + '...' : p.subject;
      const line = `  [${p.current}/${p.total}] ${sha} ${subject}  (${p.factsExtracted} facts)`;

      if (isTTY) {
        const padded = line.padEnd(lastLineLength, ' ');
        lastLineLength = line.length;
        inPlaceStarted = true;
        process.stderr.write(`\r${padded}`);
      } else {
        process.stderr.write(`${line}\n`);
      }
    } else if (p.phase === 'complete') {
      if (isTTY && inPlaceStarted) {
        process.stderr.write('\n');
        inPlaceStarted = false;
      }
    }
  };
}

/**
 * Wrap a liberate call so that if it throws after writing in-place progress,
 * a trailing newline is still written to stderr.
 */
export async function liberateWithProgress<T>(
  fn: () => Promise<T>,
  onProgress: ReturnType<typeof createStderrProgressHandler>,
): Promise<T> {
  try {
    return await fn();
  } finally {
    // Ensure terminal is clean if progress was mid-line when error occurred.
    // The 'complete' phase handler already writes \n, but if liberate threw
    // before emitting 'complete', we need a fallback. We rely on the handler's
    // internal state via one final 'complete' call.
    onProgress({ phase: 'complete', current: 0, total: 0, sha: '', subject: '', factsExtracted: 0 });
  }
}
