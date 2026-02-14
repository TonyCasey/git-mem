/**
 * TagInference
 *
 * Utilities for inferring tags from commit metadata:
 * - Conventional commit scope
 * - File paths (domain keywords)
 * - Pattern matches
 */

import type { IPatternMatch } from '../../infrastructure/services/patterns/HeuristicPatterns';

/**
 * Known domain keywords that indicate meaningful tags.
 * Extracted from common directory names in codebases.
 */
export const KNOWN_DOMAINS: readonly string[] = [
  // API/Backend
  'api', 'rest', 'graphql', 'grpc', 'rpc',
  // Auth
  'auth', 'oauth', 'jwt', 'session', 'login', 'sso',
  // Data
  'database', 'db', 'sql', 'nosql', 'redis', 'cache', 'storage',
  // Messaging
  'queue', 'events', 'pubsub', 'kafka', 'rabbitmq', 'messaging',
  // Frontend
  'ui', 'frontend', 'web', 'mobile', 'components', 'views', 'pages',
  // Backend
  'backend', 'server', 'services', 'handlers', 'controllers',
  // Infrastructure
  'infra', 'infrastructure', 'ci', 'cd', 'deploy', 'docker', 'k8s', 'kubernetes',
  // Testing
  'test', 'tests', 'spec', 'e2e', 'integration', 'unit',
  // Configuration
  'config', 'settings', 'env', 'environment',
  // Architecture
  'middleware', 'hooks', 'plugins', 'utils', 'helpers', 'lib',
  // Domain-specific
  'domain', 'entities', 'models', 'schemas', 'types',
  // Application
  'application', 'commands', 'queries', 'usecases',
  // MCP/AI
  'mcp', 'tools', 'prompts', 'llm', 'ai',
];

/**
 * Check if a path component is a known domain keyword.
 */
export function isKnownDomain(part: string): boolean {
  return KNOWN_DOMAINS.includes(part.toLowerCase());
}

/**
 * Extract meaningful directory names from file paths.
 * Filters to only known domain keywords to avoid noise.
 */
export function extractDomainsFromPaths(files: readonly string[]): string[] {
  const domains = new Set<string>();

  for (const file of files) {
    const parts = file.split('/');
    for (const part of parts) {
      const normalized = part.toLowerCase();
      // Skip common non-meaningful directories
      if (normalized === 'src' || normalized === 'dist' || normalized === 'node_modules') {
        continue;
      }
      if (isKnownDomain(normalized)) {
        domains.add(normalized);
      }
    }
  }

  return Array.from(domains);
}

/**
 * Extract file extension indicators as potential tags.
 * Maps extensions to semantic tags.
 */
const EXTENSION_TAGS: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'react',
  '.jsx': 'react',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.md': 'docs',
  '.yml': 'config',
  '.yaml': 'config',
  '.json': 'config',
  '.dockerfile': 'docker',
};

/**
 * Extract language/framework tags from file extensions.
 */
export function extractLanguageTags(files: readonly string[]): string[] {
  const tags = new Set<string>();

  for (const file of files) {
    const ext = getExtension(file);
    const tag = EXTENSION_TAGS[ext];
    if (tag) {
      tags.add(tag);
    }
  }

  return Array.from(tags);
}

/**
 * Get file extension including the dot.
 */
function getExtension(file: string): string {
  const basename = file.split('/').pop() || '';
  // Handle special cases like Dockerfile
  if (basename.toLowerCase() === 'dockerfile') {
    return '.dockerfile';
  }
  const dotIndex = basename.lastIndexOf('.');
  if (dotIndex === -1) return '';
  return basename.slice(dotIndex).toLowerCase();
}

/**
 * Infer tags from all available sources.
 *
 * @param scope - Conventional commit scope (e.g., 'auth')
 * @param files - Staged file paths
 * @param patterns - Pattern matches from HeuristicPatterns
 * @returns Deduplicated array of inferred tags
 */
export function inferTags(
  scope: string | null,
  files: readonly string[],
  patterns: readonly IPatternMatch[]
): string[] {
  const tags = new Set<string>();

  // 1. From conventional commit scope
  if (scope) {
    tags.add(scope.toLowerCase());
  }

  // 2. From file paths (domain keywords)
  for (const domain of extractDomainsFromPaths(files)) {
    tags.add(domain);
  }

  // 3. From pattern matches (prefix with pattern:)
  for (const pattern of patterns) {
    tags.add(`pattern:${pattern.patternName}`);
  }

  // 4. Optionally add language tags if few other tags
  // (to avoid noise when we have good domain tags)
  if (tags.size < 3) {
    for (const langTag of extractLanguageTags(files)) {
      tags.add(langTag);
    }
  }

  return Array.from(tags).slice(0, 10); // Limit to 10 tags
}
