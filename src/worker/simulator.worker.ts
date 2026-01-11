/// <reference lib="webworker" />

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
      state.tasks.push(msg.payload as Task);
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
      break;
    }
    case "REPLAY": {
      if (!initialSnapshot) return;

      reset();

      // Re-apply events in order
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
          events: eventLog,
        },
      });
      break;
    }
  }
};

function runTick() {
  if (!state) return;

  state = tick(state, TICK_MS / 1000, rng);

  if (state.metrics.pressure > 2) {
    postMessage({
      type: "COLLAPSE",
      payload: "System pressure exceeded recoverable limits.",
    });
    clearInterval(interval!);
    interval = null;
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
      state?.tasks.push(msg.payload);
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
