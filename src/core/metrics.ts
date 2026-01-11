export type SystemMetrics = {
  queueLength: number;

  cpuPressure: number;
  ramPressure: number;
  pressure: number;

  completed: number;
  failed: number;

  stabilityIndex: number;
};
