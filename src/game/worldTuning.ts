import type { Biome } from "./levelTemplate";

export type ActorState = "RUN" | "SPRINT" | "STUMBLE" | "HIT";
export type CameraMode = "intro" | "chase" | "threat";

export interface ChunkTuning {
  curveAmount: number;
  laneHalfWidth: number;
  enemyPressure: number;
  houseScale: number;
  shoulderWidth: number;
}

export function buildChunkTuning(index: number, biome: Biome): ChunkTuning {
  const curveSequence = [4.8, -5.2, 3.8, -4.3, 5.6];
  const curveAmount = curveSequence[index % curveSequence.length];

  const laneHalfWidthByBiome: Record<Biome, number> = {
    suburban_main: 4.8,
    yard_lane: 4.4,
    tree_run: 4.1,
    fence_choke: 3.35,
    estate_row: 4.6
  };

  const pressureByBiome: Record<Biome, number> = {
    suburban_main: 1,
    yard_lane: 1.06,
    tree_run: 1.1,
    fence_choke: 1.22,
    estate_row: 1.04
  };

  const houseScaleByBiome: Record<Biome, number> = {
    suburban_main: 3.6,
    yard_lane: 3.8,
    tree_run: 3.1,
    fence_choke: 4,
    estate_row: 4.2
  };

  return {
    curveAmount,
    laneHalfWidth: laneHalfWidthByBiome[biome],
    enemyPressure: pressureByBiome[biome],
    houseScale: houseScaleByBiome[biome],
    shoulderWidth: laneHalfWidthByBiome[biome] + 5.5
  };
}

export function getRoadOffsetAtDepth(tuning: ChunkTuning, normalizedDepth: number): number {
  const clamped = Math.max(0, Math.min(1, normalizedDepth));
  return Math.sin(clamped * Math.PI) * tuning.curveAmount;
}

export function getLaneHalfWidthAtDepth(tuning: ChunkTuning, biome: Biome, normalizedDepth: number): number {
  const clamped = Math.max(0, Math.min(1, normalizedDepth));
  const squeeze =
    biome === "fence_choke" ? 1.25 : biome === "tree_run" ? 0.7 : biome === "yard_lane" ? 0.4 : 0.22;
  return tuning.laneHalfWidth - Math.sin(clamped * Math.PI) * squeeze;
}

export function getCameraMode(input: {
  runElapsedSec: number;
  enemyGap: number;
  momentum: number;
  actorState: ActorState;
}): CameraMode {
  if (input.runElapsedSec < 2.2) return "intro";
  if (input.actorState === "STUMBLE" || input.enemyGap < 7.6 || input.momentum < 0.32) return "threat";
  return "chase";
}

export function computeGapDelta(input: {
  worldSpeed: number;
  enemySpeed: number;
  catchRate: number;
}): number {
  return input.worldSpeed - input.enemySpeed * input.catchRate;
}

export function decayMomentum(momentum: number, dt: number): number {
  return Math.max(0, momentum - dt * 0.22);
}
