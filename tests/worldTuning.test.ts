import { describe, expect, it } from "vitest";
import {
  buildChunkTuning,
  computeGapDelta,
  decayMomentum,
  getCameraMode,
  getRoadOffsetAtDepth
} from "../src/game/worldTuning";

describe("world tuning", () => {
  it("creates non-straight road chunks with left/right variance", () => {
    const first = buildChunkTuning(0, "suburban_main");
    const second = buildChunkTuning(1, "yard_lane");
    const third = buildChunkTuning(2, "tree_run");

    expect(Math.abs(first.curveAmount)).toBeGreaterThan(0.5);
    expect(Math.abs(second.curveAmount)).toBeGreaterThan(0.5);
    expect(Math.sign(first.curveAmount)).not.toBe(Math.sign(second.curveAmount));
    expect(Math.sign(second.curveAmount)).not.toBe(Math.sign(third.curveAmount));
  });

  it("narrows choke biome more than open suburban biome", () => {
    const open = buildChunkTuning(0, "suburban_main");
    const choke = buildChunkTuning(3, "fence_choke");

    expect(choke.laneHalfWidth).toBeLessThan(open.laneHalfWidth);
    expect(choke.enemyPressure).toBeGreaterThan(open.enemyPressure);
  });

  it("keeps road centered at chunk ends but curved in middle", () => {
    const tuning = buildChunkTuning(0, "estate_row");

    expect(getRoadOffsetAtDepth(tuning, 0)).toBeCloseTo(0, 5);
    expect(getRoadOffsetAtDepth(tuning, 0.5)).not.toBeCloseTo(0, 1);
    expect(getRoadOffsetAtDepth(tuning, 1)).toBeCloseTo(0, 5);
  });

  it("uses intro camera first, then chase, then threat when enemy close", () => {
    expect(getCameraMode({ runElapsedSec: 1.1, enemyGap: 12, momentum: 0.8, actorState: "RUN" })).toBe("intro");
    expect(getCameraMode({ runElapsedSec: 3.5, enemyGap: 12, momentum: 0.8, actorState: "RUN" })).toBe("chase");
    expect(getCameraMode({ runElapsedSec: 3.5, enemyGap: 6.8, momentum: 0.2, actorState: "RUN" })).toBe("threat");
    expect(getCameraMode({ runElapsedSec: 3.5, enemyGap: 10.5, momentum: 0.8, actorState: "STUMBLE" })).toBe("threat");
  });

  it("increases gap when player outruns enemy", () => {
    expect(computeGapDelta({ worldSpeed: 14, enemySpeed: 8, catchRate: 1 })).toBeGreaterThan(0);
    expect(computeGapDelta({ worldSpeed: 7, enemySpeed: 10, catchRate: 1.1 })).toBeLessThan(0);
  });

  it("decays momentum when player stops typing", () => {
    expect(decayMomentum(0.8, 1)).toBeLessThan(0.8);
    expect(decayMomentum(0.02, 1)).toBeGreaterThanOrEqual(0);
  });
});
