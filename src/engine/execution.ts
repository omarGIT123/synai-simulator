import { ResourceCurve } from "../core/task";
import { RNG } from "./random";

export function sampleUsage(curve: ResourceCurve, rng: RNG): number {
  return rng() < curve.variance ? curve.peak : curve.base;
}

export function slowdownFactor(pressure: number): number {
  return 1 + pressure * pressure;
}
