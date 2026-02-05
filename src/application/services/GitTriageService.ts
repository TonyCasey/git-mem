/**
 * GitTriageService
 *
 * Application service that scans git history and scores commits
 * for "interestingness" to identify which commits warrant annotation.
 */

import type { IGitClient, IGitLogCommit, IGitCommitStatEntry } from '../../domain/interfaces/IGitClient';
import type {
  IGitTriageService,
  IGitCommitData,
  IGitCommitStats,
  ICommitInterestSignals,
  IScoredCommit,
  ITriageResult,
  ITriageOptions,
  IFileHotspot,
  ITagInfo,
} from '../../domain/interfaces/IGitTriageService';

const DEFAULT_THRESHOLD = 3;
const DEFAULT_DAYS = 90;

const CONVENTIONAL_PREFIXES = [
  'feat', 'fix', 'refactor', 'docs', 'test',
  'chore', 'style', 'perf', 'ci', 'build', 'revert',
] as const;

const CONVENTIONAL_COMMIT_REGEX = new RegExp(
  `^(${CONVENTIONAL_PREFIXES.join('|')})(\\(.+\\))?[!]?:`,
  'i'
);

const DECISION_KEYWORDS = [
  'migrate', 'replace', 'rewrite', 'deprecate', 'breaking',
  'workaround', 'decision', 'architecture', 'redesign', 'overhaul',
] as const;

const SCORES = {
  largeDiffFiles: 3,
  largeDiffLines: 2,
  mergeCommitWithPR: 3,
  conventionalPrefix: 1,
  decisionKeywords: 2,
  createsNewDirectory: 2,
  tagAdjacent: 2,
  longMessageBody: 1,
} as const;

const TAG_ADJACENT_DISTANCE = 3;
const STAT_FETCH_MARGIN = 2;

export class GitTriageService implements IGitTriageService {
  constructor(private readonly git: IGitClient) {}

  async triage(options?: ITriageOptions): Promise<ITriageResult> {
    const startTime = Date.now();
    const threshold = options?.threshold ?? DEFAULT_THRESHOLD;
    const cwd = options?.cwd;

    const since = options?.since ?? this.getDefaultSince();
    const until = options?.until ?? new Date();

    const tags = this.git.listTags(cwd);
    const tagShas = new Set(tags.map(t => t.sha));
    const tagInfo: ITagInfo[] = tags.map(t => ({
      name: t.name,
      sha: t.sha,
      isVersionTag: this.isVersionTag(t.name),
    }));

    const rawCommits = this.git.logDetailed({
      since: since.toISOString(),
      until: until.toISOString(),
      maxCount: options?.maxCommits,
      cwd,
    });

    if (rawCommits.length === 0) {
      return this.emptyResult(startTime, tagInfo);
    }

    const shaToPosition = new Map<string, number>();
    for (let i = 0; i < rawCommits.length; i++) {
      shaToPosition.set(rawCommits[i].sha, i);
    }

    const tagPositions = new Set<number>();
    for (const tag of tags) {
      const pos = shaToPosition.get(tag.sha);
      if (pos !== undefined) {
        for (let i = Math.max(0, pos - TAG_ADJACENT_DISTANCE); i <= pos + TAG_ADJACENT_DISTANCE; i++) {
          tagPositions.add(i);
        }
      }
    }

    const fileStats = new Map<string, { commits: number; lines: number }>();
    const scoredCommits: IScoredCommit[] = [];
    const belowThreshold: IScoredCommit[] = [];
    const minorInterest: IScoredCommit[] = [];

    for (let i = 0; i < rawCommits.length; i++) {
      const raw = rawCommits[i];
      const commit = this.parseCommit(raw);
      const isTagAdjacent = tagPositions.has(i);

      const quickSignals = this.detectSignals(commit, null, tagShas, isTagAdjacent);
      const quickScore = this.calculateScore(quickSignals);

      let stats: IGitCommitStats | null = null;
      let finalSignals = quickSignals;
      let finalScore = quickScore;

      if (quickScore >= threshold - STAT_FETCH_MARGIN || options?.fetchAllStats) {
        const rawStats = this.git.getCommitStats(commit.sha, cwd);
        stats = this.parseStats(rawStats);

        finalSignals = this.detectSignals(commit, stats, tagShas, isTagAdjacent);
        finalScore = this.calculateScore(finalSignals);

        for (const entry of rawStats) {
          const existing = fileStats.get(entry.path) ?? { commits: 0, lines: 0 };
          existing.commits++;
          existing.lines += (entry.added ?? 0) + (entry.deleted ?? 0);
          fileStats.set(entry.path, existing);
        }
      }

      const scored: IScoredCommit = {
        commit,
        stats,
        signals: finalSignals,
        score: finalScore,
        passedTriage: finalScore >= threshold,
      };

      if (finalScore >= threshold) {
        scoredCommits.push(scored);
      } else if (finalScore > 0) {
        minorInterest.push(scored);
      } else {
        belowThreshold.push(scored);
      }
    }

    scoredCommits.sort((a, b) => b.score - a.score);

    const hotspots: IFileHotspot[] = Array.from(fileStats.entries())
      .map(([path, data]) => ({
        path,
        commitCount: data.commits,
        totalLinesChanged: data.lines,
      }))
      .sort((a, b) => b.commitCount - a.commitCount || b.totalLinesChanged - a.totalLinesChanged)
      .slice(0, 20);

    const linkedToPRs = scoredCommits.filter(s => s.signals.prNumber !== null).length;
    const linkedToTags = scoredCommits.filter(s => s.signals.isTagAdjacent).length;

    return {
      totalCommits: rawCommits.length,
      belowThreshold: belowThreshold.length,
      minorInterest: minorInterest.length,
      highInterest: scoredCommits,
      linkedToPRs,
      linkedToTags,
      hotspots,
      tags: tagInfo,
      durationMs: Date.now() - startTime,
    };
  }

  scoreCommit(
    commit: IGitCommitData,
    stats: IGitCommitStats | null,
    tagShas: ReadonlySet<string>,
    isTagAdjacent?: boolean
  ): IScoredCommit {
    const tagAdjacent = isTagAdjacent ?? tagShas.has(commit.sha);
    const signals = this.detectSignals(commit, stats, tagShas, tagAdjacent);
    const score = this.calculateScore(signals);

    return {
      commit,
      stats,
      signals,
      score,
      passedTriage: score >= DEFAULT_THRESHOLD,
    };
  }

  private parseCommit(raw: IGitLogCommit): IGitCommitData {
    const refs = raw.refNames
      .split(',')
      .map(r => r.trim())
      .filter(r => r && r !== 'HEAD');

    return {
      sha: raw.sha,
      shortSha: raw.shortSha,
      subject: raw.subject,
      body: raw.body,
      parentCount: raw.parentShas.length,
      author: raw.authorName,
      authorEmail: raw.authorEmail,
      timestamp: new Date(raw.authorTimestamp * 1000),
      refs,
    };
  }

  private parseStats(entries: readonly IGitCommitStatEntry[]): IGitCommitStats {
    let insertions = 0;
    let deletions = 0;
    const filesAdded: string[] = [];
    const filesDeleted: string[] = [];
    const directories = new Set<string>();

    for (const entry of entries) {
      insertions += entry.added ?? 0;
      deletions += entry.deleted ?? 0;

      if (entry.isNew) {
        filesAdded.push(entry.path);
        const dir = entry.path.split('/')[0];
        if (dir && dir !== entry.path) {
          directories.add(dir);
        }
      }

      if (entry.isDeleted) {
        filesDeleted.push(entry.path);
      }
    }

    return {
      filesChanged: entries.length,
      insertions,
      deletions,
      filesAdded,
      filesDeleted,
      directoriesCreated: Array.from(directories),
    };
  }

  private detectSignals(
    commit: IGitCommitData,
    stats: IGitCommitStats | null,
    _tagShas: ReadonlySet<string>,
    isTagAdjacent: boolean
  ): ICommitInterestSignals {
    const largeDiffFiles = stats !== null && stats.filesChanged >= 10;
    const largeDiffLines = stats !== null && (stats.insertions + stats.deletions) >= 500;

    const prMatch = commit.subject.match(/Merge pull request #(\d+)/i)
      ?? commit.subject.match(/\(#(\d+)\)/)
      ?? commit.body.match(/PR[:\s#]+(\d+)/i);
    const prNumber = prMatch ? parseInt(prMatch[1], 10) : null;
    const mergeCommitWithPR = commit.parentCount >= 2 && prNumber !== null;

    const conventionalMatch = commit.subject.match(CONVENTIONAL_COMMIT_REGEX);
    const hasConventionalPrefix = conventionalMatch !== null;
    const conventionalType = conventionalMatch ? conventionalMatch[1].toLowerCase() : null;

    const messageText = `${commit.subject} ${commit.body}`.toLowerCase();
    const hasDecisionKeywords = DECISION_KEYWORDS.some(kw => messageText.includes(kw));

    const createsNewDirectory = stats !== null && stats.directoriesCreated.length > 0;
    const hasLongMessageBody = commit.body.split('\n').filter(l => l.trim()).length >= 2;

    return {
      largeDiffFiles,
      largeDiffLines,
      mergeCommitWithPR,
      hasConventionalPrefix,
      conventionalType,
      hasDecisionKeywords,
      createsNewDirectory,
      isTagAdjacent,
      hasLongMessageBody,
      prNumber,
    };
  }

  private calculateScore(signals: ICommitInterestSignals): number {
    let score = 0;
    if (signals.largeDiffFiles) score += SCORES.largeDiffFiles;
    if (signals.largeDiffLines) score += SCORES.largeDiffLines;
    if (signals.mergeCommitWithPR) score += SCORES.mergeCommitWithPR;
    if (signals.hasConventionalPrefix) score += SCORES.conventionalPrefix;
    if (signals.hasDecisionKeywords) score += SCORES.decisionKeywords;
    if (signals.createsNewDirectory) score += SCORES.createsNewDirectory;
    if (signals.isTagAdjacent) score += SCORES.tagAdjacent;
    if (signals.hasLongMessageBody) score += SCORES.longMessageBody;
    return score;
  }

  private getDefaultSince(): Date {
    const date = new Date();
    date.setDate(date.getDate() - DEFAULT_DAYS);
    return date;
  }

  private isVersionTag(name: string): boolean {
    return /^v?\d+\.\d+(\.\d+)?/.test(name);
  }

  private emptyResult(startTime: number, tags: readonly ITagInfo[]): ITriageResult {
    return {
      totalCommits: 0,
      belowThreshold: 0,
      minorInterest: 0,
      highInterest: [],
      linkedToPRs: 0,
      linkedToTags: 0,
      hotspots: [],
      tags,
      durationMs: Date.now() - startTime,
    };
  }
}
