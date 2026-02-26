/**
 * DevEnvironmentManager — manages the lifecycle of DevEnvironments per card.
 *
 * One environment per card. Environment is provisioned when card → in_progress,
 * destroyed when card leaves in_progress. Multiple workers (CardWorker, EvalWorker)
 * share the same environment.
 *
 * When config.devenv.provider is 'local', no environments are created and workers
 * continue to run as fork()-ed processes (existing behavior).
 */

import { EventEmitter } from 'node:events';
import { config } from '../../config.js';
import type { DevEnvironment, DevEnvironmentProvider, DevEnvConfig } from './DevEnvironment.js';
import { DockerProvider } from './DockerProvider.js';

export class DevEnvironmentManager extends EventEmitter {
  private provider: DevEnvironmentProvider | null = null;
  private environments = new Map<string, DevEnvironment>(); // cardId → environment

  constructor() {
    super();
    if (config.devenv.provider === 'docker') {
      this.provider = new DockerProvider();
      console.log('[DevEnvironmentManager] Using Docker provider');
    } else {
      console.log('[DevEnvironmentManager] Using local mode (no container isolation)');
    }
  }

  /** Whether containerized environments are enabled */
  get isEnabled(): boolean {
    return this.provider !== null;
  }

  /**
   * Provision an environment for a card. No-op if provider is 'local'.
   * Returns the environment, or null if running in local mode.
   */
  async provision(cardId: string, repoPath: string, branchDir: string, image?: string): Promise<DevEnvironment | null> {
    if (!this.provider) return null;

    // If environment already exists for this card, return it
    const existing = this.environments.get(cardId);
    if (existing && existing.status === 'ready') {
      console.log(`[DevEnvironmentManager] Environment already exists for card ${cardId}`);
      return existing;
    }

    console.log(`[DevEnvironmentManager] Provisioning environment for card ${cardId}`);

    const envConfig: DevEnvConfig = {
      cardId,
      repoPath,
      branchDir,
      image,
    };

    try {
      const env = await this.provider.create(envConfig);
      this.environments.set(cardId, env);
      this.emit('environment:ready', cardId, env);
      return env;
    } catch (err) {
      console.error(`[DevEnvironmentManager] Failed to provision environment for card ${cardId}:`, err);
      this.emit('environment:error', cardId, err);
      throw err;
    }
  }

  /**
   * Get the active environment for a card.
   */
  getEnvironment(cardId: string): DevEnvironment | undefined {
    return this.environments.get(cardId);
  }

  /**
   * Destroy the environment for a card. No-op if no environment exists.
   */
  async destroy(cardId: string): Promise<void> {
    const env = this.environments.get(cardId);
    if (!env) return;

    console.log(`[DevEnvironmentManager] Destroying environment for card ${cardId}`);

    try {
      await env.destroy();
    } catch (err) {
      console.error(`[DevEnvironmentManager] Error destroying environment for card ${cardId}:`, err);
    }

    this.environments.delete(cardId);

    // Release ports if Docker provider
    if (this.provider instanceof DockerProvider) {
      this.provider.removeEnvironment(cardId);
    }

    this.emit('environment:destroyed', cardId);
  }

  /**
   * Destroy all active environments. Called during server shutdown.
   */
  async destroyAll(): Promise<void> {
    const destroyPromises = Array.from(this.environments.keys()).map((cardId) =>
      this.destroy(cardId)
    );
    await Promise.all(destroyPromises);
  }

  /**
   * Clean up orphan containers on server startup.
   * Removes any containers whose card is no longer in_progress.
   */
  async cleanupOrphans(activeCardIds: Set<string>): Promise<void> {
    if (!this.provider?.cleanupOrphans) return;
    await this.provider.cleanupOrphans(activeCardIds);
  }

  /**
   * List all active environments.
   */
  listActive(): Map<string, DevEnvironment> {
    return new Map(this.environments);
  }
}

export const devEnvironmentManager = new DevEnvironmentManager();
