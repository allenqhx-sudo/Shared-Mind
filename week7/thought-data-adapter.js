const MIN_RADIUS = 0.65;
const MAX_RADIUS = 1.12;
const LEGACY_WIDTH = 1440;
const LEGACY_HEIGHT = 738;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const validPosition = value => value && ['x', 'y', 'z'].every(axis => Number.isFinite(value[axis]));

// Keep this algorithm identical to the reference prototype, including its
// charCodeAt behavior, so the same ID always has the same eyes and shape.
export function prototypeHash(key) {
  let hash = 2166136261;
  for (const character of String(key)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function prototypeRadius(text) {
  const value = typeof text === 'string' ? text : '';
  return clamp(0.65 + Array.from(value).length * 0.004, MIN_RADIUS, MAX_RADIUS);
}

export function initialThoughtPosition(record, key) {
  if (validPosition(record?.spatial)) {
    // Saved Week 7 world coordinates are authoritative. Do not remap or migrate.
    return { x: record.spatial.x, y: record.spatial.y, z: record.spatial.z };
  }
  // Historic x/y are CSS pixels, normalized only here for presentation. The
  // source record and Firebase's legacy radius/x/y fields remain unchanged.
  const x = Number.isFinite(record?.x) ? clamp(record.x / LEGACY_WIDTH, 0, 1) : 0.5;
  const y = Number.isFinite(record?.y) ? clamp(record.y / LEGACY_HEIGHT, 0, 1) : 0.5;
  const depth = (prototypeHash(key) % 10001) / 10000;
  return { x: -5.3 + x * 10.9, y: 4.1 - y * 6.3, z: -5.8 + depth * 8.8 };
}

// Inverse of the legacy presentation mapping, for existing x/y consumers.
// The authoritative 3D drag position is still saved separately as spatial.
export function worldPositionToLegacy(position) {
  return {
    x: clamp((position.x + 5.3) / 10.9 * LEGACY_WIDTH, 20, LEGACY_WIDTH - 20),
    y: clamp((4.1 - position.y) / 6.3 * LEGACY_HEIGHT, 20, LEGACY_HEIGHT - 20),
  };
}

// This is the rendering contract, not a replacement Firebase record. In
// particular, radius is in world units and must never overwrite legacy radius.
export function firebaseThoughtTo3DData(record, key) {
  const text = typeof record?.text === 'string' ? record.text : '';
  return {
    id: key,
    text,
    radius: prototypeRadius(text),
    position: initialThoughtPosition(record, key),
    eyeSeed: key,
    type: typeof record?.type === 'string' ? record.type : 'original',
  };
}

// Exact reference fixtures. Used only by the local visual-parity mode; they are
// never submitted to Firebase and are not generated embeddings or UMAP points.
export const VISUAL_PARITY_THOUGHTS = [
  { id: 'horror-1', text: 'I like psychological horror games.', topic: 'Horror', type: 'original', spatial: { x: -5.0, y: 0.6, z: 2.3 } },
  { id: 'horror-2', text: 'Fear can come from incomplete information.', topic: 'Horror', type: 'original', spatial: { x: -3.1, y: -1.1, z: 1.0 } },
  { id: 'horror-3', text: 'Scary stories use suspense and uncertainty.', topic: 'Horror', type: 'original', spatial: { x: -5.3, y: -2.0, z: 3.0 } },
  { id: 'cooking-1', text: 'I like cooking pasta.', topic: 'Cooking', type: 'original', spatial: { x: 3.2, y: 0.3, z: -1.1 } },
  { id: 'cooking-2', text: 'Italian food is relaxing.', topic: 'Cooking', type: 'original', spatial: { x: 5.6, y: -0.5, z: -2.6 } },
  { id: 'cooking-3', text: 'I enjoy making dinner.', topic: 'Cooking', type: 'original', spatial: { x: 3.6, y: -2.2, z: -0.1 } },
  { id: 'travel-1', text: 'I want to visit Japan.', topic: 'Travel', type: 'original', spatial: { x: -1.8, y: 3.1, z: -4.2 } },
  { id: 'travel-2', text: 'Tokyo feels exciting.', topic: 'Travel', type: 'original', spatial: { x: 0.5, y: 4.1, z: -5.8 } },
  { id: 'travel-3', text: 'I want to explore a new city.', topic: 'Travel', type: 'original', spatial: { x: 1.3, y: 2.1, z: -3.1 } },
];

export const VISUAL_PARITY_RELATIONSHIPS = [
  { aId: 'horror-1', bId: 'horror-2', weight: 1, similarity: 1 },
  { aId: 'horror-2', bId: 'horror-3', weight: 1, similarity: 1 },
  { aId: 'cooking-1', bId: 'cooking-2', weight: 1, similarity: 1 },
  { aId: 'cooking-2', bId: 'cooking-3', weight: 1, similarity: 1 },
  { aId: 'travel-1', bId: 'travel-2', weight: 1, similarity: 1 },
  { aId: 'travel-2', bId: 'travel-3', weight: 1, similarity: 1 },
];
