/// <reference lib="webworker" />
console.log("🔥 WORKER FILE EXECUTED");
import { tick } from "../engine/tick";
import { SystemState } from "../core/state";
import { Task } from "../core/task";
import { PolicyName } from "../engine/policy";
import { SystemResources } from "../core/resources";
import { createRNG } from "../engine/random";
let currentSeed: number = 1;
let rng = createRNG(currentSeed);

let state: SystemState | null = null;
let interval: ReturnType<typeof setInterval> | null = null;

const TICK_MS = 100;
let sustainedPressureTicks = 0;
const COLLAPSE_PRESSURE = 1.5;
const COLLAPSE_TICKS = 10;

let eventLog: Array<{
  time: number;
  message: any;
}> = [];

self.onmessage = (event: MessageEvent) => {
  const msg = event.data;
  // Log user actions (but NOT INIT or STATE)
  if (state && !["STATE", "INIT"].includes(msg.type)) {
    eventLog.push({
      time: state.time,
      message: msg,
    });
  }
  switch (msg.type) {
    case "INIT": {
      state = structuredClone(msg.payload.state);
      initialSnapshot = structuredClone(msg.payload.state);
      currentSeed = msg.payload.seed ?? 1;
      rng = createRNG(currentSeed);
      eventLog = [];
      sustainedPressureTicks = 0;
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
    case "SET_CONFIG": {
      if (!state) return;

      state.config = {
        ...state.config,
        ...msg.payload,
      };

      post();
      break;
    }
    case "ADD_TASK": {
      if (!state) return;

      state.tasks.push({
        ...msg.payload,
        createdAt: state.time,
      });

      break;
    }

    case "SET_POLICY": {
      if (!state) return;
      state.policy = msg.payload as PolicyName;
      break;
    }

    case "SET_RESOURCES": {
      if (!state) return;
      state.resources = {
        ...state.resources,
        ...(msg.payload as Partial<SystemResources>),
      };
      for (const w of state.workers) {
        w.maxCPU = state.resources.totalCPU;
        w.maxRAM = state.resources.totalRAM;
      }
      post();
      break;
    }
    case "EXPORT_REPLAY": {
      postMessage({
        type: "REPLAY_DATA",
        payload: {
          seed: currentSeed,
          events: eventLog,
        },
      });
      break;
    }

    case "REPLAY": {
      if (!initialSnapshot) return;

      // Reset system
      state = structuredClone(initialSnapshot);
      rng = createRNG(msg.payload.seed);
      sustainedPressureTicks = 0;

      // Re-apply events deterministically
      for (const e of msg.payload.events) {
        applyEvent(e.message);
      }

      post();
      break;
    }
  }
};

function runTick() {
  if (!state) return;

  state = tick(state, TICK_MS / 1000, rng);

  if (state.metrics.pressure > COLLAPSE_PRESSURE) {
    sustainedPressureTicks++;
  } else {
    sustainedPressureTicks = 0;
  }

  if (
    state.metrics.stabilityIndex <= 15 ||
    sustainedPressureTicks >= COLLAPSE_TICKS
  ) {
    postMessage({
      type: "COLLAPSE",
      payload: {
        time: state.time,
        stabilityIndex: state.metrics.stabilityIndex,
        pressure: state.metrics.pressure,
        reason:
          sustainedPressureTicks >= COLLAPSE_TICKS
            ? "Sustained system pressure"
            : "System stability degraded beyond recovery",
      },
    });

    clearInterval(interval!);
    interval = null;
    return;
  }

  post();
}

function post() {
  postMessage({
    type: "STATE",
    payload: state,
  });
}

let initialSnapshot: SystemState | null = null;

function reset() {
  if (!initialSnapshot) return;

  state = structuredClone(initialSnapshot);
  rng = createRNG(currentSeed);
}

function applyEvent(msg: any) {
  switch (msg.type) {
    case "ADD_TASK":
      state?.tasks.push({
        ...msg.payload,
        createdAt: state.time,
      });
      break;

    case "SET_POLICY":
      if (state) state.policy = msg.payload;
      break;

    case "SET_RESOURCES":
      if (state) {
        state.resources = {
          ...state.resources,
          ...msg.payload,
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
