import "./style.css";
import assetManifestRaw from "./assets.json";
import { calcAccuracy, calcAccuracyBonus, calcRank, calcWpm, comboMultiplier } from "./game/scoring";
import { loadPB, savePB, type PersonalBest } from "./game/storage";
import { ThreeChaseWorld } from "./game/ThreeChaseWorld";
import { createWordSource } from "./game/words";
import type { CanonicalAssetsManifest } from "./game/ThreeChaseWorld";

const RUN_DURATION = 30;
const VISIBLE_WORDS = 7;
const assetManifest = assetManifestRaw as CanonicalAssetsManifest;

function mustQuery<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing required DOM node: ${selector}`);
  return node;
}

const gameLayerEl = mustQuery<HTMLDivElement>("#game-layer");
const typingTextEl = mustQuery<HTMLParagraphElement>("#typing-text");
const typingInputEl = mustQuery<HTMLInputElement>("#typing-input");
const statusSummaryEl = mustQuery<HTMLSpanElement>("#status-summary");
const statusDetailEl = mustQuery<HTMLSpanElement>("#status-detail");
const timerEl = mustQuery<HTMLSpanElement>("#timer-value");
const stateEl = mustQuery<HTMLSpanElement>("#state-value");
const pickupEl = mustQuery<HTMLSpanElement>("#pickup-value");

const resultsPanelEl = mustQuery<HTMLDivElement>("#results-panel");
const playAgainBtnEl = mustQuery<HTMLButtonElement>("#play-again-btn");
const resultRankEl = mustQuery<HTMLParagraphElement>("#result-rank");
const resultWpmEl = mustQuery<HTMLElement>("#result-wpm");
const resultAccuracyEl = mustQuery<HTMLElement>("#result-accuracy");
const resultScoreEl = mustQuery<HTMLElement>("#result-score");
const resultComboEl = mustQuery<HTMLElement>("#result-combo");
const pbWpmEl = mustQuery<HTMLParagraphElement>("#pb-wpm");
const pbAccuracyEl = mustQuery<HTMLParagraphElement>("#pb-accuracy");
const pbComboEl = mustQuery<HTMLParagraphElement>("#pb-combo");
const pbScoreEl = mustQuery<HTMLParagraphElement>("#pb-score");

const wordSource = createWordSource();
const world = new ThreeChaseWorld(gameLayerEl, assetManifest, {
  onPickup(kind) {
    applyPickup(kind);
    updateHud();
  },
  onShieldConsumed() {
    shieldCharges = Math.max(0, shieldCharges - 1);
    updateHud();
  },
  onCaught() {
    if (!runEnded) finalizeRun("caught");
  }
});

const state = {
  targetWords: [] as string[],
  currentWordIndex: 0,
  currentCharIndex: 0,
  correctChars: 0,
  wrongChars: 0,
  correctWords: 0,
  mistakeCount: 0,
  comboCount: 0,
  comboMultiplier: 1,
  score: 0,
  timeRemaining: RUN_DURATION
};

let runTicker: number | null = null;
let runStartMs = 0;
let runEnded = false;
let hadWrongInCurrentWord = false;
let maxCombo = 0;
let shieldCharges = 0;
let speedBoostUntil = 0;
let swordBoostUntil = 0;
let pb: PersonalBest = loadPB();

function elapsedSec(): number {
  return Math.min(RUN_DURATION, (performance.now() - runStartMs) / 1000);
}

function ensureWordBuffer(minWords: number): void {
  while (state.targetWords.length - state.currentWordIndex < minWords) {
    state.targetWords.push(wordSource.pickWord(elapsedSec()));
  }
}

function renderTypingText(highlightWrong = false): void {
  ensureWordBuffer(VISIBLE_WORDS);
  const current = state.currentWordIndex;
  const displayWords = state.targetWords.slice(current, current + VISIBLE_WORDS);
  const wrongIndex = state.currentCharIndex;

  typingTextEl.innerHTML = displayWords
    .map((word, wi) => {
      if (wi !== 0) return `<span class="word">${word}</span>`;

      const chars = word
        .split("")
        .map((char, ci) => {
          if (ci < state.currentCharIndex) {
            return `<span class="char char-correct">${char}</span>`;
          }
          if (highlightWrong && ci === wrongIndex) {
            return `<span class="char char-wrong-pop">${char}</span>`;
          }
          if (ci === state.currentCharIndex) {
            return `<span class="char char-active char-caret">${char}</span>`;
          }
          return `<span class="char">${char}</span>`;
        })
        .join("");

      const endCaret =
        state.currentCharIndex >= word.length
          ? '<span class="char char-active char-caret">&nbsp;</span>'
          : "";

      return `<span class="word word-active">${chars}${endCaret}</span>`;
    })
    .join(" ");
}

function updateHud(): void {
  const elapsed = Math.max(0.1, elapsedSec());
  const wpm = calcWpm(state.correctChars, elapsed);
  const accuracy = calcAccuracy(state.correctChars, state.wrongChars);
  const snapshot = world.getSnapshot();

  statusSummaryEl.textContent = `WPM ${wpm} | ACC ${accuracy.toFixed(1)}%`;
  statusDetailEl.textContent = `GAP ${snapshot.enemyGap.toFixed(1)}m | COMBO x${state.comboMultiplier} | ${snapshot.biome.toUpperCase().replace("_", " ")}`;
  timerEl.textContent = `${Math.max(0, state.timeRemaining).toFixed(1)}s`;
  stateEl.textContent = snapshot.actorState;
  pickupEl.textContent = `Shield ${shieldCharges}`;
}

function registerMistake(): void {
  state.wrongChars += 1;
  state.mistakeCount += 1;
  state.score = Math.max(0, state.score - 5);
  hadWrongInCurrentWord = true;
  state.comboCount = 0;
  state.comboMultiplier = 1;
  typingTextEl.classList.remove("mistake-shake");
  typingTextEl.classList.add("mistake-shake");
  window.setTimeout(() => typingTextEl.classList.remove("mistake-shake"), 180);
  world.onMistake();
}

function advanceWord(): void {
  state.currentWordIndex += 1;
  state.currentCharIndex = 0;
  hadWrongInCurrentWord = false;
  ensureWordBuffer(VISIBLE_WORDS);
  renderTypingText();
  updateHud();
}

function completeWord(): void {
  const currentWord = state.targetWords[state.currentWordIndex];
  const fullWordTyped = state.currentCharIndex >= currentWord.length;

  if (!fullWordTyped || hadWrongInCurrentWord) {
    registerMistake();
    advanceWord();
    return;
  }

  state.correctWords += 1;
  state.comboCount += 1;
  state.comboMultiplier = comboMultiplier(state.comboCount);
  maxCombo = Math.max(maxCombo, state.comboCount);
  state.score += 10 * state.comboMultiplier;
  world.onWordCorrect(state.comboMultiplier);
  advanceWord();
}

function handleKeyInput(event: KeyboardEvent): void {
  if (runEnded) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  if (event.key === "Backspace") {
    event.preventDefault();
    if (state.currentCharIndex > 0) {
      state.currentCharIndex -= 1;
      renderTypingText();
    }
    return;
  }

  if (event.key === " ") {
    event.preventDefault();
    completeWord();
    return;
  }

  if (event.key.length !== 1) return;

  event.preventDefault();
  const currentWord = state.targetWords[state.currentWordIndex];
  const expected = currentWord[state.currentCharIndex];
  if (!expected) return;

  if (event.key.toLowerCase() === expected.toLowerCase()) {
    state.currentCharIndex += 1;
    state.correctChars += 1;
    world.onCorrectChar();
    renderTypingText();
    updateHud();
  } else {
    registerMistake();
    renderTypingText(true);
    updateHud();
  }
}

function applyPickup(kind: string): void {
  if (kind === "potion") {
    world.recover();
    state.score += 15;
    return;
  }
  if (kind === "shield") {
    shieldCharges += 1;
    world.setShieldCharges(shieldCharges);
    return;
  }
  if (kind === "sword") {
    swordBoostUntil = performance.now() + 6000;
    state.score += 25;
    return;
  }
  if (kind === "bow") {
    speedBoostUntil = performance.now() + 6000;
  }
}

function finalizeRun(reason: "timer" | "caught"): void {
  runEnded = true;
  if (runTicker !== null) window.clearInterval(runTicker);
  runTicker = null;

  const finalWpm = calcWpm(state.correctChars, RUN_DURATION);
  const finalAccuracy = calcAccuracy(state.correctChars, state.wrongChars);
  const finalScore = state.score + calcAccuracyBonus(finalAccuracy);
  const rank = calcRank(finalWpm);

  pb = {
    bestWpm: Math.max(pb.bestWpm, finalWpm),
    bestAccuracy: Math.max(pb.bestAccuracy, finalAccuracy),
    bestCombo: Math.max(pb.bestCombo, maxCombo),
    bestScore: Math.max(pb.bestScore, finalScore)
  };
  savePB(pb);

  resultRankEl.textContent = reason === "caught" ? `${rank} (Caught)` : rank;
  resultWpmEl.textContent = `${finalWpm}`;
  resultAccuracyEl.textContent = `${finalAccuracy.toFixed(1)}%`;
  resultScoreEl.textContent = `${finalScore}`;
  resultComboEl.textContent = `${maxCombo}`;
  pbWpmEl.textContent = `Best WPM: ${pb.bestWpm}`;
  pbAccuracyEl.textContent = `Best Accuracy: ${pb.bestAccuracy.toFixed(1)}%`;
  pbComboEl.textContent = `Best Combo: ${pb.bestCombo}`;
  pbScoreEl.textContent = `Best Score: ${pb.bestScore}`;
  resultsPanelEl.classList.remove("hidden");
}

function tick(): void {
  const now = performance.now();
  state.timeRemaining = Math.max(0, RUN_DURATION - elapsedSec());
  world.setShieldCharges(shieldCharges);
  world.setBowBoost(now < speedBoostUntil);
  world.setSwordBoost(now < swordBoostUntil);
  updateHud();

  if (state.timeRemaining <= 0) {
    finalizeRun("timer");
  }
}

function resetRun(): void {
  if (runTicker !== null) window.clearInterval(runTicker);

  state.targetWords = [];
  state.currentWordIndex = 0;
  state.currentCharIndex = 0;
  state.correctChars = 0;
  state.wrongChars = 0;
  state.correctWords = 0;
  state.mistakeCount = 0;
  state.comboCount = 0;
  state.comboMultiplier = 1;
  state.score = 0;
  state.timeRemaining = RUN_DURATION;
  shieldCharges = 0;
  speedBoostUntil = 0;
  swordBoostUntil = 0;
  maxCombo = 0;
  hadWrongInCurrentWord = false;
  runEnded = false;

  world.startRun();
  resultsPanelEl.classList.add("hidden");
  ensureWordBuffer(VISIBLE_WORDS);
  renderTypingText();
  updateHud();

  runStartMs = performance.now();
  runTicker = window.setInterval(tick, 100);
}

function bindInput(): void {
  const refocus = (): void => typingInputEl.focus();
  window.addEventListener("pointerdown", refocus);
  window.addEventListener("keydown", handleKeyInput);
}

async function boot(): Promise<void> {
  await world.init();

  pbWpmEl.textContent = `Best WPM: ${pb.bestWpm}`;
  pbAccuracyEl.textContent = `Best Accuracy: ${pb.bestAccuracy.toFixed(1)}%`;
  pbComboEl.textContent = `Best Combo: ${pb.bestCombo}`;
  pbScoreEl.textContent = `Best Score: ${pb.bestScore}`;

  bindInput();
  playAgainBtnEl.addEventListener("click", () => {
    typingInputEl.focus();
    resetRun();
  });

  typingInputEl.focus();
  resetRun();
}

void boot();
