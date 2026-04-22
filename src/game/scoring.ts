export function comboMultiplier(comboCount: number): number {
  if (comboCount >= 10) return 3;
  if (comboCount >= 5) return 2;
  return 1;
}

export function calcWpm(correctChars: number, elapsedSec: number): number {
  if (elapsedSec <= 0) return 0;
  return Math.round((correctChars / 5) / (elapsedSec / 60));
}

export function calcAccuracy(correctChars: number, wrongChars: number): number {
  const total = correctChars + wrongChars;
  if (total <= 0) return 100;
  return Math.max(0, Math.min(100, (correctChars / total) * 100));
}

export function calcAccuracyBonus(accuracy: number): number {
  if (accuracy >= 98) return 250;
  if (accuracy >= 95) return 180;
  if (accuracy >= 90) return 120;
  if (accuracy >= 80) return 70;
  return 20;
}

export function calcRank(wpm: number): string {
  if (wpm >= 85) return "Typing Master";
  if (wpm >= 65) return "Ninja";
  if (wpm >= 45) return "Sprinter";
  return "Turtle";
}
