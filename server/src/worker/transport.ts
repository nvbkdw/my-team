/**
 * WorkerTransport — abstracts the communication channel between a worker
 * and the host server. Workers use this instead of process.send() directly.
 *
 * Two implementations:
 * - IpcTransport: wraps Node IPC (process.send / process.on). Used when
 *   the worker is a fork()-ed child process (local mode).
 * - WsTransport: connects to the host server via WebSocket. Used when
 *   the worker runs inside a DevEnvironment (Docker/SSH).
 *
 * Auto-selected by createTransport() based on WORKER_WS_URL env var.
 */

import WebSocket from 'ws';

// ---- Interface ----

export interface WorkerTransport {
  send(msg: Record<string, unknown>): void;
  onMessage: ((msg: Record<string, unknown>) => void) | null;
  close(): void;
  /** Resolves when the transport is ready to send/receive. */
  ready(): Promise<void>;
}

// ---- IPC Transport (fork mode — backward compatible) ----

export class IpcTransport implements WorkerTransport {
  onMessage: ((msg: Record<string, unknown>) => void) | null = null;

  constructor() {
    process.on('message', (msg: Record<string, unknown>) => {
      this.onMessage?.(msg);
    });
  }

  send(msg: Record<string, unknown>): void {
    if (process.send) {
      process.send(msg);
    }
  }

  close(): void {
    // IPC is managed by the parent process; nothing to close.
  }

  async ready(): Promise<void> {
    // IPC is immediately ready after fork().
  }
}

// ---- WebSocket Transport (container mode) ----

export class WsTransport implements WorkerTransport {
  onMessage: ((msg: Record<string, unknown>) => void) | null = null;
  private ws: WebSocket | null = null;
  private url: string;
  private cardId: string;
  private workerType: string;
  private readyPromise: Promise<void>;
  private resolveReady!: () => void;
  private rejectReady!: (err: Error) => void;

  constructor(url: string, cardId: string, workerType: string) {
    this.url = url;
    this.cardId = cardId;
    this.workerType = workerType;
    this.readyPromise = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.connect();
  }

  private connect(): void {
    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      // Register with the host server
      this.ws!.send(JSON.stringify({
        type: 'register',
        cardId: this.cardId,
        workerType: this.workerType,
      }));
      this.resolveReady();
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;
        this.onMessage?.(msg);
      } catch (err) {
        console.error('[WsTransport] Failed to parse message:', err);
      }
    });

    this.ws.on('error', (err) => {
      console.error('[WsTransport] WebSocket error:', err.message);
      this.rejectReady(err);
    });

    this.ws.on('close', (code, reason) => {
      console.log(`[WsTransport] Connection closed: code=${code}, reason=${reason.toString()}`);
    });
  }

  send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }

  async ready(): Promise<void> {
    return this.readyPromise;
  }
}

// ---- Factory ----

/**
 * Auto-select transport based on environment:
 * - If WORKER_WS_URL is set → WsTransport (running inside a DevEnvironment)
 * - Otherwise → IpcTransport (running as a fork()-ed child process)
 */
export function createTransport(): WorkerTransport {
  if (process.env.WORKER_WS_URL) {
    return new WsTransport(
      process.env.WORKER_WS_URL,
      process.env.WORKER_CARD_ID!,
      process.env.WORKER_TYPE || 'card',
    );
  }
  return new IpcTransport();
}
