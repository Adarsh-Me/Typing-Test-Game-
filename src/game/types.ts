export interface GameMetrics {
  wpm: number;
  accuracy: number;
  score: number;
  maxCombo: number;
  correctWords: number;
  mistakes: number;
  durationSec: number;
}

export interface TypingState {
  targetWords: string[];
  currentWordIndex: number;
  currentCharIndex: number;
  typedChars: string[];
  correctChars: number;
  wrongChars: number;
  correctWords: number;
  mistakeCount: number;
  comboCount: number;
  comboMultiplier: number;
  score: number;
  timeRemaining: number;
}

export interface WordSource {
  pickWord: (elapsedSec: number) => string;
}

export interface CrazyGamesAdapter {
  init: () => void;
  onRunStart: () => void;
  onRunEnd: (metrics: GameMetrics) => void;
}

