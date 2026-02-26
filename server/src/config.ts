export const config = {
  port: 3001,
  dbPath: new URL('../data/kanban.db', import.meta.url).pathname,
  maxWorkers: 5,
  workerRestartDelay: 3000,
  maxWorkerRestarts: 3,
  devServer: {
    maxInstances: 5,
    portRangeStart: 3100,
    portRangeEnd: 3149,
    proxyPortRangeStart: 3150,
    proxyPortRangeEnd: 3199,
    startupTimeoutMs: 30000,
    shutdownGraceMs: 5000,
  },
  devenv: {
    /** 'local' = all workers use fork() (current behavior).
     *  'docker' = CardWorker/EvalWorker in Docker, PRWorker still fork(). */
    provider: (process.env.DEVENV_PROVIDER || 'local') as 'docker' | 'local',
    docker: {
      socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock',
      images: {
        base: process.env.DEVENV_IMAGE_BASE || 'my-team-base:latest',
        node: process.env.DEVENV_IMAGE_NODE || 'my-team-node:latest',
        python: process.env.DEVENV_IMAGE_PYTHON || 'my-team-python:latest',
        rust: process.env.DEVENV_IMAGE_RUST || 'my-team-rust:latest',
        go: process.env.DEVENV_IMAGE_GO || 'my-team-go:latest',
        full: process.env.DEVENV_IMAGE_FULL || 'my-team-full:latest',
      },
      resources: {
        memory: process.env.DEVENV_MEMORY || '4g',
        cpus: parseInt(process.env.DEVENV_CPUS || '2'),
        pidsLimit: parseInt(process.env.DEVENV_PIDS_LIMIT || '512'),
      },
      /** First allocatable host port for dev server port mappings */
      portRangeStart: parseInt(process.env.DEVENV_PORT_START || '3200'),
      /** Last allocatable host port */
      portRangeEnd: parseInt(process.env.DEVENV_PORT_END || '3299'),
      /** Number of ports pre-mapped per environment */
      portsPerEnvironment: 5,
      /** Seconds to wait for container to stop gracefully */
      containerStopTimeout: 10,
    },
  },
};
