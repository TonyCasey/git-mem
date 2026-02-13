/**
 * trailers command handler
 *
 * Inspect AI-* trailers on commits — show trailers on HEAD,
 * a specific commit, query across history, or list distinct keys.
 */

import { createContainer } from '../infrastructure/di';
import type { ILogger } from '../domain/interfaces/ILogger';
import type { ICommitTrailers } from '../domain/interfaces/ITrailerService';

interface ITrailersOptions {
  query?: string;
  since?: string;
  keys?: boolean;
  json?: boolean;
  limit?: string;
}

export function trailersCommand(sha: string | undefined, options: ITrailersOptions, logger?: ILogger): void {
  const container = createContainer({ logger, scope: 'trailers' });
  const { trailerService, logger: log } = container.cradle;
  log.info('Command invoked', { sha, query: options.query, keys: options.keys });

  // --keys: list all distinct AI-* trailer keys in the repo
  if (options.keys) {
    const commits = trailerService.queryTrailers('AI-', { since: options.since });
    const keys = new Set<string>();
    for (const commit of commits) {
      for (const trailer of commit.trailers) {
        if (trailer.key.startsWith('AI-')) {
          keys.add(trailer.key);
        }
      }
    }

    if (keys.size === 0) {
      console.log('No AI-* trailer keys found.');
      return;
    }

    if (options.json) {
      console.log(JSON.stringify([...keys].sort(), null, 2));
      return;
    }

    console.log('AI-* trailer keys:\n');
    for (const key of [...keys].sort()) {
      console.log(`  ${key}`);
    }
    return;
  }

  // --query: search for a specific trailer key across history
  if (options.query) {
    const maxCount = options.limit ? Number(options.limit) : undefined;
    if (options.limit && (!Number.isInteger(maxCount) || (maxCount as number) <= 0)) {
      console.error(`Invalid --limit "${options.limit}". Expected a positive integer.`);
      process.exitCode = 1;
      return;
    }
    const commits = trailerService.queryTrailers(options.query, { since: options.since, maxCount });

    if (commits.length === 0) {
      console.log(`No commits found with trailer key matching "${options.query}".`);
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(commits, null, 2));
      return;
    }

    formatCommitTrailers(commits);
    return;
  }

  // Default: show trailers on HEAD or specific commit
  const ref = sha || 'HEAD';
  const trailers = trailerService.readTrailers(ref);

  if (trailers.length === 0) {
    console.log(`No AI-* trailers on ${ref}.`);
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(trailers, null, 2));
    return;
  }

  for (const trailer of trailers) {
    console.log(`${trailer.key}: ${trailer.value}`);
  }
}

function formatCommitTrailers(commits: ICommitTrailers[]): void {
  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    console.log(`commit ${commit.sha}`);
    for (const trailer of commit.trailers) {
      console.log(`${trailer.key}: ${trailer.value}`);
    }
    if (i < commits.length - 1) {
      console.log();
    }
  }
}
