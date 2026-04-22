import { describe, expect, it } from "vitest";
import {
  calcAccuracy,
  calcAccuracyBonus,
  calcRank,
  calcWpm,
  comboMultiplier
} from "../src/game/scoring";

describe("scoring helpers", () => {
  it("applies combo thresholds", () => {
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(5)).toBe(2);
    expect(comboMultiplier(10)).toBe(3);
  });

  it("calculates wpm from chars and time", () => {
    expect(calcWpm(100, 30)).toBe(40);
  });

  it("calculates bounded accuracy", () => {
    expect(calcAccuracy(50, 0)).toBe(100);
    expect(calcAccuracy(45, 5)).toBe(90);
    expect(calcAccuracy(0, 10)).toBe(0);
  });

  it("returns increasing accuracy bonus tiers", () => {
    expect(calcAccuracyBonus(79)).toBe(20);
    expect(calcAccuracyBonus(81)).toBe(70);
    expect(calcAccuracyBonus(95)).toBe(180);
    expect(calcAccuracyBonus(99)).toBe(250);
  });

  it("maps ranks by wpm", () => {
    expect(calcRank(30)).toBe("Turtle");
    expect(calcRank(50)).toBe("Sprinter");
    expect(calcRank(70)).toBe("Ninja");
    expect(calcRank(86)).toBe("Typing Master");
    expect(calcRank(100)).toBe("Typing Master");
  });
});
