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

export class ContextFormatter implements IContextFormatter {
  format(memories: readonly IMemoryEntity[], options?: IFormatOptions): string {
    if (memories.length === 0) {
      return '';
    }

    const sections: string[] = [];
    sections.push('# Git-mem: Project Memory');

    if (options?.trigger) {
      sections.push(`Session: ${options.trigger}`);
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
      }
      sections.push('');
    }

    if (options?.includeStats) {
      sections.push(`Loaded ${memories.length} memories.`);
    }

    let output = sections.join('\n').trimEnd();

    if (options?.maxLength && output.length > options.maxLength) {
      output = output.slice(0, options.maxLength - 3) + '...';
    }

    return output;
  }
}
