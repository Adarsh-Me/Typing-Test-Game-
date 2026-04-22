import type { WordSource } from "./types";

const easyWords = [
  "sun",
  "jump",
  "game",
  "swift",
  "happy",
  "cloud",
  "quick",
  "blink",
  "brave",
  "trail",
  "boost",
  "score"
];

const mediumWords = [
  "rocket",
  "rhythm",
  "victory",
  "dynamic",
  "streak",
  "thunder",
  "arcade",
  "runner",
  "energy",
  "combo",
  "typing",
  "brighten"
];

const hardWords = [
  "hyperdrive",
  "microburst",
  "lightning",
  "synchronize",
  "breakpoint",
  "reaction",
  "precision",
  "multiplier",
  "challenging",
  "trajectory",
  "acceleration",
  "adventure"
];

function pickFrom(words: string[]): string {
  return words[Math.floor(Math.random() * words.length)];
}

export function createWordSource(): WordSource {
  return {
    pickWord(elapsedSec: number): string {
      if (elapsedSec < 15) {
        return Math.random() < 0.75 ? pickFrom(easyWords) : pickFrom(mediumWords);
      }
      if (elapsedSec < 25) {
        const roll = Math.random();
        if (roll < 0.2) return pickFrom(easyWords);
        if (roll < 0.8) return pickFrom(mediumWords);
        return pickFrom(hardWords);
      }
      return Math.random() < 0.7 ? pickFrom(hardWords) : pickFrom(mediumWords);
    }
  };
}

