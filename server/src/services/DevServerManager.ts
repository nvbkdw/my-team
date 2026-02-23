import { spawn, ChildProcess } from 'node:child_process';
import type { Server as HttpServer } from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { config } from '../config.js';
import { createPreviewProxy } from './previewProxy.js';

export type DevServerStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

interface DevServerInfo {
  process: ChildProcess;
  cardId: string;
  branchDir: string;
  port: number;
  proxyPort: number;
  proxyServer: HttpServer;
  status: DevServerStatus;
  /** Direct dev server URL (for "Open in browser") */
  url: string;
  /** Preview proxy URL with injected nav script (for iframe) */
  previewUrl: string;
  error?: string;
}

/**
 * DevServerManager — manages dev server processes per card.
 * Each card gets a dev server on one port and a preview proxy on another.
 * The proxy injects a navigation monitoring script into HTML responses so
 * the client can track in-iframe URL changes via postMessage.
 */
export class DevServerManager extends EventEmitter {
  private servers = new Map<string, DevServerInfo>();
  private allocatedDevPorts = new Set<number>();
  private allocatedProxyPorts = new Set<number>();

  get activeCount(): number {
    return this.servers.size;
  }

  getServerInfo(cardId: string): {
    status: DevServerStatus;
    port?: number;
    url?: string;
    previewUrl?: string;
    error?: string;
  } {
    const info = this.servers.get(cardId);
    if (!info) return { status: 'stopped' };
    return {
      status: info.status,
      port: info.port,
      url: info.url,
      previewUrl: info.previewUrl,
      error: info.error,
    };
  }

  getAllServerStatuses(): Record<string, { status: DevServerStatus; port?: number; url?: string; previewUrl?: string }> {
    const result: Record<string, { status: DevServerStatus; port?: number; url?: string; previewUrl?: string }> = {};
    for (const [cardId, info] of this.servers) {
      result[cardId] = { status: info.status, port: info.port, url: info.url, previewUrl: info.previewUrl };
    }
    return result;
  }

  async startServer(cardId: string, branchDir: string, customCommand?: string): Promise<{ port: number; url: string; previewUrl: string }> {
    if (this.servers.has(cardId)) {
      const existing = this.servers.get(cardId)!;
      if (existing.status === 'running' || existing.status === 'starting') {
        return { port: existing.port, url: existing.url, previewUrl: existing.previewUrl };
      }
      await this.stopServer(cardId);
    }

    if (this.servers.size >= config.devServer.maxInstances) {
      throw new Error(`Max dev server instances (${config.devServer.maxInstances}) reached`);
    }

    const devPort = await this.allocatePort('dev');
    const proxyPort = await this.allocatePort('proxy');
    const url = `http://localhost:${devPort}`;
    const previewUrl = `http://localhost:${proxyPort}`;
    const { command, args, env } = this.buildCommand(branchDir, devPort, customCommand);

    // Start the preview proxy immediately (it waits for the dev server to be ready)
    const proxyServer = createPreviewProxy(devPort);
    await new Promise<void>((resolve, reject) => {
      proxyServer.on('error', reject);
      proxyServer.listen(proxyPort, '127.0.0.1', () => {
        console.log(`[DevServerManager] Preview proxy for card ${cardId} listening on :${proxyPort} → :${devPort}`);
        resolve();
      });
    });

    this.emitStatus(cardId, 'starting', devPort, url, undefined, previewUrl);

    const child = spawn(command, args, {
      cwd: branchDir,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      detached: false,
    });

    const info: DevServerInfo = {
      process: child,
      cardId,
      branchDir,
      port: devPort,
      proxyPort,
      proxyServer,
      status: 'starting',
      url,
      previewUrl,
    };
    this.servers.set(cardId, info);

    return new Promise((resolve, reject) => {
      const readyPatterns = [
        /Local:\s+http/i,
        /ready in/i,
        /listening on/i,
        /started server on/i,
        /compiled successfully/i,
        /webpack compiled/i,
      ];

      let resolved = false;

      const onReady = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        info.status = 'running';
        this.emitStatus(cardId, 'running', devPort, url, undefined, previewUrl);
        resolve({ port: devPort, url, previewUrl });
      };

      const handleOutput = (data: Buffer) => {
        const text = data.toString();
        console.log(`[DevServer:${cardId}] ${text.trim()}`);
        if (!resolved) {
          for (const pattern of readyPatterns) {
            if (pattern.test(text)) {
              onReady();
              break;
            }
          }
        }
      };

      child.stdout?.on('data', handleOutput);
      child.stderr?.on('data', handleOutput);

      const probeInterval = setInterval(async () => {
        if (resolved) { clearInterval(probeInterval); return; }
        const isOpen = await this.isPortOpen(devPort);
        if (isOpen) {
          clearInterval(probeInterval);
          onReady();
        }
      }, 1000);

      const timeout = setTimeout(() => {
        clearInterval(probeInterval);
        if (!resolved) {
          resolved = true;
          if (child.exitCode === null) {
            info.status = 'running';
            this.emitStatus(cardId, 'running', devPort, url, undefined, previewUrl);
            resolve({ port: devPort, url, previewUrl });
          } else {
            info.status = 'error';
            info.error = 'Startup timed out';
            this.emitStatus(cardId, 'error', devPort, url, 'Startup timed out', previewUrl);
            reject(new Error('Dev server startup timed out'));
          }
        }
      }, config.devServer.startupTimeoutMs);

      child.on('error', (err) => {
        clearInterval(probeInterval);
        clearTimeout(timeout);
        console.error(`[DevServerManager] Process error for card ${cardId}:`, err.message);
        info.status = 'error';
        info.error = err.message;
        this.emitStatus(cardId, 'error', devPort, url, err.message, previewUrl);
        if (!resolved) {
          resolved = true;
          this.cleanup(cardId);
          reject(err);
        }
      });

      child.on('exit', (code, signal) => {
        clearInterval(probeInterval);
        clearTimeout(timeout);
        console.log(`[DevServerManager] Process exited for card ${cardId}: code=${code}, signal=${signal}`);

        if (info.status === 'stopping') return;

        this.emit('devserver:exit', cardId, code);
        if (!resolved) {
          resolved = true;
          info.status = 'error';
          info.error = `Process exited with code ${code}`;
          this.emitStatus(cardId, 'error', devPort, url, info.error, previewUrl);
          this.cleanup(cardId);
          reject(new Error(info.error));
        } else {
          this.cleanup(cardId);
          this.emitStatus(cardId, 'stopped', devPort, url, undefined, previewUrl);
        }
      });
    });
  }

  async stopServer(cardId: string): Promise<void> {
    const info = this.servers.get(cardId);
    if (!info) return;

    info.status = 'stopping';
    this.emitStatus(cardId, 'stopping', info.port, info.url, undefined, info.previewUrl);

    return new Promise((resolve) => {
      const forceKill = setTimeout(() => {
        try { info.process.kill('SIGKILL'); } catch {}
        this.cleanup(cardId);
        this.emitStatus(cardId, 'stopped', info.port, info.url, undefined, info.previewUrl);
        resolve();
      }, config.devServer.shutdownGraceMs);

      info.process.on('exit', () => {
        clearTimeout(forceKill);
        this.cleanup(cardId);
        this.emitStatus(cardId, 'stopped', info.port, info.url, undefined, info.previewUrl);
        resolve();
      });

      try {
        info.process.kill('SIGTERM');
      } catch {
        clearTimeout(forceKill);
        this.cleanup(cardId);
        this.emitStatus(cardId, 'stopped', info.port, info.url, undefined, info.previewUrl);
        resolve();
      }
    });
  }

  async stopAll(): Promise<void> {
    const promises = Array.from(this.servers.keys()).map((cardId) => this.stopServer(cardId));
    await Promise.all(promises);
  }

  // --- Private helpers ---

  private cleanup(cardId: string): void {
    const info = this.servers.get(cardId);
    if (info) {
      // Close the preview proxy server
      info.proxyServer.close();
      this.allocatedDevPorts.delete(info.port);
      this.allocatedProxyPorts.delete(info.proxyPort);
      this.servers.delete(cardId);
    }
  }

  private emitStatus(
    cardId: string,
    status: DevServerStatus,
    port?: number,
    url?: string,
    error?: string,
    previewUrl?: string,
  ): void {
    this.emit('devserver:event', cardId, {
      type: 'devserver:status',
      status,
      port,
      url,
      previewUrl,
      error,
    });
  }

  private async allocatePort(kind: 'dev' | 'proxy'): Promise<number> {
    const start = kind === 'dev' ? config.devServer.portRangeStart : config.devServer.proxyPortRangeStart;
    const end = kind === 'dev' ? config.devServer.portRangeEnd : config.devServer.proxyPortRangeEnd;
    const allocated = kind === 'dev' ? this.allocatedDevPorts : this.allocatedProxyPorts;

    for (let port = start; port <= end; port++) {
      if (allocated.has(port)) continue;
      const available = await this.isPortAvailable(port);
      if (available) {
        allocated.add(port);
        return port;
      }
    }
    throw new Error(`No available ${kind} ports in range ${start}-${end}`);
  }

  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close(() => resolve(true));
      });
      server.listen(port, '127.0.0.1');
    });
  }

  private isPortOpen(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(500);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('timeout', () => { socket.destroy(); resolve(false); });
      socket.once('error', () => { socket.destroy(); resolve(false); });
      socket.connect(port, '127.0.0.1');
    });
  }

  private buildCommand(
    branchDir: string,
    port: number,
    customCommand?: string,
  ): { command: string; args: string[]; env: Record<string, string> } {
    if (customCommand) {
      return { command: customCommand, args: [], env: { PORT: String(port) } };
    }

    const framework = this.detectFramework(branchDir);

    switch (framework) {
      case 'vite':
        return { command: 'npx', args: ['vite', '--port', String(port)], env: {} };
      case 'next':
        return { command: 'npx', args: ['next', 'dev', '--port', String(port)], env: {} };
      case 'cra':
        return { command: 'npx', args: ['react-scripts', 'start'], env: { PORT: String(port), BROWSER: 'none' } };
      default:
        return { command: 'npm', args: ['run', 'dev'], env: { PORT: String(port) } };
    }
  }

  private detectFramework(dir: string): 'vite' | 'next' | 'cra' | 'unknown' {
    try {
      const pkgPath = path.join(dir, 'package.json');
      if (!fs.existsSync(pkgPath)) return 'unknown';
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (allDeps['vite']) return 'vite';
      if (allDeps['next']) return 'next';
      if (allDeps['react-scripts']) return 'cra';
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }
}

export const devServerManager = new DevServerManager();
