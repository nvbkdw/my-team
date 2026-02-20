export const config = {
  port: 3001,
  dbPath: new URL('../data/kanban.db', import.meta.url).pathname,
  maxWorkers: 5,
  workerRestartDelay: 3000,
  maxWorkerRestarts: 3,
};
