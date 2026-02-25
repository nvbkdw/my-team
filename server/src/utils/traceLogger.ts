import fs from 'node:fs';
import path from 'node:path';

const TRACE_DIR = path.resolve(import.meta.dirname, '../../data/traces');

const MAX_TOOL_INPUT_LEN = 10_000;
const MAX_TOOL_RESULT_LEN = 10_000;
const MAX_MESSAGE_LEN = 2_000;

export type TraceEntryType =
  | 'run_start'
  | 'system_init'
  | 'user_message'
  | 'assistant_text'
  | 'tool_use'
  | 'tool_result'
  | 'run_end'
  | 'error'
  | 'abort'
  | 'status_change'
  | 'files_changed';

export interface TraceEntry {
  ts: string;
  run: number;
  type: TraceEntryType;
  [key: string]: unknown;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '...[truncated]' : s;
}

export class TraceLogger {
  private stream: fs.WriteStream;
  private run: number;

  constructor(cardId: string) {
    fs.mkdirSync(TRACE_DIR, { recursive: true });

    const filePath = path.join(TRACE_DIR, `card-${cardId}.jsonl`);
    this.run = this.determineRunNumber(filePath);
    this.stream = fs.createWriteStream(filePath, { flags: 'a' });
  }

  private determineRunNumber(filePath: string): number {
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      const lines = data.trim().split('\n').filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const entry = JSON.parse(lines[i]) as TraceEntry;
          if (typeof entry.run === 'number') return entry.run;
        } catch { /* skip malformed lines */ }
      }
    } catch { /* file doesn't exist yet */ }
    return 0;
  }

  private write(entry: TraceEntry): void {
    this.stream.write(JSON.stringify(entry) + '\n');
  }

  private ts(): string {
    return new Date().toISOString();
  }

  logRunStart(message: string): void {
    this.run++;
    this.write({
      ts: this.ts(),
      run: this.run,
      type: 'run_start',
      message: truncate(message, MAX_MESSAGE_LEN),
    });
  }

  logSystemInit(sessionId: string, model: string, tools: string[]): void {
    this.write({
      ts: this.ts(),
      run: this.run,
      type: 'system_init',
      sessionId,
      model,
      tools,
    });
  }

  logUserMessage(message: string): void {
    this.write({
      ts: this.ts(),
      run: this.run,
      type: 'user_message',
      message: truncate(message, MAX_MESSAGE_LEN),
    });
  }

  logAssistantText(text: string): void {
    this.write({
      ts: this.ts(),
      run: this.run,
      type: 'assistant_text',
      text: truncate(text, MAX_MESSAGE_LEN),
    });
  }

  logToolUse(name: string, toolUseId: string, input: unknown): void {
    const inputStr = typeof input === 'string' ? input : JSON.stringify(input);
    this.write({
      ts: this.ts(),
      run: this.run,
      type: 'tool_use',
      name,
      toolUseId,
      input: truncate(inputStr, MAX_TOOL_INPUT_LEN),
    });
  }

  logToolResult(name: string, toolUseId: string, result: string): void {
    this.write({
      ts: this.ts(),
      run: this.run,
      type: 'tool_result',
      name,
      toolUseId,
      result: truncate(result, MAX_TOOL_RESULT_LEN),
    });
  }

  logRunEnd(costUsd: number, numTurns: number, durationMs: number): void {
    this.write({
      ts: this.ts(),
      run: this.run,
      type: 'run_end',
      costUsd,
      numTurns,
      durationMs,
    });
  }

  logError(error: string): void {
    this.write({
      ts: this.ts(),
      run: this.run,
      type: 'error',
      error,
    });
  }

  logAbort(): void {
    this.write({
      ts: this.ts(),
      run: this.run,
      type: 'abort',
    });
  }

  logStatusChange(status: string): void {
    this.write({
      ts: this.ts(),
      run: this.run,
      type: 'status_change',
      status,
    });
  }

  logFilesChanged(files: string[]): void {
    this.write({
      ts: this.ts(),
      run: this.run,
      type: 'files_changed',
      files,
    });
  }

  close(): void {
    this.stream.end();
  }
}
