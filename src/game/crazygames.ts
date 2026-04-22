import type { CrazyGamesAdapter, GameMetrics } from "./types";

interface CGSdk {
  game?: {
    gameplayStart?: () => void;
    gameplayStop?: () => void;
  };
  happytime?: () => void;
  sdk?: {
    game?: {
      gameplayStart?: () => void;
      gameplayStop?: () => void;
    };
    happytime?: () => void;
  };
}

declare global {
  interface Window {
    CrazyGamesSDK?: CGSdk;
  }
}

function trackMetric(_metrics: GameMetrics): void {
  // Placeholder for future CG analytics/event mapping.
}

export function createCrazyGamesAdapter(): CrazyGamesAdapter {
  let sdk: CGSdk | undefined;

  const gameplayStart = (): void => {
    sdk?.game?.gameplayStart?.();
    sdk?.sdk?.game?.gameplayStart?.();
  };

  const gameplayStop = (): void => {
    sdk?.game?.gameplayStop?.();
    sdk?.sdk?.game?.gameplayStop?.();
  };

  return {
    init(): void {
      sdk = window.CrazyGamesSDK;
    },
    onRunStart(): void {
      gameplayStart();
    },
    onRunEnd(metrics: GameMetrics): void {
      gameplayStop();
      trackMetric(metrics);
      sdk?.happytime?.();
      sdk?.sdk?.happytime?.();
    }
  };
}

