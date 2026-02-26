import fs from 'node:fs';
import path from 'node:path';

const SPEC_DIR = path.resolve(import.meta.dirname, '../../data/specs');

export function writeSpecFile(cardId: string, description: string): void {
  fs.mkdirSync(SPEC_DIR, { recursive: true });
  fs.writeFileSync(path.join(SPEC_DIR, `card-${cardId}.md`), description, 'utf-8');
}

export function readSpecFile(cardId: string): string | null {
  try {
    return fs.readFileSync(path.join(SPEC_DIR, `card-${cardId}.md`), 'utf-8');
  } catch {
    return null;
  }
}
