/**
 * init command handler
 *
 * Unified setup: hooks, MCP config, .gitignore, .env check, and optional extract.
 * Replaces separate init-hooks and init-mcp commands.
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { join } from 'path';
import prompts from 'prompts';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { ILogger } from '../domain/interfaces/ILogger';
import {
  getSettingsPath,
  readExistingSettings,
  buildHooksConfig,
  buildGitMemConfig,
  mergeHooksConfig,
  deepMergeGitMemConfig,
} from './init-hooks';
import { buildMcpConfig } from './init-mcp';
import { installHook, uninstallHook } from '../hooks/prepare-commit-msg';
import { installPostCommitHook, uninstallPostCommitHook } from '../hooks/post-commit';
import { installCommitMsgHook, uninstallCommitMsgHook } from '../hooks/commit-msg';
import { createContainer } from '../infrastructure/di';
import { createStderrProgressHandler } from './progress';
import { getConfigPath, getConfigDir } from '../hooks/utils/config';

interface IInitCommandOptions {
  yes?: boolean;
  uninstallHooks?: boolean;
  extract?: boolean;
  commitCount?: number;
}

// ── Pure helpers (exported for testing) ──────────────────────────────

/**
 * Ensure entries exist in .gitignore under a `# git-mem` header.
 * Creates the file if it doesn't exist. Reuses existing header on re-runs.
 */
export function ensureGitignoreEntries(cwd: string, entries: string[]): void {
  const gitignorePath = join(cwd, '.gitignore');
  let content = '';

  if (existsSync(gitignorePath)) {
    content = readFileSync(gitignorePath, 'utf8');
  }

  const lines = content.split('\n');
  const missing = entries.filter((entry) => !lines.some((line) => line.trim() === entry));

  if (missing.length === 0) return;

  const hasGitMemHeader = lines.some((line) => line.trim() === '# git-mem');

  if (content.length === 0) {
    // New file
    writeFileSync(gitignorePath, '# git-mem\n' + missing.map((e) => e + '\n').join(''));
    return;
  }

  // Ensure trailing newline before appending
  let append = '';
  if (!content.endsWith('\n')) {
    append += '\n';
  }

  if (!hasGitMemHeader) {
    append += '\n# git-mem\n';
  }

  for (const entry of missing) {
    append += entry + '\n';
  }

  appendFileSync(gitignorePath, append);
}

/**
 * Configure git to push notes automatically with regular pushes.
 * Adds refs/notes/* to existing push refspecs, preserving any user-configured refspecs.
 * Idempotent - safe to call multiple times.
 */
export function configureNotesPush(cwd: string): void {
  let existingRefspecs: string[] = [];

  try {
    // Get existing push refspecs
    const existing = execFileSync('git', ['config', '--local', '--get-all', 'remote.origin.push'], {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (existing) {
      existingRefspecs = existing.split('\n').filter(Boolean);
    }

    // Already has notes configured - nothing to do
    if (existingRefspecs.some((ref) => ref.includes('refs/notes'))) {
      return;
    }
  } catch {
    // Config doesn't exist yet, proceed to set it
  }

  // If no existing refspecs, add heads first
  if (existingRefspecs.length === 0) {
    execFileSync('git', ['config', '--local', 'remote.origin.push', '+refs/heads/*:refs/heads/*'], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  // Add notes refspec (preserves existing refspecs)
  execFileSync('git', ['config', '--local', '--add', 'remote.origin.push', '+refs/notes/*:refs/notes/*'], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/**
 * Read ANTHROPIC_API_KEY value from .env file.
 * Returns the value if set, null otherwise.
 */
export function readEnvApiKey(cwd: string): string | null {
  const envPath = join(cwd, '.env');
  if (!existsSync(envPath)) return null;

  const content = readFileSync(envPath, 'utf8');
  const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
  if (!match) return null;

  const value = match[1].trim();
  return value.length > 0 ? value : null;
}

/**
 * Ensure .env has an ANTHROPIC_API_KEY= placeholder.
 * Creates .env if it doesn't exist.
 */
export function ensureEnvPlaceholder(cwd: string): void {
  const envPath = join(cwd, '.env');

  if (!existsSync(envPath)) {
    writeFileSync(envPath, 'ANTHROPIC_API_KEY=\n');
    return;
  }

  const content = readFileSync(envPath, 'utf8');
  if (/^ANTHROPIC_API_KEY=/m.test(content)) return;

  const suffix = content.endsWith('\n') ? '' : '\n';
  appendFileSync(envPath, suffix + 'ANTHROPIC_API_KEY=\n');
}

// ── Main command ─────────────────────────────────────────────────────

/** Run unified project setup: hooks, MCP config, .gitignore, and .env. */
export async function initCommand(options: IInitCommandOptions, logger?: ILogger): Promise<void> {
  const log = logger?.child({ command: 'init' });
  const cwd = process.cwd();

  log?.info('Command invoked', { yes: options.yes, uninstallHooks: options.uninstallHooks });

  // ── Git hook uninstall (early exit) ─────────────────────────────
  if (options.uninstallHooks) {
    const removedPrepare = uninstallHook(cwd);
    const removedPost = uninstallPostCommitHook(cwd);
    const removedCommitMsg = uninstallCommitMsgHook(cwd);

    if (removedPrepare) {
      console.log('✓ Removed prepare-commit-msg hook');
    }
    if (removedPost) {
      console.log('✓ Removed post-commit hook');
    }
    if (removedCommitMsg) {
      console.log('✓ Removed commit-msg hook');
    }
    if (!removedPrepare && !removedPost && !removedCommitMsg) {
      console.log('No git-mem hooks found.');
    }
    return;
  }

  // ── Prompts (skipped with --yes) ───────────────────────────────
  let claudeIntegration = true;
  let runExtract = options.extract ?? false;
  let commitCount = options.commitCount ?? 10;

  // Validate commitCount (parseInt returns NaN for invalid input)
  if (Number.isNaN(commitCount) || commitCount < 1) {
    commitCount = 10;
  }

  if (!options.yes) {
    const response = await prompts([
      {
        type: 'confirm',
        name: 'claudeIntegration',
        message: 'Integrate with Claude Code?',
        initial: true,
      },
      {
        type: 'confirm',
        name: 'runExtract',
        message: 'Extract knowledge from commit history?',
        initial: false,
      },
      {
        type: (prev) => prev ? 'select' : null,
        name: 'commitCount',
        message: 'How many commits to extract?',
        choices: [
          { title: '10', value: 10 },
          { title: '30', value: 30 },
          { title: '50', value: 50 },
        ],
        initial: 0,
      },
    ], {
      onCancel: () => {
        console.log('\nSetup cancelled.');
        process.exit(0);
      },
    });

    claudeIntegration = response.claudeIntegration ?? true;
    runExtract = response.runExtract ?? false;
    commitCount = response.commitCount ?? 10;
  }

  // ── Claude Code hooks ──────────────────────────────────────────
  if (claudeIntegration) {
    const settingsPath = getSettingsPath('project');
    const settingsDir = join(settingsPath, '..');
    if (!existsSync(settingsDir)) {
      mkdirSync(settingsDir, { recursive: true });
    }

    const settings = readExistingSettings(settingsPath);
    const existingHooks = (settings.hooks ?? {}) as Record<string, unknown>;
    settings.hooks = mergeHooksConfig(existingHooks, buildHooksConfig());
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    console.log(`✓ Created ${settingsPath}`);

    // .git-mem/.git-mem.yaml
    const configDir = getConfigDir(cwd);
    const configPath = getConfigPath(cwd);
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    const existingGitMemConfig = existsSync(configPath)
      ? (() => { try { return parseYaml(readFileSync(configPath, 'utf8')) as Record<string, unknown>; } catch { return {}; } })()
      : {};
    const mergedGitMemConfig = deepMergeGitMemConfig(existingGitMemConfig, buildGitMemConfig());
    writeFileSync(configPath, stringifyYaml(mergedGitMemConfig));
    console.log('✓ Created .git-mem/.git-mem.yaml');
  }

  // ── Git hooks (prepare-commit-msg, commit-msg, post-commit) ─────
  // Always install hooks during init (core functionality)
  {
    const prepareResult = installHook(cwd);
    if (prepareResult.installed) {
      console.log(`✓ Installed prepare-commit-msg hook${prepareResult.wrapped ? ' (wrapped existing hook)' : ''}`);
    } else {
      console.log('✓ prepare-commit-msg hook already installed (skipped)');
    }

    const commitMsgResult = installCommitMsgHook(cwd);
    if (commitMsgResult.installed) {
      console.log(`✓ Installed commit-msg hook${commitMsgResult.wrapped ? ' (wrapped existing hook)' : ''}`);
    } else {
      console.log('✓ commit-msg hook already installed (skipped)');
    }

    const postResult = installPostCommitHook(cwd);
    if (postResult.installed) {
      console.log(`✓ Installed post-commit hook${postResult.wrapped ? ' (wrapped existing hook)' : ''}`);
    } else {
      console.log('✓ post-commit hook already installed (skipped)');
    }

    // Configure git to push notes automatically with regular pushes
    configureNotesPush(cwd);
    console.log('✓ Configured git to push notes with commits');
  }

  // ── MCP config (skip if already exists) ────────────────────────
  const mcpPath = join(cwd, '.mcp.json');
  if (existsSync(mcpPath)) {
    console.log('✓ .mcp.json already exists (skipped)');
  } else {
    const mcpConfig = buildMcpConfig();
    writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n');
    console.log('✓ Created .mcp.json');
  }

  // ── .gitignore ─────────────────────────────────────────────────
  ensureGitignoreEntries(cwd, ['.env', '.git-mem/']);
  console.log('✓ Updated .gitignore');

  // ── .env placeholder ──────────────────────────────────────────
  ensureEnvPlaceholder(cwd);
  console.log('✓ Ensured ANTHROPIC_API_KEY placeholder in .env');

  // ── Extract from history ─────────────────────────────────────
  if (runExtract) {
    const apiKey = readEnvApiKey(cwd);
    const enrich = !!apiKey;

    if (enrich) {
      process.env.ANTHROPIC_API_KEY = apiKey;
      console.log(`\nExtracting knowledge from ${commitCount} commits with LLM enrichment...`);
    } else {
      console.log(`\nExtracting knowledge from ${commitCount} commits (heuristic only)...`);
    }

    const container = createContainer({ logger, scope: 'init', enrich });
    const { extractService } = container.cradle;

    const result = await extractService.extract({
      maxCommits: commitCount,
      enrich,
      onProgress: createStderrProgressHandler(),
    });

    console.log(
      `Commits scanned: ${result.commitsScanned}  |  ` +
      `Annotated: ${result.commitsAnnotated}  |  ` +
      `Facts: ${result.factsExtracted}  |  ` +
      `Duration: ${result.durationMs}ms`,
    );

    if (!enrich) {
      console.log('\nFor a deeper AI summary of each commit, add your ANTHROPIC_API_KEY to .env and run:');
      console.log('  git-mem extract --enrich');
    }
  }
}
