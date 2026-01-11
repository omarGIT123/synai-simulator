import { SystemState } from "../core/state";

export function computeMetrics(state: SystemState): SystemState {
  let usedCPU = 0;
  let usedRAM = 0;

  for (const task of state.tasks) {
    if (task.status === "running") {
      usedCPU += task.execution.cpuCurve.base;
      usedRAM += task.execution.ramCurve.base;
    }
  }

  const cpuPressure = usedCPU / state.resources.totalCPU;
  const ramPressure = usedRAM / state.resources.totalRAM;
  const pressure = Math.max(cpuPressure, ramPressure);

  const queueLength = state.tasks.filter((t) => t.status === "queued").length;

  const failed = state.tasks.filter((t) => t.status === "failed").length;

  // 🔥 System Stability Index (0–100)
  const pressurePenalty = Math.min(pressure * 50, 60);
  const queuePenalty = Math.min(queueLength * 3, 25);
  const failurePenalty = Math.min(failed * 5, 40);

  const stabilityIndex = Math.max(
    0,
    Math.round(100 - pressurePenalty - queuePenalty - failurePenalty)
  );

  state.metrics = {
    ...state.metrics,
    cpuPressure,
    ramPressure,
    pressure,
    queueLength,
    completed: state.tasks.filter((t) => t.status === "completed").length,
    failed,
    stabilityIndex,
  };

  return state;
}
