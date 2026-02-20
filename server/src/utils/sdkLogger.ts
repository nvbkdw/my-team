import fs from 'node:fs';
import path from 'node:path';

const LOG_DIR = path.resolve(import.meta.dirname, '../../data/logs');

/**
 * Per-run logger for Claude SDK interactions.
 * Writes human-readable logs per card to server/data/logs/.
 */
export class SdkLogger {
  private stream: fs.WriteStream;
  private cardId: string;
  private runIndex: number;

  constructor(cardId: string) {
    this.cardId = cardId;

    fs.mkdirSync(LOG_DIR, { recursive: true });

    // Determine run index by counting existing log files for this card
    const existing = fs.readdirSync(LOG_DIR).filter(
      (f) => f.startsWith(`card-${cardId}-`) && f.endsWith('.log')
    );
    this.runIndex = existing.length + 1;

    const filename = `card-${cardId}-run${String(this.runIndex).padStart(3, '0')}.log`;
    this.stream = fs.createWriteStream(path.join(LOG_DIR, filename), { flags: 'a' });
    this.write('=== SDK RUN START ===');
  }

  private ts(): string {
    return new Date().toISOString();
  }

  private write(line: string): void {
    this.stream.write(`[${this.ts()}] ${line}\n`);
  }

  logSystemInit(sessionId: string, model: string, tools: string[]): void {
    this.write(`SYSTEM INIT  session=${sessionId}  model=${model}`);
    this.write(`  tools: ${tools.join(', ')}`);
  }

  logUserPrompt(message: string): void {
    const preview = message.length > 500 ? message.slice(0, 500) + '...' : message;
    this.write(`USER PROMPT  ${preview}`);
  }

  logToken(text: string): void {
    // Tokens are high-frequency — write raw without timestamp prefix for compactness
    this.stream.write(text);
  }

  logTokenBoundary(): void {
    // Mark end of a streaming sequence with a newline
    this.stream.write('\n');
    this.write('--- end streaming tokens ---');
  }

  logToolUse(name: string, input: unknown): void {
    const inputStr = JSON.stringify(input, null, 2);
    const preview = inputStr.length > 1000 ? inputStr.slice(0, 1000) + '...' : inputStr;
    this.write(`TOOL USE  ${name}`);
    this.write(`  input: ${preview}`);
  }

  logToolResult(name: string, result: string): void {
    const preview = result.length > 1000 ? result.slice(0, 1000) + '...' : result;
    this.write(`TOOL RESULT  ${name}`);
    this.write(`  result: ${preview}`);
  }

  logAssistantText(text: string): void {
    const preview = text.length > 2000 ? text.slice(0, 2000) + '...' : text;
    this.write(`ASSISTANT TEXT  (${text.length} chars)`);
    this.write(`  ${preview}`);
  }

  logResult(subtype: string, costUsd: number, numTurns: number, durationMs: number): void {
    this.write(`RESULT  subtype=${subtype}  cost=$${costUsd.toFixed(4)}  turns=${numTurns}  duration=${(durationMs / 1000).toFixed(1)}s`);
  }

  logError(error: string): void {
    this.write(`ERROR  ${error}`);
  }

  logAbort(): void {
    this.write('ABORTED by user');
  }

  logRawMessage(type: string, subtype?: string): void {
    this.write(`RAW MSG  type=${type}${subtype ? `  subtype=${subtype}` : ''}`);
  }

  close(finalContent: string, costUsd?: number, sessionId?: string): void {
    this.write('=== SDK RUN END ===');
    this.write(`  session=${sessionId ?? 'none'}  cost=$${costUsd?.toFixed(4) ?? 'n/a'}  response_length=${finalContent.length}`);
    this.stream.end();
  }
}
