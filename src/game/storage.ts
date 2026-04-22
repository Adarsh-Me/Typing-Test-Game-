const STORAGE_KEY = "typerushQuestPB";

export interface PersonalBest {
  bestWpm: number;
  bestAccuracy: number;
  bestCombo: number;
  bestScore: number;
}

const defaultPB: PersonalBest = {
  bestWpm: 0,
  bestAccuracy: 0,
  bestCombo: 0,
  bestScore: 0
};

export function loadPB(): PersonalBest {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPB;
    const parsed = JSON.parse(raw) as PersonalBest;
    return {
      bestWpm: Number.isFinite(parsed.bestWpm) ? parsed.bestWpm : 0,
      bestAccuracy: Number.isFinite(parsed.bestAccuracy) ? parsed.bestAccuracy : 0,
      bestCombo: Number.isFinite(parsed.bestCombo) ? parsed.bestCombo : 0,
      bestScore: Number.isFinite(parsed.bestScore) ? parsed.bestScore : 0
    };
  } catch {
    return defaultPB;
  }
}

export function savePB(pb: PersonalBest): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pb));
}
