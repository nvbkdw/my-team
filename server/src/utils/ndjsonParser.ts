/**
 * Parses NDJSON (newline-delimited JSON) stream chunks.
 * Handles partial lines that arrive across chunk boundaries.
 */
export class NdjsonParser {
  private buffer = '';

  parse(chunk: string): unknown[] {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    // Keep the last (potentially incomplete) line in buffer
    this.buffer = lines.pop() ?? '';

    const results: unknown[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        results.push(JSON.parse(trimmed));
      } catch {
        // Skip malformed lines
      }
    }
    return results;
  }

  flush(): unknown[] {
    if (!this.buffer.trim()) return [];
    try {
      return [JSON.parse(this.buffer.trim())];
    } catch {
      return [];
    } finally {
      this.buffer = '';
    }
  }
}
