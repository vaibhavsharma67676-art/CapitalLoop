import type {
  BoardMapDefinition,
  BoardTile,
  ColorGroup,
  MapId,
  StreetTile,
  TransitTile,
  UtilityTile,
} from '../types/board';
import { CLASSIC_METRO_MAP } from './classicMetro';
import { GLOBAL_CAPITALS_MAP } from './globalCapitals';

const MAP_REGISTRY: Record<MapId, BoardMapDefinition> = {
  'classic-metro': CLASSIC_METRO_MAP,
  'global-capitals': GLOBAL_CAPITALS_MAP,
};

export function getBoardMap(mapId: MapId): BoardMapDefinition {
  const found = MAP_REGISTRY[mapId];
  if (!found) {
    return CLASSIC_METRO_MAP;
  }
  return found;
}

export function getAllBoardMaps(): readonly BoardMapDefinition[] {
  return Object.values(MAP_REGISTRY);
}

export function isValidMapId(value: string): value is MapId {
  return Object.prototype.hasOwnProperty.call(MAP_REGISTRY, value);
}

export function getTileById(mapId: MapId, tileId: number): BoardTile {
  const map = getBoardMap(mapId);
  const tile = map.tiles[tileId];
  if (!tile) {
    throw new Error(`Invalid tileId ${tileId} for map ${mapId}`);
  }
  return tile;
}

export function getColorGroupTiles(mapId: MapId, colorGroup: ColorGroup): StreetTile[] {
  const map = getBoardMap(mapId);
  return map.tiles.filter(
    (tile): tile is StreetTile => tile.type === 'STREET' && tile.colorGroup === colorGroup,
  );
}

export function getTransitTiles(mapId: MapId): TransitTile[] {
  const map = getBoardMap(mapId);
  return map.tiles.filter((tile): tile is TransitTile => tile.type === 'TRANSIT');
}

export function getUtilityTiles(mapId: MapId): UtilityTile[] {
  const map = getBoardMap(mapId);
  return map.tiles.filter((tile): tile is UtilityTile => tile.type === 'UTILITY');
}