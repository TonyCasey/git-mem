/**
 * NotesService
 *
 * Infrastructure implementation of INotesService.
 * Reads and writes structured JSON notes in refs/notes/mem via git CLI.
 */

import { execFileSync } from 'child_process';
import type {
  INotesService,
  INoteEntry,
} from '../../domain/interfaces/INotesService';
import { DEFAULT_NOTES_REF } from '../../domain/interfaces/INotesService';

export class NotesService implements INotesService {
  read(objectSha: string, ref?: string, cwd?: string): string | null {
    const notesRef = ref || DEFAULT_NOTES_REF;
    try {
      const output = execFileSync(
        'git',
        ['notes', `--ref=${notesRef}`, 'show', objectSha],
        {
          encoding: 'utf8',
          cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      ).trim();

      return output || null;
    } catch {
      return null;
    }
  }

  write(objectSha: string, content: string, ref?: string, cwd?: string): void {
    const notesRef = ref || DEFAULT_NOTES_REF;
    // -f (force) overwrites any existing note
    execFileSync(
      'git',
      ['notes', `--ref=${notesRef}`, 'add', '-f', '-m', content, objectSha],
      {
        encoding: 'utf8',
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
  }

  append(objectSha: string, content: string, ref?: string, cwd?: string): void {
    const notesRef = ref || DEFAULT_NOTES_REF;
    execFileSync(
      'git',
      ['notes', `--ref=${notesRef}`, 'append', '-m', content, objectSha],
      {
        encoding: 'utf8',
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
  }

  remove(objectSha: string, ref?: string, cwd?: string): void {
    const notesRef = ref || DEFAULT_NOTES_REF;
    try {
      execFileSync(
        'git',
        ['notes', `--ref=${notesRef}`, 'remove', objectSha],
        {
          encoding: 'utf8',
          cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );
    } catch {
      // Ignore if note doesn't exist
    }
  }

  list(ref?: string, cwd?: string): INoteEntry[] {
    const notesRef = ref || DEFAULT_NOTES_REF;
    try {
      const output = execFileSync(
        'git',
        ['notes', `--ref=${notesRef}`, 'list'],
        {
          encoding: 'utf8',
          cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      ).trim();

      if (!output) return [];

      // Format: <note-sha> <object-sha>
      return output.split('\n').filter(line => line.trim()).map(line => {
        const parts = line.split(' ');
        return {
          noteSha: parts[0] || '',
          objectSha: parts[1] || '',
        };
      });
    } catch {
      return [];
    }
  }
}
