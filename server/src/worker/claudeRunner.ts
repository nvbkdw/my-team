import { spawn, ChildProcess } from 'node:child_process';
import { NdjsonParser } from '../utils/ndjsonParser.js';

export interface ClaudeRunnerOptions {
  cwd: string;
  sessionId: string;
}

type EventCallback = (event: ClaudeEvent) => void;

export type ClaudeEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_use'; name: string; input: unknown }
  | { type: 'tool_result'; name: string; result: string }
  | { type: 'message_complete'; content: string; costUsd?: number }
  | { type: 'error'; error: string }
  | { type: 'exit'; code: number | null };

export class ClaudeRunner {
  private process: ChildProcess | null = null;
  private options: ClaudeRunnerOptions;
  private parser = new NdjsonParser();

  constructor(options: ClaudeRunnerOptions) {
    this.options = options;
  }

  run(message: string, onEvent: EventCallback): void {
    if (this.process) {
      onEvent({ type: 'error', error: 'Claude process already running' });
      return;
    }

    const args = [
      '-p', message,
      '--output-format', 'stream-json',
      '--session-id', this.options.sessionId,
      '--verbose',
    ];

    this.process = spawn('claude', args, {
      cwd: this.options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let fullContent = '';

    this.process.stdout?.on('data', (chunk: Buffer) => {
      const events = this.parser.parse(chunk.toString());
      for (const event of events) {
        const parsed = this.parseClaudeEvent(event);
        if (parsed) {
          if (parsed.type === 'token') {
            fullContent += parsed.text;
          }
          onEvent(parsed);
        }
      }
    });

    this.process.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) {
        console.error(`[ClaudeRunner] stderr: ${text}`);
      }
    });

    this.process.on('close', (code) => {
      // Flush any remaining buffered data
      const remaining = this.parser.flush();
      for (const event of remaining) {
        const parsed = this.parseClaudeEvent(event);
        if (parsed) {
          if (parsed.type === 'token') {
            fullContent += parsed.text;
          }
          onEvent(parsed);
        }
      }

      onEvent({ type: 'message_complete', content: fullContent });
      onEvent({ type: 'exit', code });
      this.process = null;
    });

    this.process.on('error', (err) => {
      onEvent({ type: 'error', error: err.message });
      this.process = null;
    });
  }

  private parseClaudeEvent(raw: unknown): ClaudeEvent | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;

    // Claude stream-json format parsing
    // Handle different message types from Claude CLI stream-json output
    if (obj.type === 'assistant' && obj.message) {
      const msg = obj.message as Record<string, unknown>;
      if (msg.type === 'text') {
        return { type: 'token', text: msg.text as string };
      }
    }

    // Content block delta (streaming tokens)
    if (obj.type === 'content_block_delta') {
      const delta = obj.delta as Record<string, unknown>;
      if (delta?.type === 'text_delta') {
        return { type: 'token', text: delta.text as string };
      }
    }

    // Content block start (tool use)
    if (obj.type === 'content_block_start') {
      const block = obj.content_block as Record<string, unknown>;
      if (block?.type === 'tool_use') {
        return {
          type: 'tool_use',
          name: block.name as string,
          input: block.input,
        };
      }
    }

    // Tool result
    if (obj.type === 'result') {
      const content = (obj as Record<string, unknown>).result as string | undefined;
      return {
        type: 'message_complete',
        content: content ?? '',
        costUsd: (obj as Record<string, unknown>).cost_usd as number | undefined,
      };
    }

    // Simple text message (non-streaming fallback)
    if (typeof obj.text === 'string') {
      return { type: 'token', text: obj.text };
    }

    return null;
  }

  abort(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
      setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL');
          this.process = null;
        }
      }, 5000);
    }
  }

  get isRunning(): boolean {
    return this.process !== null;
  }
}
