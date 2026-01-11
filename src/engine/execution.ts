import { ResourceCurve } from "../core/task";
import { RNG } from "./random";

export function sampleUsage(curve: ResourceCurve, rng: RNG): number {
  const spread = curve.peak - curve.base;

  // centered noise in [-0.5, 0.5]
  const noise = (rng() - 0.5) * 2;

  const usage = curve.base + spread * curve.variance * noise;

  return Math.max(0, usage);
}

export function slowdownFactor(pressure: number): number {
  return 1 + pressure * pressure;
}
