/**
 * TrailerService
 *
 * Infrastructure implementation of ITrailerService.
 * Reads and writes AI-* commit trailers via git CLI.
 */

import { execFileSync } from 'child_process';
import type {
  ITrailerService,
  ITrailerQueryOptions,
  ICommitTrailers,
} from '../../domain/interfaces/ITrailerService';
import type { ITrailer } from '../../domain/entities/ITrailer';
import { AI_TRAILER_PREFIX } from '../../domain/entities/ITrailer';

export class TrailerService implements ITrailerService {
  readTrailers(sha?: string, cwd?: string): ITrailer[] {
    const ref = sha || 'HEAD';
    try {
      // Get all trailers from the commit
      const output = execFileSync(
        'git',
        ['log', '-1', '--format=%(trailers)', ref],
        {
          encoding: 'utf8',
          cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      ).trim();

      if (!output) return [];

      return this.parseTrailerBlock(output);
    } catch {
      return [];
    }
  }

  formatTrailers(trailers: readonly ITrailer[]): string {
    return trailers
      .map(t => `${t.key}: ${t.value}`)
      .join('\n');
  }

  private static readonly RECORD_SEP = '\x1e';
  private static readonly FIELD_SEP = '\x1f';

  queryTrailers(key: string, options?: ITrailerQueryOptions): ICommitTrailers[] {
    // Use ASCII record/field separators for reliable parsing
    const args: string[] = [
      'log',
      `--format=${TrailerService.RECORD_SEP}%H${TrailerService.FIELD_SEP}%(trailers)`,
    ];

    if (options?.since) args.push(`--since=${options.since}`);
    if (options?.maxCount) args.push(`-n${options.maxCount}`);

    try {
      const output = execFileSync('git', args, {
        encoding: 'utf8',
        cwd: options?.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 50 * 1024 * 1024,
      }).trim();

      if (!output) return [];

      const results: ICommitTrailers[] = [];
      const records = output.split(TrailerService.RECORD_SEP).filter(r => r.trim());

      for (const record of records) {
        const sepIndex = record.indexOf(TrailerService.FIELD_SEP);
        if (sepIndex === -1) continue;

        const sha = record.slice(0, sepIndex).trim();
        const trailerBlock = record.slice(sepIndex + 1).trim();

        if (!sha || !trailerBlock) continue;

        const trailers = this.parseTrailerBlock(trailerBlock)
          .filter(t => t.key === key || t.key.startsWith(key));

        if (trailers.length > 0) {
          results.push({ sha, trailers });
        }
      }

      return results;
    } catch {
      return [];
    }
  }

  addTrailers(trailers: readonly ITrailer[], cwd?: string): void {
    // Only operate on AI-* trailers to match readTrailers/parseTrailerBlock behavior.
    const aiTrailers = trailers.filter(t => t.key.startsWith(AI_TRAILER_PREFIX));
    if (aiTrailers.length === 0) return;

    // Read existing trailers to avoid duplicates
    const existing = this.readTrailers('HEAD', cwd);
    const existingKeys = new Set(existing.map(t => `${t.key}:${t.value}`));
    const newTrailers = aiTrailers.filter(t => !existingKeys.has(`${t.key}:${t.value}`));
    if (newTrailers.length === 0) return;

    // Get current commit message
    const currentMessage = execFileSync(
      'git',
      ['log', '-1', '--format=%B', 'HEAD'],
      { encoding: 'utf8', cwd, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trimEnd();

    // Build amended message with new trailers
    const amended = this.buildCommitMessage(currentMessage, newTrailers);

    // Amend HEAD with the new message
    execFileSync(
      'git',
      ['commit', '--amend', '--no-edit', '-m', amended],
      { encoding: 'utf8', cwd, stdio: ['pipe', 'pipe', 'pipe'] }
    );
  }

  buildCommitMessage(message: string, trailers: readonly ITrailer[]): string {
    if (trailers.length === 0) return message;

    const trailerBlock = this.formatTrailers(trailers);
    const trimmed = message.trimEnd();

    // Detect existing trailer block: lines after the last blank line
    // must all match "Key: Value" format (git trailer convention).
    if (this.hasTrailerBlock(trimmed)) {
      return `${trimmed}\n${trailerBlock}\n`;
    }

    return `${trimmed}\n\n${trailerBlock}\n`;
  }

  private hasTrailerBlock(message: string): boolean {
    const lastBlankIdx = message.lastIndexOf('\n\n');
    if (lastBlankIdx === -1) return false;

    const afterBlank = message.slice(lastBlankIdx + 2).trim();
    if (!afterBlank) return false;

    const lines = afterBlank.split('\n').filter(l => l.trim().length > 0);
    return lines.length > 0 && lines.every(l => /^[\w-]+:\s/.test(l));
  }

  private parseTrailerBlock(block: string): ITrailer[] {
    const trailers: ITrailer[] = [];
    const lines = block.split('\n');

    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();

      // Only include AI-* trailers
      if (key.startsWith(AI_TRAILER_PREFIX) && value) {
        trailers.push({ key, value });
      }
    }

    return trailers;
  }
}
