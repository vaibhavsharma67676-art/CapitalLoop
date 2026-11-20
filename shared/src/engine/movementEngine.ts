import { BOARD_TILE_COUNT, START_TILE_ID } from '../constants/limits';
import { getTransitTiles, getUtilityTiles } from '../maps/mapRegistry';
import type { MapId } from '../types/board';
import type { GameState } from '../types/game';

export interface MovementOutcome {
  from: number;
  to: number;
  passedStart: boolean;
  startBonus: number;
}

export function advancePlayerSteps(
  state: GameState,
  playerId: string,
  steps: number,
): MovementOutcome {
  const player = state.players[playerId];
  if (!player) {
    return { from: 0, to: 0, passedStart: false, startBonus: 0 };
  }

  const from = player.position;
  const rawNext = from + steps;
  const to = ((rawNext % BOARD_TILE_COUNT) + BOARD_TILE_COUNT) % BOARD_TILE_COUNT;

  let passedStart = false;
  let startBonus = 0;

  if (steps > 0 && rawNext >= BOARD_TILE_COUNT) {
    passedStart = true;
    const isExactStart = to === START_TILE_ID;
    startBonus =
      isExactStart && state.settings.doubleGoOnExactLand
        ? state.settings.passStartBonus * 2
        : state.settings.passStartBonus;
    player.cash += startBonus;
  }

  player.position = to;
  return { from, to, passedStart, startBonus };
}

export function movePlayerToTile(
  state: GameState,
  playerId: string,
  targetTileId: number,
  collectStartIfPassed: boolean,
): MovementOutcome {
  const player = state.players[playerId];
  if (!player) {
    return { from: 0, to: targetTileId, passedStart: false, startBonus: 0 };
  }

  const from = player.position;
  const to = ((targetTileId % BOARD_TILE_COUNT) + BOARD_TILE_COUNT) % BOARD_TILE_COUNT;

  let passedStart = false;
  let startBonus = 0;

  if (collectStartIfPassed && (to <= from || to === START_TILE_ID)) {
    passedStart = true;
    const isExactStart = to === START_TILE_ID;
    startBonus =
      isExactStart && state.settings.doubleGoOnExactLand
        ? state.settings.passStartBonus * 2
        : state.settings.passStartBonus;
    player.cash += startBonus;
  }

  player.position = to;
  return { from, to, passedStart, startBonus };
}

export function findNearestTileOfType(
  mapId: MapId,
  fromPosition: number,
  kind: 'TRANSIT' | 'UTILITY',
): number {
  const candidates =
    kind === 'TRANSIT'
      ? getTransitTiles(mapId).map((t) => t.id)
      : getUtilityTiles(mapId).map((t) => t.id);

  const sorted = [...candidates].sort((a, b) => a - b);
  for (const tileId of sorted) {
    if (tileId > fromPosition) {
      return tileId;
    }
  }
  return sorted[0] ?? START_TILE_ID;
}