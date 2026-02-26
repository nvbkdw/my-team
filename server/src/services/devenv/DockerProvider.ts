/**
 * DockerProvider — creates DevEnvironments backed by local Docker containers.
 *
 * Each environment is a long-lived container (kept alive with `tail -f /dev/null`)
 * into which workers are launched via `docker exec`. The container lifecycle is
 * fully controlled by DevEnvironmentManager, not by any worker process.
 */

import Dockerode from 'dockerode';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { config } from '../../config.js';
import type {
  DevEnvironment,
  DevEnvironmentProvider,
  DevEnvConfig,
  DevEnvStatus,
  ExecResult,
  RemoteProcess,
} from './DevEnvironment.js';

// ---- Port Allocator ----

class PortAllocator {
  private allocated = new Map<string, number[]>(); // envId → ports

  allocate(envId: string, count: number): number[] {
    const { portRangeStart, portRangeEnd } = config.devenv.docker;
    const allUsed = new Set<number>();
    for (const ports of this.allocated.values()) {
      for (const p of ports) allUsed.add(p);
    }

    const ports: number[] = [];
    for (let p = portRangeStart; p <= portRangeEnd && ports.length < count; p++) {
      if (!allUsed.has(p)) {
        ports.push(p);
        allUsed.add(p);
      }
    }

    if (ports.length < count) {
      throw new Error(`Cannot allocate ${count} ports for environment ${envId}: only ${ports.length} available in range ${portRangeStart}-${portRangeEnd}`);
    }

    this.allocated.set(envId, ports);
    return ports;
  }

  release(envId: string): void {
    this.allocated.delete(envId);
  }
}

// ---- Docker Remote Process ----

class DockerRemoteProcess implements RemoteProcess {
  readonly pid: string;
  private container: Dockerode.Container;
  private exitHandlers: Array<(code: number | null) => void> = [];
  private execInstance: Dockerode.Exec;

  constructor(execId: string, container: Dockerode.Container, exec: Dockerode.Exec) {
    this.pid = execId;
    this.container = container;
    this.execInstance = exec;
  }

  async kill(signal = 'SIGTERM'): Promise<void> {
    // Docker exec doesn't support direct signal sending.
    // We find the PID inside the container and kill it.
    try {
      const inspectResult = await this.execInstance.inspect();
      const containerPid = inspectResult.Pid;
      if (containerPid && containerPid > 0) {
        await execInContainer(this.container, `kill -${signal} ${containerPid} 2>/dev/null || true`);
      }
    } catch {
      // exec may have already exited
    }
  }

  onExit(handler: (code: number | null) => void): void {
    this.exitHandlers.push(handler);
  }

  /** Called internally when we detect the process exited */
  _notifyExit(code: number | null): void {
    for (const h of this.exitHandlers) h(code);
  }
}

// ---- Helper: exec inside container (short-lived) ----

async function execInContainer(
  container: Dockerode.Container,
  command: string,
  opts?: { cwd?: string; env?: Record<string, string>; timeout?: number }
): Promise<ExecResult> {
  const envArr = opts?.env
    ? Object.entries(opts.env).map(([k, v]) => `${k}=${v}`)
    : [];

  const exec = await container.exec({
    Cmd: ['bash', '-c', command],
    WorkingDir: opts?.cwd,
    Env: envArr.length > 0 ? envArr : undefined,
    AttachStdout: true,
    AttachStderr: true,
  });

  const stream = await exec.start({});
  const { stdout, stderr } = await collectStream(stream, container);

  const inspectResult = await exec.inspect();
  return {
    stdout,
    stderr,
    exitCode: inspectResult.ExitCode ?? -1,
  };
}

/** Demux Docker stream into stdout/stderr */
function collectStream(
  stream: NodeJS.ReadableStream,
  container: Dockerode.Container,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    const stdoutStream = new (require('stream').PassThrough)();
    const stderrStream = new (require('stream').PassThrough)();

    stdoutStream.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    stderrStream.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    container.modem.demuxStream(stream, stdoutStream, stderrStream);

    stream.on('end', () => {
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString(),
        stderr: Buffer.concat(stderrChunks).toString(),
      });
    });
    stream.on('error', reject);
  });
}

// ---- Docker DevEnvironment ----

class DockerDevEnvironment implements DevEnvironment {
  readonly id: string;
  readonly cardId: string;
  readonly workspacePath: string;
  status: DevEnvStatus = 'provisioning';

  private container: Dockerode.Container;
  private portMappings: Map<number, number>; // inner → host
  private envId: string;

  constructor(
    container: Dockerode.Container,
    cardId: string,
    workspacePath: string,
    portMappings: Map<number, number>,
  ) {
    this.container = container;
    this.id = container.id;
    this.envId = `devenv-${cardId}`;
    this.cardId = cardId;
    this.workspacePath = workspacePath;
    this.portMappings = portMappings;
  }

  async exec(command: string, opts?: {
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
  }): Promise<ExecResult> {
    return execInContainer(this.container, command, {
      cwd: opts?.cwd || this.workspacePath,
      env: opts?.env,
      timeout: opts?.timeout,
    });
  }

  async spawn(command: string, opts?: {
    cwd?: string;
    env?: Record<string, string>;
  }): Promise<RemoteProcess> {
    const envArr = opts?.env
      ? Object.entries(opts.env).map(([k, v]) => `${k}=${v}`)
      : [];

    const exec = await this.container.exec({
      Cmd: ['bash', '-c', command],
      WorkingDir: opts?.cwd || this.workspacePath,
      Env: envArr.length > 0 ? envArr : undefined,
      AttachStdout: true,
      AttachStderr: true,
    });

    // Start the exec — stream stays open until the process exits
    const stream = await exec.start({});

    // Pipe output to console for debugging
    const prefix = `[DevEnv:${this.cardId}]`;
    stream.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) console.log(`${prefix} ${text}`);
    });

    const execId = (exec as unknown as { id: string }).id;
    const proc = new DockerRemoteProcess(execId, this.container, exec);

    // Poll for exec completion in background
    this.pollExecCompletion(exec, proc);

    return proc;
  }

  private async pollExecCompletion(exec: Dockerode.Exec, proc: DockerRemoteProcess): Promise<void> {
    const poll = async () => {
      try {
        const inspectResult = await exec.inspect();
        if (!inspectResult.Running) {
          proc._notifyExit(inspectResult.ExitCode ?? null);
          return;
        }
        setTimeout(poll, 1000);
      } catch {
        proc._notifyExit(null);
      }
    };
    setTimeout(poll, 1000);
  }

  getHostAddress(): string {
    // Docker for Mac / Docker Desktop uses this special DNS name
    return 'host.docker.internal';
  }

  async exposePort(innerPort: number): Promise<{ hostPort: number; url: string }> {
    const hostPort = this.portMappings.get(innerPort);
    if (hostPort) {
      return { hostPort, url: `http://localhost:${hostPort}` };
    }
    throw new Error(
      `Port ${innerPort} is not pre-mapped for environment ${this.cardId}. ` +
      `Pre-mapped ports: ${Array.from(this.portMappings.keys()).join(', ')}`
    );
  }

  async destroy(): Promise<void> {
    if (this.status === 'stopping' || this.status === 'stopped') return;
    this.status = 'stopping';

    try {
      const { containerStopTimeout } = config.devenv.docker;
      await this.container.stop({ t: containerStopTimeout });
    } catch (err: unknown) {
      // Container may already be stopped or removed (AutoRemove)
      const errMsg = err instanceof Error ? err.message : String(err);
      if (!errMsg.includes('not running') && !errMsg.includes('No such container')) {
        console.error(`[DockerDevEnv] Error stopping container for card ${this.cardId}:`, errMsg);
      }
    }

    // AutoRemove handles cleanup, but ensure we try manual remove as fallback
    try {
      await this.container.remove({ force: true });
    } catch {
      // AutoRemove already removed it — fine
    }

    this.status = 'stopped';
  }
}

// ---- Docker Provider ----

export class DockerProvider implements DevEnvironmentProvider {
  readonly type = 'docker';
  private docker: Dockerode;
  private environments = new Map<string, DockerDevEnvironment>(); // cardId → env
  private portAllocator = new PortAllocator();

  constructor() {
    this.docker = new Dockerode({
      socketPath: config.devenv.docker.socketPath,
    });
  }

  /** Build a Docker image on demand if it doesn't exist locally. */
  private async ensureImage(imageName: string): Promise<void> {
    // Check if image already exists
    const images = await this.docker.listImages({
      filters: { reference: [imageName] },
    });
    if (images.length > 0) return;

    // Reverse-lookup: find the suffix key for this image name
    const entries = Object.entries(config.devenv.docker.images) as [string, string][];
    const entry = entries.find(([, img]) => img === imageName);
    if (!entry) {
      throw new Error(`[DockerProvider] Unknown image "${imageName}" — cannot auto-build. Known images: ${entries.map(([k, v]) => `${k}=${v}`).join(', ')}`);
    }
    const suffix = entry[0]; // e.g. 'base', 'node', 'full'

    // Resolve project root (4 dirs up from server/src/services/devenv/DockerProvider.ts)
    const projectRoot = new URL('../../../..', import.meta.url).pathname;
    const dockerfile = `docker/Dockerfile.${suffix}`;

    if (!existsSync(`${projectRoot}/${dockerfile}`)) {
      throw new Error(`[DockerProvider] Dockerfile not found: ${dockerfile}`);
    }

    // Dependency chain: non-base images FROM my-team-base, so build base first
    if (suffix !== 'base') {
      await this.ensureImage(config.devenv.docker.images.base);
    }

    console.log(`[DockerProvider] Building image ${imageName} from ${dockerfile}...`);
    execFileSync('docker', ['build', '-f', dockerfile, '-t', imageName, '.'], {
      cwd: projectRoot,
      stdio: 'inherit',
    });
    console.log(`[DockerProvider] Image ${imageName} built successfully.`);
  }

  async create(envConfig: DevEnvConfig): Promise<DevEnvironment> {
    const { cardId, repoPath, branchDir, image, resources } = envConfig;
    const containerName = `devenv-${cardId}`;
    const resolvedImage = image || config.devenv.docker.images.base;

    // Auto-build image if it doesn't exist locally
    await this.ensureImage(resolvedImage);

    // Remove any stale container with the same name (e.g. from a previous crash)
    try {
      const existing = this.docker.getContainer(containerName);
      await existing.remove({ force: true });
      console.log(`[DockerProvider] Removed stale container ${containerName}`);
    } catch {
      // No existing container — expected path
    }

    // Allocate ports for dev server mappings
    const { portsPerEnvironment } = config.devenv.docker;
    const hostPorts = this.portAllocator.allocate(containerName, portsPerEnvironment);

    // Common inner ports for dev servers
    const innerPorts = [3000, 5173, 8080, 4200, 8000];
    const portMappings = new Map<number, number>();
    const portBindings: Record<string, Array<{ HostPort: string }>> = {};
    const exposedPorts: Record<string, Record<string, never>> = {};

    for (let i = 0; i < Math.min(innerPorts.length, hostPorts.length); i++) {
      portMappings.set(innerPorts[i], hostPorts[i]);
      portBindings[`${innerPorts[i]}/tcp`] = [{ HostPort: String(hostPorts[i]) }];
      exposedPorts[`${innerPorts[i]}/tcp`] = {};
    }

    // Parse resource limits
    const memoryBytes = parseMemory(resources?.memory || config.devenv.docker.resources.memory);
    const cpus = resources?.cpus ?? (config.devenv.docker.resources.cpus || 2);
    const pidsLimit = resources?.pidsLimit ?? config.devenv.docker.resources.pidsLimit;

    // Data directories for bind mounts
    const dataDir = new URL('../../data', import.meta.url).pathname;

    const container = await this.docker.createContainer({
      Image: resolvedImage,
      name: containerName,
      Cmd: ['tail', '-f', '/dev/null'],
      ExposedPorts: exposedPorts,
      HostConfig: {
        Binds: [
          // Mount the entire repo (worktrees need access to .git/)
          `${repoPath}:${repoPath}`,
          // Mount eval and trace data directories
          `${dataDir}/eval:/data/eval`,
          `${dataDir}/traces:/data/traces`,
        ],
        PortBindings: portBindings,
        Memory: memoryBytes,
        CpuQuota: cpus * 100000,
        CpuPeriod: 100000,
        PidsLimit: pidsLimit,
        Init: true, // tini as PID 1
        AutoRemove: true,
      },
      Labels: {
        'my-team': 'devenv',
        'my-team-card-id': cardId,
      },
    });

    await container.start();

    const env = new DockerDevEnvironment(container, cardId, branchDir, portMappings);
    env.status = 'ready';
    this.environments.set(cardId, env);

    console.log(`[DockerProvider] Created environment for card ${cardId}: container=${container.id.slice(0, 12)}, image=${resolvedImage}`);
    return env;
  }

  async listActive(): Promise<DevEnvironment[]> {
    return Array.from(this.environments.values());
  }

  async cleanupOrphans(activeCardIds: Set<string>): Promise<void> {
    try {
      const containers = await this.docker.listContainers({
        filters: { label: ['my-team=devenv'] },
      });

      for (const containerInfo of containers) {
        const cardId = containerInfo.Labels['my-team-card-id'];
        if (!cardId || !activeCardIds.has(cardId)) {
          console.log(`[DockerProvider] Cleaning up orphan container for card ${cardId || 'unknown'}: ${containerInfo.Id.slice(0, 12)}`);
          try {
            const container = this.docker.getContainer(containerInfo.Id);
            await container.stop({ t: 5 });
          } catch {
            // Already stopped or removed
          }
        }
      }
    } catch (err) {
      console.warn('[DockerProvider] Failed to cleanup orphan containers:', err);
    }
  }

  getEnvironment(cardId: string): DockerDevEnvironment | undefined {
    return this.environments.get(cardId);
  }

  removeEnvironment(cardId: string): void {
    const envId = `devenv-${cardId}`;
    this.portAllocator.release(envId);
    this.environments.delete(cardId);
  }
}

// ---- Helpers ----

function parseMemory(memStr: string): number {
  const match = memStr.match(/^(\d+)(g|m|k)?$/i);
  if (!match) return 4 * 1024 * 1024 * 1024; // default 4GB
  const num = parseInt(match[1]);
  switch (match[2]?.toLowerCase()) {
    case 'g': return num * 1024 * 1024 * 1024;
    case 'm': return num * 1024 * 1024;
    case 'k': return num * 1024;
    default: return num;
  }
}
