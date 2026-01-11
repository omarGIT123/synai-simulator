import { SystemState } from "../src/core/state";
import { PolicyName } from "../src/engine/policy";
import { Task } from "../src/core/task";
import { render } from "./render";

const worker = new Worker(
  new URL("../src/worker/simulator.worker.ts", import.meta.url),
  { type: "module" }
);

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

const status = document.getElementById("status")!;

let state: SystemState | null = null;

worker.onmessage = (e) => {
  if (e.data.type === "STATE") {
    state = e.data.payload;
    if (state) {
      render(ctx, state);
      status.textContent = ` pressure=${state.metrics.pressure.toFixed(2)}`;
    }
  }

  if (e.data.type === "COLLAPSE") {
    status.textContent = " 💥 COLLAPSED";
  }
};

const initialState: SystemState = {
  time: 0,
  policy: "BALANCED",
  resources: { totalCPU: 8, totalRAM: 32 },
  tasks: [],
  workers: [
    {
      id: "w1",
      maxCPU: 8,
      maxRAM: 32,
      usedCPU: 0,
      usedRAM: 0,
      activeTaskIds: [],
      online: true,
    },
  ],
  metrics: {
    queueLength: 0,
    cpuPressure: 0,
    ramPressure: 0,
    pressure: 0,
    completed: 0,
    failed: 0,
  },
};

worker.postMessage({ type: "INIT", payload: initialState });

document.getElementById("start")!.onclick = () =>
  worker.postMessage({ type: "START" });

document.getElementById("pause")!.onclick = () =>
  worker.postMessage({ type: "PAUSE" });

document.getElementById("policy")!.onchange = (e) =>
  worker.postMessage({
    type: "SET_POLICY",
    payload: (e.target as HTMLSelectElement).value as PolicyName,
  });

document.getElementById("add")!.onclick = () => {
  const task: Task = {
    id: Math.random().toString(36).slice(2),
    value: 1,
    deadline: state ? state.time + 10 : 10,
    execution: {
      meanDuration: 5,
      cpuCurve: { base: 0.6, peak: 1.2, variance: 0.3 },
      ramCurve: { base: 0.5, peak: 1.0, variance: 0.2 },
    },
    createdAt: state ? state.time : 0,
    progress: 0,
    phase: "cpu",
    failureProbability: 0.05,
    status: "queued",
  };

  worker.postMessage({ type: "ADD_TASK", payload: task });
};
