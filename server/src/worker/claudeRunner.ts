import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { SdkLogger } from '../utils/sdkLogger.js';

export interface ClaudeRunnerOptions {
  cwd: string;
  cardId: string;
}

type EventCallback = (event: ClaudeEvent) => void;

export type ClaudeEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_use'; name: string; input: unknown }
  | { type: 'tool_result'; name: string; result: string }
  | { type: 'message_complete'; content: string; costUsd?: number; sessionId?: string }
  | { type: 'error'; error: string }
  | { type: 'exit'; code: number | null };

export class ClaudeRunner {
  private options: ClaudeRunnerOptions;
  private abortController: AbortController | null = null;
  private running = false;

  constructor(options: ClaudeRunnerOptions) {
    this.options = options;
  }

  async run(message: string, sessionId: string | null, onEvent: EventCallback): Promise<void> {
    if (this.running) {
      onEvent({ type: 'error', error: 'Claude process already running' });
      return;
    }

    this.running = true;
    this.abortController = new AbortController();

    const logger = new SdkLogger(this.options.cardId);
    logger.logUserPrompt(message);
    if (sessionId) logger.logRawMessage('resume', sessionId);

    // Strip Claude Code env vars to avoid nested session issues
    const { CLAUDECODE, CLAUDE_CODE_SSE_PORT, CLAUDE_CODE_ENTRYPOINT, ...cleanEnv } = process.env;

    let fullContent = '';
    let capturedSessionId: string | undefined;
    let costUsd: number | undefined;
    let wasStreaming = false;

    try {
      const stream = query({
        prompt: message,
        options: {
          cwd: this.options.cwd,
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          includePartialMessages: true,
          settingSources: ['project'],
          maxTurns: 50,
          abortController: this.abortController,
          env: cleanEnv as Record<string, string>,
          ...(sessionId ? { resume: sessionId } : {}),
        },
      });

      for await (const msg of stream) {
        if (this.abortController?.signal.aborted) {
          logger.logAbort();
          break;
        }
        wasStreaming = this.handleMessage(msg, onEvent, logger, wasStreaming,
          (text) => { fullContent += text; },
          (sid) => { capturedSessionId = sid; },
          (cost) => { costUsd = cost; },
        );
      }
    } catch (err: unknown) {
      if (this.abortController?.signal.aborted) {
        logger.logAbort();
      } else {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.logError(errorMsg);
        onEvent({ type: 'error', error: errorMsg });
      }
    } finally {
      if (wasStreaming) logger.logTokenBoundary();
      this.running = false;
      this.abortController = null;
      logger.close(fullContent, costUsd, capturedSessionId);
      onEvent({
        type: 'message_complete',
        content: fullContent,
        costUsd,
        sessionId: capturedSessionId,
      });
      onEvent({ type: 'exit', code: 0 });
    }
  }

  /**
   * Returns whether we are currently in a streaming-tokens sequence
   * (so the caller can flush the boundary marker when streaming ends).
   */
  private handleMessage(
    msg: SDKMessage,
    onEvent: EventCallback,
    logger: SdkLogger,
    wasStreaming: boolean,
    appendContent: (text: string) => void,
    setSessionId: (sid: string) => void,
    setCost: (cost: number) => void,
  ): boolean {
    switch (msg.type) {
      case 'system': {
        const subtype = 'subtype' in msg ? (msg.subtype as string) : undefined;
        if (subtype === 'init') {
          const initMsg = msg as { session_id: string; model?: string; tools?: string[] };
          setSessionId(initMsg.session_id);
          logger.logSystemInit(
            initMsg.session_id,
            initMsg.model ?? 'unknown',
            initMsg.tools ?? [],
          );
        } else {
          logger.logRawMessage('system', subtype);
        }
        return false;
      }

      case 'stream_event': {
        const event = msg.event;
        if (event.type === 'content_block_delta') {
          const delta = event.delta as { type: string; text?: string };
          if (delta.type === 'text_delta' && delta.text) {
            if (!wasStreaming) {
              logger.logRawMessage('stream_event', 'text_delta (start)');
            }
            logger.logToken(delta.text);
            onEvent({ type: 'token', text: delta.text });
            appendContent(delta.text);
            return true; // currently streaming
          }
        }
        // Non-text streaming events (message_start, content_block_start/stop, etc.)
        if (wasStreaming) {
          logger.logTokenBoundary();
        }
        return false;
      }

      case 'assistant': {
        if (wasStreaming) {
          logger.logTokenBoundary();
        }
        const content = msg.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'tool_use') {
              logger.logToolUse(block.name, block.input);
              onEvent({ type: 'tool_use', name: block.name, input: block.input });
            } else if (block.type === 'text' && block.text) {
              logger.logAssistantText(block.text as string);
            }
          }
        }
        return false;
      }

      case 'user': {
        if (wasStreaming) logger.logTokenBoundary();
        // User messages include tool results
        const content = msg.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'tool_result') {
              const resultBlock = block as { tool_use_id?: string; content?: unknown };
              const resultText = typeof resultBlock.content === 'string'
                ? resultBlock.content
                : JSON.stringify(resultBlock.content ?? '');
              logger.logToolResult(resultBlock.tool_use_id ?? 'unknown', resultText);
            }
          }
        }
        return false;
      }

      case 'result': {
        if (wasStreaming) logger.logTokenBoundary();
        const resultMsg = msg as {
          subtype?: string;
          total_cost_usd: number;
          num_turns?: number;
          duration_ms?: number;
          result?: string;
        };
        setCost(resultMsg.total_cost_usd);
        logger.logResult(
          resultMsg.subtype ?? 'unknown',
          resultMsg.total_cost_usd,
          resultMsg.num_turns ?? 0,
          resultMsg.duration_ms ?? 0,
        );
        return false;
      }

      default:
        if (wasStreaming) logger.logTokenBoundary();
        logger.logRawMessage(msg.type, 'subtype' in msg ? (msg as Record<string, unknown>).subtype as string : undefined);
        return false;
    }
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  get isRunning(): boolean {
    return this.running;
  }
}
