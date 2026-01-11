import { SystemState } from "../core/state";
import { computeMetrics } from "./metrics";
import { schedule } from "./scheduler";
import { RNG } from "./random";

export function tick(state: SystemState, dt: number, rng: RNG): SystemState {
  let next = { ...state, time: state.time + dt };

  next = computeMetrics(next);
  next = schedule(next, dt, rng);
  next = computeMetrics(next);

  return next;
}
