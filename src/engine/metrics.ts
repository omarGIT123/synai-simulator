import { SystemState } from "../core/state";

export function computeMetrics(state: SystemState): SystemState {
  const usedCPU = state.workers.reduce((a, w) => a + w.usedCPU, 0);
  const usedRAM = state.workers.reduce((a, w) => a + w.usedRAM, 0);

  const cpuPressure = usedCPU / state.resources.totalCPU;
  const ramPressure = usedRAM / state.resources.totalRAM;

  return {
    ...state,
    metrics: {
      queueLength: state.tasks.filter((t) => t.status === "queued").length,
      cpuPressure,
      ramPressure,
      pressure: Math.max(cpuPressure, ramPressure),
      completed: state.tasks.filter((t) => t.status === "completed").length,
      failed: state.tasks.filter((t) => t.status === "failed").length,
    },
  };
}
