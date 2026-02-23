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
};
