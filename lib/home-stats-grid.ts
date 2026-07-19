const GRID_GAP = 5;
const SCREEN_PAD = 32; // matches Screen horizontal padding (tokens.padLg * 2)
const MIN_TILE = 68;

/** 2–4 columns from available width inside Screen padding. */
export function homeStatColumns(screenWidth: number, screenPad = SCREEN_PAD): number {
  const inner = screenWidth - screenPad;
  return Math.min(4, Math.max(2, Math.floor((inner + GRID_GAP) / (MIN_TILE + GRID_GAP))));
}

export function homeStatTileWidth(screenWidth: number, cols: number, screenPad = SCREEN_PAD): number {
  const inner = screenWidth - screenPad;
  return (inner - GRID_GAP * (cols - 1)) / cols;
}

export const HOME_STATS_GRID_GAP = GRID_GAP;
