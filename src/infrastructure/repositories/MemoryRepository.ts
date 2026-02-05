/**
 * MemoryRepository
 *
 * Notes-backed implementation of IMemoryRepository.
 * Stores memories as JSON in git notes (refs/notes/mem).
 */

import { randomUUID } from 'crypto';
import type {
  IMemoryRepository,
  IMemoryQueryOptions,
  IMemoryQueryResult,
} from '../../domain/interfaces/IMemoryRepository';
import type {
  IMemoryEntity,
  ICreateMemoryOptions,
} from '../../domain/entities/IMemoryEntity';
import type { INotesService } from '../../domain/interfaces/INotesService';
import { DEFAULT_NOTES_REF } from '../../domain/interfaces/INotesService';

/**
 * A note can contain multiple memories as a JSON array.
 */
interface INotesPayload {
  memories: IMemoryEntity[];
}

export class MemoryRepository implements IMemoryRepository {
  constructor(private readonly notesService: INotesService) {}

  create(content: string, options?: ICreateMemoryOptions): IMemoryEntity {
    const sha = options?.sha || 'HEAD';
    const cwd = options?.cwd;
    const now = new Date().toISOString();

    const tags = this.parseTags(options?.tags);

    const memory: IMemoryEntity = {
      id: randomUUID(),
      content,
      type: options?.type || 'fact',
      sha,
      confidence: options?.confidence || 'high',
      source: options?.source || 'user-explicit',
      lifecycle: options?.lifecycle || 'project',
      tags,
      createdAt: now,
      updatedAt: now,
    };

    // Read existing note, append memory to array
    const existing = this.readPayload(sha, cwd);
    existing.memories.push(memory);
    this.writePayload(sha, existing, cwd);

    return memory;
  }

  getById(id: string, cwd?: string): IMemoryEntity | null {
    const entries = this.notesService.list(DEFAULT_NOTES_REF, cwd);

    for (const entry of entries) {
      const payload = this.readPayload(entry.objectSha, cwd);
      const found = payload.memories.find(m => m.id === id);
      if (found) return found;
    }

    return null;
  }

  query(options?: IMemoryQueryOptions): IMemoryQueryResult {
    const entries = this.notesService.list(DEFAULT_NOTES_REF, options?.cwd);
    const allMemories: IMemoryEntity[] = [];

    for (const entry of entries) {
      const payload = this.readPayload(entry.objectSha, options?.cwd);
      allMemories.push(...payload.memories);
    }

    // Apply filters
    let filtered = allMemories;

    if (options?.type) {
      filtered = filtered.filter(m => m.type === options.type);
    }

    if (options?.tag) {
      filtered = filtered.filter(m => m.tags.includes(options.tag!));
    }

    if (options?.since) {
      const sinceDate = new Date(options.since);
      filtered = filtered.filter(m => new Date(m.createdAt) >= sinceDate);
    }

    if (options?.query) {
      const q = options.query.toLowerCase();
      filtered = filtered.filter(m =>
        m.content.toLowerCase().includes(q) ||
        m.tags.some(t => t.toLowerCase().includes(q))
      );
    }

    // Sort by creation date descending
    filtered.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const total = filtered.length;
    const limit = options?.limit || 10;
    const memories = filtered.slice(0, limit);

    return { memories, total };
  }

  delete(id: string, cwd?: string): boolean {
    const entries = this.notesService.list(DEFAULT_NOTES_REF, cwd);

    for (const entry of entries) {
      const payload = this.readPayload(entry.objectSha, cwd);
      const index = payload.memories.findIndex(m => m.id === id);

      if (index !== -1) {
        payload.memories.splice(index, 1);

        if (payload.memories.length === 0) {
          // Remove the note entirely if no memories left
          this.notesService.remove(entry.objectSha, DEFAULT_NOTES_REF, cwd);
        } else {
          this.writePayload(entry.objectSha, payload, cwd);
        }
        return true;
      }
    }

    return false;
  }

  private readPayload(objectSha: string, cwd?: string): INotesPayload {
    const raw = this.notesService.read(objectSha, DEFAULT_NOTES_REF, cwd);
    if (!raw) return { memories: [] };

    try {
      const parsed = JSON.parse(raw);
      // Support both array format and wrapped format
      if (Array.isArray(parsed)) {
        return { memories: parsed };
      }
      if (parsed.memories && Array.isArray(parsed.memories)) {
        return parsed;
      }
      // Single memory object
      return { memories: [parsed] };
    } catch {
      return { memories: [] };
    }
  }

  private writePayload(objectSha: string, payload: INotesPayload, cwd?: string): void {
    const json = JSON.stringify(payload, null, 2);
    this.notesService.write(objectSha, json, DEFAULT_NOTES_REF, cwd);
  }

  private parseTags(tags?: string | readonly string[]): string[] {
    if (!tags) return [];
    if (typeof tags === 'string') {
      return tags.split(',').map(t => t.trim()).filter(Boolean);
    }
    return [...tags];
  }
}
