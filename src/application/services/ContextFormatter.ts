/**
 * ContextFormatter
 *
 * Formats memories as readable markdown for Claude Code's context window.
 * Groups memories by type and produces clean output.
 */

import type { IContextFormatter, IFormatOptions } from '../../domain/interfaces/IContextFormatter';
import type { IMemoryEntity, MemoryType } from '../../domain/entities/IMemoryEntity';

const TYPE_LABELS: Record<MemoryType, string> = {
  decision: 'Decisions',
  gotcha: 'Gotchas',
  convention: 'Conventions',
  fact: 'Facts',
};

const TYPE_ORDER: readonly MemoryType[] = ['decision', 'gotcha', 'convention', 'fact'];

const TRIGGER_MESSAGES: Record<string, string> = {
  startup: 'Session started.',
  resume: 'Session resumed.',
  compact: 'Session compacted.',
  clear: 'Session cleared.',
};

export class ContextFormatter implements IContextFormatter {
  format(memories: readonly IMemoryEntity[], options?: IFormatOptions): string {
    if (memories.length === 0) {
      return '';
    }

    const sections: string[] = [];
    sections.push('# Git-mem: Project Memory');

    if (options?.trigger) {
      sections.push(TRIGGER_MESSAGES[options.trigger] ?? `Session: ${options.trigger}`);
    }

    sections.push('');

    // Group memories by type
    const grouped = new Map<MemoryType, IMemoryEntity[]>();
    for (const memory of memories) {
      const existing = grouped.get(memory.type) ?? [];
      existing.push(memory);
      grouped.set(memory.type, existing);
    }

    // Output sections in defined order
    for (const type of TYPE_ORDER) {
      const items = grouped.get(type);
      if (!items || items.length === 0) continue;

      sections.push(`## ${TYPE_LABELS[type]} (${items.length})`);
      for (const item of items) {
        const date = item.createdAt.slice(0, 10); // YYYY-MM-DD
        sections.push(`- ${item.content} (${date})`);

        // Include commit message if available
        if (options?.commitMessages && item.sha) {
          const commit = options.commitMessages.get(item.sha);
          if (commit) {
            sections.push(`  > Commit: ${commit.subject}`);
            if (commit.body) {
              // Indent body lines and limit length
              const bodyLines = commit.body.split('\n').slice(0, 3); // Max 3 lines
              for (const line of bodyLines) {
                if (line.trim()) {
                  sections.push(`  > ${line.trim()}`);
                }
              }
            }
          }
        }
      }
      sections.push('');
    }

    if (options?.includeStats) {
      sections.push(`Loaded ${memories.length} memories.`);
    }

    let output = sections.join('\n').trimEnd();

    if (options?.maxLength && output.length > options.maxLength) {
      if (options.maxLength <= 3) {
        output = output.slice(0, options.maxLength);
      } else {
        output = output.slice(0, options.maxLength - 3) + '...';
      }
    }

    return output;
  }
}
