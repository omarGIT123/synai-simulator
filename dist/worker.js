// src/engine/metrics.ts
function computeMetrics(state2) {
  const usedCPU = state2.workers.reduce((a, w) => a + w.usedCPU, 0);
  const usedRAM = state2.workers.reduce((a, w) => a + w.usedRAM, 0);
  const cpuPressure = usedCPU / state2.resources.totalCPU;
  const ramPressure = usedRAM / state2.resources.totalRAM;
  return {
    ...state2,
    metrics: {
      queueLength: state2.tasks.filter((t) => t.status === "queued").length,
      cpuPressure,
      ramPressure,
      pressure: Math.max(cpuPressure, ramPressure),
      completed: state2.tasks.filter((t) => t.status === "completed").length,
      failed: state2.tasks.filter((t) => t.status === "failed").length
    }
  };
}

// src/engine/policy.ts
var POLICIES = {
  FAIRNESS: {
    starvationWeight: 2,
    latenessWeight: 0.8,
    failureWeight: 1,
    instabilityWeight: 0.5
  },
  BALANCED: {
    starvationWeight: 0.5,
    latenessWeight: 1,
    failureWeight: 2,
    instabilityWeight: 1
  },
  THROUGHPUT: {
    starvationWeight: 0.1,
    latenessWeight: 1.5,
    failureWeight: 3,
    instabilityWeight: 2
  }
};

// src/engine/cost.ts
function computeTaskCost(task, state2) {
  const policy = POLICIES[state2.policy];
  const now = state2.time;
  const pressure = state2.metrics.pressure;
  const waitingTime = task.startedAt === void 0 ? now - task.createdAt : 0;
  const starvation = waitingTime * policy.starvationWeight;
  const latenessTime = Math.max(0, now - task.deadline);
  const lateness = latenessTime * policy.latenessWeight;
  const failureRisk = task.failureProbability * pressure * policy.failureWeight;
  const instability = pressure * pressure * policy.instabilityWeight;
  const total = starvation + lateness + failureRisk + instability;
  return {
    starvation,
    lateness,
    failureRisk,
    instability,
    total
  };
}

// src/engine/execution.ts
function sampleUsage(curve, rng2) {
  return rng2() < curve.variance ? curve.peak : curve.base;
}
function slowdownFactor(pressure) {
  return 1 + pressure * pressure;
}

// src/engine/scheduler.ts
var MAX_PRESSURE = 1.2;
function schedule(state2, dt, rng2) {
  const now = state2.time;
  const queued = state2.tasks.filter((t) => t.status === "queued");
  if (state2.metrics.pressure > MAX_PRESSURE && queued.length > 0) {
    const worst = queued.map((t) => ({ t, cost: computeTaskCost(t, state2).total })).sort((a, b) => b.cost - a.cost)[0].t;
    worst.status = "failed";
  }
  const sortedQueued = queued.map((t) => ({ t, cost: computeTaskCost(t, state2).total })).sort((a, b) => a.cost - b.cost);
  for (const { t } of sortedQueued) {
    const cpu = sampleUsage(t.execution.cpuCurve, rng2);
    const ram = sampleUsage(t.execution.ramCurve, rng2);
    if (state2.metrics.cpuPressure + cpu / state2.resources.totalCPU > 1 || state2.metrics.ramPressure + ram / state2.resources.totalRAM > 1) {
      continue;
    }
    t.status = "running";
    t.startedAt = now;
    t.expectedEndAt = now + t.execution.meanDuration;
  }
  const running = state2.tasks.filter((t) => t.status === "running");
  const cpuTasks = running.filter((t) => t.phase === "cpu");
  const cpuPerTask = cpuTasks.length > 0 ? state2.resources.totalCPU / cpuTasks.length : 0;
  for (const t of running) {
    const slow = slowdownFactor(state2.metrics.pressure);
    if (t.phase === "cpu") {
      t.progress += cpuPerTask / state2.resources.totalCPU * (dt / t.execution.meanDuration) / slow;
    } else {
      t.progress += 0.3 * (dt / t.execution.meanDuration);
    }
    if (rng2() < t.failureProbability * state2.metrics.pressure) {
      t.status = "failed";
      continue;
    }
    if (t.progress >= 1) {
      t.status = "completed";
    }
    if (rng2() < 0.15) {
      t.phase = t.phase === "cpu" ? "io" : "cpu";
    }
  }
  return state2;
}

// src/engine/tick.ts
function tick(state2, dt, rng2) {
  let next = { ...state2, time: state2.time + dt };
  next = computeMetrics(next);
  next = schedule(next, dt, rng2);
  next = computeMetrics(next);
  return next;
}

// src/engine/random.ts
function createRNG(seed) {
  let t = seed >>> 0;
  return function() {
    t += 1831565813;
    let r = Math.imul(t ^ t >>> 15, 1 | t);
    r ^= r + Math.imul(r ^ r >>> 7, 61 | r);
    return ((r ^ r >>> 14) >>> 0) / 4294967296;
  };
}

// src/worker/simulator.worker.ts
var currentSeed = 1;
var rng = createRNG(currentSeed);
var state = null;
var interval = null;
var TICK_MS = 100;
var eventLog = [];
self.onmessage = (event) => {
  const msg = event.data;
  if (state && !["STATE", "INIT"].includes(msg.type)) {
    eventLog.push({
      time: state.time,
      message: msg
    });
  }
  switch (msg.type) {
    case "INIT": {
      state = structuredClone(msg.payload.state);
      initialSnapshot = structuredClone(msg.payload.state);
      currentSeed = msg.payload.seed ?? 1;
      rng = createRNG(currentSeed);
      eventLog = [];
      post();
      break;
    }
    case "START": {
      if (!state || interval !== null) return;
      interval = setInterval(runTick, TICK_MS);
      break;
    }
    case "PAUSE": {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
      break;
    }
    case "STEP": {
      runTick();
      break;
    }
    case "ADD_TASK": {
      if (!state) return;
      state.tasks.push(msg.payload);
      break;
    }
    case "SET_POLICY": {
      if (!state) return;
      state.policy = msg.payload;
      break;
    }
    case "SET_RESOURCES": {
      if (!state) return;
      state.resources = {
        ...state.resources,
        ...msg.payload
      };
      break;
    }
    case "REPLAY": {
      if (!initialSnapshot) return;
      reset();
      for (const e of msg.payload.events) {
        applyEvent(e.message);
      }
      post();
      break;
    }
    case "EXPORT_REPLAY": {
      postMessage({
        type: "REPLAY_DATA",
        payload: {
          seed: currentSeed,
          events: eventLog
        }
      });
      break;
    }
  }
};
function runTick() {
  if (!state) return;
  state = tick(state, TICK_MS / 1e3, rng);
  if (state.metrics.pressure > 2) {
    postMessage({
      type: "COLLAPSE",
      payload: "System pressure exceeded recoverable limits."
    });
    clearInterval(interval);
    interval = null;
  }
  post();
}
function post() {
  postMessage({
    type: "STATE",
    payload: state
  });
}
var initialSnapshot = null;
function reset() {
  if (!initialSnapshot) return;
  state = structuredClone(initialSnapshot);
  rng = createRNG(currentSeed);
}
function applyEvent(msg) {
  switch (msg.type) {
    case "ADD_TASK":
      state?.tasks.push(msg.payload);
      break;
    case "SET_POLICY":
      if (state) state.policy = msg.payload;
      break;
    case "SET_RESOURCES":
      if (state) {
        state.resources = {
          ...state.resources,
          ...msg.payload
        };
      }
      break;
    case "START":
      if (!interval) {
        interval = setInterval(runTick, TICK_MS);
      }
      break;
    case "PAUSE":
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      break;
  }
}
//# sourceMappingURL=worker.js.map